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
const CLI_OVERVIEW = join(DOCS, "cli/overview.mdx");
const CLI_ENTRYPOINT = join(root, "apps/cli/src/index.js");
const TOOLS_INTEGRATION = join(DOCS, "integrations/tools.mdx");
const ENGINE_SOURCE = join(root, "packages/engine/src/engine.js");
const PACKAGE_CONFIGURATION_REFERENCE = join(DOCS, "reference/package-configuration.mdx");
const ROOT_PACKAGE_JSON = join(root, "package.json");
const ROOT_BUNFIG = join(root, "bunfig.toml");
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
    "export { SmithersDb } from '@smithers-orchestrator/db/adapter';",
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
    [join(root, "docs/reference/types.mdx"), readFileSync(join(root, "docs/reference/types.mdx"), "utf8")],
  ]);
  const required = [
    [join(root, "docs/runtime/run-state.mdx"), "RunStateChanged` is a typed/reserved event variant, but the current runtime"],
    [join(root, "docs/runtime/events.mdx"), "the current runtime does not emit it"],
    [join(root, "docs/reference/event-types.mdx"), "typed and categorized for forward compatibility, but the current runtime does not emit it"],
    [join(root, "docs/reference/types.mdx"), "`SmithersEvent` is the discriminated union understood by the runtime and"],
    [join(root, "docs/reference/types.mdx"), "Most variants are emitted by the runtime; reserved"],
  ];
  const forbidden = [
    [join(root, "docs/runtime/run-state.mdx"), "emitted by the recovery state machine"],
    [join(root, "docs/runtime/run-state.mdx"), "Event stream: `RunStateChanged` event"],
    [join(root, "docs/runtime/events.mdx"), "every lifecycle event the runtime emits"],
    [join(root, "docs/reference/event-types.mdx"), "discriminated union emitted by the runtime"],
    [join(root, "docs/reference/types.mdx"), "every lifecycle event the runtime"],
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

function checkGatewayGetRunDocsMatchResponseShape() {
  const files = new Map([
    [join(root, "packages/gateway/src/rpc/index.ts"), readFileSync(join(root, "packages/gateway/src/rpc/index.ts"), "utf8")],
    [join(root, "docs/rpc/get-run.mdx"), readFileSync(join(root, "docs/rpc/get-run.mdx"), "utf8")],
    [join(root, "docs/integrations/gateway.mdx"), readFileSync(join(root, "docs/integrations/gateway.mdx"), "utf8")],
    [join(root, "docs/guides/custom-workflow-ui.mdx"), readFileSync(join(root, "docs/guides/custom-workflow-ui.mdx"), "utf8")],
    [join(root, "docs/examples/workflow-ui-react.mdx"), readFileSync(join(root, "docs/examples/workflow-ui-react.mdx"), "utf8")],
  ]);
  const required = [
    [join(root, "packages/gateway/src/rpc/index.ts"), "Fetch one run record with node-state counts and optional derived runState."],
    [join(root, "packages/gateway/src/rpc/index.ts"), "responseSchema: runRecord"],
    [join(root, "docs/rpc/get-run.mdx"), "Response: run record with `summary` and optional `runState: RunStateView`"],
    [join(root, "docs/integrations/gateway.mdx"), "getRun,runId,Run record + optional runState"],
    [join(root, "docs/guides/custom-workflow-ui.mdx"), "{ data: Record<string, unknown>, loading, error, refetch }"],
    [join(root, "docs/examples/workflow-ui-react.mdx"), "type RunRecord = { status?: string; workflowKey?: string; runState?: RunStateView };"],
    [join(root, "docs/examples/workflow-ui-react.mdx"), "runRecord?.runState?.state ?? runRecord?.status"],
  ];
  const forbidden = [
    [join(root, "packages/gateway/src/rpc/index.ts"), "Fetch the current RunStateView for one run."],
    [join(root, "packages/gateway/src/rpc/index.ts"), 'responseSchema: objectSchema({}, [], "RunStateView.", true)'],
    [join(root, "docs/rpc/get-run.mdx"), "Response: `RunStateView`"],
    [join(root, "docs/integrations/gateway.mdx"), "getRun,runId,RunStateView,"],
    [join(root, "docs/guides/custom-workflow-ui.mdx"), "RunStateView, refetches as the seq advances"],
    [join(root, "docs/guides/custom-workflow-ui.mdx"), "{ data: RunStateView, loading, error, refetch }"],
    [join(root, "docs/examples/workflow-ui-react.mdx"), "const runState = run.data as RunStateView | undefined;"],
  ];
  const missing = required.filter(([file, needle]) => !files.get(file)?.includes(needle));
  const stale = forbidden.filter(([file, needle]) => files.get(file)?.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ Gateway getRun docs must describe the run record payload, not a bare RunStateView:");
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
    console.log("✓ Gateway getRun docs describe a run record with optional runState");
  }
}

function checkSandboxDocsMatchProviderTypes() {
  const files = new Map([
    [join(root, "packages/components/src/components/SandboxProps.ts"), readFileSync(join(root, "packages/components/src/components/SandboxProps.ts"), "utf8")],
    [join(root, "packages/sandbox/src/ExecuteSandboxOptions.ts"), readFileSync(join(root, "packages/sandbox/src/ExecuteSandboxOptions.ts"), "utf8")],
    [join(root, "packages/sandbox/src/SandboxProvider.ts"), readFileSync(join(root, "packages/sandbox/src/SandboxProvider.ts"), "utf8")],
    [join(root, "docs/components/sandbox.mdx"), readFileSync(join(root, "docs/components/sandbox.mdx"), "utf8")],
    [join(root, "docs/reference/types.mdx"), readFileSync(join(root, "docs/reference/types.mdx"), "utf8")],
  ]);
  const required = [
    [join(root, "packages/components/src/components/SandboxProps.ts"), "provider?: unknown;"],
    [join(root, "packages/sandbox/src/ExecuteSandboxOptions.ts"), "provider?: SandboxProvider | string;"],
    [join(root, "packages/sandbox/src/ExecuteSandboxOptions.ts"), "parentWorkflow: SandboxWorkflow | undefined"],
    [join(root, "packages/sandbox/src/SandboxProvider.ts"), "executeChildWorkflow: ExecuteSandboxChildWorkflow;"],
    [join(root, "docs/components/sandbox.mdx"), "provider?: unknown; // runtime accepts a provider object or registered provider id"],
    [join(root, "docs/components/sandbox.mdx"), "The JSX prop is typed `unknown`; at execution time Smithers accepts a provider object directly"],
    [join(root, "docs/reference/types.mdx"), "provider?: unknown;              // runtime accepts a provider object or registered provider id"],
    [join(root, "docs/reference/types.mdx"), "type ExecuteSandboxChildWorkflow = ("],
    [join(root, "docs/reference/types.mdx"), "executeChildWorkflow: ExecuteSandboxChildWorkflow;"],
    [join(root, "docs/reference/types.mdx"), "diffBundle?: SandboxDiffBundleLike;"],
    [join(root, "docs/reference/types.mdx"), "type ExecuteSandboxOptions = {"],
    [join(root, "docs/reference/types.mdx"), "provider?: SandboxProvider | string;"],
  ];
  const forbidden = [
    [join(root, "docs/components/sandbox.mdx"), "provider?: SandboxProvider | string;"],
    [join(root, "docs/reference/types.mdx"), "provider?: SandboxProvider | string; // object, or an id registered with registerSandboxProvider()"],
    [join(root, "docs/reference/types.mdx"), "executeChildWorkflow: (args: unknown) => Promise<unknown>;"],
    [join(root, "docs/reference/types.mdx"), "diffBundle?: unknown;"],
  ];
  const missing = required.filter(([file, needle]) => !files.get(file)?.includes(needle));
  const stale = forbidden.filter(([file, needle]) => files.get(file)?.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ Sandbox docs must distinguish JSX provider typing from executeSandbox provider typing:");
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
    console.log("✓ Sandbox docs match JSX provider and executeSandbox provider types");
  }
}

function checkServeDocsMatchServerTypes() {
  const files = new Map([
    [join(root, "packages/server/src/ServeOptions.ts"), readFileSync(join(root, "packages/server/src/ServeOptions.ts"), "utf8")],
    [join(root, "packages/smithers/src/index.js"), readFileSync(join(root, "packages/smithers/src/index.js"), "utf8")],
    [join(root, "packages/smithers/src/index.d.ts"), readFileSync(join(root, "packages/smithers/src/index.d.ts"), "utf8")],
    [join(root, "docs/reference/types.mdx"), readFileSync(join(root, "docs/reference/types.mdx"), "utf8")],
    [join(root, "docs/integrations/serve.mdx"), readFileSync(join(root, "docs/integrations/serve.mdx"), "utf8")],
  ]);
  const required = [
    [join(root, "packages/server/src/ServeOptions.ts"), "workflow: SmithersWorkflow<unknown>;"],
    [join(root, "packages/server/src/ServeOptions.ts"), "adapter: SmithersDb;"],
    [join(root, "packages/smithers/src/index.js"), 'export { SmithersDb } from "@smithers-orchestrator/db";'],
    [join(root, "packages/smithers/src/index.d.ts"), "export { SmithersDb } from '@smithers-orchestrator/db/adapter';"],
    [join(root, "docs/reference/types.mdx"), 'type SmithersDb = import("@smithers-orchestrator/db/adapter").SmithersDb;'],
    [join(root, "docs/reference/types.mdx"), "workflow: SmithersWorkflow<unknown>;"],
    [join(root, "docs/reference/types.mdx"), "adapter: SmithersDb;"],
    [join(root, "docs/integrations/serve.mdx"), "workflow: SmithersWorkflow<unknown>;"],
    [join(root, "docs/integrations/serve.mdx"), "adapter: SmithersDb;"],
  ];
  const forbidden = [
    [join(root, "docs/reference/types.mdx"), "workflow: SmithersWorkflow<any>;"],
    [join(root, "docs/reference/types.mdx"), "adapter: any;"],
  ];
  const missing = required.filter(([file, needle]) => !files.get(file)?.includes(needle));
  const stale = forbidden.filter(([file, needle]) => files.get(file)?.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ ServeOptions docs and facade declarations must match server types:");
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
    console.log("✓ ServeOptions docs and SmithersDb facade declaration match server types");
  }
}

function checkComponentPropsDocsMatchSourceTypes() {
  const files = new Map([
    [join(root, "packages/components/src/components/ApprovalAutoApprove.ts"), readFileSync(join(root, "packages/components/src/components/ApprovalAutoApprove.ts"), "utf8")],
    [join(root, "packages/components/src/components/PollerProps.ts"), readFileSync(join(root, "packages/components/src/components/PollerProps.ts"), "utf8")],
    [join(root, "packages/components/src/components/ColumnDef.ts"), readFileSync(join(root, "packages/components/src/components/ColumnDef.ts"), "utf8")],
    [join(root, "docs/reference/types.mdx"), readFileSync(join(root, "docs/reference/types.mdx"), "utf8")],
    [join(root, "docs/components/poller.mdx"), readFileSync(join(root, "docs/components/poller.mdx"), "utf8")],
  ]);
  const required = [
    [join(root, "packages/components/src/components/ApprovalAutoApprove.ts"), "SmithersCtx<unknown> | null"],
    [join(root, "packages/components/src/components/PollerProps.ts"), "check: AgentLike | (() => unknown | Promise<unknown>);"],
    [join(root, "packages/components/src/components/ColumnDef.ts"), 'type ColumnTaskProps = Omit<Partial<TaskProps<unknown>>, "agent" | "children" | "id" | "key" | "output" | "smithersContext">;'],
    [join(root, "docs/reference/types.mdx"), "condition?: ((ctx: SmithersCtx<unknown> | null) => boolean) | (() => boolean);"],
    [join(root, "docs/reference/types.mdx"), "revertOn?: ((ctx: SmithersCtx<unknown> | null) => boolean) | (() => boolean);"],
    [join(root, "docs/reference/types.mdx"), "check: AgentLike | (() => unknown | Promise<unknown>);"],
    [join(root, "docs/reference/types.mdx"), 'type ColumnTaskProps = Omit<Partial<TaskProps<unknown>>, "agent" | "children" | "id" | "key" | "output" | "smithersContext">;'],
    [join(root, "docs/reference/types.mdx"), "task?: ColumnTaskProps;"],
    [join(root, "docs/components/poller.mdx"), "check: AgentLike | (() => Promise<unknown> | unknown);"],
  ];
  const forbidden = [
    [join(root, "docs/reference/types.mdx"), "condition?: ((ctx: any) => boolean) | (() => boolean);"],
    [join(root, "docs/reference/types.mdx"), "revertOn?: ((ctx: any) => boolean) | (() => boolean);"],
    [join(root, "docs/reference/types.mdx"), "check: AgentLike | ((...args: any[]) => any);"],
    [join(root, "docs/reference/types.mdx"), "task?: Partial<TaskProps<unknown>>;"],
  ];
  const missing = required.filter(([file, needle]) => !files.get(file)?.includes(needle));
  const stale = forbidden.filter(([file, needle]) => files.get(file)?.includes(needle));
  if (missing.length || stale.length) {
    failed = true;
    console.error("\n✗ Component prop docs must match source prop declarations:");
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
    console.log("✓ Component prop docs match source prop declarations");
  }
}

function readTomlScalar(source, key, section) {
  let sectionSource = source.split("\n[").at(0);
  if (section) {
    const sectionStart = source.indexOf(`[${section}]`);
    if (sectionStart === -1) return undefined;
    const afterSectionHeader = source.indexOf("\n", sectionStart) + 1;
    const nextSection = source.indexOf("\n[", afterSectionHeader);
    sectionSource = source.slice(afterSectionHeader, nextSection === -1 ? undefined : nextSection);
  }
  return sectionSource?.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1]?.trim();
}

