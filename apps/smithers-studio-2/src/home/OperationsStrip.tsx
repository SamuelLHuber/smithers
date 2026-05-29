import { useEffect, useState } from "react";
import { listWorkspaceApprovalHistory } from "../workspaceApi";
import { useStudioStore } from "../useStudioStore";

type OperationsCounts = {
  running: number;
  waiting: number;
  pendingApproval: number;
};

const EMPTY_COUNTS: OperationsCounts = { running: 0, waiting: 0, pendingApproval: 0 };

/**
 * Live "what's running now" strip. Phase-1 derives the pending-approval count
 * from the workspace HTTP approval history as a fallback; the phase-2 Runs
 * agent replaces this with gateway-client listRuns/listApprovals streaming.
 * Each tile deep-links into the (pre-filtered) Runs surface.
 */
export function OperationsStrip() {
  const setActiveView = useStudioStore((s) => s.setActiveView);
  const [counts, setCounts] = useState<OperationsCounts>(EMPTY_COUNTS);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const history = await listWorkspaceApprovalHistory({ limit: 100 });
        if (cancelled) return;
        const pending = history.decisions.filter((entry) => entry.status === "pending").length;
        setCounts({ ...EMPTY_COUNTS, pendingApproval: pending });
      } catch {
        if (!cancelled) setCounts(EMPTY_COUNTS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tiles: Array<{ key: keyof OperationsCounts; label: string; tone: string }> = [
    { key: "running", label: "Running", tone: "home-op--running" },
    { key: "waiting", label: "Waiting", tone: "home-op--waiting" },
    { key: "pendingApproval", label: "Pending approval", tone: "home-op--approval" },
  ];

  return (
    <div className="home-operations" data-testid="home.operations">
      {tiles.map((tile) => (
        <button
          className={`home-op ${tile.tone}`}
          key={tile.key}
          onClick={() => setActiveView("runs")}
          type="button"
        >
          <span className="home-op-count">{counts[tile.key]}</span>
          <span className="home-op-label">{tile.label}</span>
        </button>
      ))}
    </div>
  );
}
