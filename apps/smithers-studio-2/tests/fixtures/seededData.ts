/**
 * The single source of truth for every deterministic value the real-backend
 * e2e suite asserts on. Both the Gateway fixture (which seeds the SQLite run
 * store) and the workspace-API server (which serves JJHub / memory / scores
 * state) import from here, and the converted specs assert on these exact
 * values. Changing a value here changes it everywhere — no magic constants in
 * the specs.
 */

export type SeededRun = {
  runId: string;
  workflowName: string;
  workflowKey: string;
  status: string;
  createdAtMs: number;
  startedAtMs: number;
  finishedAtMs: number | null;
  heartbeatAtMs: number | null;
  errorJson: string | null;
};

export type SeededNode = {
  runId: string;
  nodeId: string;
  iteration: number;
  state: string;
  outputTable: string;
  label: string;
};

export type SeededApproval = {
  runId: string;
  nodeId: string;
  iteration: number;
  status: string;
  requestedAtMs: number;
  requestJson: string;
};

/** A fixed clock anchor so created/finished timestamps are stable. */
export const SEED_NOW_MS = 1_716_000_000_000;

/**
 * Runs seeded into the Gateway SQLite store. The Runs surface reads these via
 * the real `POST /v1/rpc/listRuns`. Statuses are chosen to exercise every
 * history filter: running, succeeded (finished), failed, and an
 * approval-waiting run.
 */
export const SEEDED_RUNS: SeededRun[] = [
  {
    runId: "run-deploy-running",
    workflowName: "studio-deploy",
    workflowKey: "studio-deploy",
    status: "running",
    createdAtMs: SEED_NOW_MS,
    startedAtMs: SEED_NOW_MS,
    finishedAtMs: null,
    heartbeatAtMs: SEED_NOW_MS,
    errorJson: null,
  },
  {
    runId: "run-build-succeeded",
    workflowName: "studio-build",
    workflowKey: "studio-build",
    status: "finished",
    createdAtMs: SEED_NOW_MS - 60_000,
    startedAtMs: SEED_NOW_MS - 60_000,
    finishedAtMs: SEED_NOW_MS - 59_000,
    heartbeatAtMs: null,
    errorJson: null,
  },
  {
    runId: "run-test-failed",
    workflowName: "studio-test",
    workflowKey: "studio-test",
    status: "failed",
    createdAtMs: SEED_NOW_MS - 120_000,
    startedAtMs: SEED_NOW_MS - 120_000,
    finishedAtMs: SEED_NOW_MS - 119_000,
    heartbeatAtMs: null,
    errorJson: JSON.stringify({ message: "studio test suite failed" }),
  },
  {
    runId: "run-approve-waiting",
    workflowName: "studio-approval",
    workflowKey: "studio-approval",
    status: "waiting-approval",
    createdAtMs: SEED_NOW_MS - 30_000,
    startedAtMs: SEED_NOW_MS - 30_000,
    finishedAtMs: null,
    heartbeatAtMs: SEED_NOW_MS - 30_000,
    errorJson: null,
  },
];

/** Nodes seeded for the approval-waiting run so its tree has labelled rows. */
export const SEEDED_NODES: SeededNode[] = [
  {
    runId: "run-approve-waiting",
    nodeId: "plan",
    iteration: 0,
    state: "finished",
    outputTable: "result",
    label: "plan",
  },
  {
    runId: "run-approve-waiting",
    nodeId: "approve-deploy",
    iteration: 0,
    state: "waiting-approval",
    outputTable: "approval",
    label: "Approve studio deploy",
  },
];

/** The pending approval gate the Runs approvals filter + inline gate surface. */
export const SEEDED_APPROVALS: SeededApproval[] = [
  {
    runId: "run-approve-waiting",
    nodeId: "approve-deploy",
    iteration: 0,
    status: "requested",
    requestedAtMs: SEED_NOW_MS - 29_000,
    requestJson: JSON.stringify({
      title: "Approve studio deploy",
      summary: "Ship studio build 42 to production?",
    }),
  },
];

