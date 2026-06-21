import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const testFilePattern = /\.(?:test|spec)(?:-[^.]+)?\.[cm]?[jt]sx?$/;

function containsRuntimeTestFile(dir) {
  if (!existsSync(dir)) {
    return false;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (containsRuntimeTestFile(path)) {
        return true;
      }
      continue;
    }

    if (entry.isFile() && testFilePattern.test(entry.name)) {
      return true;
    }
  }

  return false;
}

function workspacePackageDirs() {
  const dirs = [];
  for (const parent of ["packages", "apps"]) {
    const parentDir = join(root, parent);
    if (!existsSync(parentDir)) continue;

    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDir = join(parentDir, entry.name);
      if (existsSync(join(packageDir, "package.json"))) dirs.push(packageDir);
    }
  }
  return dirs;
}

let failed = false;

for (const packageDir of workspacePackageDirs()) {
  const manifestPath = join(packageDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const hasTests = [
    join(packageDir, "tests"),
    join(packageDir, "src"),
    join(packageDir, "server"),
  ].some(containsRuntimeTestFile);

  if (hasTests && typeof manifest.scripts?.test !== "string") {
    console.error(
      `${relative(root, manifestPath)} has runtime tests but no scripts.test for pnpm -r test`,
    );
    failed = true;
  }
}

if (failed) process.exitCode = 1;
