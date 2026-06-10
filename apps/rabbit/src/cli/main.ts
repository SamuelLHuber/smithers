#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { loadOutputs } from "@smithers-orchestrator/db/snapshot";
import { runWorkflow } from "@smithers-orchestrator/engine";
import { Effect } from "effect";
import { createRabbitAgents } from "../workflow/createRabbitAgents";
import { createRabbitWorkflow } from "../workflow/createRabbitWorkflow";
import { parseRabbitArgs, type RabbitArgs } from "./parseRabbitArgs";

const USAGE = `rabbit — code review + story-form HTML walkthrough

Usage: rabbit [repo] [options]

  --from <ref> --to <ref>   review a ref range (merge-base diff)
  --commit <sha>            review a single commit
                            (default: workspace changes, tracked + untracked)
  --background <text>       requirement background for review + narrator
  --title <text>            walkthrough title (default: narrator headline)
  --out <file>              output HTML path (default: <repo>/.rabbit/walkthrough.html)
  --db <file>               smithers db path (default: <repo>/.rabbit/rabbit.db)
  --no-review               skip review agents; walkthrough only
  --no-narrate              skip the narrator agent; deterministic story order
  --concurrency <n>         parallel file reviews (default 8)
  --timeout <min>           per-agent-task timeout in minutes (default 10)
  --open                    open the walkthrough in the default browser
  -h, --help                show this help`;

async function main() {
  let args: RabbitArgs;
  try {
    args = parseRabbitArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`rabbit: ${(error as Error).message}\n`);
    console.error(USAGE);
    process.exit(1);
    return;
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const repoDir = resolve(args.repo);
  const dbPath = args.db ? resolve(args.db) : join(repoDir, ".rabbit", "rabbit.db");
  const agents = args.review || args.narrate ? createRabbitAgents(repoDir) : { review: [], narrate: [] };
  const { workflow, db, tables } = createRabbitWorkflow({
    dbPath,
    reviewAgents: args.review ? agents.review : [],
    narratorAgents: args.narrate ? agents.narrate : [],
  });

  const runId = `rabbit-${Date.now()}`;
  const input = {
    repo: repoDir,
    from: args.from,
    to: args.to,
    commit: args.commit,
    background: args.background,
    rule: "",
    concurrency: args.concurrency,
    timeout: args.timeout,
    runReview: args.review,
    out: args.out,
    narrate: args.narrate,
    title: args.title,
  };

  console.error(
    `[rabbit] run ${runId} on ${repoDir} (review ${args.review ? "on" : "off"}, narration ${args.narrate ? "on" : "off"})`,
  );
  const result = (await Effect.runPromise(
    runWorkflow(workflow as never, { input, runId, allowNetwork: true }) as never,
  )) as { status: string };

  const rows = (await loadOutputs(db as never, tables as never, runId)) as Record<
    string,
    Record<string, unknown>[]
  >;
  const walkthrough = rows.walkthrough?.at(-1);
  const review = rows.review?.at(-1);

  if (!walkthrough) {
    console.error(`[rabbit] run ended with status "${result.status}" but produced no walkthrough.`);
    process.exit(1);
    return;
  }

  if (review?.message) console.log(`Review: ${String(review.message)}`);
  console.log(String(walkthrough.message ?? `Walkthrough written to ${String(walkthrough.path)}`));

  if (args.open) {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawn(opener, [String(walkthrough.path)], { stdio: "ignore", detached: true }).unref();
  }

  const failed = result.status === "failed" || result.status === "cancelled";
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`rabbit: ${(error as Error)?.message ?? String(error)}`);
  process.exit(1);
});
