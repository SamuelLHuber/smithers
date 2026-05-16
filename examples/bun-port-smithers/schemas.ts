import { z } from "zod";

export const zigFileInputSchema = z.object({
  zig: z.string(),
  loc: z.number().int().nonnegative().default(0),
  crate: z.string().optional(),
});

export const lifetimeInputSchema = z.object({
  repo: z.string().default("."),
  files: z.array(zigFileInputSchema).default([]),
  sampleRate: z.number().min(0).max(1).default(0.12),
  unknownApprovalThreshold: z.number().min(0).max(1).default(0.05),
});

export const lifetimeClassificationSchema = z.object({
  file: z.string(),
  crate: z.string(),
  fields: z.array(z.object({
    struct: z.string(),
    field: z.string(),
    zigType: z.string(),
    class: z.enum([
      "OWNED",
      "SHARED",
      "BORROW_PARAM",
      "BORROW_FIELD",
      "STATIC",
      "JSC_BORROW",
      "BACKREF",
      "INTRUSIVE",
      "FFI",
      "ARENA",
      "UNKNOWN",
    ]),
    rustType: z.string(),
    evidence: z.string(),
    confidence: z.enum(["high", "low"]),
  })),
});

export const lifetimeSelectionSchema = z.object({
  totalFields: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  selected: z.array(z.object({
    key: z.string(),
    file: z.string(),
    struct: z.string(),
    field: z.string(),
    class: z.string(),
    rustType: z.string(),
  })),
});

export const lifetimeVoteSchema = z.object({
  key: z.string(),
  voter: z.string(),
  refuted: z.boolean(),
  correctClass: z.string(),
  reason: z.string(),
});

export const lifetimeSummarySchema = z.object({
  totalFields: z.number().int().nonnegative(),
  unknownRate: z.number(),
  verifiedCount: z.number().int().nonnegative(),
  overturned: z.number().int().nonnegative(),
  byClass: z.record(z.string(), z.number().int().nonnegative()),
  tsvPreview: z.string(),
});

export const approvalSchema = z.object({
  approved: z.boolean().default(false),
  note: z.string().nullable().default(null),
  decidedBy: z.string().nullable().default(null),
  decidedAt: z.string().nullable().default(null),
});

export const phaseAInputSchema = z.object({
  repo: z.string().default("."),
  files: z.array(zigFileInputSchema).default([]),
  maxConcurrency: z.number().int().positive().default(8),
});

export const phaseAPlanSchema = z.object({
  total: z.number().int().nonnegative(),
  files: z.array(z.object({
    zig: z.string(),
    rs: z.string(),
    loc: z.number().int().nonnegative(),
    crate: z.string(),
  })),
});

export const phaseAImplementSchema = z.object({
  zig: z.string(),
  rs: z.string(),
  status: z.enum(["drafted", "skipped", "failed"]),
  confidence: z.enum(["high", "medium", "low"]),
  todos: z.number().int().nonnegative(),
  rsLoc: z.number().int().nonnegative(),
  note: z.string(),
});

export const issueSchema = z.object({
  severity: z.enum(["must-fix", "should-fix", "nit"]),
  rule: z.string(),
  detail: z.string(),
  fix: z.string().optional(),
});

export const reviewSchema = z.object({
  subject: z.string(),
  reviewer: z.string().default("reviewer"),
  ok: z.boolean(),
  issues: z.array(issueSchema),
});

export const phaseAFixSchema = z.object({
  zig: z.string(),
  rs: z.string(),
  applied: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  note: z.string(),
});

export const phaseAReportSchema = z.object({
  total: z.number().int().nonnegative(),
  clean: z.number().int().nonnegative(),
  fixed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  todoCount: z.number().int().nonnegative(),
  summary: z.string(),
});

export const crateCompileInputSchema = z.object({
  repo: z.string().default("."),
  crates: z.array(z.object({
    name: z.string(),
    tier: z.number().int().nonnegative().default(0),
  })).default([]),
  maxRounds: z.number().int().positive().default(25),
});

export const cratePlanSchema = z.object({
  tiers: z.array(z.object({
    tier: z.number().int().nonnegative(),
    crates: z.array(z.object({ name: z.string(), tier: z.number().int().nonnegative() })),
  })),
  totalCrates: z.number().int().nonnegative(),
});

