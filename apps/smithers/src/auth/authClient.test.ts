import { describe, expect, test } from "bun:test";
import {
  normalizeAuthToken,
  normalizeGatewayBaseUrl,
  providerAuthorizeUrl,
  safeRedirectPath,
} from "./authClient";

describe("authClient redirect helpers", () => {
  test("keeps only same-origin relative redirects", () => {
    expect(safeRedirectPath("/store?tab=remote#runs")).toBe("/store?tab=remote#runs");
    expect(safeRedirectPath("https://evil.example/store")).toBe(null);
    expect(safeRedirectPath("//evil.example/store")).toBe(null);
    expect(safeRedirectPath("/login?redirect=/store")).toBe(null);
  });

  test("builds WorkOS provider authorize URLs", () => {
    const github = new URL(
      providerAuthorizeUrl("github", { redirect: "/store" }),
      "https://smithers.local",
    );
    expect(github.pathname).toBe("/api/auth/workos/authorize");
    expect(github.searchParams.get("provider")).toBe("GitHubOAuth");
    expect(github.searchParams.get("redirect")).toBe("/store");

    const email = new URL(
      providerAuthorizeUrl("email", { email: "will@example.com", redirect: "/" }),
      "https://smithers.local",
    );
    expect(email.searchParams.get("provider")).toBe("authkit");
    expect(email.searchParams.get("login_hint")).toBe("will@example.com");
  });
});

describe("authClient token and gateway normalization", () => {
  test("normalizes bearer/token prefixes", () => {
    expect(normalizeAuthToken("Bearer abc123")).toBe("abc123");
    expect(normalizeAuthToken("token abc123")).toBe("abc123");
    expect(normalizeAuthToken("  abc123  ")).toBe("abc123");
    expect(normalizeAuthToken("   ")).toBe(null);
  });

  test("keeps only http gateway base URLs without path noise", () => {
    expect(normalizeGatewayBaseUrl("https://gateway.example.com/rpc?x=1#frag")).toBe(
      "https://gateway.example.com/rpc",
    );
    expect(normalizeGatewayBaseUrl("http://127.0.0.1:7331/")).toBe("http://127.0.0.1:7331");
    expect(normalizeGatewayBaseUrl("file:///tmp/gateway")).toBe("");
  });
});
