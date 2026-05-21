// smithers-source: authored
// smithers-display-name: Autonomous Terminal Demo
/** @jsxImportSource smithers-orchestrator */

/**
 * An autonomous Smithers demo that runs in a single terminal:
 *   - macOS `say` narrates each beat (sequentially — visuals and voice overlap
 *     within a beat, but the next beat waits for the prior voice to finish)
 *   - banners, boxed quotes, syntax-coloured snippets in the same TTY
 *   - the durability and time-travel beats run a REAL nested smithers process
 *     against a stage workflow at .smithers/workflows/demo-stage/sample.tsx
 *   - the meta beat near the end `cat`s this file itself
 *
 * Usage (from repo root):
 *   ./.smithers/scripts/run-demo.sh
 *   ./.smithers/scripts/run-demo.sh --silent --speed 8     # iterate on visuals
 *   ./.smithers/scripts/run-demo.sh --voice Daniel         # alternate voice
 *
 * Target length: ~5 minutes with audio on (Ava Premium).
 */

import { createSmithers } from "smithers-orchestrator";
import { z } from "zod/v4";

const inputSchema = z.object({
  silent: z.boolean().default(false),
  voice: z.string().default("Ava (Premium)"),
  rate: z.number().int().default(195),
  speed: z.number().default(1),
});

const beatSchema = z.object({ done: z.boolean() });
const durabilitySchema = z.object({ done: z.boolean(), subRunId: z.string() });

const { Workflow, Task, Sequence, smithers, outputs } = createSmithers({
  input: inputSchema,
  cold: beatSchema,
  thesis: beatSchema,
  shape: beatSchema,
  durability: durabilitySchema,
  timeTravel: beatSchema,
  meta: beatSchema,
  future: beatSchema,
  cta: beatSchema,
});

// ─── ansi + tty helpers ──────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  grey: "\x1b[90m",
  white: "\x1b[37m",
};

const write = (s: string) => process.stdout.write(s);
const clearScreen = () => write("\x1b[2J\x1b[H");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(1, ms)));

const visibleLen = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

const hr = (color = C.grey) => write(`${color}${"─".repeat(78)}${C.reset}\n`);

function box(title: string, lines: string[], color = C.cyan) {
  const w = 76;
  write(`${color}┌${"─".repeat(w)}┐${C.reset}\n`);
  if (title) {
    const pad = w - title.length - 2;
    write(`${color}│${C.reset} ${C.bold}${title}${C.reset}${" ".repeat(Math.max(0, pad))}${color}│${C.reset}\n`);
    write(`${color}├${"─".repeat(w)}┤${C.reset}\n`);
  }
  for (const line of lines) {
    const pad = Math.max(0, w - visibleLen(line) - 2);
    write(`${color}│${C.reset} ${line}${" ".repeat(pad)} ${color}│${C.reset}\n`);
  }
  write(`${color}└${"─".repeat(w)}┘${C.reset}\n`);
}

// Type a line of text character-by-character. Honors --speed for skim mode.
async function type(text: string, dc: DemoCtx, charMs = 12) {
  for (const ch of text) {
    write(ch);
    if (ch !== " ") await sleep(charMs / Math.max(0.1, dc.speed));
  }
  write("\n");
}

// Lightweight syntax highlighter — keyword / string / comment / jsx tag.
function printCode(code: string) {
  const KW = /\b(import|from|export|default|const|let|return|function|async|await|if|else|for|of|new)\b/g;
  for (const rawLine of code.split("\n")) {
    const line = rawLine
      .replace(/(\/\/[^\n]*)/g, `${C.grey}$1${C.reset}`)
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, `${C.green}$1${C.reset}`)
      .replace(KW, `${C.magenta}$1${C.reset}`)
      .replace(/(<\/?\w+)/g, `${C.cyan}$1${C.reset}`)
      .replace(/(\b\w+)(?==)/g, `${C.yellow}$1${C.reset}`);
    write(`  ${line}\n`);
  }
}

