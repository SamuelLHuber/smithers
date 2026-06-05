import { create } from "zustand";
import { AUTH_REFACTOR_FRAMES, GATE_FRAME } from "./authRefactorFrames";
import type { Run } from "./Run";

export type RunGate = "none" | "pending" | "approved" | "denied";

export type RunState = {
  id: string;
  title: string;
  model: string;
  runId: string;
  startedAtMs: number;
  frame: number;
  gate: RunGate;
  note?: string;
  /** Scrubbed via time-travel — auto-advance leaves it alone. */
  paused?: boolean;
  canceled?: boolean;
};

export type Approval = {
  runId: string;
  title: string;
  gate: string;
  status: "pending" | "approved" | "denied";
  note?: string;
};

/**
 * The engine seam: run state plus the actions that mutate it. Derived views
 * (`getRun`, `getApproval`) live in selectors, not here, so subscribing to a run
 * never returns a fresh object every render. `AppContext` composes this store
 * and the selectors into the `EngineApi` that cards and surfaces consume.
 */
export type EngineApi = {
  runs: RunState[];
  getRun: (id: string) => Run | undefined;
  getApproval: (runId: string) => Approval | undefined;
  launch: (title?: string) => string;
  approve: (runId: string, note?: string) => void;
  deny: (runId: string, note?: string) => void;
  cancel: (runId: string) => void;
  /** Time-travel: preview a past frame (pauses auto-advance for that run). */
  scrub: (runId: string, frame: number) => void;
  /** Branch a new run from the current frame. */
  fork: (runId: string) => string | undefined;
};

export type RunsState = Omit<EngineApi, "getRun" | "getApproval">;

const LAST_FRAME = AUTH_REFACTOR_FRAMES.length - 1;
let seq = 4820;

/**
 * The local run engine on the `ephemeral` medium. It owns run state and advances
 * each run a frame at a time, pausing at the deploy gate until approved. A real
 * deployment swaps the module interval below for streamed gateway events
 * mutating the same RunState shape.
 */
export const useRunsStore = create<RunsState>((set) => {
  function patch(id: string, next: Partial<RunState>): void {
    set((state) => ({
      runs: state.runs.map((run) => (run.id === id ? { ...run, ...next } : run)),
    }));
  }

  return {
    runs: [],
    launch: (title = "Implement · auth refactor") => {
      seq += 1;
      const runId = String(seq);
      const id = `run-${runId}`;
      set((state) => ({
        runs: [
          ...state.runs,
          {
            id,
            title,
            model: "claude-opus",
            runId,
            // Backdate so the card reads "running · 2m14s" and ticks up.
            startedAtMs: Date.now() - 134_000,
            // Open at the screenshot state, then run on.
            frame: 2,
            gate: "none",
          },
        ],
      }));
      return id;
    },
    approve: (runId, note) => patch(runId, { gate: "approved", note }),
    deny: (runId, note) => patch(runId, { gate: "denied", note }),
    cancel: (runId) => patch(runId, { canceled: true }),
    scrub: (runId, frame) =>
      patch(runId, {
        frame: Math.max(0, Math.min(LAST_FRAME, frame)),
        paused: true,
      }),
    fork: (runId) => {
      let forkedId: string | undefined;
      set((state) => {
        const source = state.runs.find((run) => run.id === runId);
        if (!source) {
          return state;
        }
        seq += 1;
        const newRunId = String(seq);
        forkedId = `run-${newRunId}`;
        // Match the fork's gate to where it starts, so the heartbeat keeps it
        // moving: before the gate it advances to it, at the gate it waits for
        // approval, past the gate it continues. A flat "none" would strand a
        // fork taken at or past the gate frame.
        const forkGate: RunGate =
          source.frame < GATE_FRAME
            ? "none"
            : source.frame > GATE_FRAME
              ? "approved"
              : "pending";
        return {
          runs: [
            ...state.runs,
            {
              ...source,
              id: forkedId,
              runId: newRunId,
              title: `${source.title} (fork)`,
              gate: forkGate,
              paused: false,
              canceled: false,
              startedAtMs: Date.now(),
            },
          ],
        };
      });
      return forkedId;
    },
  };
});

// One heartbeat advances every eligible run by a frame. Runs pause at the gate
// (frame 4) until approved and stop at the last frame. Module-level interval, no
// effect: it ticks for the life of the page.
window.setInterval(() => {
  useRunsStore.setState((state) => ({
    runs: state.runs.map((run) => {
      if (run.paused || run.canceled) {
        return run;
      }
      if (run.gate === "none" && run.frame < GATE_FRAME) {
        const frame = run.frame + 1;
        return { ...run, frame, gate: frame === GATE_FRAME ? "pending" : "none" };
      }
      if (run.gate === "approved" && run.frame < LAST_FRAME) {
        return { ...run, frame: run.frame + 1 };
      }
      return run;
    }),
  }));
}, 2200);
