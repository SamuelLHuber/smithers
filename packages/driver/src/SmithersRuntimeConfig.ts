export type SmithersRuntimeConfig = {
  cliAgentToolsDefault?: "all" | "explicit-only";
  baseRootDir?: string;
  workflowPath?: string | null;
  worktreePaths?: Record<string, string>;
};
