import { useState } from "react";
import { useProjects } from "./projects/useProjects";
import { ProjectSwitcher } from "./projects/ProjectSwitcher";
import { StatsStrip } from "./StatsStrip";
import { useStudioStore } from "../useStudioStore";

/**
 * The top bar: current project (colored, click to switch), stats, and the gear
 * that drops back to the classic tabbed shell. Deliberately minimal — project,
 * a few numbers, settings.
 */
export function ProjectBar() {
  const { current } = useProjects();
  const setShellMode = useStudioStore((s) => s.setShellMode);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <header className="project-bar" data-testid="project-bar">
      <div className="project-bar-left">
        <button
          aria-expanded={switcherOpen}
          className="project-chip"
          data-testid="project-chip"
          onClick={() => setSwitcherOpen((open) => !open)}
          style={{ ["--project-color" as string]: current.color }}
          type="button"
        >
          <span className="project-dot" style={{ background: current.color }} />
          <span className="project-name">{current.name}</span>
          <span className="project-caret">▾</span>
        </button>
        {switcherOpen && <ProjectSwitcher onClose={() => setSwitcherOpen(false)} />}
      </div>

      <StatsStrip projectId={current.id} />

      <button
        className="project-bar-gear"
        data-testid="shell-gear"
        onClick={() => setShellMode("studio")}
        title="Classic Studio view"
        type="button"
      >
        ⚙
      </button>
    </header>
  );
}
