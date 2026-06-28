/**
 * Smithers plugin for Eliza (elizaOS).
 *
 * Makes Smithers — a durable control plane for long-running coding agents — a
 * first-class capability of an Eliza agent. Once this plugin is in your
 * character's `plugins`, the agent can launch durable workflows, clear approval
 * gates, and is *automatically* aware of every in-flight run (a provider injects
 * live run status into the agent's context on every turn).
 *
 * Dependency-light by design: it shells out to the `smithers` CLI rather than
 * importing the engine, and it duck-types the Eliza runtime so it works across
 * elizaOS versions without pinning `@elizaos/core`. Drop it into any Eliza agent.
 *
 * @see https://github.com/elizaOS/eliza
 * @see https://smithers.sh
 */

import { spawn } from "node:child_process";

/**
 * Run `smithers <args>` and resolve with the captured result. Never rejects.
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: boolean; code: number; stdout: string; stderr: string }>}
 */
function runSmithers(args, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const base = process.env.SMITHERS_BIN
      ? process.env.SMITHERS_BIN.split(" ")
      : ["bunx", "smithers-orchestrator"];
    const [command, ...prefix] = base;
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(command, [...prefix, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve({ ok: false, code: 127, stdout: "", stderr: String(err) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({ ok: false, code: 124, stdout, stderr: stderr || "smithers timed out" });
    }, timeoutMs);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: 127, stdout, stderr: String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? 1, stdout, stderr });
    });
  });
}

