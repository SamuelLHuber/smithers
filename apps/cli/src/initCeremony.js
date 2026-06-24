import { basename } from "node:path";
import { intro, log } from "@clack/prompts";
import pc from "picocolors";
import { detectAvailableAgents } from "./agent-detection.js";
import { initWorkflowPack } from "./workflow-pack.js";

/**
 * Render the human-facing `smithers init` flow: a clean clack ceremony that
 * narrates each step (scaffold → detect agents → install) instead of dumping
 * the raw result object. Returns the same {@link InitResult} as a plain
 * {@link initWorkflowPack} call so callers can attach templates/CTAs after.
 *
 * Only call this in interactive TTY mode; piped/agent callers should use
 * {@link initWorkflowPack} directly so structured output is preserved.
 *
 * @param {{ force?: boolean; agentsOnly?: boolean; install?: boolean; global?: boolean; installSkill?: boolean; env?: NodeJS.ProcessEnv }} opts
 * @returns {import("./workflow-pack.js").InitResult}
 */
export function runInitCeremony(opts = {}) {
    const env = opts.env ?? process.env;
    const agentsOnly = Boolean(opts.agentsOnly);
    const global = Boolean(opts.global);
    const installSkill = opts.installSkill !== false;

    intro(`${pc.bgCyan(pc.black(" smithers "))} ${pc.dim(global ? "init --global" : "init")}`);

    const reporter = {
        scaffolded({ writtenCount, skippedCount }) {
            const base = global ? "~/.smithers/" : ".smithers/";
            const target = pc.cyan(agentsOnly ? `${base}agents/` : base);
            log.success(`Scaffolded ${agentsOnly ? "agent config" : "workflow pack"} into ${target}`);
            const parts = [];
            if (writtenCount > 0) parts.push(`${pc.bold(String(writtenCount))} ${pc.dim(`file${writtenCount === 1 ? "" : "s"} created`)}`);
            if (skippedCount > 0) parts.push(`${pc.bold(String(skippedCount))} ${pc.dim("preserved")}`);
            log.message(parts.length > 0 ? parts.join(pc.dim("  ·  ")) : pc.dim("nothing to write (pack already present)"));
            renderAgents(env);
        },
        skillInstalled(result) {
            if (result.installed.length === 0) return;
            const agents = result.installed.map((entry) => entry.agent).join(", ");
            log.message(`${pc.dim("→")} Installed the ${pc.cyan(result.skill)} skill for you ${pc.dim("(" + agents + ")")}`);
        },
        agentDocsNoted(result) {
            const updated = result.files.filter((file) => file.status === "updated");
            if (updated.length === 0) return;
            const names = updated.map((file) => pc.cyan(basename(file.path))).join(", ");
            log.message(`${pc.dim("→")} Added ${pc.cyan("smithers.sh")} workflow guidance to ${names}`);
        },
        installStart() {
            log.step("Installing dependencies " + pc.dim("(bun install)"));
        },
        installDone(result, captured) {
            if (result.status === "ok") {
                log.success("Dependencies installed");
                return;
            }
            log.warn(`Skipping install: ${result.reason}`);
            const tail = (captured?.stderr || captured?.stdout || "").trim().split("\n").slice(-4).join("\n");
            if (tail) log.message(pc.dim(tail));
        },
    };

    return initWorkflowPack({
        force: opts.force,
        agentsOnly,
        global,
        installSkill,
        skipInstall: agentsOnly || opts.install === false,
        reporter,
    });
}

/**
 * Show which coding agents Smithers found on this machine, so it's obvious what
 * `agents.ts` was wired up to and what's missing.
 *
 * @param {NodeJS.ProcessEnv} env
 */
function renderAgents(env) {
    const detections = detectAvailableAgents(env).filter((agent) => !agent.deprecated);
    if (detections.length === 0) return;
    const usable = detections.filter((agent) => agent.usable);
    const lines = detections
        .slice()
        .sort((left, right) => Number(right.usable) - Number(left.usable))
        .map((agent) => agent.usable
            ? `${pc.green("✓")} ${agent.displayName}`
            : `${pc.dim("○")} ${pc.dim(agent.displayName)} ${pc.dim(`(${agent.unusableReasons[0] ?? "unavailable"})`)}`);
    log.step(`Coding agents ${pc.dim(`(${usable.length} ready)`)}`);
    log.message(lines.join("\n"));
}
