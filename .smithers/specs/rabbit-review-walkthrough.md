# Rabbit: code review + story-form HTML walkthrough

`apps/rabbit` is our CodeRabbit. It does two things in one run:

1. Reviews changed code with the OpenCodeReview-derived per-file review flow
   already in `.smithers/lib/open-code-review.ts` (the same prompts, filters,
   and comment-anchoring logic the `open-code-review` workflow uses).
2. Writes a single-file HTML walkthrough that presents the change as a story:
   chapters in logical reading order, each explaining why a group of files
   changed, with the diffs and review findings inline. A reviewer reads it top
   to bottom instead of decoding an alphabetical file list.

## CLI

```
rabbit [repo] [options]

  --from <ref> --to <ref>   review a ref range (merge-base diff)
  --commit <sha>            review a single commit
                            (default: workspace changes, tracked + untracked)
  --background <text>       requirement background passed to review + narrator
  --title <text>            walkthrough title (default: narrator headline)
  --out <file>              output HTML path (default: <repo>/.rabbit/walkthrough.html)
  --db <file>               smithers db path (default: <repo>/.rabbit/rabbit.db)
  --no-review               skip review agents; walkthrough only
  --no-narrate              skip the narrator agent; deterministic story order
  --concurrency <n>         parallel file reviews (default 8)
  --timeout <min>           per-agent-task timeout in minutes (default 10)
  --open                    open the HTML in the default browser when done
```

Run it with bun: `bun apps/rabbit/src/cli/main.ts` or via the `rabbit` bin.
Exit code 0 when the walkthrough is written, 1 on failure. Review findings do
not affect the exit code; rabbit reports, humans decide.

## Pipeline

One durable smithers workflow (`createRabbitWorkflow`), programmatic engine run
(`runWorkflow` from `@smithers-orchestrator/engine`), own sqlite db. Tasks:

| id                | kind    | what it does |
|-------------------|---------|--------------|
| `resolve-target`  | compute | `resolveReviewTarget` from the review lib |
| `preview`         | compute | `previewOpenCodeReview`: file list, stats, review filters |
| `collect-changes` | compute | `loadDiffs`: full diff text for every changed file, including files the review filters exclude (tests, docs); the walkthrough shows everything |
| `prepare-review`  | compute | `buildNativeReviewPrompt`: per-file review prompts |
| `review-file-*`   | agent   | one per reviewable file, in parallel, OpenCodeReview prompt verbatim |
| `review`          | compute | `finalizeNativeReview`: comment normalization, line anchoring, scoping |
| `narrate`         | agent   | turns the change set + findings into a story (schema below) |
| `walkthrough`     | compute | normalize the story, render HTML, write the file |

Review reuse is at the lib level: rabbit imports the lib functions, it does not
fork their logic. New lib exports added for rabbit: `loadDiffs`,
`effectivePath`, `diffStatus`, `type DiffRecord` (all existed as internals).

`--no-review` (or no review agents configured) sets `runReview: false` before
`prepare-review`, so the review finalizer reports `skipped` instead of failing.
`narrate` runs with `continueOnFail`; if it fails or is disabled the
walkthrough falls back to the deterministic story.

## Story schema

The narrator returns structured output:

```ts
story = {
  headline: string,    // one sentence: what this change does
  synopsis: string,    // short paragraph: the arc of the change
  chapters: [{
    title: string,
    narrative: string, // why this chapter exists, what to look for
    files: [{ path: string, role: string }],  // role: one line per file
  }],
}
```

Narrator ordering contract: open with the motivating or central change, follow
it through supporting code in dependency order, keep related files together,
put tests next to what they prove, end with chores. Every changed file appears
in exactly one chapter.

`normalizeStory` repairs agent output before rendering: drops paths that are
not in the change set, dedupes files across chapters (first chapter wins),
drops empty chapters, and appends an "Everything else" chapter for any changed
file the story missed. The invariant after normalization: every changed file
appears in exactly one chapter. If nothing survives, the fallback story is
used.

`fallbackStory` is deterministic: code files grouped by workspace area
(`apps/x`, `packages/y`, top-level dir otherwise), ordered by churn descending,
then configuration, then tests, then docs. It needs no agent, so the
walkthrough works offline and in tests.

## Walkthrough HTML

Self-contained single file, inline CSS, one small inline script
(expand/collapse all). No external assets, works from `file://`. Content, in
order:

- header: title/headline, synopsis, repo + ref + mode + date, change totals
- findings index: review comment count, links to each finding's file section
- table of contents: numbered chapters
- chapters: narrative prose, then per file: path, status badge, +/- counts,
  the file's role line, review findings as callout cards (comment, line range,
  existing/suggested code), and the rendered diff in a `<details>` block
- binary files get a note instead of a diff; very long diffs are truncated
  with a line count notice

All dynamic text is HTML-escaped. Diff rendering is display-only and lives in
the app, not the review lib.

## Outputs

CLI-read output rows (`walkthrough`, via `loadOutputs`) use single-word
column names (`path`, `bytes`, `chapters`, `files`, `findings`, `message`)
because output rows come back snake_cased; single words round-trip unchanged.

## Agents

Default agents are the two reliable ClaudeCode subscription providers (see
`.smithers/agents.ts` and issue #236): opus primary, sonnet fallback, `cwd` set
to the target repo. Override models with `RABBIT_MODEL` and
`RABBIT_FALLBACK_MODEL`.

## Testing

- Unit tests on real git fixtures (temp repos, real `git`), no mocks: fallback
  story grouping/ordering, story normalization invariants, HTML rendering and
  escaping.
- An agentless end-to-end test runs the real workflow through the real engine
  (`runWorkflow`, real sqlite, real git): `--no-review --no-narrate` on a temp
  repo, then asserts the HTML exists and contains every changed file.
- Agent-driven runs are exercised manually (`rabbit` on this repo); they need
  ClaudeCode credentials.

## Non-goals (for now)

- No GitHub App, webhooks, or PR comment posting. Output is local HTML.
- No incremental re-review state. Each run is a fresh review of the target.
- No chat replies on findings.
