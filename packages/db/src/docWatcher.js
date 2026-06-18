import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "./sha256Hex.js";

/**
 * Durability file-watcher seam for `_smithers_docs`.
 *
 * Watches a directory of `*.md` docs and upserts each into `_smithers_docs`
 * (via a {@link import("./adapter.js").SmithersDb}), so a doc edited on disk —
 * by a human, an agent, or a `git` checkout — surfaces through the gateway's
 * `listTickets` RPC without a separate import step. The doc identity (`path` PK)
 * is the filename WITHOUT its `.md` extension, matching the id a `createTicket`
 * caller supplies, so a file and an RPC-created row for the same id reconcile to
 * one row.
 *
 * Reconciliation is ONE-DIRECTIONAL (file → DB) and last-write-wins on a
 * content-hash mismatch: a file is upserted only when `sha256(content)` differs
 * from the stored `content_hash` (a no-op otherwise, so a noisy `fs.watch` does
 * not churn the DB or bump `updated_at_ms`). The watcher NEVER writes the DB
 * back out to disk and NEVER materializes a tombstone as a file — a soft-deleted
 * row stays deleted unless its file is independently re-written, in which case
 * the fresh file content legitimately revives it (file wins).
 *
 * @param {import("./adapter.js").SmithersDb} adapter
 * @param {{
 *   dir: string,
 *   kind?: string,
 *   defaultStatus?: string | null,
 *   nowMs?: () => number,
 *   onError?: (error: unknown) => void,
 * }} options
 * @returns {{ dir: string, sync: () => Promise<void>, syncFile: (file: string) => Promise<void>, close: () => void }}
 */
export function watchDocsDirectory(adapter, options) {
    const dir = options.dir;
    const kind = options.kind ?? "ticket";
    const defaultStatus = options.defaultStatus ?? null;
    const now = options.nowMs ?? (() => Date.now());
    const onError = options.onError ?? ((error) => {
        console.warn(`[docWatcher] ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    });

    // The watched directory must exist before `fs.watch`; create it so wiring the
    // seam against a not-yet-populated docs dir is safe (idempotent).
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    /** Map a `*.md` filename to its doc `path` (id) — drop the extension. */
    function pathForFile(file) {
        return file.endsWith(".md") ? file.slice(0, -3) : file;
    }

    /**
     * Reconcile ONE `*.md` file into `_smithers_docs`. Reads the file, hashes it,
     * and upserts only when the hash differs from the stored row (last-write-wins).
     * A vanished/non-`.md`/unreadable file is ignored — the watcher never deletes
     * a row from a missing file (soft-deletes are the gateway's job, not the
     * filesystem's), so a transient editor swap can't tombstone a doc.
     * @param {string} file
     */
    async function syncFile(file) {
        if (!file.endsWith(".md")) {
            return;
        }
        const full = join(dir, file);
        let content;
        try {
            if (!existsSync(full) || !statSync(full).isFile()) {
                return;
            }
            content = readFileSync(full, "utf8");
        }
        catch (error) {
            onError(error);
            return;
        }
        const path = pathForFile(file);
        const contentHash = sha256Hex(content);
        try {
            const existing = await adapter.getDoc(path);
            // Last-write-wins on hash mismatch: identical content (and still live)
            // is a no-op so a duplicate `fs.watch` event never bumps updated_at_ms.
            if (existing && existing.contentHash === contentHash && existing.deletedAtMs == null) {
                return;
            }
            await adapter.upsertDoc({
                path,
                kind,
                content,
                contentHash,
                // Preserve an existing row's status; a brand-new file gets the default.
                status: existing && existing.status != null ? existing.status : defaultStatus,
                updatedAtMs: now(),
                deletedAtMs: null,
            });
        }
        catch (error) {
            onError(error);
        }
    }

    /** Reconcile every `*.md` currently in the directory. */
    async function sync() {
        let files;
        try {
            files = readdirSync(dir);
        }
        catch (error) {
            onError(error);
            return;
        }
        for (const file of files) {
            await syncFile(file);
        }
    }

    // Initial reconcile, then watch for changes. Each event re-syncs just the
    // touched file; errors are reported, never thrown, so a watcher hiccup never
    // takes down the gateway that wired it.
    void sync();

    let watcher = null;
    try {
        watcher = watch(dir, { persistent: false }, (_event, filename) => {
            if (typeof filename === "string" && filename.length > 0) {
                void syncFile(filename);
            }
            else {
                void sync();
            }
        });
        watcher.on("error", onError);
    }
    catch (error) {
        onError(error);
    }

    return {
        dir,
        sync,
        syncFile,
        close: () => {
            if (watcher) {
                watcher.close();
                watcher = null;
            }
        },
    };
}
