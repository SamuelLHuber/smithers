# rabbit

Our CodeRabbit. One command reviews a change set with agents and writes a
single-file HTML walkthrough that presents the change as a story: chapters in
logical reading order, each explaining why a group of files changed, with
diffs and review findings inline. You read it top to bottom instead of
decoding an alphabetical file list.

Spec: `.smithers/specs/rabbit-review-walkthrough.md`.

## Usage

```sh
# review the working tree of the current repo, write .rabbit/walkthrough.html
bun apps/rabbit/src/cli/main.ts

# review a branch against main, open the walkthrough when done
bun apps/rabbit/src/cli/main.ts --from main --to HEAD --open

# review one commit
bun apps/rabbit/src/cli/main.ts --commit abc1234

# no agents: deterministic story, no review findings (works offline)
bun apps/rabbit/src/cli/main.ts --no-review --no-narrate
```

Run `--help` for all options.

## How it works

One durable smithers workflow, run in-process through the engine:

1. The review side reuses `.smithers/lib/open-code-review.ts` (the
   OpenCodeReview-derived flow): target resolution, file filtering, one
   parallel review agent per file with the OpenCodeReview prompt, then comment
   normalization and line anchoring.
2. `collect-changes` loads the full diff for every changed file, including
   files the review filters skip (tests, docs, configs). The walkthrough shows
   everything.
3. `narrate` (an agent) organizes the change set into chapters: the central
   change first, supporting code in dependency order, tests with what they
   prove, chores last. `normalizeStory` enforces that every changed file
   appears in exactly one chapter; a deterministic fallback story covers agent
   failure and `--no-narrate`.
4. `walkthrough` renders self-contained HTML (inline CSS, no external assets)
   and writes it to `--out`.

Review findings never change the exit code; rabbit reports, humans decide.

Agents default to ClaudeCode subscription providers (opus primary, sonnet
failover). Override with `RABBIT_MODEL` / `RABBIT_FALLBACK_MODEL`.

## Tests

```sh
pnpm -C apps/rabbit test        # bun test: real git fixtures + agentless engine e2e
pnpm -C apps/rabbit typecheck
```
