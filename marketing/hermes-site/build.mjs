/**
 * Stage the self-contained marketing site into `dist/` for the static
 * Cloudflare deploy. The whole site is one file (index.html) with no external
 * assets, so this just copies it in as the site index. Mirrors the gil microsite.
 */
import { rm, mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, "dist");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile(resolve(root, "index.html"), resolve(out, "index.html"));

console.log(`build: staged ${out} (index.html)`);
