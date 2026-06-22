# Smithers 0.25.0 launch thread

Ready-to-post X/Twitter thread for the Smithers 0.25.0 release.

---

### 1. Tweet 1

**Media:** [hero card → assets/tweet-01-hero.svg](assets/tweet-01-hero.svg)

> Smithers 0.25.0 is out.
>
> Workflow authors get fully typed output reads, the repo shed its proof-of-concept UI apps, and CI plus the release pipeline are green and hardened.
>
> bunx smithers-orchestrator@0.25.0

Claim IDs: none
Characters: 207

---

### 2. Tweet 2

**Media:** [capability card → assets/tweet-02-capability.svg](assets/tweet-02-capability.svg)

> ctx.output / outputMaybe / latest now infer the row type from the table you pass.
>
> ctx.outputMaybe(outputs.research, { nodeId: "research" }).summary just typechecks. No more untyped output rows in your workflows.

Claim IDs: none
Characters: 212

---

### 3. Tweet 3

> The product UI moved to its own repo, so the in-repo POC apps (the chat PWA, the studio shell, the demos) are gone. The published library, the engine, and the `smithers ui` workflow-UI surface are unchanged.

Claim IDs: none
Characters: 207

---

### 4. Tweet 4

> Also in 0.25.0: a green CI (typecheck + test), a release drift guard that no longer trips on non-deterministic .d.ts output, and a refreshed gateway OpenAPI spec plus llms bundles.
>
> Full notes: smithers.sh

Claim IDs: none
Characters: 205

---

## Media manifest

| Tweet | Asset | Kind |
|-------|-------|------|
| 1 | `assets/tweet-01-hero.svg` | hero |
| 2 | `assets/tweet-02-capability.svg` | capability |

**Rasterize to PNG for upload:** `node marketing/0.25.0/assets/render-pngs.mjs` (renders each card at 2x).
