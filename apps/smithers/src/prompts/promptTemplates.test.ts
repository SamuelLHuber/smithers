import { describe, expect, test } from "bun:test";
import { fillTemplate, PROMPT_TEMPLATES, type PromptTemplate } from "./promptTemplates";

const TEMPLATE: PromptTemplate = {
  id: "test",
  name: "Test",
  field: "file path",
  body: "Inspect {target} carefully.",
};

describe("fillTemplate", () => {
  test("substitutes a non-empty target into the template body", () => {
    expect(fillTemplate(TEMPLATE, "src/index.ts")).toBe("Inspect src/index.ts carefully.");
  });

  test("falls back to a field placeholder for an empty target", () => {
    expect(fillTemplate(TEMPLATE, "")).toBe("Inspect <file path> carefully.");
  });
});

describe("PROMPT_TEMPLATES", () => {
  test("is non-empty with unique ids and complete template fields", () => {
    expect(PROMPT_TEMPLATES.length).toBeGreaterThan(0);

    const ids = new Set<string>();
    for (const template of PROMPT_TEMPLATES) {
      expect(template.id).not.toBe("");
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);

      expect(template.name).not.toBe("");
      expect(template.field).not.toBe("");
      expect(template.body).not.toBe("");
      expect(template.body).toContain("{target}");
    }
  });
});
