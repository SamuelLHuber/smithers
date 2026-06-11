import { ClaudeCodeAgent, type AgentLike } from "smithers-orchestrator";

/**
 * Default agent arrays for review and narration. Mirrors .smithers/agents.ts:
 * the ClaudeCode subscription providers are the reliable ones locally
 * (issue #236); Fable primary, Opus failover.
 */
export function createReviewAgents(repoDir: string): { review: AgentLike[]; narrate: AgentLike[] } {
  const primary = new ClaudeCodeAgent({ model: process.env.SMITHERS_REVIEW_MODEL ?? "claude-fable-5", cwd: repoDir });
  const fallback = new ClaudeCodeAgent({ model: process.env.SMITHERS_REVIEW_FALLBACK_MODEL ?? "claude-opus-4-8", cwd: repoDir });
  return { review: [primary, fallback], narrate: [primary, fallback] };
}
