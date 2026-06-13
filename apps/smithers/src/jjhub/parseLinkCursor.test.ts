import { describe, expect, test } from "bun:test";
import { parseLinkCursor } from "./parseLinkCursor";

describe("parseLinkCursor", () => {
  test("returns null for a null header", () => {
    expect(parseLinkCursor(null)).toBe(null);
  });

  test("returns null when no next relation is present", () => {
    expect(parseLinkCursor('</api/issues?cursor=prev>; rel="prev"')).toBe(null);
  });

  test("returns the cursor from a standard quoted next relation", () => {
    expect(parseLinkCursor('</api/issues?cursor=abc123>; rel="next"')).toBe("abc123");
  });

  test("returns the cursor from an unquoted next relation", () => {
    expect(parseLinkCursor("</api/issues?cursor=unquoted>; rel=next")).toBe("unquoted");
  });

  test("returns the cursor when only the second link is next", () => {
    const header = '</api/issues?cursor=old>; rel="prev", </api/issues?cursor=new>; rel="next"';

    expect(parseLinkCursor(header)).toBe("new");
  });

  test("resolves a relative next URL", () => {
    expect(parseLinkCursor('</workspaces?limit=30&cursor=relative>; rel="next"')).toBe(
      "relative",
    );
  });

  test("returns null when the next URL has no cursor parameter", () => {
    expect(parseLinkCursor('</api/issues?limit=30>; rel="next"')).toBe(null);
  });
});
