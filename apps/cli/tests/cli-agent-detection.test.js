import { describe, expect, onTestFinished, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutableDir, writeFakeClaudeBinary, writeFakeCodexBinary, writeFakeGeminiBinary } from "../../../packages/smithers/tests/e2e-helpers.js";
// We test the exported pure-logic functions by importing the module.
// detectAvailableAgents calls spawnSync so we test the scoring/status logic
// via generateAgentsTs with controlled env.
import { detectAvailableAgents } from "../src/agent-detection.js";
// We can't easily mock spawnSync, but we can test the detection logic
// by verifying structure and scoring behavior with the real environment.
describe("detectAvailableAgents", () => {
    function tempHome() {
        const dir = mkdtempSync(join(tmpdir(), "smithers-detect-home-"));
        onTestFinished(() => {
            rmSync(dir, { recursive: true, force: true });
        });
        return dir;
    }

    function envWithPath(home, binDir, extra = {}) {
        return {
            HOME: home,
            PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
            ANTHROPIC_API_KEY: "",
            OPENAI_API_KEY: "",
            GOOGLE_API_KEY: "",
            GEMINI_API_KEY: "",
            ...extra,
        };
    }

    test("returns array with entries for all known agents", () => {
        const results = detectAvailableAgents({});
        const ids = results.map((r) => r.id);
        expect(ids).toContain("claude");
        expect(ids).toContain("codex");
        expect(ids).toContain("gemini");
        expect(ids).toContain("pi");
        expect(ids).toContain("kimi");
        expect(ids).toContain("amp");
        expect(results.length).toBe(6);
    });
    test("each result has required fields", () => {
        const results = detectAvailableAgents({});
        for (const result of results) {
            expect(typeof result.id).toBe("string");
            expect(typeof result.displayName).toBe("string");
            expect(typeof result.binary).toBe("string");
            expect(typeof result.hasBinary).toBe("boolean");
            expect(typeof result.hasAuthSignal).toBe("boolean");
            expect(typeof result.hasApiKeySignal).toBe("boolean");
            expect(typeof result.hasProjectTrustSignal).toBe("boolean");
            expect(typeof result.status).toBe("string");
            expect(typeof result.score).toBe("number");
            expect(typeof result.usable).toBe("boolean");
            expect(Array.isArray(result.checks)).toBe(true);
            expect(Array.isArray(result.unusableReasons)).toBe(true);
        }
    });
    test("status is 'unavailable' when no binary, no auth, no api key", () => {
        // Empty env, no HOME (so auth signals won't match)
        const results = detectAvailableAgents({ HOME: "/nonexistent-path-xyz" });
        for (const result of results) {
            if (!result.hasBinary && !result.hasAuthSignal && !result.hasApiKeySignal) {
                expect(result.status).toBe("unavailable");
                expect(result.score).toBe(0);
                expect(result.usable).toBe(false);
            }
        }
    });
    test("api key signal detected from env", () => {
        const results = detectAvailableAgents({
            HOME: "/nonexistent-path-xyz",
            ANTHROPIC_API_KEY: "sk-ant-test123",
        });
        const claude = results.find((r) => r.id === "claude");
        expect(claude.hasApiKeySignal).toBe(true);
        // Should be "api-key" if no binary, or higher if binary found
        if (!claude.hasBinary) {
            expect(claude.status).toBe("api-key");
            expect(claude.score).toBe(3);
        }
    });
    test("openai api key detected for codex", () => {
        const emptyPathDir = tempHome();
        const results = detectAvailableAgents({
            HOME: "/nonexistent-path-xyz",
            PATH: emptyPathDir,
            OPENAI_API_KEY: "sk-test123",
        });
        const codex = results.find((r) => r.id === "codex");
        expect(codex.hasApiKeySignal).toBe(true);
        expect(codex.usable).toBe(false);
        expect(codex.unusableReasons.join(" ")).toContain("missing `codex`");
    });
    test("google api key detected for gemini", () => {
        const results = detectAvailableAgents({
            HOME: "/nonexistent-path-xyz",
            GOOGLE_API_KEY: "test-key",
        });
        const gemini = results.find((r) => r.id === "gemini");
        expect(gemini.hasApiKeySignal).toBe(true);
    });
    test("GEMINI_API_KEY also detected for gemini", () => {
        const results = detectAvailableAgents({
            HOME: "/nonexistent-path-xyz",
            GEMINI_API_KEY: "test-key",
        });
        const gemini = results.find((r) => r.id === "gemini");
        expect(gemini.hasApiKeySignal).toBe(true);
    });
    test("checks array includes binary check", () => {
        const results = detectAvailableAgents({});
        for (const result of results) {
            const binaryCheck = result.checks.find((c) => c.startsWith("binary:"));
            expect(binaryCheck).toBeDefined();
        }
    });
    test("checks array includes env checks for agents with api keys", () => {
        const results = detectAvailableAgents({});
        const claude = results.find((r) => r.id === "claude");
        const envCheck = claude.checks.find((c) => c.startsWith("env:ANTHROPIC_API_KEY:"));
        expect(envCheck).toBeDefined();
    });
    test("usable requires both a runnable CLI and credentials", () => {
        const home = tempHome();
        const binDir = createExecutableDir();
        writeFakeClaudeBinary(binDir);
        const results = detectAvailableAgents({
            HOME: home,
            PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
            ANTHROPIC_API_KEY: "sk-ant-test",
        });
        const claude = results.find((r) => r.id === "claude");
        expect(claude.hasBinary).toBe(true);
        expect(claude.hasApiKeySignal).toBe(true);
        expect(claude.usable).toBe(true);
        expect(claude.unusableReasons).toEqual([]);
    });
    test("binary-only agents are not usable", () => {
        const home = tempHome();
        const binDir = createExecutableDir();
        writeFakeCodexBinary(binDir);
        const results = detectAvailableAgents(envWithPath(home, binDir));
        const codex = results.find((r) => r.id === "codex");
        expect(codex.hasBinary).toBe(true);
        expect(codex.hasApiKeySignal).toBe(false);
        expect(codex.usable).toBe(false);
        expect(codex.unusableReasons.join(" ")).toContain("missing credentials");
    });
    test("Gemini requires the current project to be trusted", () => {
        const home = tempHome();
        const binDir = createExecutableDir();
        writeFakeGeminiBinary(binDir);
        mkdirSync(join(home, ".gemini"), { recursive: true });
        writeFileSync(join(home, ".gemini", "oauth_creds.json"), "{}\n");
        const cwd = join(home, "repo");
        mkdirSync(cwd, { recursive: true });
        const untrusted = detectAvailableAgents(envWithPath(home, binDir), { cwd });
        const untrustedGemini = untrusted.find((r) => r.id === "gemini");
        expect(untrustedGemini.hasBinary).toBe(true);
        expect(untrustedGemini.hasAuthSignal).toBe(true);
        expect(untrustedGemini.hasProjectTrustSignal).toBe(false);
        expect(untrustedGemini.usable).toBe(false);
        writeFileSync(join(home, ".gemini", "trustedFolders.json"), JSON.stringify({ [cwd]: "TRUST_FOLDER" }));
        const trusted = detectAvailableAgents(envWithPath(home, binDir), { cwd });
        const trustedGemini = trusted.find((r) => r.id === "gemini");
        expect(trustedGemini.hasProjectTrustSignal).toBe(true);
        expect(trustedGemini.usable).toBe(true);
    });
    test("kimi detects KIMI_SHARE_DIR as auth signal path", () => {
        const results = detectAvailableAgents({
            HOME: "/nonexistent-path-xyz",
            KIMI_SHARE_DIR: "/tmp/kimi-test",
        });
        const kimi = results.find((r) => r.id === "kimi");
        const authCheck = kimi.checks.find((c) => c.includes("/tmp/kimi-test"));
        expect(authCheck).toBeDefined();
    });
});
