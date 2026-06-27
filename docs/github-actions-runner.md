# Smithers GitHub Actions Runner

Execute any Smithers workflow in CI/CD — whether it lives in your repo, in a
shared pack on GitHub, or in a private workflow registry. Three distribution
layers let you pick the right level of abstraction.

## Quick reference

```yaml
# In your repo's .github/workflows/my-review.yml
name: Security Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    uses: smithersai/smithers/.github/workflows/run-smithers.yml@main
    with:
      workflow: .smithers/workflows/pr-security-review.tsx
      workflow-repo: smithersai/security-workflows   # external pack
      workflow-ref: v1.2.0
      input: |
        {"pr": ${{ github.event.pull_request.number }}}
    secrets: inherit   # ANTHROPIC_API_KEY, etc.
```

## Three distribution layers

### Layer 1: The Runner (reusable workflow + composite action)

**Reusable workflow**: `smithersai/smithers/.github/workflows/run-smithers.yml`

Accepts any `.tsx` workflow and runs `smithers up` in CI. Supports both local
workflows (in the caller's repo) and external workflows (cloned from another git
repo at runtime).

**Composite action**: `smithersai/smithers/action.yml`

A standalone composite action that wraps the same logic. Can be published to the
[GitHub Marketplace](https://github.com/marketplace) for the shortest possible
reference:

```yaml
uses: smithersai/run-smithers@v1
with:
  workflow: .smithers/workflows/audit.tsx
  workflow-repo: smithersai/security-workflows
```

### Layer 2: Workflow Templates (`.github` org repo)

Pre-configured starter workflows that appear in **Actions → New workflow** for
every repo in your organization. A user clicks "Configure" and gets a
ready-to-use workflow file with no manual editing.

Templates live in an **organization-level `.github` repository**:

```
your-org/.github/
└── workflow-templates/
    ├── smithers-security-review.yml
    ├── smithers-security-review.properties.json
    ├── smithers-code-review.yml
    └── smithers-code-review.properties.json
```

[See example templates →](examples/github-actions-templates/)

### Layer 3: Workflow Packs (external git repos)

The actual `.tsx` files, prompts, and agents. Distributed as plain git repos.
The Runner clones them automatically. Anyone can publish a pack:

```
smithersai/security-workflows/           # or your-org/my-review-pack
├── .smithers/
│   ├── workflows/
│   │   └── pr-security-review.tsx
│   ├── prompts/
│   │   └── security-analysis.mdx
│   └── agents.ts
└── package.json                         # lists smithers-orchestrator dep
```

Pure workflow-sharing repos (just `.tsx` files, no `package.json`) also work —
the Runner automatically installs `smithers-orchestrator` and `zod` on demand.

## Runner inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `workflow` | ✅ | — | Path to `.tsx` workflow file |
| `workflow-repo` | | *(local)* | External pack: `owner/repo` or full git URL |
| `workflow-ref` | | `main` | Git ref (branch, tag, SHA) |
| `input` | | `{}` | JSON-stringified input payload |
| `run-id` | | | Explicit run identifier |
| `allow-network` | | `false` | Allow bash tools to make network requests |
| `root` | | `.` | Tool sandbox root directory |
| `max-concurrency` | | | Max parallel tasks |
| `timeout-minutes` | | `60` | Job timeout |
| `allow-suspend` | | `false` | Treat exit code 3 (waiting approval/event) as success |
| `build-first` | | `true` | `pnpm -r build` before execution (local only) |

**Outputs:** `run-id`, `status` (`finished`/`failed`/`suspended`/`cancelled`), `exit-code`

## Exit code mapping

The runner maps Smithers CLI exit codes to Actions semantics:

| Exit code | Status | Behavior |
|-----------|--------|----------|
| `0` | `finished` | Success |
| `1` | `failed` | Job fails |
| `2` | `cancelled` | Job fails |
| `3` | `suspended` | Fails unless `allow-suspend: true` |

## Use cases

### Security review on every PR
```yaml
uses: smithersai/smithers/.github/workflows/run-smithers.yml@main
with:
  workflow: .smithers/workflows/pr-security-review.tsx
  workflow-repo: smithersai/security-workflows
  input: '{"pr": ${{ github.event.pull_request.number }}}'
  allow-network: false
  timeout-minutes: 45
```

### Code review with a shared pack
```yaml
uses: smithersai/smithers/.github/workflows/run-smithers.yml@main
with:
  workflow: .smithers/workflows/code-review.tsx
  workflow-repo: smithersai/review-packs
  input: '{"sha": "${{ github.sha }}", "repo": "${{ github.repository }}"}'
```

### Architecture validation
```yaml
uses: smithersai/smithers/.github/workflows/run-smithers.yml@main
with:
  workflow: .smithers/workflows/validate-hexagonal.tsx
  workflow-repo: smithersai/architecture-tests
  input: '{"srcDir": "src"}'
```

### Infrastructure drift detection
```yaml
uses: smithersai/smithers/.github/workflows/run-smithers.yml@main
with:
  workflow: .smithers/workflows/drift-check.tsx
  input: '{"environment": "production"}'
```

### Local workflow (no external pack)
```yaml
uses: ./.github/workflows/run-smithers.yml    # relative to this repo
with:
  workflow: .smithers/workflows/audit.tsx
  input: '{"repo": "${{ github.repository }}"}'
```

## Security considerations

- **Trusted sources only**: Running external `.tsx` workflows is arbitrary code
  execution. Only reference repos you trust.
- **`secrets: inherit`**: API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
  must be passed to the runner for agent tasks to work.
- **Network isolation**: Default `allow-network: false`. External packs that
  need `curl`/`wget` must opt in.
- **Path sandbox**: Set `root` explicitly to prevent tools from writing outside
  the intended directory.
- **Token permissions**: In nested workflows, permissions can only be
  *downgraded*, never escalated.

## How it works

1. **Checkout** the caller repo (the repo triggering the action)
2. **If external mode**: Clone the workflow pack repo, detect package manager
   from lockfiles, install dependencies
3. **Execute** `bun run smithers up <workflow>` from the correct directory
4. **Map exit codes** to Actions status (success / failure / suspended)
5. **Upload** Smithers log files as artifacts

Module resolution is the key enabler: when Bun `import()`s the workflow `.tsx`,
it resolves `from "smithers-orchestrator"` starting from the workflow file's
directory, not the CLI's location. This means external packs naturally use their
own `node_modules`, `agents.ts`, prompts, and relative imports.

## Files

| File | What it is |
|------|-----------|
| `.github/workflows/run-smithers.yml` | The reusable runner (Layer 1) |
| `.github/workflows/run-smithers-example.yml` | Example callers showing local + external + manual dispatch |
| `.github/workflows/run-smithers-research.md` | Design rationale and research notes |
| `action.yml` | Standalone composite action for Marketplace publishing |
| `examples/github-actions-templates/` | Template examples for org-level `.github` repo (Layer 2) |

## Next steps

1. **Try it locally**: Reference `./.github/workflows/run-smithers.yml` with a
   workflow in this repo
2. **Try an external pack**: Create a test repo with just `.smithers/workflows/test.tsx`
   and call it via `workflow-repo`
3. **Publish a template**: Copy the examples to your org's `.github` repo and
   see them appear in the "New workflow" UI
4. **Extract to a dedicated runner repo**: For broader sharing, move just the
   runner + action to `smithersai/github-actions-runner` and version it
   independently of the framework
