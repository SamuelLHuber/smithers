# t3-real-chat-llm — Chat streams a REAL LLM completion (Gemini Flash or Cerebras) through the real Worker

Wire /api/chat to a real LLM and prove it in the UI.

The Worker (apps/smithers/src/worker.ts) already supports upstream overrides via its env bindings: CEREBRAS_API_KEY (required), CEREBRAS_BASE_URL (default https://api.cerebras.ai/v1), CEREBRAS_MODEL (default gpt-oss-120b). Those are binding NAMES; pointing them at another real OpenAI-compatible LLM API is not a mock.

1. `scripts/e2e-real/worker.ts`: boot the REAL Worker code (same pattern as tests/fixtures/workerHost.ts — study it, but do NOT import it or the cerebrasUpstream fixture) on 127.0.0.1:5376. Upstream selection at boot:
   - CEREBRAS_API_KEY set -> use it with the Cerebras defaults.
   - else GEMINI_API_KEY set -> bindings CEREBRAS_API_KEY=$GEMINI_API_KEY, CEREBRAS_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai, CEREBRAS_MODEL=${SMITHERS_E2E_CHAT_MODEL:-gemini-2.5-flash} (Gemini's OpenAI-compatible endpoint, real Gemini Flash completions).
   - neither set -> REFUSE to boot with a clear error naming both env vars. No fallback, no canned data.
   Log which provider/model was selected (never the key).
2. Extend playwright.real.config.ts: worker webServer leg + SMITHERS_CHAT_PROXY_TARGET=http://127.0.0.1:5376 on the vite leg. Load the keys from apps/smithers/.env.e2e.local AND process.env into the worker leg's env (read the file in the config; never commit values).
3. `apps/smithers/tests/e2e-real/chat.spec.ts`: open the chat surface, send a short prompt (e.g. "Reply with one short sentence."), and assert a real assistant message streams back: non-empty assistant text appears, no error state, and the /api/chat response was a 200 SSE/stream. Generous timeout (real model latency). Assert behavior, not exact text. The spec must pass identically on either upstream.

Success criteria: verify command exits 0 with a REAL upstream (the workflow's preflight already proved the resolved upstream completes a prompt). The worker leg refuses to boot without a key. Zero fixture imports. If the Gemini model id 404s, list the live models via GET https://generativelanguage.googleapis.com/v1beta/openai/models with the key and pick the current flash id; document the choice.

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/chat.spec.ts
```
