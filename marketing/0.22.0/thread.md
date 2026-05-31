# Smithers 0.22.0 launch thread

Ready-to-post X/Twitter thread for the 0.22.0 release. Each tweet lists its media
attachment (files live in `./assets/`). The shape follows a strong flagship launch
thread: hook, vision, product framing, depth, objection, then proof and CTA.

Every product screenshot and GIF is a real capture from Studio 2. The title and
diagram cards are rendered from the actual Studio 2 design tokens (`src/theme.css`).

Copy follows an anti-slop pass: no em-dashes, no "it's not X, it's Y" framing, no
padding triads, no hedging. (Reference: the patterns flagged in common anti-AI-slop
writing guides.)

---

### 1. Hook
**Media:** `assets/hero.png`

> Smithers Studio 2 is here.
>
> A dark, live console for the agents doing your work. Every run, terminal,
> workflow, and approval gate streams over real backends. No mocks in the runtime
> path.
>
> And the new default is one conversation that drives all of it. 🧵

Leads with claims a skeptic can test (live, real backends, zero mocks) instead of
adjectives. The "new default" line plus the 🧵 opens a loop into tweet 2.

---

### 2. Vision
**Media:** `assets/chat-first.gif` (static fallback: `assets/chat-first.png`)

> The new default shell is chat-first. You don't click between 25 views, you say
> what you want.
>
> "Review this branch and show me the verdicts." It launches the workflow, opens
> the live board next to the chat, and hands you the approval gate when it's ready.

An analogy that compresses the ambition (one conversation instead of 25 views)
plus a concrete example. It sells the feeling, not the spec sheet.

---

### 3. Product framing
**Media:** `assets/studio-home.png`

> Studio 2 gives you one place to operate from.
>
> Navigation has three tiers: 4 surfaces always visible (Home, Runs, Workspace,
> Workflows), 6 a click away, 3 dev tools hidden until you opt in. ⌘K jumps to any
> of them, plus run-a-workflow, open-file, and ask-AI.

Names the architecture in numbers anyone can picture. The ⌘K line tells power
users the surface area is deep without cluttering the pitch.

---

### 4. Depth (the detail that signals taste)
**Media:** `assets/runs-live.gif` (alt: `assets/color-state.png`)

> One rule runs the whole design: saturated color only ever means run state.
>
> 🔵 running 🟢 succeeded 🟡 waiting-on-you 🔴 failed. Everything else stays calm
> monochrome, so a room full of agents reads at a glance and a pending approval
> jumps out.
>
> Live frames stream over the real Gateway WebSocket. Scrub back to time-travel.

One opinionated rule says more about craft than a feature list, and the live GIF
proves it instead of claiming it.

---

### 5. Depth (new primitive)
**Media:** `assets/task-fork.gif` (static fallback: `assets/task-fork.png`)

> New primitive: `<Task fork="plan">`.
>
> It copies an agent's whole session into a fresh task, so you can chain plan →
> implement → verify, or fan out parallel branches from one base context. The
> source is never touched, and a fork can be forked again.

Gives builders one concrete, quotable API. "Copies the whole session into a fresh
task" is the line people repeat.

---

### 6. Objection ("am I locked in?")
**Media:** `assets/any-agent.png`

> You don't have to switch agents to use Smithers.
>
> One `smithers skills add` plus `smithers mcp add` wires it into Claude Code,
> Codex, Cursor, Copilot, Pi, Hermes, OpenClaw, and ~14 more. The agent you already
> run drives it for you.

Answers the obvious worry inside the thread. Reassurance first, then the one-line
proof.

---

### 7. Proof, CTA, and the rest
**Media:** `assets/command-palette.gif`

> 0.22.0 is big and this thread only scratched it. Also shipping:
>
> • per-workflow UIs from `smithers init`, opened with `smithers ui`
> • Gateway Run Chronicle
> • `smithers starters` gallery
> • `smithers optimize` (GEPA prompt tuning)
> • HermesAgent worker
> • a security pass closing XSS, local-RCE, path-traversal, DoS, and auth-bypass
> • a broad engine, DB, and time-travel correctness sweep
>
> Full changelog: https://smithers.sh/changelogs/0.22.0

Honest about what got left out, leads the list with security and correctness
rather than only shiny features, and ends on one clean link.

---

## Media manifest

| Tweet | File | Source |
|------|------|--------|
| 1 Hook | `assets/hero.png` | generated (theme tokens) |
| 2 Vision | `assets/chat-first.gif`, `assets/chat-first.png` | generated animation, static |
| 3 Framing | `assets/studio-home.png` | real Studio 2 capture |
| 4 Depth/state | `assets/runs-live.gif`, `assets/color-state.png` | real GIF, generated |
| 5 Fork | `assets/task-fork.gif`, `assets/task-fork.png` | generated animation, static |
| 6 Any agent | `assets/any-agent.png` | generated (theme tokens) |
| 7 CTA | `assets/command-palette.gif` | real Studio 2 capture |
| spare | `assets/workspace-terminal.png`, `assets/workflow-ui-review.png` | real captures |

**Regenerate static cards:** edit `assets/_cards.html`, then run
`node marketing/0.22.0/assets/_shoot.mjs` (Chromium screenshots each `.card` at 2x).

**Regenerate GIFs:** edit `assets/_anim.html` or `assets/_anim.mjs`, then run
`node marketing/0.22.0/assets/_anim.mjs` (captures frames to `/tmp/anim/`) and
`bash marketing/0.22.0/assets/_gif.sh` (ffmpeg palettegen/paletteuse, looping GIFs).
