# Github Actions Workflow Templates for Smithers

This directory contains **workflow template examples** that should be placed in an
organization-level `.github` repository to appear in the GitHub UI when users
navigate to **Actions → New workflow**.

## How templates work

1. Create or use an existing `.github` repo at the **organization** level:
   - `smithersai/.github` for the `smithersai` org
   - `your-org/.github` for your org

2. Place these files in `.github/workflow-templates/` of that org repo.

3. GitHub shows them in the "New workflow" UI for every repo in that org.

4. When a user clicks "Configure", GitHub creates a `.github/workflows/*.yml`
   file in the **user's repo** — not the `.github` repo.

## Repo structure (org-level `.github` repo)

```
smithersai/.github/
└── workflow-templates/
    ├── README.md
    ├── smithers-security-review.yml
    ├── smithers-security-review.properties.json
    ├── smithers-code-review.yml
    ├── smithers-code-review.properties.json
    ├── smithers-architecture-test.yml
    ├── smithers-architecture-test.properties.json
    └── smithers-icon.svg   # optional icon
```

## Template file reference

Each template consists of two files:

### 1. `*.yml` — The workflow that gets copied into the user's repo

This is a normal GitHub Actions workflow file that calls the reusable runner.

Key characteristics:
- Uses `$default-branch` placeholder for the default branch name
- Calls the shared runner via `uses:` at the job level
- Uses the user's own `${{ github.repository }}`, `${{ github.sha }}`, etc.
- Must include `secrets: inherit` to pass API keys to the runner

### 2. `*.properties.json` — Metadata for the GitHub UI

```json
{
    "name": "Smithers Security Review",
    "description": "AI-powered security review on every pull request.",
    "iconName": "shield",
    "categories": ["Security", "Code Review"],
    "filePatterns": ["\\.ts$", "\\.tsx$", "\\.js$", "\\.py$"]
}
```

Field reference (from GitHub docs):
- `name` *(required)* — Displayed in the template list
- `description` *(required)* — Displayed below the name
- `iconName` *(optional)* — SVG file in `workflow-templates/` or `octicon <name>`
- `categories` *(optional)* — Controls grouping in the UI
- `filePatterns` *(optional)* — Regex array; template only shown if repo has matching files

## Icon sourcing

For `iconName`, use either:
1. **Local SVG**: Save an SVG in `workflow-templates/` and reference it by filename
   without extension: `"iconName": "smithers-icon"` for `smithers-icon.svg`
2. **Octicon**: `"iconName": "octicon shield"` for the shield icon from GitHub's
   Octicon set

## Visibility rules

| Template repo visibility | Who sees the templates |
|--------------------------|------------------------|
| public | All repos (public, internal, private) |
| internal | Internal + private repos |
| private | Private repos only (need explicit read access) |

---

## Example: creating a custom template

Let's say you have a custom workflow pack at `acme-corp/checkstyle-agent`.
Create these two files in your org's `.github` repo:

### `.github/workflow-templates/acme-checkstyle-review.yml`
```yaml
name: Checkstyle Review (Smithers)

on:
  pull_request:
    types: [opened, synchronize]
    branches: [$default-branch]

jobs:
  review:
    uses: smithersai/smithers/.github/workflows/run-smithers.yml@main
    with:
      workflow: .smithers/workflows/checkstyle-review.tsx
      workflow-repo: acme-corp/checkstyle-agent
      workflow-ref: main
      input: |
        {"sha": "${{ github.event.pull_request.head.sha }}",
         "repo": "${{ github.repository }}",
         "pr": ${{ github.event.pull_request.number }}}
      allow-network: false
      timeout-minutes: 30
    secrets: inherit
```

### `.github/workflow-templates/acme-checkstyle-review.properties.json`
```json
{
    "name": "Checkstyle Review (Smithers)",
    "description": "AI-driven checkstyle analysis on Java PRs using Smithers workflows.",
    "iconName": "octicon code",
    "categories": ["Code Review", "Java"],
    "filePatterns": ["\\.java$", "pom\\.xml$", "build\\.gradle$"]
}
```

After pushing these, users in your org will see the template in
**Actions → New workflow** when their repo contains `.java` files.

Clicking "Configure" creates a `.github/workflows/checkstyle-review.yml` in
THEIR repo, ready to go with no manual editing needed.
