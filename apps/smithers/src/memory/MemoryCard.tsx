import { recall } from "./memoryFacts";

function MemoryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3a4 4 0 0 0-4 4 4 4 0 0 0-1 7 3 3 0 0 0 5 2 3 3 0 0 0 5-2 4 4 0 0 0-1-7 4 4 0 0 0-4-4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Memory recall card: the query, then matching facts by similarity. */
export function MemoryCard({ query }: { query: string }) {
  const results = recall(query);

  return (
    <article className="list-card" data-testid="memory-card">
      <header className="card-head">
        <span className="card-icon">
          <MemoryIcon />
        </span>
        <div className="card-headings">
          <div className="card-title">Memory · recall</div>
          <div className="card-sub">top {results.length} matches</div>
        </div>
      </header>
      <div className="card-body">
        <div className="recall-query">
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {query || "browse all facts"}
        </div>
        {results.map((fact) => (
          <div className="fact-row" key={fact.id}>
            <span className="ns-chip">{fact.namespace}</span>
            <span className="fact-text">{fact.text}</span>
            <span className="fact-sim">{fact.sim.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
