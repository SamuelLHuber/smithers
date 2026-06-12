#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSession } from "./createSession";
import { fetchOidcToken } from "./fetchOidcToken";
import { gateEvent } from "./gateEvent";
import { runReview } from "./runReview";

/**
 * Composite step entrypoint that runs after the early gate has passed:
 *
 *   1. Re-gate (defence in depth + we still need the parsed decision).
 *   2. Mint an OIDC token, POST it to /api/sessions.
 *   3. Apply the server-side mode: a `pull_request` trigger on a `comment`
 *      mode repo skips with a notice naming the magic phrase.
 *   4. For `issue_comment`, resolve and check out the PR head into the
 *      workspace so the agents and the CLI see the PR's tree.
 *   5. Spawn the existing review CLI with proxy env so all inference and the
 *      walkthrough upload go through the session.
 */
async function main(): Promise<void> {
  const serviceUrl = process.env.SMITHERS_REVIEW_SERVICE_URL ?? "https://review.jjhub.tech";
  const actionPath = process.env.SMITHERS_ACTION_PATH ?? process.cwd();
  const smithersRoot = resolve(actionPath, "..", "..", "..");
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const eventPath = process.env.GITHUB_EVENT_PATH ?? "";

  if (!eventPath) {
    console.log("::notice::smithers review skipped: GITHUB_EVENT_PATH is empty");
    return;
  }
  const payload = JSON.parse(readFileSync(eventPath, "utf8")) as unknown;

  const decision = gateEvent({ eventName, payload });
  if (!decision.run) {
    console.log(`::notice::smithers review skipped: ${decision.reason}`);
    return;
  }

  const oidcToken = await fetchOidcToken();
  const session = await createSession({
    serviceUrl,
    oidcToken,
    pr: decision.prNumber,
  });

  if (session.status === "quota-exhausted") {
    console.log(
      `::notice::smithers review skipped: this repo's monthly PR quota is spent (${session.message})`,
    );
    return;
  }
  if (session.status === "not-registered") {
    console.log(
      `::notice::smithers review skipped: this repository is not registered. Open an issue titled "review access: <org>/<repo>" at https://github.com/smithersai/smithers/issues to request access (${session.message})`,
    );
    return;
  }
  if (session.status === "error") {
    throw new Error(`/api/sessions failed: ${session.message}`);
  }

  if (decision.eventName === "pull_request" && session.mode === "comment") {
    console.log(
      `::notice::smithers review skipped: this repo is in comment mode — comment "@smithers review" on the PR to trigger a review.`,
    );
    return;
  }

  if (decision.eventName === "issue_comment") {
    execFileSync("gh", ["pr", "checkout", String(decision.prNumber)], {
      cwd: workspace,
      stdio: "inherit",
      env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN ?? "" },
    });
  }

  const exitCode = await runReview({
    smithersRoot,
    workspace,
    prNumber: decision.prNumber,
    anthropicBaseUrl: session.anthropicBaseUrl,
    anthropicApiKey: session.token,
    publishUrl: session.publishUrl,
    publishToken: session.token,
    ghToken: process.env.GH_TOKEN,
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((error) => {
  console.error(`smithers review action: ${(error as Error).message ?? String(error)}`);
  process.exit(1);
});
