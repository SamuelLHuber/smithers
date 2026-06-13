import { describe, expect, test } from "bun:test";
import { workflowUiSrc } from "./WorkflowRunUi";

describe("workflowUiSrc", () => {
  test("returns an absolute URL when gatewayBaseUrl is absolute", () => {
    expect(workflowUiSrc("/path", "run-1", "https://gateway.example.com/base")).toBe(
      "https://gateway.example.com/path?runId=run-1",
    );
  });

  test("returns a relative URL when gatewayBaseUrl is empty", () => {
    expect(workflowUiSrc("/path", "run-1", "")).toBe("/path?runId=run-1");
  });

  test("trims leading whitespace from uiPath", () => {
    expect(workflowUiSrc("  /path", "run-1", "")).toBe("/path?runId=run-1");
  });

  test("appends runId to an existing query string", () => {
    expect(workflowUiSrc("/path?foo=bar", "run-1", "")).toBe(
      "/path?foo=bar&runId=run-1",
    );
  });

  test("defaults an empty uiPath to the root path", () => {
    expect(workflowUiSrc("", "run-1", "")).toBe("/?runId=run-1");
  });
});
