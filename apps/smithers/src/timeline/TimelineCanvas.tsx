import { useApp } from "../app/AppContext";

function ClockBack() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none">
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 5v4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Time travel as one strip: a frame scrubber over the run's snapshots, with
 * Fork (branch a new run from here), Replay (resume from here) and Rewind.
 * Scrubbing previews a past frame; the run pauses while you look.
 */
export function TimelineCanvas({ runId }: { runId: string }) {
  const { engine, postCard, say } = useApp();
  const run = engine.getRun(runId);
  if (!run) {
    return <div className="surface-empty">Run not found.</div>;
  }

  const frames = Array.from({ length: run.frameCount }, (_, index) => index);
  const headPct = (run.frame / (run.frameCount - 1)) * 100;

  return (
    <section className="surface" data-testid="timeline-canvas">
      <header className="surface-head">
        <span className="surface-title">Time travel</span>
        <span className="surface-sub">{run.frameCount} snapshots</span>
      </header>
      <div className="timeline">
        <span className="tl-banner">
          <ClockBack /> viewing frame {run.frame} / {run.frameCount - 1}
        </span>
        <div className="tl-track">
          <span className="tl-fill" style={{ width: `${headPct}%` }} />
          {frames.map((index) => {
            const pct = (index / (run.frameCount - 1)) * 100;
            const done = index < run.frame;
            const head = index === run.frame;
            return (
              <button
                key={index}
                type="button"
                aria-label={`Frame ${index}`}
                className={`tl-dot${done ? " is-done" : ""}${head ? " is-head" : ""}`}
                style={{ left: `${pct}%` }}
                onClick={() => engine.scrub(runId, index)}
              />
            );
          })}
        </div>
        <div className="tl-actions">
          <button
            className="btn btn-brand"
            type="button"
            onClick={() => {
              const forkId = engine.fork(runId);
              if (forkId) {
                postCard({ kind: "run", runId: forkId }, "Forked a new run from this frame.");
              }
            }}
          >
            Fork from here
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => say(`Replaying run ${run.runId} from frame ${run.frame}…`)}
          >
            Replay
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => engine.scrub(runId, run.frame)}
          >
            Rewind run to here
          </button>
        </div>
      </div>
    </section>
  );
}
