import { useEffect, useState } from "react";

/** Format a millisecond duration as "2m14s" / "8s" / "1h03m". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}h${String(m).padStart(2, "0")}m`;
  }
  if (m > 0) {
    return `${m}m${String(s).padStart(2, "0")}s`;
  }
  return `${s}s`;
}

/**
 * A live elapsed-time label that ticks once a second while `running`. Frozen at
 * the final value once the run stops, so finished cards don't keep counting.
 */
export function useElapsed(startedAtMs: number, running: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return formatElapsed((running ? now : Date.now()) - startedAtMs);
}
