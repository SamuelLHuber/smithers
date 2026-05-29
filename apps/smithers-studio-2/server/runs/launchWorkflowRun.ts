import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { handleWorkspaceBackendRequest, loadWorkspaceStatus, WorkspaceHttpError } from "../workspaceBackend";

const execFileAsync = promisify(execFile);

export type WorkflowLaunchResult = {
  runId: string;
  workflow: string;
};

/**
 * Resolve a workflow launch key to its `.tsx` file path on disk via the real
 * `GET /workflow-sources/<key>` resolution that the Source tab uses.
 */
async function resolveWorkflowPath(root: string, workflow: string): Promise<string> {
  const response = await handleWorkspaceBackendRequest({
    method: "GET",
    path: `/__smithers_studio/api/workflow-sources/${encodeURIComponent(workflow)}`,
    query: {},
  });
  if (response.status !== 200) {
    const message = response.payload && typeof response.payload === "object" && "error" in response.payload
      ? String((response.payload as { error: unknown }).error)
      : `Workflow ${workflow} was not found.`;
    throw new WorkspaceHttpError(response.status === 404 ? 404 : 400, message);
  }
  const payload = response.payload as { workflow?: { path?: string } };
  const relativePath = payload.workflow?.path;
  if (!relativePath) {
    throw new WorkspaceHttpError(404, `Workflow ${workflow} has no source path.`);
  }
  const absolute = resolve(join(root, relativePath));
  if (!existsSync(absolute)) {
    throw new WorkspaceHttpError(404, `Workflow file not found: ${relativePath}`);
  }
  return absolute;
}

/**
 * Launch a REAL detached workflow run via the `smithers up --detach` CLI and
 * return the run id it prints. The Workflows launch form posts here; the run
 * then appears in the gateway's run store (and the Runs surface) like any other
 * run. No synthetic run ids.
 */
export async function launchWorkflowRun(workflow: string, input: Record<string, unknown>): Promise<WorkflowLaunchResult> {
  const trimmed = workflow.trim();
  if (!trimmed) {
    throw new WorkspaceHttpError(400, "workflow is required.");
  }
  const status = loadWorkspaceStatus();
  if (!status.root) {
    throw new WorkspaceHttpError(404, `.smithers not found from ${status.cwd}`);
  }
  const workflowPath = await resolveWorkflowPath(status.root, trimmed);

  const args = ["up", workflowPath, "--detach"];
  if (input && Object.keys(input).length > 0) {
    args.push("--input", JSON.stringify(input));
  }

  let stdout: string;
  try {
    const result = await execFileAsync("smithers", args, {
      cwd: status.root,
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    });
    stdout = result.stdout;
  } catch (error: unknown) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    const message = stderr || (error instanceof Error ? error.message : String(error));
    throw new WorkspaceHttpError(500, `Failed to launch ${trimmed}: ${message}`);
  }

  // `smithers up --detach` prints the run id; take the last non-empty token that
  // looks like an id line.
  const runId = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!runId) {
    throw new WorkspaceHttpError(502, `Launch of ${trimmed} produced no run id.`);
  }
  return { runId, workflow: trimmed };
}
