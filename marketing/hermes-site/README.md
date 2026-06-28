# marketing/hermes-site

Marketing site for **Smithers × Hermes**: how Smithers gives a self-hosted,
always-on Hermes agent durable, crash-safe long-running jobs that survive a
restart, ask for approval in your chat, and report back into the thread. Also
covers the [Eliza (elizaOS)](https://github.com/elizaOS/eliza) drop-in plugin.

The copy is written for the Hermes audience (self-hosters running an autonomous
agent on a VPS via Telegram / Discord / Slack), not for IDE/CI coding workflows.

Single self-contained `index.html` (no external assets), dark-aurora style.
Deployed to Cloudflare via Alchemy at **hermes.smithers.sh**.

## Preview locally

```bash
npm install            # one-time (alchemy, for deploy)
npm run build          # stages dist/index.html
npx serve dist         # or open index.html directly
```

## Deploy

```bash
npm run deploy         # binds hermes.smithers.sh
npm run destroy        # teardown
```

Run with `node` (bun segfaults on the Alchemy entrypoint). Required env:
`CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID` if the token spans multiple
accounts) and `ALCHEMY_PASSWORD` for the encrypted state. The `smithers.sh` zone
must live in that Cloudflare account. `node_modules/`, `dist/`, and `.alchemy/`
(local encrypted deploy state) are gitignored.

## Links

- Hermes: https://github.com/NousResearch/hermes-agent
- Eliza: https://github.com/elizaOS/eliza
- Smithers: https://github.com/smithersai/smithers
- Integration docs: https://smithers.sh/integrations/hermes
