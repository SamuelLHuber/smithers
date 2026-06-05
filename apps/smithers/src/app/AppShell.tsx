import type { CSSProperties } from "react";
import { Outlet } from "@tanstack/react-router";
import { useChatStore } from "../chat/chatStore";
import { ChatTranscript } from "../chat/ChatTranscript";
import { PanelLeftIcon } from "../icons/PanelLeftIcon";
import { useRailStore } from "../layout/railStore";
import { Toasts } from "../notifications/Toasts";
import { selectApproval } from "../runs/selectApproval";
import { selectRun } from "../runs/selectRun";
import { useRunsStore, type EngineApi } from "../runs/runsStore";
import { AppProvider, type AppActions } from "./AppContext";
import { ComposerBar } from "./ComposerBar";
import { closeSurface, openSurface } from "./navigation";
import { usePreferencesStore } from "./preferencesStore";
import { useRouteStore } from "./routeStore";
import { useUiStore } from "./uiStore";

/**
 * The application shell and root route. It owns the chrome — toasts, the chat
 * rail or bottom dock, the composer — and renders the active page through
 * <Outlet/>. The run engine and chat actions are exposed to cards and surfaces
 * via <AppProvider>; everything it renders reads from stores.
 */
export function AppShell() {
  const layout = usePreferencesStore((state) => state.layout);
  const toggleLayout = usePreferencesStore((state) => state.toggleLayout);
  const view = useRouteStore((state) => state.view);
  const surface = useRouteStore((state) => state.surface);
  const messagesCount = useChatStore((state) => state.messages.length);
  const navDir = useUiStore((state) => state.navDir);
  const runs = useRunsStore((state) => state.runs);
  const rail = useRailStore();

  // Compose the live run state with the pure selectors into the EngineApi cards
  // and surfaces consume; rebuilding it each render keeps consumers reactive.
  const engineActions = useRunsStore.getState();
  const engine: EngineApi = {
    runs,
    getRun: (id) => selectRun(runs, id),
    getApproval: (id) => selectApproval(runs, id),
    launch: engineActions.launch,
    approve: engineActions.approve,
    deny: engineActions.deny,
    cancel: engineActions.cancel,
    scrub: engineActions.scrub,
    fork: engineActions.fork,
  };
  const chatActions = useChatStore.getState();
  const appActions: AppActions = {
    engine,
    openSurface,
    closeSurface,
    fillComposer: chatActions.fill,
    say: chatActions.say,
    postCard: chatActions.postCard,
  };

  // A surface always shows in the sidebar shell, even if the layout preference
  // is "normal" (e.g. a deep link to /runs/...).
  const effectiveLayout = surface ? "sidebar" : layout;
  const isChat =
    messagesCount > 0 || view === "askme" || view === "store" || surface !== null;
  const mode =
    effectiveLayout === "sidebar" ? "sidebar" : isChat ? "chat" : "home";
  const showTranscript =
    surface === null && view !== "store" && (messagesCount > 0 || view === "askme");
  const canvasKey = surface ? `${surface.kind}-${surface.runId}` : view;

  return (
    <AppProvider value={appActions}>
      <main
        className={rail.resizing ? "app-shell is-resizing" : "app-shell"}
        data-mode={mode}
      >
        <Toasts />

        {effectiveLayout === "sidebar" ? (
          <>
            <aside
              className="chat-rail"
              hidden={rail.collapsed}
              style={{ "--rail-width": `${rail.width}px` } as CSSProperties}
            >
              <header className="rail-head">
                <span className="rail-brand">
                  <span className="rail-dot" />
                  Smithers
                </span>
                <button
                  aria-label="Exit sidebar layout"
                  className="nav-button"
                  type="button"
                  onClick={toggleLayout}
                >
                  <PanelLeftIcon />
                </button>
              </header>
              <ChatTranscript />
              <div className="composer-dock">
                <ComposerBar />
              </div>
            </aside>
            {/* Always mounted, even while collapsed: if it unmounted mid-drag the
                pointer capture would orphan and the resize gesture would never
                end. When collapsed it tucks behind the reopen tab. */}
            <div
              aria-label="Resize chat panel"
              aria-orientation="vertical"
              className="rail-resizer"
              role="separator"
              onPointerDown={rail.onResizeStart}
              onPointerMove={rail.onResizeMove}
              onPointerUp={rail.onResizeEnd}
              onPointerCancel={rail.onResizeEnd}
            />
            <section className="main-canvas" data-dir={navDir} key={canvasKey}>
              {rail.collapsed ? (
                <button
                  aria-label="Show chat panel"
                  className="nav-button rail-restore"
                  type="button"
                  onClick={rail.expand}
                >
                  <PanelLeftIcon />
                </button>
              ) : null}
              <Outlet />
            </section>
          </>
        ) : (
          <>
            <div className="view" data-dir={navDir} key={view}>
              <Outlet />
              {showTranscript ? <ChatTranscript /> : null}
            </div>
            <div className="composer-dock">
              <ComposerBar />
            </div>
          </>
        )}
      </main>
    </AppProvider>
  );
}
