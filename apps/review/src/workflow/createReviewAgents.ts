import { ClaudeCodeAgent, type AgentLike } from "smithers-orchestrator";

/**
 * Default agent arrays for review and narration. Mirrors .smithers/agents.ts:
 * the ClaudeCode subscription providers are the reliable ones locally
 * (issue #236); Fable primary, Opus failover.
 *
 * Auth selection: when both `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` are
 * set in the environment, build the agents in API-key mode. This is the path
 * the cloud composite action takes — the service mints a session-scoped key
 * and points the CLI at the metered proxy, and ClaudeCodeAgent must forward
 * that key to the spawned `claude` binary (its default behaviour is to
 * *clear* `ANTHROPIC_API_KEY` so subscription auth wins). Without the
 * `apiKey` option, that clear would route CI traffic at the user's empty
 * subscription instead of the proxy. Otherwise (local dev, the in-repo CI
 * that uses CLAUDE_CODE_OAUTH_TOKEN) keep subscription mode.
 */
export function createReviewAgents(repoDir: string): { review: AgentLike[]; narrate: AgentLike[] } {
  const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const proxyMode = Boolean(baseUrl && apiKey);

  const primaryModel = process.env.SMITHERS_REVIEW_MODEL ?? "claude-fable-5";
  const fallbackModel = process.env.SMITHERS_REVIEW_FALLBACK_MODEL ?? "claude-opus-4-8";

  const primary = proxyMode
    ? new ClaudeCodeAgent({ model: primaryModel, cwd: repoDir, apiKey })
    : new ClaudeCodeAgent({ model: primaryModel, cwd: repoDir });
  const fallback = proxyMode
    ? new ClaudeCodeAgent({ model: fallbackModel, cwd: repoDir, apiKey })
    : new ClaudeCodeAgent({ model: fallbackModel, cwd: repoDir });

  return { review: [primary, fallback], narrate: [primary, fallback] };
}
