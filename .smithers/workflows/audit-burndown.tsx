// smithers-source: authored
// smithers-display-name: Audit Burndown
/** @jsxImportSource smithers-orchestrator */
import { createSmithers, Sequence, Parallel, Loop, Worktree } from "smithers-orchestrator";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { z } from "zod/v4";
import { agents } from "../agents";
import { ValidationLoop, implementOutputSchema, validateOutputSchema } from "../components/ValidationLoop";
import { reviewOutputSchema } from "../components/Review";

/**
 * Audit Burndown — a long-running (multi-week), validation-first burndown engine
 * for the bulletproof-audit backlog in `.smithers/tickets/smithers/*.md`.
 *
 * Design goals (the whole point of this workflow):
 *  1. SMALL TASKS. The unit of work is a single open `- [ ]` checkbox item, not a
 *     whole ticket. An agent does ONE small item per worktree, so progress is
 *     incremental and reviewable.
 *  2. PROVE THE WORK IS WORKING. Per-item agents implement + self-validate +
 *     get independently reviewed inside an isolated `<Worktree>`. But the
 *     AUTHORITATIVE proof is the COMPLETENESS ORACLE: a deterministic compute
 *     task that, after the batch merges to local main, runs the REAL full gate
 *     (`pnpm typecheck` + `pnpm test`) on the real main checkout — where every
 *     workspace package resolves correctly — and records the result. Agents
 *     cannot fake a compute task's exit code, and only a green full-gate-on-main
 *     proves the landed changes actually work end-to-end.
 *  3. OBSERVABILITY PROVING COMPLETENESS. Every outer iteration writes a
 *     `completeness` row: open-item count before/after, items closed this batch,
 *     and the main-gate result. That table is queryable (`smithers inspect`,
 *     `smithers node oracle -r <run>`, `smithers events`) and traced via OTLP,
 *     so the burndown is observable and "done" is provable: openCount == 0 AND
 *     the full gate is green on main.
 *  4. MULTI-WEEK / DURABLE. The whole thing is wrapped in an outer `<Loop>` that
 *     re-discovers a fresh batch each iteration and stops only when the backlog
 *     is empty and main is green. Run it with `smithers up … --detach` +
 *     `smithers supervise` and it survives restarts via resume, grinding the
 *     backlog down over days/weeks one verified batch at a time.
 *
 * Run:
 *   smithers up .smithers/workflows/audit-burndown.tsx --detach \
 *     --input '{"batchSize":4,"maxConcurrency":2,"runFullGate":true,"push":false}'
 *   smithers supervise            # auto-resume on owner-process death
 *   smithers ps                   # watch it
 *   smithers node oracle -r RUN   # the completeness proof per iteration
 *   smithers logs RUN --follow    # live progress
 */

const batchItemSchema = z.object({
  slug: z.string(),
  ticketFile: z.string(),
  lineNo: z.number().int(),
  itemText: z.string(),
  pkg: z.string().nullable().default(null),
});

const batchSchema = z.object({
  items: z.array(batchItemSchema).default([]),
  openCount: z.number().int().default(0),
  summary: z.string().default(""),
});

const itemResultSchema = z.object({
  slug: z.string(),
  ticketFile: z.string(),
  itemText: z.string(),
  branch: z.string(),
  status: z.enum(["success", "partial", "failed"]).default("partial"),
  summary: z.string().default(""),
});

