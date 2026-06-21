import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { accountsFilePath } from "./accountsFilePath.js";

/**
 * Atomically writes the accounts registry to ~/.smithers/accounts.json. The
 * file is mode 0600 because it may contain raw API keys.
 *
 * Writes to a temp file then renames over the target so a crash mid-write
 * leaves the existing accounts.json byte-identical (atomicity). If the rename
 * fails, the temp file — which contains plaintext API keys — is removed so it
 * cannot linger world-readable or accumulate under ~/.smithers.
 *
 * @param {import("./AccountsFile.ts").AccountsFile} contents
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} the file path that was written
 */
export function writeAccounts(contents, env = process.env) {
    const path = accountsFilePath(env);
    mkdirSync(dirname(path), { recursive: true });
    // pid + time + random so two same-millisecond writers never share a temp
    // path and clobber each other's in-flight bytes.
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}`;
    const serialized = `${JSON.stringify(contents, null, 2)}\n`;
    writeFileSync(tmp, serialized, { encoding: "utf8", mode: 0o600 });
    chmodSync(tmp, 0o600);
    try {
        renameSync(tmp, path);
    } catch (cause) {
        // Don't leave a plaintext-key temp file behind on a failed rename.
        try { rmSync(tmp, { force: true }); } catch {}
        throw cause;
    }
    chmodSync(path, 0o600);
    return path;
}
