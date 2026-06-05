import { useChatStore } from "../chat/chatStore";
import { useNotificationsStore } from "../notifications/notificationsStore";
import { useRunsStore } from "../runs/runsStore";
import { openSurface } from "./navigation";

/** Launch a run: post its live card and raise an ambient companion toast. */
export function launchRun(title?: string): string {
  const id = useRunsStore.getState().launch(title);
  useChatStore.getState().postCard({ kind: "run", runId: id });
  useNotificationsStore.getState().notify({
    title: "Open Code Review",
    detail: "running · 1m02s",
    kind: "workflow",
    command: "chat",
  });
  return id;
}

/**
 * Route a feature slash command to a chat card or a canvas surface. Returns false
 * for anything it does not own, so unknown slashes fall through to the chat path.
 */
export function runSlash(name: string, arg: string): boolean {
  const runs = useRunsStore.getState().runs;
  const latest = runs[runs.length - 1]?.id;
  const chat = useChatStore.getState();
  switch (name) {
    case "run":
    case "implement":
      launchRun(arg ? `Implement · ${arg}` : undefined);
      return true;
    case "research":
    case "launch":
      chat.postCard({
        kind: "launch",
        workflowId: name === "research" ? "research" : arg || "research",
      });
      return true;
    case "diff":
      chat.postCard(
        { kind: "diff", runId: latest ?? "none", diffId: arg || "auth" },
        "Here's what changed.",
      );
      return true;
    case "logs":
      openSurface({ kind: "logs", runId: latest ?? launchRun() });
      return true;
    case "timeline":
    case "fork":
      openSurface({ kind: "timeline", runId: latest ?? launchRun() });
      return true;
    case "approvals": {
      const pending = runs.find((entry) => entry.gate === "pending");
      if (pending) {
        chat.postCard({ kind: "approval", runId: pending.id });
      } else {
        chat.say("No approvals waiting.");
      }
      return true;
    }
    case "agents":
      chat.postCard({ kind: "agents" });
      return true;
    case "memory":
      chat.postCard({ kind: "memory", query: arg });
      return true;
    case "eval":
    case "scores":
      chat.postCard({ kind: "scores", reportId: "review-suite" });
      return true;
    case "cron":
    case "crons":
      chat.postCard({ kind: "crons" });
      return true;
    case "prompt":
    case "prompts":
      chat.postCard({ kind: "prompts" });
      return true;
    case "human":
      chat.postCard({ kind: "human" });
      return true;
    case "signal":
      chat.postCard({ kind: "signal", event: arg || "pr-merged" });
      return true;
    default:
      return false;
  }
}