function checkPackageConfigurationDocsMatchRootConfig() {
  const docs = readFileSync(PACKAGE_CONFIGURATION_REFERENCE, "utf8");
  const bunfig = readFileSync(ROOT_BUNFIG, "utf8");
  const packageJson = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, "utf8"));
  const runtimePreload = readTomlScalar(bunfig, "preload");
  const testRoot = readTomlScalar(bunfig, "root", "test");
  const testPreload = readTomlScalar(bunfig, "preload", "test");
  const required = [
    runtimePreload ? `preload = ${runtimePreload}` : null,
    testRoot ? `root = ${testRoot}` : null,
    testPreload ? `preload = ${testPreload}` : null,
    testRoot ? `| \`root\` | \`${testRoot.replace(/^"|"$/g, "")}\` |` : null,
    testPreload ? `| \`preload\` | \`${testPreload}\` |` : null,
    ...Object.entries(packageJson.scripts ?? {}).map(([script, command]) => `| \`${script}\` | \`${command}\` |`),
  ].filter(Boolean);
  const forbidden = [
    "preload.ts",
    'root = "./tests"',
    "| `test` | `node scripts/check-single-effect-version.mjs && node scripts/check-dependency-boundaries.mjs && pnpm -r test` |",
  ];
  const missing = required.filter((needle) => !docs.includes(needle));
  const stale = forbidden.filter((needle) => docs.includes(needle));
  if (missing.length || stale.length || !runtimePreload || !testRoot || !testPreload) {
    failed = true;
    console.error("\n✗ Package configuration docs must match root package.json and bunfig.toml:");
    if (!runtimePreload) console.error("    could not read root bunfig.toml preload");
    if (!testRoot) console.error("    could not read bunfig.toml [test].root");
    if (!testPreload) console.error("    could not read bunfig.toml [test].preload");
    if (missing.length) console.error(`    missing: ${missing.join(", ")}`);
    if (stale.length) console.error(`    stale: ${stale.join(", ")}`);
  } else {
    console.log("✓ package configuration docs match root package.json and bunfig.toml");
  }
}