export const crateCheckSchema = z.object({
  crate: z.string(),
  tier: z.number().int().nonnegative(),
  compiles: z.boolean(),
  errorCount: z.number().int().nonnegative(),
  rounds: z.number().int().nonnegative(),
  gatedModules: z.array(z.string()).default([]),
  blockedOn: z.array(z.string()).default([]),
  notes: z.string(),
});

export const compileReportSchema = z.object({
  totalCrates: z.number().int().nonnegative(),
  green: z.number().int().nonnegative(),
  failing: z.number().int().nonnegative(),
  gatedModules: z.number().int().nonnegative(),
  summary: z.string(),
});

export const ungateInputSchema = z.object({
  repo: z.string().default("."),
  targets: z.array(z.object({
    id: z.string(),
    crate: z.string(),
    file: z.string(),
    reason: z.string().default("ungate/proper-port"),
  })).default([]),
  maxRounds: z.number().int().positive().default(5),
});

export const targetSurveySchema = z.object({
  totalTargets: z.number().int().nonnegative(),
  targets: z.array(z.object({
    id: z.string(),
    crate: z.string(),
    file: z.string(),
    reason: z.string(),
  })),
});

export const patchResultSchema = z.object({
  targetId: z.string(),
  status: z.enum(["patched", "skipped", "failed"]),
  filesChanged: z.array(z.string()).default([]),
  summary: z.string(),
});

export const specReviewSchema = z.object({
  targetId: z.string(),
  reviewer: z.string(),
  approved: z.boolean(),
  issues: z.array(issueSchema).default([]),
  feedback: z.string(),
});

export const ungateReportSchema = z.object({
  totalTargets: z.number().int().nonnegative(),
  patched: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  summary: z.string(),
});

export const probeInputSchema = z.object({
  repo: z.string().default("."),
  probes: z.array(z.object({
    id: z.string(),
    cmd: z.string(),
    expect: z.string().optional(),
  })).default([]),
});

export const buildResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  summary: z.string(),
});

export const probeResultSchema = z.object({
  probeId: z.string(),
  command: z.string(),
  passed: z.boolean(),
  panicLocation: z.string().nullable().default(null),
  assertion: z.string().nullable().default(null),
  signal: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative(),
  output: z.string(),
});

export const failureSetSchema = z.object({
  totalFailures: z.number().int().nonnegative(),
  failures: z.array(z.object({
    failureKey: z.string(),
    probeId: z.string(),
    command: z.string(),
    panicLocation: z.string().nullable().default(null),
    assertion: z.string().nullable().default(null),
  })),
});

export const failureFixSchema = z.object({
  failureKey: z.string(),
  status: z.enum(["fixed", "skipped", "failed"]),
  filesChanged: z.array(z.string()).default([]),
  summary: z.string(),
});

export const probeReportSchema = z.object({
  totalProbes: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  uniqueFailures: z.number().int().nonnegative(),
  fixes: z.number().int().nonnegative(),
  summary: z.string(),
});

export const testSwarmInputSchema = z.object({
  repo: z.string().default("."),
  baseBranch: z.string().default("main"),
  useWorktrees: z.boolean().default(true),
  maxIterations: z.number().int().positive().default(30),
  maxConcurrency: z.number().int().positive().default(8),
  areas: z.array(z.object({
    id: z.string(),
    glob: z.string(),
    crate: z.string(),
  })).default([]),
});

export const testAreaResultSchema = z.object({
  areaId: z.string(),
  pass: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  allPass: z.boolean(),
  bughuntBugs: z.number().int().nonnegative().default(0),
  commits: z.array(z.string()).default([]),
  branch: z.string(),
  notes: z.string(),
});

export const mergeResultSchema = z.object({
  id: z.string(),
  picked: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative().default(0),
  notes: z.string(),
});

export const testSwarmReportSchema = z.object({
  areas: z.number().int().nonnegative(),
  allPass: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  merged: z.number().int().nonnegative(),
  summary: z.string(),
});

export const sweepInputSchema = z.object({
  repo: z.string().default("."),
  sweeps: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    pattern: z.string(),
    scope: z.string(),
  })).default([]),
});

export const sweepSurveySchema = z.object({
  sweeps: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    pattern: z.string(),
    scope: z.string(),
  })),
  total: z.number().int().nonnegative(),
});

export const sweepResultSchema = z.object({
  sweepId: z.string(),
  kind: z.string(),
  candidates: z.number().int().nonnegative(),
  fixed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  summary: z.string(),
});

export const sweepReportSchema = z.object({
  totalSweeps: z.number().int().nonnegative(),
  fixed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  summary: z.string(),
});
