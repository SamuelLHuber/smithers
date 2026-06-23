# Smithers 0.25.0 launch thread

Ready-to-post X/Twitter thread for the Smithers 0.25.0 release.

---

### 1. Tweet 1

**Media:** [hero card → assets/tweet-01-hero.svg](assets/tweet-01-hero.svg)

> Smithers 0.25.0 is out. ~450 commits.
>
> Postgres-backed durability, a Gateway sync layer, typed workflow outputs, new agent tools, and the real UI on the way.
>
> bunx smithers-orchestrator@0.25.0

Claim IDs: none
Characters: 192

---

### 2. Tweet 2

**Media:** [capability card → assets/tweet-02-capability.svg](assets/tweet-02-capability.svg)

> Durability now runs on Postgres alongside SQLite and PGlite, with a fail-loud migration:
>
> bunx smithers-orchestrator migrate
>
> A missing migration errors instead of silently reading a stale store.

Claim IDs: none
Characters: 195

---

### 3. Tweet 3

> The Gateway grew a sync layer: new read RPCs (docs, accounts, prompts, scores, memory, tickets, crons) backed by TanStack DB collections + React hooks, browser persistence via SQLite-WASM/OPFS, and optional cloud Electric sync.

Claim IDs: none
Characters: 227

---

### 4. Tweet 4

> More built-in agent tools: grounded multi-provider web search, a generic HTTP tool, Whisper/Deepgram transcription, image generation, and document OCR. Plus typed ctx.output reads, so the data your workflow reads back typechecks.

Claim IDs: none
Characters: 229

---

### 5. Tweet 5

> We're gearing up to ship the real Smithers UI, so the in-repo proof-of-concept UIs are gone.
>
> Preview the real thing: ui-preview.smithers.sh

Claim IDs: none
Characters: 140

---

## Media manifest

| Tweet | Asset | Kind |
|-------|-------|------|
| 1 | `assets/tweet-01-hero.svg` | hero |
| 2 | `assets/tweet-02-capability.svg` | capability |

**Rasterize to PNG for upload:** `node marketing/0.25.0/assets/render-pngs.mjs` (renders each card at 2x).
