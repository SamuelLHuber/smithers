/**
 * Options for shaping the generated toolset. Mirrors the curation knobs on
 * `createOpenApiTools` so MCP and OpenAPI integrations feel the same.
 */
export type McpToolsetOptions = {
  /** Only expose these MCP tool names. */
  include?: string[];
  /** Drop these MCP tool names. */
  exclude?: string[];
  /** Prefix applied to every tool name, e.g. `"github_"`. */
  namePrefix?: string;
  /** Identifies this client to the server. */
  clientName?: string;
  /** Client version reported to the server. */
  clientVersion?: string;
};
