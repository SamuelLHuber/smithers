# smithers review

Agent code review that reads like a story.

`smithers review` runs one review agent per changed file, then a narrator
agent writes a walkthrough of the whole change: chapters in logical reading
order, prose explaining why each group of files changed, diffs embedded at
the right point in the narrative, and Mermaid diagrams wherever structure
changed. The output is a single self-contained HTML file you can open, share,
or publish to a hosted URL.

Pointed at a GitHub pull request, it also posts the review onto the PR: the
narrative summary as the review body, and every finding as an inline comment
with a ` ```suggestion ` block when there is replacement code to apply.

Findings never fail the build. smithers review reports; humans decide.

## Requirements

- [Bun](https://bun.sh) 1.3+
- `git`, and the [`gh` CLI](https://cli.github.com) for PR mode
- Claude credentials: a logged-in `claude` CLI, a `CLAUDE_CODE_OAUTH_TOKEN`
  (from `claude setup-token`), or an `ANTHROPIC_API_KEY`

## Use it from the terminal

The CLI runs from a checkout of this repository and can review any repo on
your machine:

```sh
git clone https://github.com/smithersai/smithers
cd smithers && pnpm install
```

```sh
# review the working tree of a repo, write .smithers-review/walkthrough.html
bun apps/review/src/cli/main.ts /path/to/repo

# review a branch against main, open the walkthrough when done
bun apps/review/src/cli/main.ts /path/to/repo --from main --to HEAD --open

# review one commit
bun apps/review/src/cli/main.ts /path/to/repo --commit abc1234

# review GitHub PR #123 and post the review onto it (via gh)
bun apps/review/src/cli/main.ts /path/to/repo --pr 123

# publish the walkthrough to the share service and print an unlisted URL
bun apps/review/src/cli/main.ts /path/to/repo --pr 123 --publish

# no agents: deterministic story, no review findings (works offline)
bun apps/review/src/cli/main.ts /path/to/repo --no-review --no-narrate
```

The repo path defaults to the current directory. Run `--help` for all
options.

## Set up automatic PR reviews (GitHub Actions)

There is no GitHub App to install yet; reviews run as a GitHub Actions
workflow inside your repo. The job posts one review per PR push and uploads
the walkthrough HTML as a run artifact.

### Secrets

| Secret | Required | What it does |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | yes (or `ANTHROPIC_API_KEY`) | authenticates the review and narrator agents; mint one with `claude setup-token` |
| `SMITHERS_REVIEW_PUBLISH_TOKEN` | no | adds a hosted walkthrough link to the posted review; without it the review still posts |

Set them with the `gh` CLI:

```sh
claude setup-token   # prints a long-lived token
gh secret set CLAUDE_CODE_OAUTH_TOKEN
```

If neither agent credential is configured the job skips with a notice
instead of failing.

### In this repository

Already installed: `.github/workflows/pr-review.yml` runs on every non-draft
PR from a branch in this repo. Adding the secrets above is the entire setup.

### In any other repository

Copy this workflow into `.github/workflows/pr-review.yml`. It checks out
your PR, checks out smithers next to it, and runs the review against your
repo:

```yaml
name: PR review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions: {}

concurrency:
  group: pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    # Fork PRs have no secrets and a read-only token; drafts are not ready.
    if: github.event.pull_request.head.repo.full_name == github.repository && !github.event.pull_request.draft
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read       # checkout + fetching the PR head sha
      pull-requests: write # post the review (summary + inline findings)
    steps:
      - uses: actions/checkout@v6.0.2
        with:
          fetch-depth: 0 # the review diffs origin/<base>..<head>; merge-base needs history
      - uses: actions/checkout@v6.0.2
        with:
          repository: smithersai/smithers
          path: .smithers-review-tool
      - uses: pnpm/action-setup@v6.0.8
        with:
          version: 10.10.0
          run_install: false
      - uses: actions/setup-node@v6.4.0
        with:
          node-version: 22
      - uses: oven-sh/setup-bun@v2.2.0
        with:
          bun-version: 1.3.13
      - run: pnpm -C .smithers-review-tool install --frozen-lockfile
      - run: npm install -g @anthropic-ai/claude-code
      - name: Review the PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
        run: >
          bun .smithers-review-tool/apps/review/src/cli/main.ts .
          --pr ${{ github.event.pull_request.number }}
      - if: always()
        uses: actions/upload-artifact@v4.6.2
        with:
          name: walkthrough
          path: .smithers-review/walkthrough.html
          if-no-files-found: ignore
```

Keep the workflow on the `pull_request` event. Never switch it to
`pull_request_target`: the review agents execute with the PR's code checked
out, and `pull_request_target` would hand that code your secrets.

## Publishing walkthroughs

`--publish` uploads the walkthrough to the share service and prints an
unlisted URL. The service lives at `https://review.jjhub.tech`. Credentials
come from `SMITHERS_REVIEW_PUBLISH_URL` / `SMITHERS_REVIEW_PUBLISH_TOKEN`
or `~/.smithers-review.json`.

## Status

- Published as: this repo's GitHub Actions workflow plus the CLI above.
- Not yet: an installable GitHub App, or a standalone npm package
  (`@smithers-orchestrator/review` is private; it depends on the
  unpublished `smithers-workflows` workspace package).

## Contributing

Architecture, the publish service, diff rendering exports, and the test
suites are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
