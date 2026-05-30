import { create } from "zustand";
import type { Overlay, OverlayPresentation } from "./Overlay";

type OverlayState = {
  /** At most one overlay is shown at a time. */
  overlay: Overlay | null;
  presentation: OverlayPresentation;
  open: (overlay: Overlay, presentation?: OverlayPresentation) => void;
  close: () => void;
  setPresentation: (presentation: OverlayPresentation) => void;
};

/**
 * The single overlay layered over — or split beside — the chat. Both the agent
 * (via feed items) and slash commands drive this store; `OverlayHost` renders
 * whatever is here.
 */
export const useOverlayStore = create<OverlayState>((set) => ({
  overlay: null,
  presentation: "split",
  open: (overlay, presentation = "split") => set({ overlay, presentation }),
  close: () => set({ overlay: null }),
  setPresentation: (presentation) => set({ presentation }),
}));
