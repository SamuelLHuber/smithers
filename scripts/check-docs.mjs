#!/usr/bin/env node
/**
 * Docs lint gate. Fails CI when the docs drift from house style:
 *   - bare `smithers` / `bunx smithers` CLI invocations (must be
 *     `bunx smithers-orchestrator`)
 *   - hyphenated angle-bracket CLI placeholders (`<run-id>`, must be RUN_ID)
 *   - em-dashes (—)
 *
 * The first two reuse the fix scripts in `--check` mode (one source of truth
 * for detection and fixing). Run the matching fixer to resolve:
 *   bun scripts/normalize-bunx.ts
 *   bun scripts/normalize-placeholders.ts
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(root, "docs");

let failed = false;

for (const script of ["normalize-bunx.ts", "normalize-placeholders.ts"]) {
  const r = spawnSync("bun", [join("scripts", script), "--check"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) failed = true;
}

// Em-dash check (house style: none allowed).
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".mdx") || name.endsWith(".md")) out.push(p);
  }
  return out;
}
const offenders = [];
for (const f of walk(DOCS)) {
  if (readFileSync(f, "utf8").includes("—")) offenders.push(f.replace(root + "/", ""));
}
if (offenders.length) {
  failed = true;
  console.error(
    `\n✗ ${offenders.length} doc file(s) contain em-dashes (—), which house style forbids:\n` +
      offenders.map((o) => `    ${o}`).join("\n"),
  );
} else {
  console.log("✓ no em-dashes in docs");
}

process.exit(failed ? 1 : 0);
