// smithers-source: authored
// smithers-display-name: Repo Prospector
// smithers-description: Find one unseen GitHub repo, build a real Smithers demo on a fork, and draft maintainer outreach that waits for human approval before it is sent. Self-throttles to once every 15 minutes.
// smithers-tags: growth, outreach, github
/** @jsxImportSource smithers-orchestrator */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";
import { agents } from "../agents";

const LEDGER = ".smithers/state/repo-prospector.json";
const WORK_ROOT = ".smithers/tmp/repo-prospector";
const FORK_OWNER = "roninjin10";
const THROTTLE_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Seen ledger — local, gitignored, the source of truth for "never look twice".
// ---------------------------------------------------------------------------
type Ledger = { lastRunAt: number | null; seen: { repo: string; at: number }[] };

function readLedger(): Ledger {
  if (!existsSync(LEDGER)) return { lastRunAt: null, seen: [] };
  try {
    const parsed = JSON.parse(readFileSync(LEDGER, "utf8")) as Partial<Ledger>;
    return { lastRunAt: parsed.lastRunAt ?? null, seen: Array.isArray(parsed.seen) ? parsed.seen : [] };
  } catch {
    return { lastRunAt: null, seen: [] };
  }
}

function writeLedger(next: Ledger): void {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, `${JSON.stringify(next, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Schemas. z.number() persists as INTEGER, so every numeric field is an int.
// ---------------------------------------------------------------------------
const inputSchema = z.object({
  topic: z
    .string()
    .nullable()
    .default(null)
    .describe("Optional bias for discovery, e.g. 'AI code review bots' or 'release automation'."),
  minStars: z.number().int().default(50).describe("Skip repos below this star count."),
  force: z.boolean().default(false).describe("Bypass the 15-minute self-throttle for a manual run."),
});

const gateSchema = z.object({
  proceed: z.boolean(),
  reason: z.string(),
  seen: z.array(z.string()).default([]),
  seenCount: z.number().int().default(0),
});

const discoverSchema = z.object({
  found: z.boolean(),
  fullName: z.string().describe("owner/repo, or empty when found is false"),
  owner: z.string(),
  repo: z.string(),
  url: z.string(),
  stars: z.number().int().default(0),
  defaultBranch: z.string().default("main"),
  existingAutomation: z.string().describe("The brittle/manual automation Smithers could improve, or 'none found'."),
  smithersAngle: z.string().describe("One sentence: how Smithers helps this repo."),
  rationale: z.string(),
});

const recordSchema = z.object({ recorded: z.boolean(), repo: z.string(), seenCount: z.number().int() });

const assessSchema = z.object({
  fit: z.enum(["strong", "weak", "none"]),
  defaultBranch: z.string().default("main"),
  existingWorkflowSummary: z.string(),
  proposedChange: z.string().describe("The concrete change the demo branch should make."),
  smithersWorkflows: z.array(z.string()).default([]).describe("Named Smithers workflows/capabilities that apply."),
  valueProps: z.array(z.string()).default([]),
  maintainerHandle: z.string().describe("GitHub handle of the maintainer to contact, or empty."),
  maintainerContact: z.string().nullable().default(null).describe("Email or other contact if discoverable."),
});

const implementSchema = z.object({
  forked: z.boolean(),
  pushed: z.boolean(),
  forkFullName: z.string().describe("roninjin10/<repo>"),
  branch: z.string(),
  commitSha: z.string().default(""),
  filesChanged: z.array(z.string()).default([]),
  summary: z.string(),
});

const diffSchema = z.object({ compareUrl: z.string(), branch: z.string(), forkFullName: z.string() });

const draftSchema = z.object({
  channel: z.enum(["issue", "email", "dm"]),
  to: z.string().describe("Issue target repo, email address, or DM handle."),
  subject: z.string(),
  body: z.string(),
});

// Matches the Approval component's durable decision shape.
const approvalSchema = z.object({
  approved: z.boolean(),
  note: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
});

const sendSchema = z.object({
  action: z.enum(["created-issue", "draft-only", "skipped"]),
  sent: z.boolean(),
  issueUrl: z.string().nullable().default(null),
  note: z.string(),
});

const { Workflow, Task, Sequence, Approval, smithers, outputs } = createSmithers({
  input: inputSchema,
  gate: gateSchema,
  discover: discoverSchema,
  record: recordSchema,
  assess: assessSchema,
  implement: implementSchema,
  diff: diffSchema,
  draft: draftSchema,
  approval: approvalSchema,
  send: sendSchema,
});

// ---------------------------------------------------------------------------
// Agent prompts. Each agent does real work via its tools, then returns JSON
// matching the task's output schema.
// ---------------------------------------------------------------------------
const NEVER_TOUCH_HOST =
  "CRITICAL SAFETY RULES: You are running inside an unrelated repository (the Smithers monorepo). " +
  "NEVER run git or gh against the current directory or the Smithers repo. " +
  "ALWAYS pass an explicit OWNER/REPO to gh, and ALWAYS cd into the dedicated work directory before any git command. " +
  "Do not commit, stage, or push anything in the Smithers repo.";

function discoverPrompt(seen: string[], topic: string | null, minStars: number): string {
  return [
    "You are a growth scout for Smithers, a durable agentic-workflow orchestrator.",
    NEVER_TOUCH_HOST,
    "",
    "GOAL: find exactly ONE GitHub repository that would visibly benefit from a Smithers workflow.",
    "Strongest candidates ALREADY run some automation Smithers can improve: hand-rolled GitHub Actions,",
    "AI/LLM glue (langchain, crewai, autogen, n8n), flaky bots, release or triage scripts, doc generators.",
    "",
    `Use the gh CLI to search and inspect (e.g. \`gh search repos\`, \`gh api\`). Require at least ${minStars} stars.`,
    topic ? `Bias the search toward: ${topic}.` : "Pick any healthy, active repo that fits.",
    "",
    "DENYLIST — these were already looked at, you MUST NOT pick any of them:",
    seen.length ? seen.map((r) => `  - ${r}`).join("\n") : "  (none yet)",
    "",
    "Prefer active repos (recent commits) where a real maintainer would care. Verify the repo exists with gh.",
    "If you genuinely cannot find a fresh, fitting repo, return found=false with empty strings.",
    "",
    "Return ONLY the JSON object for the output schema: found, fullName (owner/repo), owner, repo, url, stars,",
    "defaultBranch, existingAutomation, smithersAngle, rationale.",
  ].join("\n");
}