// ─── speech ──────────────────────────────────────────────────────────────────

type DemoCtx = { silent: boolean; voice: string; rate: number; speed: number };

const estimateMs = (text: string, rate: number) =>
  Math.max(800, (text.split(/\s+/).length / rate) * 60 * 1000);

/**
 * Speak text via macOS `say`. Resolves when the say process actually exits
 * (not an estimate). In --silent mode, falls back to a word-count estimate
 * so timing roughly tracks an audio run.
 *
 * Pair with a visual via `Promise.all([visual(), speak(text, dc)])` so the
 * visual unfolds while the voice talks, and the beat ends when both finish.
 */
async function speak(text: string, dc: DemoCtx): Promise<void> {
  if (dc.silent) {
    await sleep(estimateMs(text, dc.rate) / Math.max(0.1, dc.speed));
    return;
  }
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve) => {
    const p = spawn("say", ["-v", dc.voice, "-r", String(dc.rate), text], { stdio: "ignore" });
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
}

// ─── beat title card ─────────────────────────────────────────────────────────

async function titleCard(num: string, question: string, dc: DemoCtx) {
  clearScreen();
  await sleep(300 / Math.max(0.1, dc.speed));
  write("\n\n");
  write(`        ${C.dim}BEAT ${num}${C.reset}\n\n`);
  await sleep(400 / Math.max(0.1, dc.speed));
  await type(`        ${C.bold}${C.yellow}${question}${C.reset}`, dc, 18);
  write("\n");
  hr();
  write("\n");
  await sleep(600 / Math.max(0.1, dc.speed));
}

// ─── child process helpers (for real smithers sub-runs) ──────────────────────

const STAGE_DIR = ".smithers/workflows/demo-stage";

async function pretendPrompt(line: string, dc: DemoCtx) {
  write(`${C.grey}$${C.reset} `);
  await type(line, dc, 18);
}

/**
 * Spawn `bun run smithers <args>` in the stage cwd. Returns a handle that
 * resolves when the process exits. stdio is inherited so the smithers output
 * stream appears live in our TTY — the audience sees real task transitions.
 */
