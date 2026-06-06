import "./runsList.css";
import { openSurface } from "../app/navigation";
import { StatusPill } from "../cards/StatusPill";
import {
  distinctWorkflows,
  filterRuns,
  groupRuns,
  hasActiveFilters,
  isTerminal,
  runDisplayName,
  runStatusToNode,
  shortRunId,
  shouldShowProgress,
  type AgeFilter,
  type RunStatusFilter,
  type RunSummary,
} from "./runsList";
import { useRunsListStore } from "./runsListStore";

/** The status segmented control, mirroring RunsView's status Menu. */
const STATUS_OPTIONS: { id: RunStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "waiting", label: "Waiting" },
  { id: "finished", label: "Finished" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
];

/** The four date-window options, matched by seeded ageBucket inclusion. */
const AGE_OPTIONS: { id: AgeFilter; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

/** A run row's per-row quick actions + the inline approval / error affordances. */
function RunRow({ run }: { run: RunSummary }) {
  const selectedRunId = useRunsListStore((state) => state.selectedRunId);
  const selectRun = useRunsListStore((state) => state.selectRun);
  const rerun = useRunsListStore((state) => state.rerun);
  const resume = useRunsListStore((state) => state.resume);
  const approve = useRunsListStore((state) => state.approve);
  const deny = useRunsListStore((state) => state.deny);

  const terminal = isTerminal(run.status);
  const showProgress = shouldShowProgress(run);
  const pct = Math.round(run.progress * 100);
  const selected = selectedRunId === run.runId;

  return (
    <div
      className={selected ? "runs-row is-on" : "runs-row"}
      data-testid="runs-row"
      onClick={() => {
        selectRun(run.runId);
        openSurface({ kind: "inspector", runId: run.runId });
      }}
    >
      <StatusPill status={runStatusToNode(run.status)} label={run.status} />

      <div className="runs-row-text">
        <div className="runs-row-name">{runDisplayName(run)}</div>
        <div className="runs-row-id">{shortRunId(run.runId)}</div>
      </div>

      <div className="runs-row-right">
        <span className="runs-row-elapsed">{run.elapsedLabel}</span>
      </div>

      {showProgress ? (
        <div className="runs-row-progress">
          <div className="runs-progress-bar">
            <div className="runs-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="runs-progress-pct">{pct}%</span>
        </div>
      ) : null}

      {run.status === "failed" && run.errorText ? (
        <div className="runs-error">{run.errorText}</div>
      ) : null}

      {run.status === "waiting" && run.blockedNodeLabel ? (
        <div
          className="runs-approval"
          data-testid="runs-approval"
          onClick={(event) => event.stopPropagation()}
        >
          <span>
            Waiting for approval:{" "}
            <span className="runs-approval-node">{run.blockedNodeLabel}</span>
          </span>
          <div className="runs-approval-actions">
            <button
              className="btn btn-brand tone-ok"
              type="button"
              onClick={() => approve(run.runId)}
            >
              Approve
            </button>
            <button className="btn btn-deny" type="button" onClick={() => deny(run.runId)}>
              Deny
            </button>
          </div>
        </div>
      ) : null}

      <div className="runs-row-actions" onClick={(event) => event.stopPropagation()}>
        <button
          className="btn"
          type="button"
          onClick={() => openSurface({ kind: "inspector", runId: run.runId })}
        >
          Inspect
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => openSurface({ kind: "logs", runId: run.runId })}
        >
          Logs
        </button>
        {!terminal ? (
          <button className="btn" type="button" onClick={() => rerun(run.runId)}>
            Rerun
          </button>
        ) : null}
        {run.status === "failed" || run.status === "cancelled" ? (
          <button className="btn run-resume" type="button" onClick={() => resume(run.runId)}>
            Resume
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The full runs LIST surface: filters + grouped, searchable run roster. */
export function RunsCanvas() {
  const runs = useRunsListStore((state) => state.runs);
  const statusFilter = useRunsListStore((state) => state.statusFilter);
  const workflowFilter = useRunsListStore((state) => state.workflowFilter);
  const ageFilter = useRunsListStore((state) => state.ageFilter);
  const search = useRunsListStore((state) => state.search);
  const streamMode = useRunsListStore((state) => state.streamMode);
  const setStatusFilter = useRunsListStore((state) => state.setStatusFilter);
  const setWorkflowFilter = useRunsListStore((state) => state.setWorkflowFilter);
  const setAgeFilter = useRunsListStore((state) => state.setAgeFilter);
  const setSearch = useRunsListStore((state) => state.setSearch);
  const setStreamMode = useRunsListStore((state) => state.setStreamMode);
  const clearFilters = useRunsListStore((state) => state.clearFilters);

  const filters = { status: statusFilter, workflow: workflowFilter, age: ageFilter, search };
  const shown = filterRuns(runs, filters);
  const groups = groupRuns(shown);
  const workflows = distinctWorkflows(runs);
  const showClear = hasActiveFilters(filters);
  const live = streamMode === "live";

  return (
    <section className="surface" data-testid="runs-canvas">
      <header className="surface-head">
        <span className="surface-title">Runs</span>
        <button
          type="button"
          className={`runs-stream-badge ${live ? "is-live" : "is-poll"}`}
          onClick={() => setStreamMode(live ? "polling" : "live")}
          data-testid="runs-stream-badge"
        >
          {live ? "Live" : "Polling"}
        </button>
        <span className="surface-sub">
          {shown.length} run{shown.length === 1 ? "" : "s"}
        </span>

        <div className="runs-toolbar" data-testid="runs-toolbar">
          <div className="seg" data-testid="runs-status-filter">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={statusFilter === option.id ? "is-on" : ""}
                onClick={() => setStatusFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={workflowFilter === "all" ? "chip is-on" : "chip"}
            onClick={() => setWorkflowFilter("all")}
          >
            All workflows
          </button>
          {workflows.map((name) => (
            <button
              key={name}
              type="button"
              className={workflowFilter === name ? "chip is-on" : "chip"}
              onClick={() => setWorkflowFilter(name)}
              data-testid="runs-workflow-chip"
            >
              {name}
            </button>
          ))}

          <div className="seg" data-testid="runs-age-filter">
            {AGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={ageFilter === option.id ? "is-on" : ""}
                onClick={() => setAgeFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <input
            className="field-input"
            placeholder="Search runs…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="runs-search"
          />

          {showClear ? (
            <button className="card-link" type="button" onClick={clearFilters} data-testid="runs-clear">
              Clear
            </button>
          ) : null}
        </div>
      </header>

      <div className="runs-scroll">
        {groups.length > 0 ? (
          groups.map((group) => (
            <div className="runs-group" key={group.key} data-testid="runs-group">
              <div className="runs-group-head">
                {group.label} <span className="vcs-count">{group.runs.length}</span>
              </div>
              {group.runs.map((run) => (
                <RunRow key={run.runId} run={run} />
              ))}
            </div>
          ))
        ) : (
          <div className="surface-empty">No runs found.</div>
        )}
      </div>
    </section>
  );
}