function assessPrompt(repo: z.infer<typeof discoverSchema>, workDir: string): string {
  return [
    "You assess whether Smithers can help a specific GitHub repo, and design the demo.",
    NEVER_TOUCH_HOST,
    "",
    `TARGET: ${repo.fullName} (${repo.url})`,
    `Smithers angle from discovery: ${repo.smithersAngle}`,
    `Existing automation noted: ${repo.existingAutomation}`,
    "",
    "STEPS:",
    `1. mkdir -p ${workDir} and shallow-clone for READ-ONLY inspection:`,
    `   git clone --depth 1 ${repo.url} ${workDir}/${repo.repo}`,
    "2. Inspect .github/workflows, README, CONTRIBUTING, package manifests, and any agent/automation code.",
    "3. Learn what Smithers actually offers — run `smithers docs`, `smithers starters`, and `smithers workflow`",
    "   so your recommendation maps to REAL Smithers capabilities, not invented ones.",
    "4. Decide fit: 'strong' (clear, demoable win), 'weak' (plausible but thin), or 'none' (skip it).",
    "5. Design ONE concrete, small demo change a fork branch can make (e.g. add a .smithers/ workflow,",
    "   or replace a brittle Action step with a Smithers-driven one). Keep it realistic and reviewable.",
    "6. Find the best maintainer to contact (GitHub handle from commits/CODEOWNERS/README; email/FUNDING if public).",
    "",
    "Return ONLY the JSON: fit, defaultBranch, existingWorkflowSummary, proposedChange, smithersWorkflows[],",
    "valueProps[], maintainerHandle, maintainerContact (or null).",
  ].join("\n");
}

function implementPrompt(
  repo: z.infer<typeof discoverSchema>,
  assess: z.infer<typeof assessSchema>,
  workDir: string,
): string {
  const slug = "smithers-demo";
  return [
    "You build a real demonstration of a Smithers improvement on a FORK. A branch, never a PR.",
    NEVER_TOUCH_HOST,
    "",
    `TARGET (upstream): ${repo.fullName}`,
    `Proposed change: ${assess.proposedChange}`,
    `Default branch: ${assess.defaultBranch || repo.defaultBranch}`,
    "",
    "STEPS (run each git/gh command from inside the cloned fork directory):",
    `1. Fork into ${FORK_OWNER} and clone the fork:`,
    `   cd ${workDir} && gh repo fork ${repo.fullName} --clone --default-branch-only`,
    `   (this creates ${FORK_OWNER}/${repo.repo} and clones it to ${workDir}/${repo.repo})`,
    `2. cd ${workDir}/${repo.repo}`,
    `3. git checkout -b ${slug}/smithers-improvement`,
    "4. Implement the proposed change. Make it real and minimal — something a maintainer would actually merge.",
    "   Add a short note (e.g. SMITHERS_DEMO.md) explaining what changed and why Smithers helps.",
    "5. git add -A && git commit (clear message). Then push the branch to the FORK:",
    `   git push -u origin ${slug}/smithers-improvement`,
    "   The fork's origin is your push target; never push to upstream and never open a PR.",
    "",
    "Return ONLY the JSON: forked, pushed, forkFullName, branch, commitSha, filesChanged[], summary.",
  ].join("\n");
}

