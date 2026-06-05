import { useState } from "react";
import { AUTH_REFACTOR_DIFF } from "./authRefactorDiff";
import { DiffHunks } from "./DiffHunks";

/** The full diff review surface: a file list rail + the selected file's hunks. */
export function DiffCanvas() {
  const diff = AUTH_REFACTOR_DIFF;
  const [active, setActive] = useState(0);

  return (
    <section className="surface" data-testid="diff-canvas">
      <header className="surface-head">
        <span className="surface-title">{diff.title}</span>
        <span className="surface-sub">
          8 files · <span className="delta-add">+{diff.totalAdd}</span>{" "}
          <span className="delta-del">−{diff.totalDel}</span>
        </span>
      </header>
      <div className="diff-body">
        <div className="diff-filelist">
          {diff.files.map((file, index) => (
            <button
              key={file.path}
              type="button"
              className={index === active ? "diff-file is-on" : "diff-file"}
              onClick={() => setActive(index)}
            >
              <span className="diff-file-path">{file.path}</span>
              <span className="diff-file-delta">
                <span className="delta-add">+{file.add}</span>
                <span className="delta-del">−{file.del}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="diff-view">
          <DiffHunks file={diff.files[active]} />
        </div>
      </div>
    </section>
  );
}