/** Parse the first JSON value out of CLI stdout (tolerates a trailing CTA object). */
function parseFirstJson(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function messageText(message) {
  return (message?.content?.text ?? message?.content ?? message?.text ?? "").toString();
}

/**
 * Action: launch a durable Smithers workflow from a natural-language request.
 * Defaults to the `create-workflow` workflow when the user describes new work
 * with no named workflow, so an Eliza agent always reaches for a durable,
 * inspectable run instead of doing multi-step work in-band.
 */
const runWorkflowAction = {
  name: "RUN_SMITHERS_WORKFLOW",
  similes: ["ORCHESTRATE", "RUN_WORKFLOW", "START_WORKFLOW", "SMITHERS_RUN", "IMPLEMENT_DURABLY"],
  description:
    "Start a durable, crash-safe Smithers workflow run for any multi-step, long-running, " +
    "or background coding task. Prefer this over doing the work in-band. If no workflow id " +
    "is given, run 'create-workflow' to author one from the request.",
  validate: async (_runtime, message) => {
    const text = messageText(message).toLowerCase();
    return /smithers|workflow|orchestrate|implement|run a|keep (going|iterating)|build me/.test(text);
  },
  handler: async (_runtime, message, _state, _options, callback) => {
    const text = messageText(message).trim();
    const named = text.match(/\b(?:workflow|run)\s+([a-z0-9][a-z0-9-]*)\b/i);
    const workflow = named?.[1] ?? "create-workflow";
    const args =
      workflow === "create-workflow"
        ? ["workflow", "run", "create-workflow", "--prompt", text, "--detach"]
        : ["workflow", "run", workflow, "--prompt", text, "--detach"];
    const res = await runSmithers(args, 180_000);
    const parsed = parseFirstJson(res.stdout);
    const runId = parsed?.runId ?? parsed?.id ?? null;
    const reply = res.ok
      ? `Started Smithers workflow \`${workflow}\`${runId ? ` (run \`${runId}\`)` : ""}. ` +
        "I'll watch it and surface any approval gates."
      : `Couldn't start the workflow: ${(res.stderr || res.stdout).trim().slice(0, 400)}`;
    callback?.({ text: reply, action: "RUN_SMITHERS_WORKFLOW", source: "smithers" });
    return res.ok;
  },
  examples: [],
};

/** Action: approve a paused Smithers approval gate. */
const approveAction = {
  name: "SMITHERS_APPROVE",
  similes: ["APPROVE_RUN", "APPROVE_GATE", "UNBLOCK_SMITHERS"],
  description: "Approve a paused Smithers approval gate so the run continues. Provide the run id (and node).",
  validate: async (_runtime, message) => /approve/i.test(messageText(message)) && /run|smithers|gate/i.test(messageText(message)),
  handler: async (_runtime, message, _state, _options, callback) => {
    const text = messageText(message);
    const runId = text.match(/\brun[_-]?[a-z0-9]+/i)?.[0];
    if (!runId) {
      callback?.({ text: "Which run should I approve? Give me the run id." });
      return false;
    }
    const node = text.match(/\bnode\s+([a-z0-9][a-z0-9-]*)/i)?.[1];
    const res = await runSmithers(["approve", runId, ...(node ? ["--node", node] : []), "--by", "eliza"]);
    callback?.({ text: res.ok ? `Approved ${runId}.` : `Approve failed: ${(res.stderr || res.stdout).trim().slice(0, 300)}` });
    return res.ok;
  },
  examples: [],
};

/** Action: deny a paused Smithers approval gate. */
const denyAction = {
  name: "SMITHERS_DENY",
  similes: ["DENY_RUN", "REJECT_GATE"],
  description: "Deny a paused Smithers approval gate. Provide the run id (and node).",
  validate: async (_runtime, message) => /deny|reject/i.test(messageText(message)) && /run|smithers|gate/i.test(messageText(message)),
  handler: async (_runtime, message, _state, _options, callback) => {
    const text = messageText(message);
    const runId = text.match(/\brun[_-]?[a-z0-9]+/i)?.[0];
    if (!runId) {
      callback?.({ text: "Which run should I deny? Give me the run id." });
      return false;
    }
    const node = text.match(/\bnode\s+([a-z0-9][a-z0-9-]*)/i)?.[1];
    const res = await runSmithers(["deny", runId, ...(node ? ["--node", node] : []), "--by", "eliza"]);
    callback?.({ text: res.ok ? `Denied ${runId}.` : `Deny failed: ${(res.stderr || res.stdout).trim().slice(0, 300)}` });
    return res.ok;
  },
  examples: [],
};

/**
 * Provider: inject live Smithers run status into the agent's context every turn,
 * so an Eliza agent is *automatically* aware of in-flight durable work and any
 * pending approval gates without being asked. This is the "always aware" half of
 * the integration — the agent sees what is running and what needs a human.
 */
const smithersRunsProvider = {
  name: "SMITHERS_RUNS",
  get: async () => {
    const res = await runSmithers(["ps", "--json"], 8_000);
    if (!res.ok) return "";
    const data = parseFirstJson(res.stdout);
    const runs = Array.isArray(data) ? data : data?.runs;
    if (!Array.isArray(runs) || runs.length === 0) return "";
    const lines = ["Live Smithers runs (you are the operator — observe and clear gates):"];
    const gates = [];
    for (const run of runs) {
      if (!run || typeof run !== "object") continue;
      const rid = run.runId ?? run.id ?? "?";
      const status = run.status ?? "?";
      const name = run.workflow ?? run.name ?? "workflow";
      lines.push(`- ${rid} (${name}) [${status}]`);
      for (const gate of run.pendingApprovals ?? []) {
        gates.push(`${rid}:${gate.nodeId ?? gate.node ?? "?"}`);
      }
    }
    if (gates.length) lines.push(`Pending approvals (relay to a human, then approve/deny): ${gates.join(", ")}`);
    return lines.join("\n");
  },
};

/** The Smithers Eliza plugin. Add to your character's `plugins`. */
export const smithersPlugin = {
  name: "smithers",
  description:
    "Drive Smithers, a durable control plane for long-running coding agents. Run crash-safe " +
    "multi-step workflows, clear human approval gates, and stay aware of every in-flight run.",
  actions: [runWorkflowAction, approveAction, denyAction],
  providers: [smithersRunsProvider],
  evaluators: [],
};

export default smithersPlugin;
