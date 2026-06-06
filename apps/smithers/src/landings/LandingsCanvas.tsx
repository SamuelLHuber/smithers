import {
  canLand,
  filterLandings,
  isTerminal,
  summarizeLandings,
  toneForLandingState,
  toneForReviewStatus,
  type DetailTab,
  type LandingFilter,
} from "./landings";
import { LandingDiff } from "./LandingDiff";
import { useLandingsStore } from "./landingsStore";

const FILTERS: { id: LandingFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "draft", label: "Draft" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
];

const TABS: { id: DetailTab; label: string }[] = [
  { id: "info", label: "Info" },
  { id: "diff", label: "Diff" },
  { id: "checks", label: "Checks" },
];

/** The full landings dashboard: a filtered stack on the left, detail on the right. */
export function LandingsCanvas() {
  const landings = useLandingsStore((state) => state.landings);
  const filter = useLandingsStore((state) => state.filter);
  const tab = useLandingsStore((state) => state.tab);
  const reviewDraft = useLandingsStore((state) => state.reviewDraft);
  const createOpen = useLandingsStore((state) => state.createOpen);
  const newTitle = useLandingsStore((state) => state.newTitle);
  const newBody = useLandingsStore((state) => state.newBody);
  const newTarget = useLandingsStore((state) => state.newTarget);
  const selected = useLandingsStore(
    (state) => state.landings.find((landing) => landing.id === state.selectedId) ?? null,
  );
  const select = useLandingsStore((state) => state.select);
  const setFilter = useLandingsStore((state) => state.setFilter);
  const setTab = useLandingsStore((state) => state.setTab);
  const setReviewDraft = useLandingsStore((state) => state.setReviewDraft);
  const review = useLandingsStore((state) => state.review);
  const land = useLandingsStore((state) => state.land);
  const openCreate = useLandingsStore((state) => state.openCreate);
  const cancelCreate = useLandingsStore((state) => state.cancelCreate);
  const setNewTitle = useLandingsStore((state) => state.setNewTitle);
  const setNewBody = useLandingsStore((state) => state.setNewBody);
  const setNewTarget = useLandingsStore((state) => state.setNewTarget);
  const submitCreate = useLandingsStore((state) => state.submitCreate);

  const summary = summarizeLandings(landings);
  const filtered = filterLandings(landings, filter);

  return (
    <section className="surface" data-testid="landings-canvas">
      <header className="surface-head">
        <span className="surface-title">Landings</span>
        <span className="surface-sub">
          {summary.total} total · {summary.open} open · {summary.merged} merged
        </span>
        <div className="seg" data-testid="landings-filter">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={filter === option.id ? "is-on" : ""}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="rev-body">
        <div className="rev-list">
          {createOpen ? (
            <div className="rev-create">
              <div className="rev-create-head">New landing</div>
              <input
                className="field-input"
                placeholder="Title"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
              <textarea
                className="field-input"
                placeholder="Description (optional)"
                value={newBody}
                onChange={(event) => setNewBody(event.target.value)}
              />
              <input
                className="field-input"
                placeholder="Target bookmark (optional)"
                value={newTarget}
                onChange={(event) => setNewTarget(event.target.value)}
              />
              <div className="rev-detail-actions">
                <button
                  className="btn btn-brand"
                  type="button"
                  onClick={submitCreate}
                  disabled={newTitle.trim() === ""}
                >
                  Create
                </button>
                <button className="btn" type="button" onClick={cancelCreate}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="rev-create-head" type="button" onClick={openCreate}>
              + New landing
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="rev-empty">No landings.</div>
          ) : (
            filtered.map((landing) => (
              <button
                key={landing.id}
                type="button"
                className={landing.id === selected?.id ? "rev-row is-on" : "rev-row"}
                onClick={() => select(landing.id)}
                data-testid="landings-row"
              >
                <span className={`rev-dot ${toneForLandingState(landing.state)}`} />
                <div className="rev-row-main">
                  <div className="rev-row-title">{landing.title}</div>
                  <div className="rev-row-meta">
                    <span className="rev-num">#{landing.number}</span>
                    <span className={`state-badge ${toneForLandingState(landing.state)}`}>
                      {landing.state.toUpperCase()}
                    </span>
                    <span className={`mini-tag ${toneForReviewStatus(landing.reviewStatus)}`}>
                      {landing.reviewStatus}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rev-detail">
          {selected ? (
            <>
              <div className="rev-detail-head">
                <div className="file-tabs">
                  {TABS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={tab === option.id ? "file-tab is-on" : "file-tab"}
                      onClick={() => setTab(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {!isTerminal(selected.state) ? (
                  <div className="rev-detail-actions">
                    <input
                      className="field-input"
                      placeholder="Review note (optional)"
                      value={reviewDraft}
                      onChange={(event) => setReviewDraft(event.target.value)}
                    />
                    <button className="btn" type="button" onClick={() => review("approve")}>
                      Approve
                    </button>
                    <button className="btn" type="button" onClick={() => review("request_changes")}>
                      Request changes
                    </button>
                    <button className="btn" type="button" onClick={() => review("comment")}>
                      Comment
                    </button>
                    {canLand(selected) ? (
                      <button className="btn btn-brand" type="button" onClick={land}>
                        Land
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {tab === "info" ? (
                <div className="rev-detail-scroll">
                  <div className="rev-detail-title">{selected.title}</div>
                  {selected.description ? <p className="rev-prose">{selected.description}</p> : null}
                  <div className="kv">
                    <b>Number</b> #{selected.number}
                  </div>
                  <div className="kv">
                    <b>State</b> {selected.state}
                  </div>
                  <div className="kv">
                    <b>Target</b> {selected.targetBranch}
                  </div>
                  <div className="kv">
                    <b>Author</b> {selected.author}
                  </div>
                  <div className="kv">
                    <b>Review</b> {selected.reviewStatus}
                  </div>
                  <div className="kv">
                    <b>Created</b> {selected.createdAt}
                  </div>
                </div>
              ) : null}

              {tab === "diff" ? (
                <div className="rev-detail-scroll">
                  <LandingDiff diff={selected.diff} />
                </div>
              ) : null}

              {tab === "checks" ? (
                <div className="rev-detail-scroll">
                  {selected.checks ? (
                    <pre className="node-stream">{selected.checks}</pre>
                  ) : (
                    <div className="rev-empty">No checks</div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rev-detail-empty">Select a landing</div>
          )}
        </div>
      </div>
    </section>
  );
}
