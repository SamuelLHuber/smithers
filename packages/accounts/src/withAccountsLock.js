import { closeSync, mkdirSync, openSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { accountsFilePath } from "./accountsFilePath.js";

/**
 * Cross-process advisory lock around accounts.json read-modify-write. Smithers
 * runs many agents/CLIs concurrently and both the wizard and the programmatic
 * API can mutate ~/.smithers/accounts.json at the same time. Without a lock,
 * two callers each readAccounts() the same base state and then writeAccounts()
 * the whole file via atomic rename — the second rename clobbers the first
 * writer's entry (lost update). This serializes those critical sections.
 *
 * The lock is an O_EXCL lock file next to accounts.json: only one process can
 * create it. Others spin-wait briefly. A lock older than {@link STALE_LOCK_MS}
 * is treated as orphaned (the holder crashed) and broken, so a killed process
 * can never wedge the registry permanently — which matters because Smithers'
 * whole premise is surviving kills/restarts.
 *
 * @template T
 * @param {NodeJS.ProcessEnv} env
 * @param {() => T} critical the read-modify-write to run while holding the lock
 * @returns {T}
 */
export function withAccountsLock(env, critical) {
    const lockPath = `${accountsFilePath(env)}.lock`;
    mkdirSync(dirname(lockPath), { recursive: true });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    let fd = -1;
    for (;;) {
        try {
            // wx === O_CREAT | O_EXCL | O_WRONLY: atomic create-or-fail.
            fd = openSync(lockPath, "wx", 0o600);
            break;
        } catch (cause) {
            if (cause?.code !== "EEXIST") throw cause;
            if (Date.now() >= deadline) {
                throw new Error(
                    `Timed out acquiring accounts lock at ${lockPath} after ${LOCK_TIMEOUT_MS}ms; another process may be stuck holding it.`,
                );
            }
            if (breakStaleLock(lockPath)) continue;
            spin();
        }
    }
    try {
        writeFileSync(fd, `${process.pid}\n${Date.now()}\n`);
        return critical();
    } finally {
        try { closeSync(fd); } catch {}
        try { rmSync(lockPath, { force: true }); } catch {}
    }
}

const LOCK_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 30_000;

/**
 * Removes the lock file if it is older than STALE_LOCK_MS (the holder almost
 * certainly crashed). Returns true if the caller should retry acquiring.
 *
 * @param {string} lockPath
 * @returns {boolean}
 */
function breakStaleLock(lockPath) {
    try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
            rmSync(lockPath, { force: true });
            return true;
        }
    } catch {
        // Lock vanished between EEXIST and stat: the holder released it. Retry.
        return true;
    }
    return false;
}

/**
 * Busy-wait a few milliseconds before retrying. addAccount/removeAccount are
 * fully synchronous, so the critical section never yields the event loop — a
 * short spin is simpler and safer than introducing async, and the lock is held
 * only for a single read-modify-write.
 */
function spin() {
    const until = Date.now() + 5;
    while (Date.now() < until) {
        // intentional busy-wait
    }
}
