import "./chat.css";
import { ProjectBar } from "./ProjectBar";
import { ChatStream } from "./ChatStream";
import { ChatComposer } from "./ChatComposer";
import { OverlayHost } from "./overlay/OverlayHost";
import { useOverlayStore } from "./overlay/overlayStore";
import { useProjects } from "./projects/useProjects";
import { useChatFeed } from "./feed/useChatFeed";
import type { ChatItem } from "./feed/ChatItem";
import { parseSlash } from "./slash/parseSlash";
import { resolveSlashAction } from "./slash/resolveSlashAction";
import { useStudioStore } from "../useStudioStore";

/**
 * The chat-first shell: project bar on top, one long chat, and an overlay that
 * can sit beside (split) or over (full) the conversation. Slash commands are
 * dispatched here — open a default UI as an overlay, switch shells, or prompt
 * the agent — and recorded back into the feed so the transcript stays the single
 * source of truth.
 */
export function ChatShell() {
  const { current } = useProjects();
  const feed = useChatFeed(current.id);
  const overlay = useOverlayStore((s) => s.overlay);
  const presentation = useOverlayStore((s) => s.presentation);
  const openOverlay = useOverlayStore((s) => s.open);
  const setShellMode = useStudioStore((s) => s.setShellMode);

  const handleSubmit = (text: string) => {
    const parsed = parseSlash(text);
    if (!parsed || !parsed.name) {
      feed.send(text);
      return;
    }
    const action = resolveSlashAction(parsed);
    switch (action.kind) {
      case "open-overlay":
        feed.append(
          assistantItem(current.id, {
            kind: "overlay",
            summary: action.note,
            overlay: action.overlay,
          }),
        );
        openOverlay(action.overlay, action.presentation);
        return;
      case "shell-mode":
        setShellMode(action.mode);
        return;
      case "prompt":
        feed.send(action.text || text);
        return;
      case "unknown":
        feed.append(
          assistantItem(current.id, { kind: "markdown", text: `Unknown command \`${action.input}\`. Type \`/\` to see what's available.` }),
        );
        return;
    }
  };

  const layout = overlay ? `chat-shell--overlay chat-shell--${presentation}` : "";

  return (
    <div className={`chat-shell ${layout}`.trim()} data-testid="chat-shell">
      <ProjectBar />
      <div className="chat-main">
        <section className="chat-pane" data-testid="chat-pane">
          <ChatStream items={feed.items} />
          <ChatComposer onSubmit={handleSubmit} />
        </section>
        <OverlayHost />
      </div>
    </div>
  );
}

function assistantItem(projectId: string, body: ChatItem["body"]): ChatItem {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    projectId,
    timestampMs: Date.now(),
    tags: [],
    body,
  };
}
