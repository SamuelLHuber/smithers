/**
 * One row of the `prompts` collection — the live `listPrompts` RPC response
 * shape.
 *
 * The gateway builds each row by walking the project's `.smithers/prompts/`
 * directory for `.md`/`.mdx` files (the SAME prompt files smithers-studio reads).
 * `id` is the prompt's relative path without extension, so it is the natural
 * primary key the editor selects by.
 *
 * Field provenance (verified against the `listPrompts` handler in
 * `packages/server/src/gateway.js`):
 *  - `id`          — prompt path under `.smithers/prompts/` without extension
 *                    (e.g. `refactor`, `release-content/changelog`).
 *  - `entryFile`   — workspace-relative source path (e.g. `prompts/refactor.mdx`).
 *  - `source`      — raw file text (`fs.readFileSync`).
 *  - `createdAtMs` — `fs.stat().birthtimeMs` (omitted when unavailable).
 *  - `updatedAtMs` — `fs.stat().mtimeMs` (omitted when unavailable).
 */
export type GatewayPromptRow = {
  id: string;
  entryFile: string;
  source: string;
  createdAtMs?: number;
  updatedAtMs?: number;
};
