# t4-real-gateway-run — Launch a gateway workflow run that makes a REAL Claude LLM call, watch it finish in the UI

Make the cwd gateway execute a real agent workflow end to end.

1. `.smithers/workflows/e2e-probe.tsx`: a minimal one-task agent workflow (output schema like { answer: z.string() }) whose Task uses a ClaudeCodeAgent (model claude-sonnet-4-6, cheap — NOT 4-7, which 404s on this account) and asks for a one-line answer. The gateway auto-mounts every .smithers/workflows/*.tsx at boot, so creating the file registers it on next gateway boot.
   - Mount caveat: an ALREADY-RUNNING e2e gateway on 7342 will not see the new file. If 7342 is up and /workflows lacks e2e-probe, kill ONLY that gateway process (the one bound to 7342; never 7331) and let playwright's webServer reboot it. Script this guard into the spec setup or a tiny stack helper.
2. `scripts/e2e-real/probe-agent-cred.sh` — ASSUMPTION PROBE, must run before the spec: source apps/smithers/.env.e2e.local if present, `unset ANTHROPIC_API_KEY` unless that file supplied one (see ground rules: the shell-exported key has no credits), then run `claude -p "Say OK" --model claude-sonnet-4-6` ON THE HOST (the gateway spawns the same host CLI) and require exit 0 with non-empty output. If this fails, the spec is doomed — fail fast naming the missing credential (claude /login, claude setup-token, or ANTHROPIC_API_KEY).
3. `apps/smithers/tests/e2e-real/gatewayRun.spec.ts`: through the UI (study tests/e2e/launchRun.spec.ts + gatewayRun.spec.ts for the surfaces, but target the real config), launch the e2e-probe workflow on the real gateway, watch live run events arrive, and assert THAT run (by its runId) reaches finished with a visible non-empty output. Timeout generous (a real Claude call takes 30-120s).

Success criteria: probe script + spec both green via the verify command. The LLM call is real (visible token usage / agent events in the gateway run, no canned text).

## Verify command (must exit 0)

```bash
bash scripts/e2e-real/probe-agent-cred.sh && pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/gatewayRun.spec.ts
```
