import { createContext, useContext } from "react";
import type { Card } from "../cards/Card";
import type { EngineApi } from "../runs/runsStore";
import type { Surface } from "./Surface";

/**
 * App-level actions every card and surface can reach without prop drilling:
 * the run engine, opening/closing the canvas, and posting back into the chat.
 */
export type AppActions = {
  engine: EngineApi;
  openSurface: (surface: Surface) => void;
  closeSurface: () => void;
  /** Prefill the composer (e.g. a picked prompt) and focus it. */
  fillComposer: (text: string) => void;
  /** Append an assistant text line to the conversation. */
  say: (text: string) => void;
  /** Append an assistant message that renders a card. */
  postCard: (card: Card, text?: string) => void;
};

const AppContext = createContext<AppActions | null>(null);

export const AppProvider = AppContext.Provider;

export function useApp(): AppActions {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useApp must be used inside <AppProvider>");
  }
  return value;
}
