import { isAbsolute, resolve } from "node:path";
import { SmithersError } from "@smithers-orchestrator/errors/SmithersError";
import { WORKTREE_EMPTY_PATH_ERROR } from "./constants.js";

/**
 * Resolve a <Worktree path> prop exactly the way graph extraction resolves it.
 *
 * @param {unknown} path
 * @param {{ baseRootDir?: string }} [opts]
 * @returns {string}
 */
export function resolveWorktreePath(path, opts) {
    const pathVal = String(path ?? "").trim();
    if (!pathVal) {
        throw new SmithersError("WORKTREE_EMPTY_PATH", WORKTREE_EMPTY_PATH_ERROR);
    }
    if (isAbsolute(pathVal)) {
        return resolve(pathVal);
    }
    const base = typeof opts?.baseRootDir === "string" && opts.baseRootDir.length > 0
        ? opts.baseRootDir
        : process.cwd();
    return resolve(base, pathVal);
}