/** The names a converted spec can assert appear in the runs history. */
export const SEEDED_RUN_IDS = SEEDED_RUNS.map((run) => run.runId);

/** JJHub state served by the workspace-API server (issues/landings/workspaces). */
export const SEEDED_JJHUB_STATE = {
  auth: {
    apiUrl: "https://api.jjhub.test",
    loggedIn: true,
    tokenSet: true,
    tokenSource: "fixture env",
    user: "studio-fixture",
    email: "studio@example.test",
    message: null,
  },
  issues: [
    {
      id: "issue-101",
      number: 101,
      title: "Studio JJHub issue",
      body: "Real JJHub issue data for Smithers Studio 2.",
      state: "open",
      labels: ["studio", "parity"],
      assignees: ["codex"],
      commentCount: 2,
    },
    {
      id: "issue-102",
      number: 102,
      title: "Closed Studio issue",
      body: "Closed issue loaded through JJHub.",
      state: "closed",
      labels: ["done"],
      assignees: [],
      commentCount: 1,
    },
  ],
  landings: [
    {
      id: "landing-201",
      number: 201,
      title: "Studio landing request",
      description: "Real JJHub landing data for Smithers Studio 2.",
      state: "open",
      targetBranch: "main",
      author: "codex",
      createdAt: "2026-05-25T12:00:00.000Z",
      reviewStatus: "pending",
      diff: "diff --git a/landing.txt b/landing.txt\n--- a/landing.txt\n+++ b/landing.txt\n@@ -1 +1,2 @@\n base\n+landing change\n",
      checks: "build: passing\ntest: passing\n",
      conflicts: {
        conflictStatus: "conflicted",
        hasConflicts: true,
        conflicts: [
          {
            changeID: "change-studio-1",
            filePath: "src/landing-conflict.ts",
            conflictType: "content",
            resolved: false,
            resolutionStatus: "unresolved",
          },
        ],
      },
    },
    {
      id: "landing-202",
      number: 202,
      title: "Merged Studio landing",
      description: "Merged landing loaded through JJHub.",
      state: "merged",
      targetBranch: "main",
      author: "codex",
      createdAt: "2026-05-24T12:00:00.000Z",
      reviewStatus: "approved",
      diff: "",
      checks: "merged checks passed\n",
      conflicts: { conflictStatus: "clean", hasConflicts: false, conflicts: [] },
    },
  ],
  workspaces: [
    {
      id: "ws-active",
      name: "Studio cloud workspace",
      status: "active",
      createdAt: "2026-05-26T12:00:00.000Z",
    },
    {
      id: "ws-suspended",
      name: "Studio suspended workspace",
      status: "suspended",
      createdAt: "2026-05-26T12:05:00.000Z",
    },
  ],
  snapshots: [
    {
      id: "snap-base",
      workspaceId: "ws-active",
      name: "studio-base-snapshot",
      createdAt: "2026-05-26T12:10:00.000Z",
    },
  ],
  recents: [
    {
      path: "/tmp/studio-alpha",
      displayName: "studio-alpha",
      exists: true,
      hasSmithers: true,
      smithersPath: "/tmp/studio-alpha/.smithers",
      lastOpenedAt: "2026-05-27T12:00:00.000Z",
    },
    {
      path: "/tmp/studio-beta",
      displayName: "studio-beta",
      exists: true,
      hasSmithers: false,
      smithersPath: null,
      lastOpenedAt: "2026-05-26T09:30:00.000Z",
    },
  ],
} as const;

/**
 * Workflow discovery state served by the workspace-API server for the Workflows
 * surface (`/api/workflows`, `/jjhub-workflows`, `/prompts`, `/crons`, and the
 * `/workflow-sources/*` source + graph endpoints). The four segments
 * (Local / Remote / Prompts / Schedules) each read one of these lists; the
 * Local "studio-ship" workflow additionally exposes a source + declared launch
 * fields so the launch form + source tab can be exercised end to end.
 */
