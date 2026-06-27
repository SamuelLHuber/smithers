# Research: Shareable Smithers GitHub Actions Runner — v2

## Three-Layer Distribution Architecture

### Layer 1: The Runner Engine (reusable workflow)
`smithersai/smithers/.github/workflows/run-smithers.yml@main`

The execution engine. Accepts any `.tsx` workflow file (local or external git).
Already built — see `.github/workflows/run-smithers.yml`.

### Layer 2: Workflow Templates (`.github` org repo)
`smithersai/.github/workflow-templates/*.yml`

Pre-configured starter workflows that appear in **Actions → New workflow** in every repo
that can see the template repo. A user clicks "Configure" and gets a ready-to-use
workflow file in their own repo.

```
smithersai/.github/                    # the org-level .github repo
└── workflow-templates/
    ├── smithers-security-review.yml                  # template workflow
    ├── smithers-security-review.properties.json      # metadata
    ├── smithers-code-review.yml
    ├── smithers-code-review.properties.json
    ├── smithers-architecture-test.yml
    ├── smithers-architecture-test.properties.json
    └── smithers-icon.svg
```

Key insight from GitHub docs:
- Templates in a **public** `.github` repo → available to ALL repos
- Templates in an **internal** `.github` repo → available to internal + private repos
- Templates in a **private** `.github` repo → available to private repos only
- Users need **read access** to the template repo
- `$default-branch` placeholder auto-replaced

### Layer 3: Workflow Packs (external git repos)
`smithersai/security-workflows`, `smithersai/review-packs`, etc.

The actual `.tsx` files, prompts, agents. Distributed as plain git repos.
The Runner clones them at runtime.

---

## How `smithers up` Resolves External Workflows

### Module resolution
```js
// apps/cli/src/index.js — loadWorkflowAsync
const abs = resolve(process.cwd(), path);
const mod = await import(pathToFileURL(abs).href);
```

- `import()` resolves `from "smithers-orchestrator"` starting from the workflow
  file's directory, walking up — NOT from the CLI's location.
- Running `bun run smithers up` from the external repo's directory uses that
  repo's `node_modules/smithers-orchestrator`, its `.smithers/agents.ts`,
  prompts, and relative imports.

### CLI delegation
`packages/smithers/src/bin/smithers.js` delegates to the nearest local
`smithers-orchestrator` install. So running from the external repo's directory
just works.

### Direct execution vs discovery
- `smithers up <path>` — direct file import, no discovery
- `smithers workflow run <id>` — discovers `.smithers/workflows/*.tsx` relative to cwd

The runner uses `smithers up` because external repos need direct file paths.

---

## GitHub Actions Mechanics (from official docs)

### Reusable workflow access rules

| Caller repo | Accessible called workflows |
|-------------|-----------------------------|
| private | same repo, private (with access config), public |
| public | same repo, public |

### Critical limitations
- **Max 10 nesting levels**
- **Max 50 unique reusable workflows** from a single caller
- `env` context at workflow level does **NOT** propagate to called workflow
- `env` in called workflow NOT accessible in caller (use `outputs` instead)
- `vars` context IS shared across org/repo/environment
- Called workflow runs in job context (not step-level), so `GITHUB_ENV` can pass values to caller job steps

### GITHUB_TOKEN behavior
- `github` context **always belongs to the caller**
- Called workflow automatically gets `github.token` / `secrets.GITHUB_TOKEN`
- Token permissions can only be **downgraded**, never escalated
- For nested workflows (A→B→C): A's permissions are the ceiling

### Runner assignment
- GitHub-hosted runners: evaluated in **caller context**, billed to caller
- Self-hosted runners: called workflow can access caller's runners if same user/org

### Re-run behavior
- Re-run ALL jobs → uses current referenced version
- Re-run failed/specific job → uses first attempt's commit SHA

---

## Security Model

### Secrets handling
`secrets: inherit` passes the caller's secrets to the runner. This is REQUIRED
because the workflow needs API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
to run agent tasks.

### Trust boundaries
- **Runner repo** must be trusted (it runs arbitrary `bun run smithers` commands)
- **External workflow pack** must be trusted (runs arbitrary TSX code)
- Use `allow-network: false` by default
- Use `root` input to sandbox tool access

### Private repo access
The runner clones external repos using `github.token`. This works for:
- Same organization private repos
- Cross-org private repos where the runner repo has been granted access
- Personal private repos if the actor's token has access

---

## Package Manager Detection for External Packs

```
bun.lock / bun.lockb  → bun install
pnpm-lock.yaml        → pnpm install --frozen-lockfile
package-lock.json     → npm ci
yarn.lock            → yarn install --frozen-lockfile
(none of above)       → bun add smithers-orchestrator zod
```

Note: `bun` is always needed at runtime because the `smithers` CLI is a Bun
script (`#!/usr/bin/env bun`). Even if the external repo uses pnpm for
dependency management, `bun run smithers up` still works because Bun reads
the `node_modules` tree that pnpm laid down.

Pure workflow-sharing repos (just `.tsx` files, no `package.json`) get seeded
with a minimal setup via `bun add smithers-orchestrator zod`.

---

## Use Cases with Distribution Layer Mapping

| Use case | Runner input | Template name | Example pack |
|----------|-------------|---------------|-------------|
| Security review on PR | `workflow: .smithers/workflows/pr-security-review.tsx` | `smithers-security-review` | `smithersai/security-workflows` |
| Code review on PR | `workflow: .smithers/workflows/code-review.tsx` | `smithers-code-review` | `smithersai/review-packs` |
| Architecture validation | `workflow: .smithers/workflows/validate-hexagonal.tsx` | `smithers-architecture-test` | `smithersai/architecture-tests` |
| Infrastructure drift | `workflow: .smithers/workflows/drift-check.tsx` | `smithers-infrastructure-drift` | `smithersai/infra-packs` |
| Dependency audit | `workflow: .smithers/workflows/audit-deps.tsx` | `smithers-dependency-audit` | `smithersai/security-workflows` |
| PRD → tickets | `workflow: .smithers/workflows/write-a-prd.tsx` | `smithers-product-planning` | `smithersai/product-workflows` |

---

## Implementation File Map

### In `smithersai/smithers` (this repo)
```
.github/
├── workflows/
│   ├── run-smithers.yml           # Layer 1: the reusable runner
│   └── run-smithers-example.yml     # Example callers
├── workflow-templates/               # (optional — could be in .github repo instead)
│   └── ...
action.yml                            # Layer 1b: composite action
```

### In `smithersai/.github` (org-level .github repo)
```
workflow-templates/
├── smithers-security-review.yml
├── smithers-security-review.properties.json
├── smithers-code-review.yml
├── smithers-code-review.properties.json
├── smithers-architecture-test.yml
├── smithers-architecture-test.properties.json
└── smithers-logo.svg
```

### In distributed pack repos (e.g. `smithersai/security-workflows`)
```
.smithers/
├── workflows/
│   └── pr-security-review.tsx
├── prompts/
│   └── security-analysis.mdx
├── agents.ts
└── package.json          # lists smithers-orchestrator as dependency
```

---

## SQLite State Considerations

By default Smithers writes `smithers.db` to `process.cwd()`. In external mode,
the DB is created inside the temporary clone directory and is discarded after
the job completes.

For CI/CD persistence:
- **Artifacts**: logs are uploaded via `actions/upload-artifact` (already in runner)
- **Cache**: cache `smithers.db-*` files for cross-run state
- **Postgres backend**: future feature for durable cross-run state
