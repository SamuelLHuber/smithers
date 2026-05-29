import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatBlock,
  type ChatStreamDelta,
  loadChatSession,
  sendChatMessage,
} from "./chatApi";

export type AgentChatStatus = "loading" | "ready" | "streaming" | "error";

export type AgentChatState = {
  status: AgentChatStatus;
  error: string | null;
  blocks: ChatBlock[];
  model: string | null;
  mode: string | null;
  send: (content: string) => void;
};

/**
 * Surface-local chat state. Detail state for the chat half lives HERE (inside
 * the workspace folder), never in useStudioStore — per the foundation rule that
 * the global store holds only top-level nav + terminal tabs + palette.
 */
export function useAgentChat(active: boolean): AgentChatState {
  const [status, setStatus] = useState<AgentChatStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Load once the chat segment is active and we have no session yet. We guard
    // with sessionIdRef (not a "started" ref) so React 18 StrictMode's mount →
    // cleanup → remount double-invoke cannot strand us in "loading": the second
    // mount simply re-fetches because the first run was cancelled before it
    // could record a session.
    if (!active || sessionIdRef.current) return;
    let cancelled = false;
    setStatus("loading");
    loadChatSession()
      .then((session) => {
        if (cancelled) return;
        sessionIdRef.current = session.sessionId;
        setBlocks(session.blocks);
        setModel(session.model);
        setMode(session.mode);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const applyDelta = useCallback((delta: ChatStreamDelta) => {
    setBlocks((current) => {
      switch (delta.type) {
        case "block": {
          const existing = current.findIndex((block) => block.id === delta.block.id);
          if (existing === -1) return [...current, delta.block];
          const next = current.slice();
          next[existing] = delta.block;
          return next;
        }
        case "delta": {
          const index = current.findIndex((block) => block.id === delta.id);
          if (index === -1) {
            return [
              ...current,
              { id: delta.id, role: "assistant", content: delta.content, timestampMs: Date.now(), pending: true },
            ];
          }
          const next = current.slice();
          next[index] = { ...next[index], content: next[index].content + delta.content, pending: true };
          return next;
        }
        case "done": {
          const index = current.findIndex((block) => block.id === delta.id);
          if (index === -1) return current;
          const next = current.slice();
          next[index] = { ...next[index], pending: false };
          return next;
        }
        case "error":
          return current;
      }
    });
    if (delta.type === "error") setError(delta.message);
  }, []);

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      const sessionId = sessionIdRef.current;
      if (!trimmed || !sessionId) return;

      const userBlock: ChatBlock = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestampMs: Date.now(),
      };
      setBlocks((current) => [...current, userBlock]);
      setStatus("streaming");
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      sendChatMessage(sessionId, trimmed, applyDelta, controller.signal)
        .then(() => setStatus("ready"))
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : String(reason));
          setStatus("error");
        });
    },
    [applyDelta],
  );

  return { status, error, blocks, model, mode, send };
}