function draftPrompt(
  repo: z.infer<typeof discoverSchema>,
  assess: z.infer<typeof assessSchema>,
  implement: z.infer<typeof implementSchema>,
  compareUrl: string,
): string {
  return [
    "Draft outreach to the maintainer about the Smithers demo you just built. Pick the single best channel.",
    "",
    `Repo: ${repo.fullName}`,
    `Maintainer: ${assess.maintainerHandle || "unknown"}${assess.maintainerContact ? ` (${assess.maintainerContact})` : ""}`,
    `Demo branch: ${implement.forkFullName} @ ${implement.branch}`,
    `Hypothetical-PR diff (include this link prominently): ${compareUrl}`,
    `What it does: ${implement.summary}`,
    `Value props: ${assess.valueProps.join("; ")}`,
    "",
    "Choose channel:",
    "  - 'issue'  : a GitHub issue on their repo (most actionable; use when issues are open and no email is known).",
    "  - 'email'  : a short personal email (use when a real email was found).",
    "  - 'dm'     : a short DM (X/LinkedIn/Discord) when that's the obvious channel.",
    "",
    "Tone: specific, humble, no hype, no marketing slop. Lead with what you built for them and the diff link.",
    "Keep it short. Make it trivially easy for them to say yes.",
    "",
    "Return ONLY the JSON: channel, to (issue repo / email / handle), subject, body.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
export default smithers((ctx) => {
  const force = ctx.input.force ?? false;
  const topic = ctx.input.topic ?? null;
  const minStars = ctx.input.minStars ?? 50;
  const workDir = `${WORK_ROOT}/${ctx.runId}`;

  const gate = ctx.outputMaybe("gate", { nodeId: "gate" });
  const discover = ctx.outputMaybe("discover", { nodeId: "discover" });
  const assess = ctx.outputMaybe("assess", { nodeId: "assess" });
  const implement = ctx.outputMaybe("implement", { nodeId: "implement" });
  const diff = ctx.outputMaybe("diff", { nodeId: "diff" });
  const draft = ctx.outputMaybe("draft", { nodeId: "draft" });
  const approval = ctx.outputMaybe("approval", { nodeId: "approval" });

  const proceed = gate?.proceed === true;
  const found = discover?.found === true;
  const goodFit = assess !== undefined && assess.fit !== "none";
  const pushed = implement?.pushed === true;
  const drafted = draft !== undefined;
  const approved = approval?.approved === true;

  return (
    <Workflow name="repo-prospector">
      <Sequence>
        {/* 1 — Self-throttle + load the seen denylist. Stamps lastRunAt on proceed. */}
        <Task id="gate" output={outputs.gate}>
          {() => {
            const now = Date.now();
            const ledger = readLedger();
            const seen = ledger.seen.map((e) => e.repo);
            const sinceLast = ledger.lastRunAt === null ? Number.POSITIVE_INFINITY : now - ledger.lastRunAt;
            const throttled = !force && sinceLast < THROTTLE_MS;
            if (throttled) {
              const mins = Math.ceil((THROTTLE_MS - sinceLast) / 60000);
              return { proceed: false, reason: `throttled — ~${mins} min until the next window`, seen, seenCount: seen.length };
            }
            // Reserve this 15-minute window so cron ticks line up regardless of outcome.
            writeLedger({ ...ledger, lastRunAt: now });
            return { proceed: true, reason: force ? "forced run" : "window open", seen, seenCount: seen.length };
          }}
        </Task>

        {/* 2 — Find one unseen, high-fit repo via gh. */}
        {proceed ? (
          <Task id="discover" output={outputs.discover} agent={agents.smartTool} heartbeatTimeoutMs={600_000}>
            {discoverPrompt(gate?.seen ?? [], topic, minStars)}
          </Task>
        ) : null}

        {/* 3 — Record it immediately so we never look at it twice, even if later stages fail. */}
        {found ? (
          <Task id="record" output={outputs.record}>
            {() => {
              const ledger = readLedger();
              const repo = discover?.fullName ?? "";
              if (repo && !ledger.seen.some((e) => e.repo === repo)) {
                ledger.seen.push({ repo, at: Date.now() });
                writeLedger(ledger);
              }
              return { recorded: Boolean(repo), repo, seenCount: ledger.seen.length };
            }}
          </Task>
        ) : null}

        {/* 4 — Inspect the repo and design the demo. */}
        {found ? (
          <Task id="assess" output={outputs.assess} agent={agents.smartTool} heartbeatTimeoutMs={900_000}>
            {discover ? assessPrompt(discover, workDir) : ""}
          </Task>
        ) : null}

        {/* 5 — Fork into roninjin10, branch, build the demo, push. Allowed without approval. */}
        {goodFit ? (
          <Task id="implement" output={outputs.implement} agent={agents.smartTool} heartbeatTimeoutMs={1_800_000}>
            {discover && assess ? implementPrompt(discover, assess, workDir) : ""}
          </Task>
        ) : null}

        {/* 6 — The hypothetical-PR link: GitHub's cross-fork compare/PR-creator UI. */}
        {pushed ? (
          <Task id="diff" output={outputs.diff}>
            {() => {
              const base = assess?.defaultBranch || discover?.defaultBranch || "main";
              const owner = discover?.owner ?? "";
              const repo = discover?.repo ?? "";
              const branch = implement?.branch ?? "";
              const compareUrl = `https://github.com/${owner}/${repo}/compare/${base}...${FORK_OWNER}:${repo}:${branch}?expand=1`;
              return { compareUrl, branch, forkFullName: implement?.forkFullName ?? `${FORK_OWNER}/${repo}` };
            }}
          </Task>
        ) : null}

        {/* 7 — Draft the outreach (issue / email / dm). Nothing is sent yet. */}
        {pushed ? (
          <Task id="draft" output={outputs.draft} agent={agents.smart}>
            {discover && assess && implement && diff ? draftPrompt(discover, assess, implement, diff.compareUrl) : ""}
          </Task>
        ) : null}

        {/* 8 — Human gate. No issue is created and no email/DM goes out without this. */}
        {drafted ? (
          <Approval
            id="approval"
            output={outputs.approval}
            onDeny="continue"
            request={{
              title: `Send ${draft?.channel} to ${discover?.fullName} maintainer?`,
              summary: [
                `Repo: ${discover?.fullName}  (${discover?.stars ?? 0}★)`,
                `Fit: ${assess?.fit} — ${assess?.smithersWorkflows?.join(", ") || "n/a"}`,
                `Demo branch: ${implement?.forkFullName} @ ${implement?.branch}`,
                `Hypothetical PR: ${diff?.compareUrl}`,
                "",
                `Channel: ${draft?.channel} → ${draft?.to}`,
                `Subject: ${draft?.subject}`,
                "",
                draft?.body ?? "",
              ].join("\n"),
            }}
          />
        ) : null}

        {/* 9 — Only after approval. Issue → create it. Email/DM → hand back the draft to send by hand. */}
        {drafted && approved ? (
          <Task id="send" output={outputs.send}>
            {() => {
              const d = draft;
              if (!d) return { action: "skipped" as const, sent: false, issueUrl: null, note: "no draft" };
              if (d.channel !== "issue") {
                return {
                  action: "draft-only" as const,
                  sent: false,
                  issueUrl: null,
                  note: `Approved ${d.channel}. Send this yourself to ${d.to}. Subject: ${d.subject}`,
                };
              }
              try {
                const out = execFileSync(
                  "gh",
                  ["issue", "create", "--repo", discover?.fullName ?? d.to, "--title", d.subject, "--body", d.body],
                  { encoding: "utf8" },
                );
                const issueUrl = out.trim().split(/\s+/).find((t) => t.startsWith("http")) ?? out.trim();
                return { action: "created-issue" as const, sent: true, issueUrl, note: "issue created on upstream repo" };
              } catch (err: unknown) {
                const msg = (err as { stderr?: unknown; message?: unknown })?.stderr ?? (err as { message?: unknown })?.message ?? String(err);
                return { action: "draft-only" as const, sent: false, issueUrl: null, note: `gh issue create failed: ${String(msg).slice(0, 500)}` };
              }
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
