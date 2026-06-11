// smithers-source: generated
// Account providers (camelCase labels) come from ~/.smithers/accounts.json — managed via `smithers agent add|list|remove`.
import { homedir } from "node:os";
import path from "node:path";
import { type AgentLike, ClaudeCodeAgent as SmithersClaudeCodeAgent, CodexAgent as SmithersCodexAgent, OpenCodeAgent as SmithersOpenCodeAgent, PiAgent as SmithersPiAgent, KimiAgent as SmithersKimiAgent, AmpAgent as SmithersAmpAgent, GeminiAgent as SmithersGeminiAgent } from "smithers-orchestrator";

export const providers = {
  claude: new SmithersClaudeCodeAgent({ model: "claude-opus-4-7", cwd: process.cwd() }),
  codex: new SmithersCodexAgent({ model: "gpt-5.3-codex", cwd: process.cwd(), skipGitRepoCheck: true }),
  opencode: new SmithersOpenCodeAgent({ model: "anthropic/claude-opus-4-20250514", cwd: process.cwd() }),
  pi: new SmithersPiAgent({ provider: "openai", model: "gpt-5.3-codex" }),
  kimi: new SmithersKimiAgent({ model: "kimi-latest" }),
  amp: new SmithersAmpAgent(),
  claudeSonnet: new SmithersClaudeCodeAgent({ model: "claude-sonnet-4-6", cwd: process.cwd() }),
  kimi1: new SmithersKimiAgent({ model: "kimi-latest", configDir: path.join(homedir(), ".smithers/accounts/kimi-1"), cwd: process.cwd() }),
  codex1: new SmithersCodexAgent({ model: "gpt-5.3-codex", configDir: path.join(homedir(), ".codex"), skipGitRepoCheck: true, cwd: process.cwd() }),
  gemini1: new SmithersGeminiAgent({ model: "gemini-3.1-pro-preview", configDir: path.join(homedir(), ".gemini"), cwd: process.cwd() }),
} as const;

// LOCAL OVERRIDE (uncommitted, dogfooding session): the codex providers reject
// `gpt-5.3-codex` under ChatGPT auth, opencode runs on an uncredited Anthropic
// API key, and the kimi accounts' OAuth has expired — all local credential
// issues, not a shared-config fix. A kimi auth-setup error is fatal (the engine
// fails the run instead of failing over), so leading arrays with it kills runs.
// Restrict to the two reliable ClaudeCode subscription providers. See issue #236.
export const agents = {
  cheapFast: [providers.claudeSonnet, providers.claude],
  smart: [providers.claude, providers.claudeSonnet],
  smartTool: [providers.claude, providers.claudeSonnet],
} as const satisfies Record<string, AgentLike[]>;