function normalizeCliManifestCommand(command) {
  return command
    .trim()
    .replace(/\s+(?:<[^>]+>|\[[^\]]+\])/g, "")
    .trim()
    .replace(/\s+/g, ".");
}

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function runCli(args) {
  return spawnSync("bun", [CLI_ENTRYPOINT, ...args], { cwd: root, encoding: "utf8" });
}

function readCliOverviewToonCommandBlock(commandName) {
  const docs = readFileSync(CLI_OVERVIEW, "utf8");
  const toon = docs.match(/```toon\ncommands\[\d+\]:\n([\s\S]*?)\n```/)?.[1];
  const marker = `  - name: ${commandName}\n`;
  const start = toon?.indexOf(marker) ?? -1;
  if (!toon || start === -1) return undefined;
  const bodyStart = start + marker.length;
  const next = toon.indexOf("\n  - name: ", bodyStart);
  return toon.slice(bodyStart, next === -1 ? undefined : next);
}

function readCliOverviewToonFlags(commandName) {
  const block = readCliOverviewToonCommandBlock(commandName);
  if (!block) return undefined;
  const lines = block.split("\n");
  const headerIndex = lines.findIndex((line) => /^    flags\[(\d+)\]\{[^}]+\}:$/.test(line));
  if (headerIndex === -1) return undefined;
  const header = lines[headerIndex].match(/^    flags\[(\d+)\]\{[^}]+\}:$/);
  const flags = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const flag = line.match(/^      ([^,]+),/);
    if (!flag) break;
    flags.push(flag[1].trim());
  }
  return {
    declaredCount: Number(header[1]),
    flags,
  };
}