export const SEEDED_WORKFLOWS = {
  local: [
    {
      key: "studio-ship",
      readableName: "Studio Ship",
      description: "Land the current studio change.",
      hasUi: true,
    },
    {
      key: "studio-review",
      readableName: "Studio Review",
      description: "Review a studio diff.",
      hasUi: false,
    },
  ],
  remote: [
    { id: 7, name: "studio-nightly-build", path: ".jjhub/studio-nightly.yml", isActive: true },
  ],
  prompts: [{ id: "studio-summarize", entryFile: ".smithers/prompts/studio-summarize.md" }],
  crons: [
    { cronId: "studio-cron-1", workflow: "studio-ship", pattern: "0 9 * * *", enabled: true },
  ],
} as const;

/**
 * The Local "studio-ship" workflow's source + launch graph. The source tab
 * asserts on `source`; the launch form renders one control per `fields` entry.
 * `target` carries a default ("main") and is required; `dryRun` is an optional
 * boolean — together they exercise prefill, validation, and boolean coercion.
 */
export const SEEDED_WORKFLOW_SHIP_SOURCE = {
  workflowKey: "studio-ship",
  path: ".smithers/workflows/studio-ship.tsx",
  source: 'export const studioShip = workflow(() => <Task name="land" />);',
  imports: [],
} as const;

export const SEEDED_WORKFLOW_SHIP_GRAPH = {
  workflowKey: "studio-ship",
  path: ".smithers/workflows/studio-ship.tsx",
  mode: "graph",
  message: null,
  tasks: [],
  edges: [],
  fields: [
    { key: "target", name: "target", type: "string", defaultValue: "main", required: true },
    { key: "dryRun", name: "dryRun", type: "boolean", defaultValue: null, required: false },
  ],
  raw: {},
} as const;

/** Memory facts served at /__smithers_studio/api/memory. */
export const SEEDED_MEMORY_FACTS = [
  {
    namespace: "studio/project",
    key: "deploy-window",
    valueJson: JSON.stringify({ fact: "Deploys run weekdays after 10am PT." }),
    schemaSig: null,
    createdAtMs: SEED_NOW_MS - 200_000,
    updatedAtMs: SEED_NOW_MS - 100_000,
    ttlMs: null,
  },
  {
    namespace: "studio/project",
    key: "owner",
    valueJson: JSON.stringify({ fact: "Studio is owned by the platform team." }),
    schemaSig: null,
    createdAtMs: SEED_NOW_MS - 300_000,
    updatedAtMs: SEED_NOW_MS - 150_000,
    ttlMs: null,
  },
] as const;

/**
 * The deterministic agent-chat transcript served by the workspace-API server
 * at /__smithers_studio/api/chat/*. studio-2 has no Gateway-DB chat-event path,
 * so the workspace server IS the real deterministic backend: it serves a seeded
 * session and replays a fixed assistant turn (no live LLM). The converted chat
 * spec drives the real AgentChat + useAgentChat + chatApi code against these
 * exact values over real same-origin HTTP (vite proxies /__smithers_studio).
 */
export const SEEDED_CHAT_SESSION = {
  sessionId: "studio-chat-session",
  model: "claude-opus-4",
  mode: "default",
  blocks: [
    {
      id: "chat-seed-system",
      role: "system",
      content: "Workspace agent ready.",
      timestampMs: SEED_NOW_MS - 400_000,
    },
  ],
} as const;

/**
 * The id the streamed assistant reply uses, and the markdown content the server
 * streams as ndjson deltas. The content exercises the MarkdownContent renderer
 * end-to-end: a heading line, a fenced code block (.ws-md-code), bold (strong)
 * and inline code (.ws-md-inline-code).
 */
