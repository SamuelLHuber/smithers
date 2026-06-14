// smithers-display-name: Marketing Thread
// smithers-description: Draft a ready-to-post X/Twitter launch thread from a release changelog into marketing/<version>/thread.md.
// smithers-tags: marketing, release, authoring
/** @jsxImportSource smithers-orchestrator */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";
import { agents } from "../agents";
import DraftPrompt from "../prompts/marketing-thread.mdx";

const REPO_ROOT = process.cwd();
const CHANGELOG_DIR = join(REPO_ROOT, "docs/changelogs");
const MARKETING_DIR = join(REPO_ROOT, "marketing");

// Highest-version-last ordering for "0.24.0"-style ids.
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function versionDirs(dir: string, predicate: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(predicate)
    .sort(compareVersions);
}

const inputSchema = z.object({
  version: z
    .string()
    .nullable()
    .default(null)
    .describe("Release version to write a thread for, e.g. 0.24.0. Null uses the latest changelog."),
});

// 1. Deterministic read of the changelog and a prior thread to mirror.
const gatherSchema = z.looseObject({
  version: z.string().default("").describe("Resolved release version."),
  changelog: z.string().default("").describe("Full changelog body for the version."),
  styleRef: z.string().default("").describe("A prior thread.md to mirror for tone and shape."),
  outPath: z.string().default("").describe("Repo-relative path the thread is written to."),
});

// 2. The drafted thread copy (the agent generates only text; I/O stays deterministic).
const draftSchema = z.looseObject({
  thread: z.string().default("").describe("The full launch thread as Markdown, saved verbatim."),
  tweetCount: z.number().default(0).describe("Number of tweets in the thread."),
  notes: z.string().default("").describe("Scope or follow-up notes for the human poster."),
});

// 3. Confirmation of the file write.
const writeSchema = z.looseObject({
  path: z.string().default("").describe("Repo-relative path written."),
  bytes: z.number().default(0).describe("Size of the written thread in bytes."),
});

const { Workflow, Task, Sequence, smithers, outputs } = createSmithers({
  input: inputSchema,
  gather: gatherSchema,
  draft: draftSchema,
  write: writeSchema,
});

export default smithers((ctx) => {
  const requested = (ctx.input.version ?? "").trim();

  const gather = ctx.outputMaybe("gather", { nodeId: "gather" });
  const draft = ctx.outputMaybe("draft", { nodeId: "draft" });

  return (
    <Workflow name="marketing-thread">
      <Sequence>
        {/* 1 — Read the changelog for the target version and the latest existing thread. */}
        <Task id="gather" output={outputs.gather}>
          {() => {
            const available = versionDirs(CHANGELOG_DIR, (f) => f.endsWith(".mdx")).map((f) =>
              f.replace(/\.mdx$/, ""),
            );
            if (available.length === 0) {
              throw new Error("no changelogs found under docs/changelogs");
            }
            const version = requested || available[available.length - 1];
            const changelogPath = join(CHANGELOG_DIR, `${version}.mdx`);
            if (!existsSync(changelogPath)) {
              throw new Error(
                `docs/changelogs/${version}.mdx not found (have: ${available.join(", ")})`,
              );
            }
            const changelog = readFileSync(changelogPath, "utf8");

            const priorThreads = versionDirs(
              MARKETING_DIR,
              (d) => /^\d+\.\d+/.test(d) && existsSync(join(MARKETING_DIR, d, "thread.md")),
            ).filter((d) => d !== version);
            const styleVersion = priorThreads[priorThreads.length - 1];
            const styleRef = styleVersion
              ? readFileSync(join(MARKETING_DIR, styleVersion, "thread.md"), "utf8").slice(0, 9000)
              : "";

            return { version, changelog, styleRef, outPath: `marketing/${version}/thread.md` };
          }}
        </Task>

        {/* 2 — Draft the thread copy from the changelog, mirroring the prior thread's shape. */}
        {gather ? (
          <Task id="draft" output={outputs.draft} agent={agents.smart} heartbeatTimeoutMs={900_000}>
            <DraftPrompt
              version={gather.version}
              changelog={gather.changelog}
              styleRef={gather.styleRef || "(no prior thread to mirror; follow the house style above.)"}
            />
          </Task>
        ) : null}

        {/* 3 — Write the drafted thread to marketing/<version>/thread.md. */}
        {gather && draft ? (
          <Task id="write" output={outputs.write}>
            {() => {
              const outPath = gather.outPath || `marketing/${gather.version}/thread.md`;
              const abs = join(REPO_ROOT, outPath);
              mkdirSync(dirname(abs), { recursive: true });
              const body = draft.thread.endsWith("\n") ? draft.thread : `${draft.thread}\n`;
              writeFileSync(abs, body, "utf8");
              return { path: outPath, bytes: Buffer.byteLength(body, "utf8") };
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
