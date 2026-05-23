import type { BaseCliAgentOptions } from "./BaseCliAgent/BaseCliAgentOptions";

export type AntigravityAgentOptions = BaseCliAgentOptions & {
  debug?: boolean;
  model?: string;
  sandbox?: boolean;
  yolo?: boolean;
  dangerouslySkipPermissions?: boolean;
  allowedMcpServerNames?: string[];
  allowedTools?: string[];
  extensions?: string[];
  listExtensions?: boolean;
  resume?: string;
  listSessions?: boolean;
  deleteSession?: string;
  includeDirectories?: string[];
  screenReader?: boolean;
  outputFormat?: "text" | "json" | "stream-json";
  /**
   * Antigravity CLI binary to execute. The official CLI currently installs
   * `agy`; this exists for test harnesses and future binary renames.
   */
  binary?: string;
  /**
   * Path to an isolated Google CLI config root. Passed as `--gemini_dir` so
   * Antigravity reads/writes `<configDir>/antigravity-cli/...` instead of the
   * user's default `~/.gemini/antigravity-cli/...`.
   */
  configDir?: string;
  /**
   * Explicit alias for `configDir` when matching the Antigravity CLI flag name.
   */
  geminiDir?: string;
  /**
   * Google API key for API-billed invocations when supported by the CLI.
   */
  apiKey?: string;
};
