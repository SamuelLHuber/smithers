import { describe, expect, test } from "bun:test";
import { resolveInferenceEnv } from "../../action/src/resolveInferenceEnv";

describe("resolveInferenceEnv", () => {
  test("defaults to proxy mode with the session token as the API key", () => {
    const resolved = resolveInferenceEnv({
      anthropicBaseUrl: "https://review.example/anthropic",
      sessionToken: "srs_session",
    });
    expect(resolved.mode).toBe("proxy");
    expect(resolved.env).toEqual({
      ANTHROPIC_BASE_URL: "https://review.example/anthropic",
      ANTHROPIC_API_KEY: "srs_session",
    });
  });

  test("a CLAUDE_CODE_OAUTH_TOKEN switches to subscription mode with no overrides", () => {
    const resolved = resolveInferenceEnv({
      anthropicBaseUrl: "https://review.example/anthropic",
      sessionToken: "srs_session",
      claudeCodeOauthToken: "sk-ant-oat01-example",
    });
    expect(resolved.mode).toBe("subscription");
    expect(resolved.env).toEqual({});
  });

  test("a blank token does not count as subscription mode", () => {
    const resolved = resolveInferenceEnv({
      anthropicBaseUrl: "https://review.example/anthropic",
      sessionToken: "srs_session",
      claudeCodeOauthToken: "   ",
    });
    expect(resolved.mode).toBe("proxy");
  });
});
