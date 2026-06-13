import { describe, expect, test } from "bun:test";
import { toNodeStatus } from "./toNodeStatus";

describe("toNodeStatus", () => {
  test("maps every gateway state onto a node status", () => {
    const cases = [
      ["running", "running"],
      ["succeeded", "ok"],
      ["finished", "ok"],
      ["completed", "ok"],
      ["ok", "ok"],
      ["failed", "failed"],
      ["errored", "failed"],
      ["cancelled", "failed"],
      ["canceled", "failed"],
      ["waiting-approval", "waiting"],
      ["waiting-event", "waiting"],
      ["waiting-timer", "waiting"],
      ["waiting", "waiting"],
      ["blocked", "waiting"],
    ] as const;

    for (const [state, status] of cases) {
      expect(toNodeStatus(state), state).toBe(status);
    }
  });

  test("falls back to queued for absent or unknown states", () => {
    expect(toNodeStatus(undefined)).toBe("queued");
    expect(toNodeStatus("not-a-gateway-state")).toBe("queued");
  });
});
