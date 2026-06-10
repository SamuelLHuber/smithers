import { ClaudeCodeAgent, type AgentLike } from "smithers-orchestrator";

/**
 * Default agent arrays for review and narration. Mirrors .smithers/agents.ts:
 * the ClaudeCode subscription providers are the reliable ones locally
 * (issue #236); opus primary, sonnet failover.
 */
export function createRabbitAgents(repoDir: string): { review: AgentLike[]; narrate: AgentLike[] } {
  const primary = new ClaudeCodeAgent({ model: process.env.RABBIT_MODEL ?? "claude-opus-4-7", cwd: repoDir });
  const fallback = new ClaudeCodeAgent({ model: process.env.RABBIT_FALLBACK_MODEL ?? "claude-sonnet-4-7", cwd: repoDir });
  return { review: [primary, fallback], narrate: [primary, fallback] };
}
