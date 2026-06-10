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
const ERROR_DEFINITIONS = join(root, "packages/errors/src/smithersErrorDefinitions.js");
const SMITHERS_FACADE_DECLARATIONS = join(root, "packages/smithers/src/index.d.ts");
const ERROR_REFERENCE = join(DOCS, "reference/errors.mdx");
const TYPES_REFERENCE = join(DOCS, "reference/types.mdx");
const IRON_PROXY_EGRESS_SPEC = join(root, ".smithers/specs/iron-proxy-egress-seam.html");
const CLOUD_EXECUTION_SPEC = join(root, ".smithers/specs/cloud-execution-engineering.md");
const CLOUD_PRODUCT_SPEC = join(root, ".smithers/specs/cloud-execution-product.md");

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
// The root README follows the same house style, so gate it alongside docs/.
for (const f of [...walk(DOCS), join(root, "README.md")]) {
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

function readErrorDefinitionCodes() {
  const source = readFileSync(ERROR_DEFINITIONS, "utf8");
  return [...source.matchAll(/^\s{4}([A-Z0-9_]+):\s*\{/gm)].map((match) => match[1]);
}

function checkErrorReferenceCodes(codes) {
  const docs = readFileSync(ERROR_REFERENCE, "utf8");
  const runtimeSection = docs.split("\n## HTTP API Errors\n")[0] ?? docs;
  const rows = [...runtimeSection.matchAll(/^\|\s+`([A-Z0-9_]+)`\s+\|/gm)]
    .map((match) => match[1])
    .filter((code) => codes.includes(code));
  const missing = codes.filter((code) => !rows.includes(code));
  const duplicates = [...new Set(rows.filter((code, index) => rows.indexOf(code) !== index))];
  if (missing.length || duplicates.length) {
    failed = true;
    console.error("\n✗ docs/reference/errors.mdx does not match smithersErrorDefinitions:");
    if (missing.length) console.error(`    missing: ${missing.join(", ")}`);
    if (duplicates.length) console.error(`    duplicate: ${duplicates.join(", ")}`);
  } else {
    console.log("✓ error reference lists each built-in code once");
  }
}

function checkKnownErrorCodeUnion(codes) {
  const docs = readFileSync(TYPES_REFERENCE, "utf8");
  const match = docs.match(/type KnownSmithersErrorCode =([\s\S]*?);/);
  const documented = match
    ? [...match[1].matchAll(/"([A-Z0-9_]+)"/g)].map((codeMatch) => codeMatch[1])
    : [];
  const missing = codes.filter((code) => !documented.includes(code));
  const extra = documented.filter((code) => !codes.includes(code));
  if (!match || missing.length || extra.length) {
    failed = true;
    console.error("\n✗ docs/reference/types.mdx KnownSmithersErrorCode does not match smithersErrorDefinitions:");
    if (!match) console.error("    type KnownSmithersErrorCode block not found");
    if (missing.length) console.error(`    missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`    extra: ${extra.join(", ")}`);
  } else {
    console.log("✓ KnownSmithersErrorCode docs match built-in codes");
  }
}

function requireContains(label, source, needles) {
  const missing = needles.filter((needle) => !source.includes(needle));
  if (missing.length) {
    failed = true;
    console.error(`\n✗ ${label} is missing expected public API text:`);
    console.error(missing.map((needle) => `    ${needle}`).join("\n"));
  } else {
    console.log(`✓ ${label} includes expected public API text`);
  }
}

function checkGatewayTypeDocs() {
  const docs = readFileSync(TYPES_REFERENCE, "utf8");
  requireContains("gateway type docs", docs, [
    "type GatewayUiConfig =",
    "type GatewayOperatorUiConfig =",
    "type GatewayRegisterOptions =",
    "type GatewayWebhookConfig =",
    "operatorUi?: GatewayOperatorUiConfig | false;",
    "tokenId?: string;",
    "issuedAtMs?: number;",
    "expiresAtMs?: number;",
    "revokedAtMs?: number;",
  ]);
}

function checkFacadeDeclarations() {
  const declarations = readFileSync(SMITHERS_FACADE_DECLARATIONS, "utf8");
  requireContains("smithers facade declarations", declarations, [
    "type CreateSmithersOptions",
    "declare function createSmithersPostgres",
    "type GatewayUiConfig",
    "type GatewayOperatorUiConfig",
    "type GatewayRegisterOptions",
    "type GatewayWebhookConfig",
  ]);
}

function checkImplementedApisNotMarkedComingSoon() {
  const files = [
    "docs/components/sandbox.mdx",
    "docs/components/timer.mdx",
    "docs/reference/types.mdx",
  ];
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const line of source.split("\n")) {
      if (
        /coming soon/i.test(line) &&
        /(egress|SandboxEgressConfig|Durable suspend|Durable Suspend|timer wake|Gateway wake)/i.test(line)
      ) {
        offenders.push(`${file}: ${line.trim()}`);
      }
    }
  }
  if (offenders.length) {
    failed = true;
    console.error("\n✗ implemented egress/timer APIs are still marked coming soon:");
    console.error(offenders.map((offender) => `    ${offender}`).join("\n"));
  } else {
    console.log("✓ implemented egress/timer APIs are not marked coming soon");
  }
}

function checkIronProxySpecMatchesSandboxSeam() {
  const source = readFileSync(IRON_PROXY_EGRESS_SPEC, "utf8");
  const required = [
    "sandbox-owned egress seam",
    "SandboxEgressConfig",
    "packages/sandbox/src/SandboxEgressConfig.ts",
    "executeSandbox()",
    "request.egress",
    "Smithers core has no built-in iron-proxy provider shortcut.",
  ];
  const forbidden = [
    "EgressProvider",
    "packages/driver/src/egress",
    "provider.attach",
    "BaseCliAgent",
    "ProxyAgent",
    "global undici",
    "agentServiceSpec",
    "@smithers-orchestrator/iron-proxy",
    'provider: "iron-proxy"',
    'provider="iron-proxy"',
    'provider: "freestyle-vm"',
    'provider="freestyle-vm"',
  ];
  const missing = required.filter((needle) => !source.includes(needle));
  const stale = forbidden.filter((needle) => source.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ .smithers/specs/iron-proxy-egress-seam.html does not match the sandbox-owned egress implementation:");
    if (missing.length) console.error(`    missing: ${missing.join(", ")}`);
    if (stale.length) console.error(`    stale: ${stale.join(", ")}`);
  } else {
    console.log("✓ iron-proxy spec describes sandbox-owned egress, not harness-level proxy wiring");
  }
}

function displayPath(file) {
  return file.replace(root + "/", "");
}

function checkFreestyleDocsMatchProviderSeam() {
  const files = new Map([
    [CLOUD_EXECUTION_SPEC, readFileSync(CLOUD_EXECUTION_SPEC, "utf8")],
    [CLOUD_PRODUCT_SPEC, readFileSync(CLOUD_PRODUCT_SPEC, "utf8")],
    [join(root, "docs/components/sandbox.mdx"), readFileSync(join(root, "docs/components/sandbox.mdx"), "utf8")],
    [
      join(root, "docs/examples/freestyle-sandbox-provider.mdx"),
      readFileSync(join(root, "docs/examples/freestyle-sandbox-provider.mdx"), "utf8"),
    ],
    [join(root, "examples/freestyle/README.md"), readFileSync(join(root, "examples/freestyle/README.md"), "utf8")],
  ]);
  const required = [
    [CLOUD_EXECUTION_SPEC, 'Do not add `"freestyle"` to `SandboxRuntime`.'],
    [CLOUD_EXECUTION_SPEC, "No public `--runtime freestyle` flag is added."],
    [CLOUD_PRODUCT_SPEC, "<Sandbox provider={freestyleProvider}>"],
    [join(root, "docs/components/sandbox.mdx"), "vm.fs.writeTextFile()"],
    [join(root, "docs/components/sandbox.mdx"), "https://www.freestyle.sh/docs/vms"],
    [join(root, "docs/examples/freestyle-sandbox-provider.mdx"), "vm.fs.writeTextFile()"],
    [join(root, "examples/freestyle/README.md"), "vm.fs.writeTextFile()"],
  ];
  const forbidden = [
    [CLOUD_EXECUTION_SPEC, "FreestyleSandboxExecutorLive"],
    [CLOUD_EXECUTION_SPEC, "smithers env:setup --freestyle"],
    [CLOUD_EXECUTION_SPEC, "smithers run workflow.tsx --runtime freestyle"],
    [CLOUD_EXECUTION_SPEC, "smithers fork workflow.tsx --run-id run-001 --frame 5 --runtime freestyle"],
    [CLOUD_PRODUCT_SPEC, "smithers env:setup --freestyle"],
    [CLOUD_PRODUCT_SPEC, "--runtime freestyle"],
    [join(root, "docs/components/sandbox.mdx"), "additionalFiles"],
    [join(root, "docs/components/sandbox.mdx"), "https://docs.freestyle.sh/v2/vms"],
    [join(root, "docs/examples/freestyle-sandbox-provider.mdx"), "additionalFiles"],
    [join(root, "examples/freestyle/README.md"), "additionalFiles"],
  ];
  const missing = required.filter(([file, needle]) => !files.get(file)?.includes(needle));
  const stale = forbidden.filter(([file, needle]) => files.get(file)?.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ Freestyle sandbox docs do not match the provider-object implementation:");
    if (missing.length) {
      console.error(
        `    missing: ${missing.map(([file, needle]) => `${displayPath(file)}:${needle}`).join(", ")}`,
      );
    }
    if (stale.length) {
      console.error(
        `    stale: ${stale.map(([file, needle]) => `${displayPath(file)}:${needle}`).join(", ")}`,
      );
    }
  } else {
    console.log("✓ Freestyle sandbox docs describe provider objects, not core runtime strings");
  }
}

function checkRunStateDocsMatchCurrentEmission() {
  const files = new Map([
    [join(root, "docs/runtime/run-state.mdx"), readFileSync(join(root, "docs/runtime/run-state.mdx"), "utf8")],
    [join(root, "docs/runtime/events.mdx"), readFileSync(join(root, "docs/runtime/events.mdx"), "utf8")],
    [join(root, "docs/reference/event-types.mdx"), readFileSync(join(root, "docs/reference/event-types.mdx"), "utf8")],
  ]);
  const required = [
    [join(root, "docs/runtime/run-state.mdx"), "RunStateChanged` is a typed/reserved event variant, but the current runtime"],
    [join(root, "docs/runtime/events.mdx"), "the current runtime does not emit it"],
    [join(root, "docs/reference/event-types.mdx"), "typed and categorized for forward compatibility, but the current runtime does not emit it"],
  ];
  const forbidden = [
    [join(root, "docs/runtime/run-state.mdx"), "emitted by the recovery state machine"],
    [join(root, "docs/runtime/run-state.mdx"), "Event stream: `RunStateChanged` event"],
    [join(root, "docs/runtime/events.mdx"), "every lifecycle event the runtime emits"],
    [join(root, "docs/reference/event-types.mdx"), "discriminated union emitted by the runtime"],
  ];
  const missing = required.filter(([file, needle]) => !files.get(file)?.includes(needle));
  const stale = forbidden.filter(([file, needle]) => files.get(file)?.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ RunState docs overstate current RunStateChanged emission:");
    if (missing.length) {
      console.error(
        `    missing: ${missing.map(([file, needle]) => `${displayPath(file)}:${needle}`).join(", ")}`,
      );
    }
    if (stale.length) {
      console.error(
        `    stale: ${stale.map(([file, needle]) => `${displayPath(file)}:${needle}`).join(", ")}`,
      );
    }
  } else {
    console.log("✓ RunState docs mark RunStateChanged as typed/reserved, not emitted");
  }
}

const errorCodes = readErrorDefinitionCodes();
checkErrorReferenceCodes(errorCodes);
checkKnownErrorCodeUnion(errorCodes);
checkGatewayTypeDocs();
checkFacadeDeclarations();
checkImplementedApisNotMarkedComingSoon();
checkIronProxySpecMatchesSandboxSeam();
checkFreestyleDocsMatchProviderSeam();
checkRunStateDocsMatchCurrentEmission();

process.exit(failed ? 1 : 0);