export const SEEDED_CHAT_REPLY = {
  blockId: "chat-reply-assistant",
  intro: "Here is a plan:",
  codeLine: "const x = 1;",
  boldWord: "bold",
  inlineCodeWord: "code",
  /** The full markdown the assembled assistant block contains once streamed. */
  markdown:
    "Here is a plan:\n\n```ts\nconst x = 1;\n```\nDone with **bold** and `code`.",
} as const;

/** Scorer rows served at /__smithers_studio/api/scores. */
export const SEEDED_SCORES = [
  {
    id: "score-1",
    runId: "run-build-succeeded",
    nodeId: "review",
    iteration: 0,
    attempt: 0,
    scorerId: "faithfulness",
    scorerName: "Faithfulness",
    source: "llm-judge",
    score: 0.92,
    reason: "Output matched the build spec.",
    metaJson: null,
    inputJson: null,
    outputJson: null,
    latencyMs: 120,
    scoredAtMs: SEED_NOW_MS - 58_000,
    durationMs: 120,
  },
  {
    id: "score-2",
    runId: "run-build-succeeded",
    nodeId: "review",
    iteration: 0,
    attempt: 0,
    scorerId: "relevancy",
    scorerName: "Relevancy",
    source: "llm-judge",
    score: 0.81,
    reason: "Mostly relevant with minor drift.",
    metaJson: null,
    inputJson: null,
    outputJson: null,
    latencyMs: 95,
    scoredAtMs: SEED_NOW_MS - 57_500,
    durationMs: 95,
  },
] as const;

/**
 * The absolute path the workspace-API server reports as the SQLite database
 * location. Deterministic so the SQL Browser surface can assert on the dbPath.
 */
export const SEEDED_SQL_DB_PATH = "/tmp/studio/.smithers/smithers.db";

/**
 * The schema the workspace-API server builds a REAL in-process SQLite database
 * from, then serves `/sql/tables`, `/sql/schema`, and `/sql/query` against. This
 * is not route mocking: the server runs genuine SQL via `bun:sqlite` and returns
 * whatever the engine produces. The `runs` table is seeded from `SEEDED_RUNS`
 * (the same runs the Gateway serves) so the SQL Browser and the Runs surface
 * agree on the data.
 */
export const SEEDED_SQL_TABLES = [
  {
    name: "runs",
    createSql:
      "CREATE TABLE runs (id TEXT PRIMARY KEY NOT NULL, workflow_key TEXT, status TEXT)",
    rows: SEEDED_RUNS.map((run) => ({
      id: run.runId,
      workflow_key: run.workflowKey,
      status: run.status,
    })),
  },
  {
    name: "memory_facts",
    createSql:
      "CREATE TABLE memory_facts (namespace TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT)",
    rows: SEEDED_MEMORY_FACTS.map((fact) => ({
      namespace: fact.namespace,
      key: fact.key,
      value_json: fact.valueJson,
    })),
  },
] as const;

/**
 * Event-log firehose entries served at `/__smithers_studio/api/logs`. Levels
 * and categories are chosen to exercise the Logs surface stats (1 error, 1
 * warning) and the level / category / free-text filters end to end.
 */
export const SEEDED_LOG_ENTRIES = [
  {
    id: "log-gateway-error",
    timestamp: "2026-05-28T10:00:00.000Z",
    level: "error",
    category: "gateway",
    message: "studio gateway connection refused",
    metadata: null,
    sourcePath: "/tmp/studio/.smithers/logs/gateway.log",
    raw: null,
  },
  {
    id: "log-runner-info",
    timestamp: "2026-05-28T10:00:01.000Z",
    level: "info",
    category: "runner",
    message: "studio run started",
    metadata: null,
    sourcePath: "/tmp/studio/.smithers/logs/runner.log",
    raw: null,
  },
  {
    id: "log-runner-warn",
    timestamp: "2026-05-28T10:00:02.000Z",
    level: "warn",
    category: "runner",
    message: "studio run heartbeat slow",
    metadata: null,
    sourcePath: "/tmp/studio/.smithers/logs/runner.log",
    raw: null,
  },
] as const;