function checkCliOverviewCommandCatalogMatchesCli() {
  const docs = readFileSync(CLI_OVERVIEW, "utf8");
  const block = docs.match(/```toon\ncommands\[(\d+)\]:\n([\s\S]*?)\n```/);
  const declaredCount = block ? Number(block[1]) : NaN;
  const documented = block
    ? [...block[2].matchAll(/^  - name: ([^\n]+)/gm)].map((match) => match[1].trim().replace(/^"|"$/g, ""))
    : [];
  const llms = runCli(["--llms"]);
  const topLevelHelp = runCli(["--help"]);
  const mcpHelp = runCli(["mcp", "--help"]);
  const skillsHelp = runCli(["skills", "--help"]);
  const completionsHelp = runCli(["completions", "--help"]);
  const cliCommands =
    llms.status === 0
      ? [...llms.stdout.matchAll(/\| `smithers ([^`]+)` \|/g)].map((match) =>
          normalizeCliManifestCommand(match[1]),
        )
      : [];
  const documentedSet = new Set(documented);
  const missingCliCommands = cliCommands.filter((command) => !documentedSet.has(command));
  const integrationEvidence = [
    ["completions", topLevelHelp.stdout.includes("completions") && completionsHelp.stdout.includes("Usage: smithers completions")],
    ["mcp.add", topLevelHelp.stdout.includes("mcp add") && mcpHelp.stdout.includes("add  Register as MCP server")],
    ["skills.add", topLevelHelp.stdout.includes("skills") && skillsHelp.stdout.includes("add   Sync skill files to agents")],
    ["skills.list", topLevelHelp.stdout.includes("skills") && skillsHelp.stdout.includes("list  List skills")],
  ];
  const missingIntegrationDocs = integrationEvidence
    .filter(([command, backedByCli]) => backedByCli && !documentedSet.has(command))
    .map(([command]) => command);
  const missingIntegrationHelp = integrationEvidence
    .filter(([, backedByCli]) => !backedByCli)
    .map(([command]) => command);
  if (
    !block ||
    declaredCount !== documented.length ||
    llms.status !== 0 ||
    topLevelHelp.status !== 0 ||
    mcpHelp.status !== 0 ||
    skillsHelp.status !== 0 ||
    completionsHelp.status !== 0 ||
    missingCliCommands.length ||
    missingIntegrationDocs.length ||
    missingIntegrationHelp.length
  ) {
    failed = true;
    console.error("\n✗ docs/cli/overview.mdx command catalog must match the live CLI:");
    if (!block) console.error("    TOON command catalog block not found");
    if (block && declaredCount !== documented.length) {
      console.error(`    commands[${declaredCount}] declares ${declaredCount}, but documents ${documented.length}`);
    }
    if (llms.status !== 0) console.error(`    bun apps/cli/src/index.js --llms failed with status ${llms.status}`);
    if (topLevelHelp.status !== 0) console.error(`    bun apps/cli/src/index.js --help failed with status ${topLevelHelp.status}`);
    if (mcpHelp.status !== 0) console.error(`    bun apps/cli/src/index.js mcp --help failed with status ${mcpHelp.status}`);
    if (skillsHelp.status !== 0) {
      console.error(`    bun apps/cli/src/index.js skills --help failed with status ${skillsHelp.status}`);
    }
    if (completionsHelp.status !== 0) {
      console.error(`    bun apps/cli/src/index.js completions --help failed with status ${completionsHelp.status}`);
    }
    if (missingCliCommands.length) console.error(`    missing CLI manifest commands: ${missingCliCommands.join(", ")}`);
    if (missingIntegrationDocs.length) {
      console.error(`    missing integration commands: ${missingIntegrationDocs.join(", ")}`);
    }
    if (missingIntegrationHelp.length) {
      console.error(`    documented integration commands are not backed by CLI help: ${missingIntegrationHelp.join(", ")}`);
    }
  } else {
    console.log("✓ CLI overview command catalog matches live CLI command names");
  }
}

function checkCliOverviewWorkflowRunFlagsMatchSchema() {
  const documented = readCliOverviewToonFlags("workflow.run");
  const schemaResult = runCli(["workflow", "run", "--schema", "--format", "json"]);
  let schema;
  if (schemaResult.status === 0) {
    try {
      schema = JSON.parse(schemaResult.stdout);
    } catch {
      // handled below
    }
  }
  const schemaFlags = Object.keys(schema?.options?.properties ?? {}).map(camelToKebab);
  const missing = documented ? schemaFlags.filter((flag) => !documented.flags.includes(flag)) : [];
  const extra = documented ? documented.flags.filter((flag) => !schemaFlags.includes(flag)) : [];
  if (
    !documented ||
    documented.declaredCount !== documented.flags.length ||
    schemaResult.status !== 0 ||
    !schema ||
    missing.length ||
    extra.length
  ) {
    failed = true;
    console.error("\n✗ docs/cli/overview.mdx workflow.run flags must match the live CLI schema:");
    if (!documented) console.error("    workflow.run flags block not found");
    if (documented && documented.declaredCount !== documented.flags.length) {
      console.error(
        `    flags[${documented.declaredCount}] declares ${documented.declaredCount}, but documents ${documented.flags.length}`,
      );
    }
    if (schemaResult.status !== 0) {
      console.error(`    bun apps/cli/src/index.js workflow run --schema --format json failed with status ${schemaResult.status}`);
    }
    if (schemaResult.status === 0 && !schema) console.error("    workflow.run schema output was not valid JSON");
    if (missing.length) console.error(`    missing schema flags: ${missing.join(", ")}`);
    if (extra.length) console.error(`    extra documented flags: ${extra.join(", ")}`);
  } else {
    console.log("✓ CLI overview workflow.run flags match live CLI schema");
  }
}

function checkToolDocsMatchCurrentRuntimeLogging() {
  const docs = readFileSync(TOOLS_INTEGRATION, "utf8");
  const engine = readFileSync(ENGINE_SOURCE, "utf8");
  const required = [
    "Smithers creates the `_smithers_tool_calls` table and exposes adapter methods to insert and list rows.",
    "The current engine reads that table on retry to build warnings for previously recorded non-idempotent side-effect tool calls.",
    "The `defineTool()` wrapper itself does not insert a durable row for every call",
    "`defineTool()` wraps custom [AI SDK](https://ai-sdk.dev) tools with Smithers runtime context, deterministic idempotency keys, side-effect metadata, and the side-effect snapshot hook.",
    "`idempotent: false` marks the tool for retry warnings when a previous attempt has a recorded `_smithers_tool_calls` row.",
    "`defineTool()` does not persist `_smithers_tool_calls` rows directly",
  ];
  const forbidden = [
    "Every invocation is logged to `_smithers_tool_calls`:",
    "Every `defineTool()` call is logged to `_smithers_tool_calls`.",
    "durable tool-call logging",
  ];
  const missing = required.filter((needle) => !docs.includes(needle));
  const stale = forbidden.filter((needle) => docs.includes(needle));
  const engineReadsToolCalls = engine.includes(".listToolCalls(");
  const engineInsertsToolCalls = engine.includes(".insertToolCall(");
  if (missing.length || stale.length || !engineReadsToolCalls || engineInsertsToolCalls) {
    failed = true;
    console.error("\n✗ docs/integrations/tools.mdx must match current _smithers_tool_calls runtime behavior:");
    if (!engineReadsToolCalls) console.error("    engine no longer reads tool-call rows for retry warnings");
    if (engineInsertsToolCalls) console.error("    engine now inserts tool-call rows; update docs to document full logging");
    if (missing.length) console.error(`    missing: ${missing.join(", ")}`);
    if (stale.length) console.error(`    stale: ${stale.join(", ")}`);
  } else {
    console.log("✓ tool docs describe current _smithers_tool_calls behavior");
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
checkGatewayGetRunDocsMatchResponseShape();
checkSandboxDocsMatchProviderTypes();
checkServeDocsMatchServerTypes();
checkComponentPropsDocsMatchSourceTypes();
checkPackageConfigurationDocsMatchRootConfig();
checkCliOverviewCommandCatalogMatchesCli();
checkCliOverviewWorkflowRunFlagsMatchSchema();
checkToolDocsMatchCurrentRuntimeLogging();

process.exit(failed ? 1 : 0);
