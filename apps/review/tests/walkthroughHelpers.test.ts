import { describe, expect, test } from "bun:test";
import { escapeHtml } from "../src/walkthrough/escapeHtml";
import { classifyChangeRole } from "../src/walkthrough/classifyChangeRole";

describe("escapeHtml", () => {
  test("escapes the five HTML-sensitive characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  test("escapes ampersands before other entities (no double-escaping)", () => {
    expect(escapeHtml("<a href=\"x\">&'</a>")).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });

  test("leaves plain text and empty strings untouched", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });
});

describe("classifyChangeRole", () => {
  test("classifies docs by directory and extension", () => {
    expect(classifyChangeRole("docs/guide.mdx")).toBe("docs");
    expect(classifyChangeRole("packages/x/README.md")).toBe("docs");
    expect(classifyChangeRole("notes.rst")).toBe("docs");
  });

  test("classifies tests by directory and filename", () => {
    expect(classifyChangeRole("packages/x/tests/foo.ts")).toBe("tests");
    expect(classifyChangeRole("src/__tests__/foo.ts")).toBe("tests");
    expect(classifyChangeRole("src/foo.test.ts")).toBe("tests");
    expect(classifyChangeRole("e2e/case01.spec.ts")).toBe("tests");
  });

  test("classifies config by name, extension, dotfiles, and .github", () => {
    expect(classifyChangeRole("package.json")).toBe("config");
    expect(classifyChangeRole("pnpm-lock.yaml")).toBe("config");
    expect(classifyChangeRole("tsconfig.base.json")).toBe("config");
    expect(classifyChangeRole(".github/workflows/ci.yml")).toBe("config");
    expect(classifyChangeRole(".gitignore")).toBe("config");
    expect(classifyChangeRole("vitest.config.ts")).toBe("config");
    expect(classifyChangeRole("settings.toml")).toBe("config");
  });

  test("falls back to code for source files", () => {
    expect(classifyChangeRole("packages/x/src/index.ts")).toBe("code");
    expect(classifyChangeRole("apps/cli/src/main.js")).toBe("code");
  });

  test("docs/tests take precedence over the code default", () => {
    // A .ts file inside a tests/ dir is tests, not code.
    expect(classifyChangeRole("tests/helpers/build.ts")).toBe("tests");
    // A markdown file anywhere is docs.
    expect(classifyChangeRole("packages/x/src/NOTES.md")).toBe("docs");
  });
});
