import { useEffect, useState } from "react";
import { runsGatewayClient } from "../runs/runsGatewayClient";
import { parseApprovals, parseRunSummaries } from "../runs/parseRunPayloads";
import { useStudioStore } from "../useStudioStore";

type OperationsCounts = {
  running: number;
  waiting: number;
  pendingApproval: number;
};

const EMPTY_COUNTS: OperationsCounts = { running: 0, waiting: 0, pendingApproval: 0 };

/**
 * Live "what's running now" strip. Derives its counts from the same Gateway RPCs
 * the Runs surface uses (listRuns + listApprovals): `running` counts runs whose
 * lifecycle state is actively executing, `waiting` counts runs blocked on an
 * event/timer, and `pendingApproval` is the live approval-gate count. Each tile
 * deep-links into the (pre-filtered) Runs surface.
 */
export function OperationsStrip() {
  const setActiveView = useStudioStore((s) => s.setActiveView);
  const [counts, setCounts] = useState<OperationsCounts>(EMPTY_COUNTS);

  useEffect(() => {
    const client = runsGatewayClient();
    let cancelled = false;
    void (async () => {
      try {
        const [runsPayload, approvalsPayload] = await Promise.all([
          client.rpc("listRuns", {}),
          client.rpc("listApprovals", {}),
        ]);
        if (cancelled) return;
        const runs = parseRunSummaries(runsPayload);
        const approvals = parseApprovals(approvalsPayload);
        let running = 0;
        let waiting = 0;
        for (const run of runs) {
          if (run.status === "running") running += 1;
          else if (
            run.status === "waiting-approval" ||
            run.status === "waiting-event" ||
            run.status === "waiting-timer"
          ) {
            waiting += 1;
          }
        }
        setCounts({ running, waiting, pendingApproval: approvals.length });
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
