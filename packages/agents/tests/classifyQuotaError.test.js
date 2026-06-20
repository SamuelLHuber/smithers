import { describe, expect, test } from "bun:test";
import { classifyQuotaError } from "../src/BaseCliAgent/BaseCliAgent.js";

const NOW_MS = 1_750_000_000_000; // fixed reference point
const ctx = { nowMs: () => NOW_MS };

describe("classifyQuotaError — pattern detection", () => {
    test("detects 'hit your usage limit' (Codex ChatGPT ticket example)", () => {
        const msg = "You've hit your usage limit. Try again at Jun 18th, 2026 9:54 AM.";
        const err = classifyQuotaError(msg, "codex", ctx);
        expect(err).not.toBeNull();
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
        expect(err?.details?.failureQuota).toBe(true);
    });

    test("detects 'usage limit exceeded'", () => {
        const err = classifyQuotaError("usage limit exceeded", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 'quota exceeded'", () => {
        const err = classifyQuotaError("Your quota exceeded for this month", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 'rate limit exceeded'", () => {
        const err = classifyQuotaError("rate limit exceeded, please wait", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 'you have reached your usage'", () => {
        const err = classifyQuotaError("you have reached your usage limit", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 'you've reached your quota'", () => {
        const err = classifyQuotaError("you've reached your quota", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 'usage cap reached'", () => {
        const err = classifyQuotaError("usage cap reached", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 'too many requests'", () => {
        const err = classifyQuotaError("Too many requests, slow down", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("detects 429 with try again", () => {
        const err = classifyQuotaError("Error 429: rate limit hit. Please try again later.", "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
    });

    test("returns null for generic errors", () => {
        expect(classifyQuotaError("network timeout", "codex", ctx)).toBeNull();
        expect(classifyQuotaError("model not found", "codex", ctx)).toBeNull();
        expect(classifyQuotaError("invalid api key", "codex", ctx)).toBeNull();
        expect(classifyQuotaError("", "codex", ctx)).toBeNull();
    });
});

describe("classifyQuotaError — reset time parsing", () => {
    test("parses ordinal date format: 'try again at Jun 18th, 2026 9:54 AM'", () => {
        // Use a now well before June 2026
        const pastCtx = { nowMs: () => 1_000_000 };
        const msg = "You've hit your usage limit. Try again at Jun 18th, 2026 9:54 AM.";
        const err = classifyQuotaError(msg, "codex", pastCtx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
        // Should have parsed a reset time (date is in the future relative to nowMs=1000)
        expect(typeof err?.details?.quotaResetAtMs).toBe("number");
        expect(err?.details?.quotaResetAtMs).toBeGreaterThan(0);
    });

    test("parses 'retry after N seconds' format", () => {
        const msg = "Rate limit exceeded. Retry after 60 seconds.";
        const err = classifyQuotaError(msg, "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
        expect(typeof err?.details?.quotaResetAtMs).toBe("number");
        // Should be approximately NOW_MS + 60_000
        const resetAt = err?.details?.quotaResetAtMs;
        expect(resetAt).toBeGreaterThanOrEqual(NOW_MS + 59_000);
        expect(resetAt).toBeLessThanOrEqual(NOW_MS + 61_000);
    });

    test("does not set quotaResetAtMs when no reset time present", () => {
        const msg = "You've hit your usage limit.";
        const err = classifyQuotaError(msg, "codex", ctx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
        expect(err?.details?.quotaResetAtMs).toBeUndefined();
    });

    test("does not set quotaResetAtMs when parsed date is in the past", () => {
        // Pass a nowMs well in the future so the date is always in the past
        const futureCtx = { nowMs: () => 9_999_999_999_999 };
        const msg = "You've hit your usage limit. Try again at Jun 18th, 2026 9:54 AM.";
        const err = classifyQuotaError(msg, "codex", futureCtx);
        expect(err?.code).toBe("AGENT_QUOTA_EXCEEDED");
        expect(err?.details?.quotaResetAtMs).toBeUndefined();
    });
});

describe("classifyQuotaError — error metadata", () => {
    test("embeds agentId, agentModel, agentEngine from context", () => {
        const msg = "You've hit your usage limit.";
        const err = classifyQuotaError(msg, "codex", {
            ...ctx,
            agentId: "my-agent",
            agentModel: "gpt-4o",
            agentEngine: "codex",
        });
        expect(err?.details?.agentId).toBe("my-agent");
        expect(err?.details?.agentModel).toBe("gpt-4o");
        expect(err?.details?.agentEngine).toBe("codex");
    });

    test("uses <anonymous>/<unset> defaults when context is absent", () => {
        const msg = "quota exceeded";
        const err = classifyQuotaError(msg, "codex");
        expect(err?.details?.agentId).toBe("<anonymous>");
        expect(err?.details?.agentModel).toBe("<unset>");
    });
});
