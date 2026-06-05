import { useState } from "react";
import { useApp } from "../app/AppContext";
import { AUTH_REFACTOR_DIFF } from "./authRefactorDiff";
import { DiffHunks } from "./DiffHunks";

function DiffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 3v12a3 3 0 0 0 3 3h6M18 21v-6M18 9V3M6 3a2 2 0 1 0 0 .01M18 21a2 2 0 1 0 0-.01M18 9a2 2 0 1 0 0-.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The inline diff card: file tabs + the selected file's hunks (Image: Diff). */
export function DiffCard({ runId }: { runId: string }) {
  const { openSurface } = useApp();
  const diff = AUTH_REFACTOR_DIFF;
  const [active, setActive] = useState(0);
  const hidden = 8 - diff.files.length;

  return (
    <article className="diff-card" data-testid="diff-card">
      <header className="card-head">
        <span className="card-icon">
          <DiffIcon />
        </span>
        <div className="card-headings">
          <div className="card-title">{diff.title}</div>
          <div className="card-sub">
            8 files · <span className="delta-add">+{diff.totalAdd}</span>{" "}
            <span className="delta-del">−{diff.totalDel}</span>
          </div>
        </div>
        <button
          className="card-link"
          type="button"
          onClick={() => openSurface({ kind: "diff", runId, diffId: diff.id })}
        >
          Review in canvas ›
        </button>
      </header>

      <div className="card-body">
        <div className="file-tabs">
          {diff.files.map((file, index) => (
            <button
              key={file.path}
              type="button"
              className={index === active ? "file-tab is-on" : "file-tab"}
              onClick={() => setActive(index)}
            >
              {file.path}
            </button>
          ))}
          {hidden > 0 ? <span className="file-tab is-more">+{hidden}</span> : null}
        </div>
        <DiffHunks file={diff.files[active]} />
      </div>
    </article>
  );
}
