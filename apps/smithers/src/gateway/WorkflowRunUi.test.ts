import { describe, expect, test } from "bun:test";
import { workflowUiSrc } from "./WorkflowRunUi";

describe("workflowUiSrc", () => {
  test("keeps same-origin iframe paths relative for the gateway proxy", () => {
    expect(workflowUiSrc("/workflows/demo-ui", "run-1", "")).toBe(
      "/workflows/demo-ui?runId=run-1",
    );
  });

  test("uses an absolute remote gateway origin when configured", () => {
    expect(
      workflowUiSrc(
        "/workflows/demo-ui?theme=dark",
        "run 1",
        "https://gateway.example.com/base",
      ),
    ).toBe("https://gateway.example.com/workflows/demo-ui?theme=dark&runId=run+1");
  });

  test("does not allow protocol-relative ui paths to escape the gateway origin", () => {
    expect(
      workflowUiSrc(
        "//evil.example/workflows/pwn?theme=dark",
        "run-1",
        "https://gateway.example.com",
      ),
    ).toBe("https://gateway.example.com/workflows/pwn?theme=dark&runId=run-1");
  });

  test("uses only the path from absolute ui urls", () => {
    expect(
      workflowUiSrc(
        "https://evil.example/workflows/pwn#panel",
        "run-1",
        "https://gateway.example.com",
      ),
    ).toBe("https://gateway.example.com/workflows/pwn?runId=run-1#panel");
  });

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