async function runReal(
  args: string[],
  opts: { allowFailure?: boolean } = {},
): Promise<number> {
  const { spawn } = await import("node:child_process");
  return new Promise<number>((resolve, reject) => {
    const p = spawn("bun", ["run", "smithers", ...args], {
      cwd: STAGE_DIR,
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
    p.on("close", (code) => {
      if (code === 0 || opts.allowFailure) resolve(code ?? 0);
      else reject(new Error(`smithers ${args.join(" ")} exited ${code}`));
    });
    p.on("error", reject);
  });
}

/** Start smithers, return the child so caller can SIGTERM it. */
async function startReal(args: string[]) {
  const { spawn } = await import("node:child_process");
  const p = spawn("bun", ["run", "smithers", ...args], {
    cwd: STAGE_DIR,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const exited = new Promise<number>((resolve) => p.on("close", (c) => resolve(c ?? 0)));
  return { p, exited };
}

async function wipeStageDb() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  for (const f of ["smithers.db", "smithers.db-shm", "smithers.db-wal"]) {
    try { fs.unlinkSync(path.join(STAGE_DIR, f)); } catch {}
  }
}

// ─── beats ───────────────────────────────────────────────────────────────────

async function beatCold(dc: DemoCtx) {
  clearScreen();
  await sleep(500 / Math.max(0.1, dc.speed));
  const banner = [
    "",
    "   ███████╗███╗   ███╗██╗████████╗██╗  ██╗███████╗██████╗ ███████╗",
    "   ██╔════╝████╗ ████║██║╚══██╔══╝██║  ██║██╔════╝██╔══██╗██╔════╝",
    "   ███████╗██╔████╔██║██║   ██║   ███████║█████╗  ██████╔╝███████╗",
    "   ╚════██║██║╚██╔╝██║██║   ██║   ██╔══██║██╔══╝  ██╔══██╗╚════██║",
    "   ███████║██║ ╚═╝ ██║██║   ██║   ██║  ██║███████╗██║  ██║███████║",
    "   ╚══════╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝",
    "",
  ];
  for (const line of banner) {
    write(`${C.cyan}${line}${C.reset}\n`);
    await sleep(70 / Math.max(0.1, dc.speed));
  }
  write(`${C.dim}            durable AI workflow orchestration as a JSX runtime${C.reset}\n\n\n`);
  await speak("Hi. This is Smithers.", dc);
  await sleep(600 / Math.max(0.1, dc.speed));
  await speak("Over the next five minutes I'm going to show you what it does, " +
    "and the one idea behind it that makes everything else work.", dc);
  await sleep(500 / Math.max(0.1, dc.speed));
}

async function beatThesis(dc: DemoCtx) {
  await titleCard("1", "Why does Smithers exist?", dc);

  await speak(
    "Every workflow engine asks the agent to learn a new schema. " +
    "A custom Y A M L. A node and edges format. A state machine. " +
    "Each one is a domain the agent has seen a small amount of training data for.",
    dc,
  );
  await sleep(400 / Math.max(0.1, dc.speed));

  const visual = (async () => {
    box(
      "The insight",
      [
        "",
        `   React is the ${C.bold}highest-density domain${C.reset} in any LLM's training corpus.`,
        "",
        `   So we map workflow orchestration onto J S X.`,
        `   Agents write it ${C.bold}fluently${C.reset}, ${C.bold}idiomatically${C.reset}, on the first try.`,
        "",
        `   ${C.dim}We call this ${C.bold}AX${C.reset}${C.dim} — Agent Experience.${C.reset}`,
        "",
      ],
      C.yellow,
    );
  })();
  await Promise.all([
    visual,
    speak(
      "React is the highest-density domain in any L L M's training corpus. " +
      "So we did the opposite of everyone else. " +
      "We mapped orchestration onto the one domain agents have already mastered.",
      dc,
    ),
  ]);
  await sleep(600 / Math.max(0.1, dc.speed));
  await speak(
    "Durability, time travel, hot reload, composability — every other property of Smithers " +
    "falls out of that one decision.",
    dc,
  );
  await sleep(500 / Math.max(0.1, dc.speed));
}

async function beatShape(dc: DemoCtx) {
  await titleCard("2", "What is Smithers, mechanically?", dc);

  await speak(
    "The runtime is a loop. Four steps.",
    dc,
  );
  await sleep(400 / Math.max(0.1, dc.speed));

  const diagram = [
    "",
    `       ${C.cyan}┌────────┐${C.reset}     ${C.cyan}┌─────────┐${C.reset}     ${C.cyan}┌─────────┐${C.reset}     ${C.cyan}┌─────────┐${C.reset}`,
    `       ${C.cyan}│ Render │${C.reset} ──▶ ${C.cyan}│ Extract │${C.reset} ──▶ ${C.cyan}│ Execute │${C.reset} ──▶ ${C.cyan}│ Persist │${C.reset}`,
    `       ${C.cyan}│  JSX   │${C.reset}     ${C.cyan}│  tasks  │${C.reset}     ${C.cyan}│  ready  │${C.reset}     ${C.cyan}│ outputs │${C.reset}`,
    `       ${C.cyan}└────────┘${C.reset}     ${C.cyan}└─────────┘${C.reset}     ${C.cyan}└─────────┘${C.reset}     ${C.cyan}└────┬────┘${C.reset}`,
    `             ${C.grey}▲                                                │${C.reset}`,
    `             ${C.grey}└────────────────────────────────────────────────┘${C.reset}`,
    `                          ${C.dim}re-render with new state${C.reset}`,
    "",
  ];
  const visual = (async () => {
    for (const line of diagram) {
      write(`${line}\n`);
      await sleep(120 / Math.max(0.1, dc.speed));
    }
  })();
  await Promise.all([
    visual,
    speak(
      "Render the J S X tree. Extract the list of tasks. Execute the ones that are ready. " +
      "Persist their outputs to SQLite. Re-render. " +
      "That's the entire model.",
      dc,
    ),
  ]);
  await sleep(500 / Math.max(0.1, dc.speed));

  await speak(
    "Branching, loops, approvals, resume, time travel — they're all either J S X constructs " +
    "that affect rendering, or C L I surfaces over the persisted state.",
    dc,
  );
  await sleep(400 / Math.max(0.1, dc.speed));
}

async function beatDurability(dc: DemoCtx): Promise<string> {
  await titleCard("3", "What happens if my workflow crashes?", dc);

  await speak(
    "Let's run a real workflow. " +
    "Three tasks. Research, plan, implement. Like a tiny coding agent pipeline.",
    dc,
  );
  await sleep(300 / Math.max(0.1, dc.speed));

  // Show the sample workflow source
  const fs = await import("node:fs");
  const samplePath = `${STAGE_DIR}/sample.tsx`;
  const src = fs.existsSync(samplePath) ? fs.readFileSync(samplePath, "utf8") : "";
  // Just the JSX body — strip imports/schema noise
  const body =
`<Workflow name="ship-it">
  <Sequence>
    <Task id="research"  output={outputs.research}>  {/* fast */}
      {async () => { await wait(1.2); return { message: "scanned repo" }; }}
    </Task>
    <Task id="plan"      output={outputs.plan}>      {/* slow on purpose */}
      {async () => { await wait(7);   return { message: "drafted plan" }; }}
    </Task>
    <Task id="implement" output={outputs.implement}>
      {async () => { await wait(1.2); return { message: "patches applied" }; }}
    </Task>
  </Sequence>
</Workflow>`;
  printCode(body);
  write("\n");
  await sleep(800 / Math.max(0.1, dc.speed));

  await speak(
    "I'm going to start this workflow, kill the process while plan is running, " +
    "then resume it. Watch what gets re-run and what doesn't.",
    dc,
  );
  await sleep(400 / Math.max(0.1, dc.speed));

  // Generate a fresh run ID + wipe the stage DB so this is a clean run
  const runId = `demo-${Date.now()}`;
  await wipeStageDb();

  // ─── live run #1 — start it, then SIGTERM during plan ─────────────────────
  await pretendPrompt(`smithers up sample.tsx --run-id ${runId}`, dc);
  write("\n");
  const { p, exited } = await startReal(["up", "sample.tsx", "--run-id", runId]);

  // Wait for research to complete + plan to be a few seconds in
  await sleep(3500);

  write(`\n${C.red}${C.bold}^C${C.reset}  ${C.dim}(closing the laptop)${C.reset}\n\n`);
  p.kill("SIGTERM");
  await exited;
  await sleep(600);

  await speak(
    "Research finished. Plan was in flight when I killed it. Implement never started. " +
    "All of that is now sitting in SQLite. Watch.",
    dc,
  );
  await sleep(400 / Math.max(0.1, dc.speed));

  // ─── release the heartbeat lock (process died ungracefully) ───────────────
  await runReal(["cancel", runId], { allowFailure: true });
  await sleep(300);

  // ─── live run #2 — resume from where we left off ──────────────────────────
  write("\n");
  await pretendPrompt(`smithers up sample.tsx --run-id ${runId} --resume true --force`, dc);
  write("\n");
  await runReal(["up", "sample.tsx", "--run-id", runId, "--resume", "true", "--force"]);
  await sleep(600);

  await speak(
    "Look at what just happened. Research did not run again — it was already in the database. " +
    "Plan re-ran as attempt two, because it was interrupted. " +
    "Implement ran for the first time. The workflow finished. No work lost.",
    dc,
  );
  await sleep(500 / Math.max(0.1, dc.speed));

  return runId;
}

async function beatTimeTravel(dc: DemoCtx, runId: string) {
  await titleCard("4", "How do I debug what already happened?", dc);

  await speak(
    "Every render of the J S X tree is a frame. Every frame is committed to the database. " +
    "Not a log of what happened — the actual state.",
    dc,
  );
  await sleep(400 / Math.max(0.1, dc.speed));

  await pretendPrompt(`smithers timeline ${runId}`, dc);
  write("\n");
  await runReal(["timeline", runId, "--format", "md"], { allowFailure: true });
  await sleep(600);

  const visual = (async () => {
    box(
      "What you can do with frames",
      [
        "",
        `   ${C.bold}smithers fork${C.reset}      ${C.dim}branch from any frame${C.reset}`,
        `   ${C.bold}smithers replay${C.reset}    ${C.dim}re-execute from a checkpoint${C.reset}`,
        `   ${C.bold}smithers diff${C.reset}      ${C.dim}compare two snapshots${C.reset}`,
        `   ${C.bold}smithers timetravel${C.reset} ${C.dim}rewind FS state, edit, replay forward${C.reset}`,
        "",
        `   ${C.dim}Your laptop is now a git history for AI workflows.${C.reset}`,
        "",
      ],
      C.magenta,
    );
  })();
  await Promise.all([
    visual,
    speak(
      "Each row is a real snapshot of the workflow plan. " +
      "You can fork from any of them, edit an output, and replay forward " +
      "against the exact source code that ran the original.",
      dc,
    ),
  ]);
  await sleep(500 / Math.max(0.1, dc.speed));
}

async function beatMeta(dc: DemoCtx) {
  await titleCard("5", "One more thing.", dc);

  await speak("Everything you just watched...", dc);
  await sleep(400 / Math.max(0.1, dc.speed));
  await speak("...is itself a Smithers workflow.", dc);
  await sleep(300 / Math.max(0.1, dc.speed));

  const fs = await import("node:fs");
  const path = await import("node:path");
  const self = path.resolve(process.cwd(), ".smithers/workflows/demo.tsx");
  if (fs.existsSync(self)) {
    const src = fs.readFileSync(self, "utf8");
    // Find the workflow JSX block and show just the structural skeleton
    const skeleton =
`export default smithers((ctx) => (
  <Workflow name="demo">
    <Sequence>
      <Task id="cold"       output={outputs.cold}>       {async () => { await beatCold(dc);       return { done: true }; }} </Task>
      <Task id="thesis"     output={outputs.thesis}>     {async () => { await beatThesis(dc);     return { done: true }; }} </Task>
      <Task id="shape"      output={outputs.shape}>      {async () => { await beatShape(dc);      return { done: true }; }} </Task>
      <Task id="durability" output={outputs.durability}> {async () => { const runId = await beatDurability(dc); return { done: true, runId }; }} </Task>
      <Task id="timeTravel" output={outputs.timeTravel}> {async () => { await beatTimeTravel(dc, ctx.output(outputs.durability).runId); return { done: true }; }} </Task>
      <Task id="meta"       output={outputs.meta}>       {async () => { await beatMeta(dc);       return { done: true }; }} </Task>
      <Task id="future"     output={outputs.future}>     {async () => { await beatFuture(dc);     return { done: true }; }} </Task>
      <Task id="cta"        output={outputs.cta}>        {async () => { await beatCta(dc);        return { done: true }; }} </Task>
    </Sequence>
  </Workflow>
));`;
    printCode(skeleton);
    write(`\n${C.dim}     ${src.split("\n").length} lines total · .smithers/workflows/demo.tsx${C.reset}\n\n`);
  }
  await sleep(500 / Math.max(0.1, dc.speed));

  await speak(
    "Each beat you just watched is a Task. " +
    "The narration, the boxes, the live sub-workflow that crashed and resumed — " +
    "every line of this demo lives inside a J S X tree. " +
    "If I had killed this process two minutes ago and resumed, " +
    "you would have picked up exactly where I left off.",
    dc,
  );
  await sleep(600 / Math.max(0.1, dc.speed));
}

async function beatFuture(dc: DemoCtx) {
  await titleCard("6", "Where is Smithers headed?", dc);

  const visual = (async () => {
    box(
      "Smithers, three layers",
      [
        "",
        `   ${C.cyan}1.${C.reset} ${C.bold}smithers-orchestrator${C.reset}   ${C.dim}shipped today · OSS · npm${C.reset}`,
        `       the J S X workflow runtime you just watched`,
        "",
        `   ${C.cyan}2.${C.reset} ${C.bold}Smithers (the forge)${C.reset}      ${C.dim}AGPL · in build · ~78% MVP${C.reset}`,
        `       jj-native code host, landing requests, agent runtime,`,
        `       cloud workspaces on Freestyle VMs, BYOK for LLM keys`,
        "",
        `   ${C.cyan}3.${C.reset} ${C.bold}Smithers GUI${C.reset}              ${C.dim}native macOS · download today${C.reset}`,
        `       embedded Ghostty terminal, time-travel scrubber,`,
        `       multi-agent picker (claude / codex / gemini / kimi / amp / forge)`,
        "",
      ],
      C.cyan,
    );
  })();
  await Promise.all([
    visual,
    speak(
      "Smithers is three layers. " +
      "The orchestrator, shipped today on N P M. " +
      "The forge — a J J native code host with cloud workspaces — in build. " +
      "And a native macOS app you can download right now.",
      dc,
    ),
  ]);
  await sleep(500 / Math.max(0.1, dc.speed));
}

async function beatCta(dc: DemoCtx) {
  clearScreen();
  write("\n\n\n");
  write(`        ${C.bold}${C.green}bunx smithers-orchestrator init${C.reset}\n`);
  write(`        ${C.dim}scaffolds .smithers/ in any project${C.reset}\n\n\n`);
  write(`        ${C.bold}smithers.sh${C.reset}\n`);
  write(`        ${C.dim}docs · llms-full.txt · GUI download${C.reset}\n\n\n`);
  await speak("Try it. B U N X smithers-orchestrator init. Thanks for watching.", dc);
  await sleep(800 / Math.max(0.1, dc.speed));
  write(`\n${C.dim}        — demo complete —${C.reset}\n\n`);
}

// ─── workflow ────────────────────────────────────────────────────────────────

export default smithers((ctx) => {
  const dc: DemoCtx = {
    silent: ctx.input.silent,
    voice: ctx.input.voice,
    rate: ctx.input.rate,
    speed: ctx.input.speed,
  };
  const prev = ctx.outputMaybe(outputs.durability, { nodeId: "durability" });

  return (
    <Workflow name="demo">
      <Sequence>
        <Task id="cold" output={outputs.cold}>
          {async () => { await beatCold(dc); return { done: true }; }}
        </Task>
        <Task id="thesis" output={outputs.thesis}>
          {async () => { await beatThesis(dc); return { done: true }; }}
        </Task>
        <Task id="shape" output={outputs.shape}>
          {async () => { await beatShape(dc); return { done: true }; }}
        </Task>
        <Task id="durability" output={outputs.durability}>
          {async () => {
            const subRunId = await beatDurability(dc);
            return { done: true, subRunId };
          }}
        </Task>
        {prev ? (
          <Task id="timeTravel" output={outputs.timeTravel}>
            {async () => { await beatTimeTravel(dc, prev.subRunId); return { done: true }; }}
          </Task>
        ) : null}
        <Task id="meta" output={outputs.meta}>
          {async () => { await beatMeta(dc); return { done: true }; }}
        </Task>
        <Task id="future" output={outputs.future}>
          {async () => { await beatFuture(dc); return { done: true }; }}
        </Task>
        <Task id="cta" output={outputs.cta}>
          {async () => { await beatCta(dc); return { done: true }; }}
        </Task>
      </Sequence>
    </Workflow>
  );
});
