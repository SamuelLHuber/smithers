/**
 * Decide how the review subprocess authenticates its agents.
 *
 * Default is proxy mode: inference goes through the service's metered
 * Anthropic proxy using the session token. When the job env carries a
 * non-empty CLAUDE_CODE_OAUTH_TOKEN (the repo owner's Claude subscription,
 * from `claude setup-token`), inference runs on that subscription instead:
 * no ANTHROPIC_* overrides are set, and the claude CLI picks the OAuth token
 * up from the inherited env. Publishing and quota are session-scoped either
 * way and unaffected by this choice.
 */
export interface ResolveInferenceEnvInput {
  anthropicBaseUrl: string;
  sessionToken: string;
  claudeCodeOauthToken?: string;
}

export interface ResolvedInferenceEnv {
  mode: "proxy" | "subscription";
  env: Record<string, string>;
}

export function resolveInferenceEnv(input: ResolveInferenceEnvInput): ResolvedInferenceEnv {
  if (input.claudeCodeOauthToken?.trim()) {
    return { mode: "subscription", env: {} };
  }
  return {
    mode: "proxy",
    env: {
      ANTHROPIC_BASE_URL: input.anthropicBaseUrl,
      ANTHROPIC_API_KEY: input.sessionToken,
    },
  };
}