const mergeSchema = z.object({
  merged: z.array(z.string()).default([]),
  skipped: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

const completenessSchema = z.object({
  openCountBefore: z.number().int().default(0),
  openCountAfter: z.number().int().default(0),
  closedThisBatch: z.number().int().default(0),
  mainTypecheckGreen: z.boolean().default(false),
  mainTestGreen: z.boolean().default(false),
  mainGateGreen: z.boolean().default(false),
  ranFullGate: z.boolean().default(false),
  summary: z.string().default(""),
  output: z.string().default(""),
});

const approvalSchema = z.object({
  approved: z.boolean(),
  note: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
});

const inputSchema = z.object({
  /** How many small items to work per outer iteration. */
  batchSize: z.number().int().default(4),
  /** How many worktrees run in parallel within a batch. */
  maxConcurrency: z.number().int().default(2),
  /** Cap on outer iterations (high — this is meant to run for weeks). */
  maxOuterIterations: z.number().int().default(200),
  /** Per-item implement→validate→review loop cap. */
  maxItemIterations: z.number().int().default(3),
  /** Run the heavy full `pnpm typecheck && pnpm test` in the oracle (authoritative). */
  runFullGate: z.boolean().default(true),
  /** Glob-ish ticket-id prefixes to target (e.g. ["0052","0047"]); empty = all. */
  ticketPrefixes: z.array(z.string()).default([]),
});

const { Workflow, Task, Approval, smithers, outputs } = createSmithers({
  input: inputSchema,
  batch: batchSchema,
  itemResult: itemResultSchema,
  merge: mergeSchema,
  completeness: completenessSchema,
  approval: approvalSchema,
  implement: implementOutputSchema,
  validate: validateOutputSchema,
  review: reviewOutputSchema,
});

type BatchItem = z.infer<typeof batchItemSchema>;

const TICKETS_DIR = ".smithers/tickets/smithers";

/** Sub-bullet markers that mean an item is already resolved/deferred/dispositioned. */
const RESOLVED_MARKERS = ["_done", "_disposition", "_correction", "_resolved", "_scope assessment", "_partial"];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** Heuristically pull a `packages/<x>` or `apps/<x>` package dir out of item text. */
function guessPackage(text: string): string | null {
  const m = text.match(/\b(packages|apps)\/([a-z0-9-]+)/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Scan the audit tickets for genuinely-actionable open `- [ ]` checkbox items:
 * an open checkbox whose immediately-following sub-bullet is NOT a disposition/
 * done/deferred note. Returns them oldest-ticket-first, with a stable slug.
 */
function discoverActionableItems(prefixes: string[]): BatchItem[] {
  const root = resolve(process.cwd(), TICKETS_DIR);
  let files: string[];
  try {
    files = readdirSync(root).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
  } catch {
    return [];
  }
  files.sort();
  const out: BatchItem[] = [];
  for (const file of files) {
    const ticketId = file.slice(0, 4);
    if (prefixes.length > 0 && !prefixes.some((p) => file.startsWith(p))) continue;
    const rel = `${TICKETS_DIR}/${file}`;
    let lines: string[];
    try {
      lines = readFileSync(resolve(process.cwd(), rel), "utf8").split("\n");
    } catch {
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!/^\s*- \[ \]/.test(line)) continue;
      // Look at the next non-empty line: if it's a disposition/done sub-bullet, skip.
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? "").trim() === "") j++;
      const next = (lines[j] ?? "").trim();
      const isResolved = RESOLVED_MARKERS.some((m) => next.startsWith(`- ${m}`) || next.startsWith(m));
      if (isResolved) continue;
      const itemText = line.replace(/^\s*- \[ \]\s*/, "").trim();
      out.push({
        slug: `${ticketId}-${slugify(itemText)}-${i}`,
        ticketFile: rel,
        lineNo: i + 1,
        itemText,
        pkg: guessPackage(itemText),
      });
    }
  }
  return out;
}

function itemPrompt(item: BatchItem): string {
  return [
    `You are completing ONE small audit item end-to-end on this branch. Keep the change tightly scoped to exactly this item — do not bundle unrelated work.`,
    ``,
    `TICKET FILE: ${item.ticketFile} (line ${item.lineNo})`,
    `ITEM: ${item.itemText}`,
    item.pkg ? `LIKELY PACKAGE: ${item.pkg}` : ``,
    ``,
    `Requirements:`,
    `- Make the smallest correct change that fully satisfies the item.`,
    `- Follow CLAUDE.md: atomic emoji+conventional commits, NO mocks in product/e2e, keep the committed src/index.d.ts in sync by hand when you change a public export (tsup does not regen it here).`,
    `- VERIFY locally before you finish: run the affected package's \`pnpm -C <pkg> typecheck\` and \`test\`, plus root \`pnpm lint\` and \`node scripts/check-dependency-boundaries.mjs\`. If you touched docs/, run \`node scripts/check-docs.mjs\` and \`node scripts/check-llms.mjs\` (regenerate bundles with \`pnpm docs:llms\`).`,
    `- If the item turns out to be already-done, stale, by-design, or genuinely multi-week, do NOT fake it: instead edit the ticket to replace the \`- [ ]\` with \`- [x]\` (if truly done) or add a \`  - _disposition (date):_ …\` sub-bullet explaining why, and commit that. An honest disposition counts as completing the item.`,
    `- When the code change is done, CHECK THE BOX: change the item's \`- [ ]\` to \`- [x]\` in ${item.ticketFile} and add a one-line \`— done: …\` note, then commit.`,
    `- Commit your work to this branch. Do not push.`,
  ].filter(Boolean).join("\n");
}

const reviewPromptFor = (item: BatchItem): string =>
  `Independently review the change on this branch for the audit item: "${item.itemText}" (${item.ticketFile}). Approve only if the change is correct, minimal, the ticket box/disposition was updated honestly, and the affected package's typecheck + tests + lint actually pass. Reject with concrete, actionable feedback otherwise.`;

/** Per-item done = validation passed AND a reviewer approved (mirrors ValidationLoop semantics). */
function itemDone(ctx: any, idPrefix: string): { done: boolean; feedback: string | null } {
  const validate = ctx.outputMaybe(outputs.validate, { nodeId: `${idPrefix}:validate` });
  const reviews = (ctx.outputs.review ?? []) as Array<z.infer<typeof reviewOutputSchema> & { nodeId?: string }>;
  const mine = reviews.filter((r) => typeof r.nodeId === "string" && r.nodeId.startsWith(`${idPrefix}:review:`));
  const validationPassed = validate !== undefined && validate.allPassed !== false;
  const anyApproved = mine.length > 0 && mine.some((r) => r.approved === true);
  const done = validationPassed && anyApproved;
  if (validate === undefined) return { done: false, feedback: null };
  const parts: string[] = [];
  if (!validationPassed && validate.failingSummary) parts.push(`VALIDATION FAILED:\n${validate.failingSummary}`);
  for (const r of mine) {
    if (r.approved === false) {
      parts.push(`REVIEWER REJECTED:\n${r.feedback}`);
      for (const issue of r.issues ?? []) parts.push(`  [${issue.severity}] ${issue.title}: ${issue.description}${issue.file ? ` (${issue.file})` : ""}`);
    }
  }
  return { done, feedback: parts.length ? parts.join("\n\n") : null };
}

export default smithers((ctx) => {
  const batchSize = ctx.input.batchSize ?? 4;
  const maxConcurrency = ctx.input.maxConcurrency ?? 2;
  const maxOuterIterations = ctx.input.maxOuterIterations ?? 200;
  const maxItemIterations = ctx.input.maxItemIterations ?? 3;
  const runFullGate = ctx.input.runFullGate ?? true;
  const ticketPrefixes = ctx.input.ticketPrefixes ?? [];

  // Current batch (this outer iteration). Re-discovered fresh each iteration so
  // closed items drop out and new ones rotate in.
  const batch = ctx.outputMaybe(outputs.batch, { nodeId: "discover" });
  const items = (batch?.items ?? []) as BatchItem[];
  const ticketResults = (ctx.outputs.itemResult ?? []) as Array<z.infer<typeof itemResultSchema>>;

  // Outer-loop termination: the latest oracle proves an empty, green backlog.
  const oracle = ctx.outputMaybe(outputs.completeness, { nodeId: "oracle" });
  const backlogEmpty = oracle?.openCountAfter === 0;
  const mainGreen = oracle?.mainGateGreen === true;
  const burndownDone = backlogEmpty && mainGreen;
  const oracleBrokeMain = oracle !== undefined && oracle.ranFullGate && oracle.mainGateGreen === false;

  return (
    <Workflow name="audit-burndown">
      <Loop id="burndown" until={burndownDone} maxIterations={maxOuterIterations} onMaxReached="return-last">
        <Sequence>
          {/* 1. DISCOVER — deterministic scan for small actionable items, pick a batch. */}
          <Task id="discover" output={outputs.batch}>
            {() => {
              const all = discoverActionableItems(ticketPrefixes);
              const chosen = all.slice(0, batchSize);
              return {
                items: chosen,
                openCount: all.length,
                summary: `${all.length} actionable open items; working ${chosen.length}: ${chosen.map((c) => c.slug).join(", ") || "(none)"}`,
              };
            }}
          </Task>

          {/* 2. WORK — one small item per isolated worktree, in parallel. */}
          <Parallel maxConcurrency={maxConcurrency}>
            {items.map((item) => {
              const idPrefix = `bd-${item.slug}`;
              const { done, feedback } = itemDone(ctx, idPrefix);
              return (
                <Worktree key={item.slug} path={`.worktrees/burndown-${item.slug}`} branch={`burndown/${item.slug}`}>
                  <Sequence>
                    <ValidationLoop
                      idPrefix={idPrefix}
                      prompt={itemPrompt(item)}
                      implementAgents={agents.smart}
                      validateAgents={agents.cheapFast}
                      reviewAgents={agents.smart}
                      feedback={feedback}
                      done={done}
                      maxIterations={maxItemIterations}
                    />
                    <Task id={`result-${item.slug}`} output={outputs.itemResult} continueOnFail>
                      {{
                        slug: item.slug,
                        ticketFile: item.ticketFile,
                        itemText: item.itemText,
                        branch: `burndown/${item.slug}`,
                        status: done ? "success" : "partial",
                        summary: done ? `Completed: ${item.itemText}` : `Did not converge: ${item.itemText}`,
                      }}
                    </Task>
                  </Sequence>
                </Worktree>
              );
            })}
          </Parallel>

          {/* 3. MERGE — land only the green+approved branches onto LOCAL main. */}
          <Task id="merge" output={outputs.merge} agent={agents.smart}>
            {[
              `Merge the completed burndown branches from this batch into local \`main\`. Do NOT push to origin.`,
              ``,
              `Batch results:`,
              ticketResults.map((r) => `- ${r.slug} [${r.status}] branch "${r.branch}" — ${r.summary}`).join("\n") || "(none)",
              ``,
              `Rules:`,
              `- Only merge branches whose status is "success". Skip "partial"/"failed" and list them in \`skipped\`.`,
              `- Merge each onto main with a fast-forward or a clean merge commit; resolve trivial ticket-file conflicts by unioning the checkbox/disposition edits.`,
              `- After merging, run \`pnpm typecheck\` and \`pnpm lint\` at the repo root and fix any trivial merge fallout before finishing.`,
              `- Report \`merged\` (slugs landed on main), \`skipped\` (slugs left behind + why), and a short \`summary\`.`,
            ].join("\n")}
          </Task>

          {/* 4. COMPLETENESS ORACLE — the authoritative proof. Re-count open items and
              run the REAL full gate on the real main checkout. This is what makes
              "done" provable and observable; agents cannot fake the exit codes. */}
          <Task id="oracle" output={outputs.completeness}>
            {async () => {
              const { spawnSync } = await import("node:child_process");
              const openBefore = batch?.openCount ?? 0;
              const remaining = discoverActionableItems(ticketPrefixes);
              const openAfter = remaining.length;
              const run = (cmd: string) => {
                const res = spawnSync("bash", ["-lc", cmd], {
                  cwd: process.cwd(),
                  encoding: "utf8",
                  timeout: 1_800_000,
                  maxBuffer: 64 * 1024 * 1024,
                  env: process.env,
                });
                const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
                return { code: typeof res.status === "number" ? res.status : null, out: combined };
              };
              let typecheckGreen = true;
              let testGreen = true;
              let tail = "";
              if (runFullGate) {
                const tc = run("pnpm typecheck");
                typecheckGreen = tc.code === 0;
                tail += `\n=== pnpm typecheck (exit ${tc.code}) ===\n${tc.out.slice(-4000)}`;
                if (typecheckGreen) {
                  const t = run("pnpm test");
                  testGreen = t.code === 0;
                  tail += `\n=== pnpm test (exit ${t.code}) ===\n${t.out.slice(-6000)}`;
                } else {
                  testGreen = false;
                  tail += `\n=== pnpm test SKIPPED (typecheck red) ===`;
                }
              }
              const mainGateGreen = runFullGate ? typecheckGreen && testGreen : true;
              return {
                openCountBefore: openBefore,
                openCountAfter: openAfter,
                closedThisBatch: Math.max(0, openBefore - openAfter),
                mainTypecheckGreen: typecheckGreen,
                mainTestGreen: testGreen,
                mainGateGreen,
                ranFullGate: runFullGate,
                summary: `open ${openBefore}→${openAfter} (closed ${Math.max(0, openBefore - openAfter)}); main gate ${mainGateGreen ? "GREEN" : "RED"}${runFullGate ? "" : " (full gate skipped)"}`,
                output: tail.slice(-12000),
              };
            }}
          </Task>

          {/* 5. SAFETY — if the batch turned main red, stop and ask a human before
              continuing (never push a red main; never grind on a broken base). */}
          {oracleBrokeMain ? (
            <Approval
              id="oracle-fix"
              output={outputs.approval}
              request={{
                title: `Audit burndown turned main RED after the last batch`,
                summary: [
                  `The completeness oracle ran the full gate on main and it FAILED.`,
                  oracle?.summary ?? "",
                  ``,
                  `APPROVE once you have fixed/reverted main back to green to continue the burndown,`,
                  `or DENY to stop the run for manual takeover.`,
                  ``,
                  `--- gate output (tail) ---`,
                  (oracle?.output ?? "").slice(-4000),
                ].join("\n"),
                metadata: { openCountAfter: oracle?.openCountAfter ?? null },
              }}
              onDeny="fail"
            />
          ) : null}
        </Sequence>
      </Loop>
    </Workflow>
  );
});
