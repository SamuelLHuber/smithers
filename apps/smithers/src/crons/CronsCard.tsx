import { useState } from "react";
import { useApp } from "../app/AppContext";
import { CRONS } from "./crons";

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Schedules card: trigger rows + an inline "new schedule" affordance. */
export function CronsCard() {
  const { say } = useApp();
  const [adding, setAdding] = useState(false);

  return (
    <article className="list-card" data-testid="crons-card">
      <header className="card-head">
        <span className="card-icon">
          <ClockIcon />
        </span>
        <div className="card-headings">
          <div className="card-title">Schedules</div>
          <div className="card-sub">{CRONS.length} active triggers</div>
        </div>
      </header>
      <div className="card-body card-body-flush">
        {CRONS.map((cron) => (
          <div className="list-row" key={cron.id}>
            <div className="list-text">
              <div className="list-name">{cron.name}</div>
              <div className="list-meta">
                <code className="cron-pattern">{cron.pattern}</code> · {cron.workflow}
              </div>
            </div>
            <div className="list-tags">
              <span className="mini-tag">next {cron.next}</span>
              <span className="ready-dot is-on" />
            </div>
          </div>
        ))}
        {adding ? (
          <div className="cron-new-form">
            <div className="field-input is-mono">0 * * * *</div>
            <div className="field-input">workflow…</div>
            <button
              className="btn btn-brand"
              type="button"
              onClick={() => {
                setAdding(false);
                say("Schedule created.");
              }}
            >
              Add
            </button>
          </div>
        ) : (
          <button className="cron-add" type="button" onClick={() => setAdding(true)}>
            <span className="cron-add-plus">＋</span> New schedule
          </button>
        )}
      </div>
    </article>
  );
}
