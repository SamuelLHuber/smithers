import { useState } from "react";
import { isTerminalState, type RunStateView } from "./runState";
import { stateColor, stateLabel } from "./stateColor";
import { useRunActions } from "./useRunActions";

/**
 * The selected-run toolbar: workflow + state, plus the lifecycle actions that
 * make sense for the current state (cancel a live run, resume a terminal one)
 * and a frame scrubber for time-travel rewind when the run reports frames.
 */
export function RunToolbar(props: {
  run: RunStateView;
  streaming: boolean;
  onChanged: () => void;
}) {
  const { run, streaming, onChanged } = props;
  const actions = useRunActions();
  const [busy, setBusy] = useState(false);
  const terminal = isTerminalState(run.state);
  const frameCount = run.frameCount ?? 0;

  const guarded = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="runs-toolbar" data-testid="runs.toolbar">
      <div className="runs-toolbar-identity">
        <span className="runs-toolbar-title">{run.workflowKey ?? "Live Run"}</span>
        <span
          className="runs-status-pill"
          style={{ color: stateColor(run.state), borderColor: stateColor(run.state) }}
          data-testid="runs.toolbar.state"
        >
          {stateLabel(run.state)}
        </span>
        {streaming ? <span className="runs-toolbar-live">live</span> : null}
      </div>
      <div className="runs-toolbar-actions">
        {!terminal ? (
          <button
            type="button"
            className="runs-toolbar-btn runs-toolbar-btn--danger"
            disabled={busy}
            data-testid="runs.toolbar.cancel"
            onClick={() => void guarded(() => actions.cancelRun(run.runId))}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="runs-toolbar-btn"
            disabled={busy}
            data-testid="runs.toolbar.resume"
            onClick={() => void guarded(() => actions.resumeRun(run.runId))}
          >
            Resume
          </button>
        )}
        {frameCount > 1 ? (
          <button
            type="button"
            className="runs-toolbar-btn"
            disabled={busy}
            data-testid="runs.toolbar.rewind"
            onClick={() => void guarded(() => actions.rewindRun(run.runId, frameCount - 1))}
          >
            Rewind
          </button>
        ) : null}
      </div>
    </div>
  );
}
