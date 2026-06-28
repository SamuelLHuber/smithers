# @smithers-orchestrator/eliza-plugin

A [Smithers](https://smithers.sh) plugin for [Eliza (elizaOS)](https://github.com/elizaOS/eliza).

It makes Smithers a first-class capability of an Eliza agent. Smithers is a
durable control plane for long-running coding agents: workflows run for minutes
or days, survive crashes, retry on failure, and pause for human approval.

Once the plugin is in your character's `plugins`, the agent can:

- **Run durable workflows** (`RUN_SMITHERS_WORKFLOW`) for any multi-step or
  background coding task, instead of grinding through it in-band. If no workflow
  is named it runs `create-workflow` to author one from the request.
- **Clear approval gates** (`SMITHERS_APPROVE` / `SMITHERS_DENY`).
- **Stay automatically aware of in-flight runs.** A provider injects live run
  status and any pending approval gates into the agent's context on every turn.

## Install

```bash
npm install @smithers-orchestrator/eliza-plugin
# Smithers itself is reached via the CLI:
npm install -g smithers-orchestrator   # or rely on `bunx smithers-orchestrator`
```

## Use

Add it to your character definition:

```ts
import { smithersPlugin } from "@smithers-orchestrator/eliza-plugin";

export const character = {
  name: "Ada",
  plugins: [smithersPlugin],
  // ...
};
```

The plugin shells out to the `smithers` CLI (override the binary with
`$SMITHERS_BIN`, e.g. `SMITHERS_BIN="bunx smithers-orchestrator"`). It is
dependency-light and duck-types the Eliza runtime, so it works across elizaOS
versions without pinning `@elizaos/core`.

See the [Hermes & Eliza integration docs](https://smithers.sh/integrations/hermes).
