/**
 * Smithers Pair — real-time multiplayer pair-coding page.
 *
 * Two people edit one shared.md and prompt one shared model (Codex on a ChatGPT
 * subscription, running in a Freestyle sandbox). State syncs over the ElectricSQL
 * shape protocol; the Worker reverse-proxies /sync/* to the backend and gates the
 * room behind an access key (carried as a cookie). Rendered as a full-viewport
 * overlay so it takes over the app shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Render above the app shell chrome (composer dock, onboarding overlays).
const Z = 2147483000;

type Row = Record<string, unknown>;
type DocRow = { content?: string; version?: number; updated_by?: string };
type MsgRow = { id: string; seq: number; author: string; color: string; role: "user" | "assistant"; text: string };
type PresenceRow = { id: string; name: string; color: string };

const PALETTE = ["#7B93D9", "#59C173", "#E3B341", "#9061F9", "#3BC9DB", "#F05252"];
const ADJ = ["swift", "calm", "bold", "lucid", "keen", "vivid", "zen", "neon"];

function loadIdentity() {
  try {
    const c = sessionStorage.getItem("pair_identity");
    if (c) return JSON.parse(c) as { id: string; name: string; color: string };
  } catch { /* ignore */ }
  const rand = Math.random().toString(36).slice(2, 6);
  const identity = {
    id: `c_${rand}${Date.now().toString(36).slice(-3)}`,
    name: `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${rand}`,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
  };
  try { sessionStorage.setItem("pair_identity", JSON.stringify(identity)); } catch { /* ignore */ }
  return identity;
}

async function syncPost(path: string, body: unknown) {
  await fetch(`/sync${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface ShapeMessage {
  headers: { operation?: "insert" | "update" | "delete"; control?: "up-to-date" | "must-refetch" };
  key?: string;
  value?: Row;
}

/** Subscribe to a shape over the Electric protocol; returns live rows + synced. */
function useShape(table: string, enabled: boolean) {
  const [rows, setRows] = useState<Row[]>([]);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const controller = new AbortController();
    let handle: string | null = null;
    let offset = "-1";
    const byKey = new Map<string, Row>();

    const apply = (messages: ShapeMessage[]) => {
      let mutated = false;
      for (const m of messages) {
        if (m.headers.control === "must-refetch") { byKey.clear(); offset = "-1"; handle = null; mutated = true; continue; }
        if (m.headers.control) continue;
        if (!m.key) continue;
        if (m.headers.operation === "delete") byKey.delete(m.key);
        else byKey.set(m.key, m.value ?? {});
        mutated = true;
      }
      if (mutated) setRows([...byKey.values()]);
    };

    const loop = async () => {
      let backoff = 500;
      while (!stopped) {
        const live = offset !== "-1";
        const params = new URLSearchParams({ table, offset });
        if (handle) params.set("handle", handle);
        if (live) params.set("live", "true");
        try {
          const res = await fetch(`/sync/v1/shape?${params}`, { signal: controller.signal, credentials: "same-origin" });
          if (res.status === 204) { offset = res.headers.get("electric-offset") ?? offset; backoff = 500; continue; }
          const nh = res.headers.get("electric-handle");
          const no = res.headers.get("electric-offset");
          if (res.status === 409) { offset = "-1"; handle = nh; continue; }
          if (!res.ok) throw new Error(`shape ${res.status}`);
          apply((await res.json()) as ShapeMessage[]);
          if (nh) handle = nh;
          if (no) offset = no;
          setSynced(true);
          backoff = 500;
        } catch {
          if (stopped || controller.signal.aborted) return;
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, 5000);
        }
      }
    };
    void loop();
    return () => { stopped = true; controller.abort(); };
  }, [table, enabled]);
  return { rows, synced };
}

const C = {
  app: "#0B0E14", root: "#07090D", panel: "#11151C", active: "#1D2331",
  primary: "#F0F2F5", secondary: "#9BA1AD", muted: "#8B94A5", border: "rgba(255,255,255,.1)",
  blue: "#7B93D9", purple: "#9061F9", green: "#59C173", yellow: "#E3B341", red: "#F05252",
};

function Gate({ error }: { error: boolean }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: Z + 1, background: C.root, color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          document.cookie = `pair_key=${encodeURIComponent(val)}; path=/; SameSite=Lax; Max-Age=86400`;
          window.location.href = "/pair";
        }}
        style={{ width: 340, padding: 28, border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel }}
      >
        <div style={{ fontSize: 22 }}>✦</div>
        <h1 style={{ fontSize: 16, margin: "4px 0" }}>Smithers Pair</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 18px" }}>Real-time multiplayer coding. Enter your access key to join the room.</p>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="pair_…" data-testid="pair-key-input"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.root, color: C.primary, fontFamily: "ui-monospace, monospace", fontSize: 13 }} />
        <button type="submit" style={{ marginTop: 12, width: "100%", padding: 10, border: 0, borderRadius: 8, background: C.blue, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Enter room</button>
        <div style={{ color: C.red, fontSize: 12, marginTop: 10, minHeight: 14 }}>{error ? "Invalid access key." : ""}</div>
      </form>
    </div>
  );
}

export function PairPage() {
  const [gate, setGate] = useState<"checking" | "ok" | "need-key">("checking");
  useEffect(() => {
    // Accept a key from a shared link (/pair?key=…) and persist it as a cookie,
    // then drop it from the URL. `/sync/*` carries the cookie to the Worker.
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("key");
    if (urlKey) {
      document.cookie = `pair_key=${encodeURIComponent(urlKey)}; path=/; SameSite=Lax; Max-Age=86400`;
      params.delete("key");
      window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    }
    fetch("/sync/health", { credentials: "same-origin" })
      .then((r) => setGate(r.ok ? "ok" : "need-key"))
      .catch(() => setGate("need-key"));
  }, []);

  const content =
    gate === "checking" ? <div style={{ position: "fixed", inset: 0, zIndex: Z, background: C.root }} />
    : gate === "need-key" ? <Gate error={false} />
    : <PairRoom />;
  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

function PairRoom() {
  const identity = useMemo(loadIdentity, []);
  const { rows: docRows } = useShape("doc", true);
  const { rows: msgRows, synced: msgSynced } = useShape("messages", true);
  const { rows: presRows, synced: presSynced } = useShape("presence", true);

  const [localContent, setLocalContent] = useState("");
  const [appliedVersion, setAppliedVersion] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const docTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  const docRow = docRows[0] as DocRow | undefined;
  const messages = useMemo(() => (msgRows as MsgRow[]).slice().sort((a, b) => Number(a.seq) - Number(b.seq)), [msgRows]);
  const peers = useMemo(() => (presRows as PresenceRow[]).slice().sort((a, b) => a.name.localeCompare(b.name)), [presRows]);
  const connected = docRows.length > 0 && msgSynced && presSynced;

  // Apply remote document changes without clobbering the local typist.
  useEffect(() => {
    if (!docRow) return;
    const version = Number(docRow.version ?? 0);
    if (version <= appliedVersion) return;
    const focused = document.activeElement === editorRef.current;
    const mine = docRow.updated_by === identity.name;
    if (!focused || !mine) setLocalContent(String(docRow.content ?? ""));
    setAppliedVersion(version);
  }, [docRow, appliedVersion, identity.name]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // Presence heartbeat.
  useEffect(() => {
    const beat = () => void syncPost("/presence", { clientId: identity.id, name: identity.name, color: identity.color });
    beat();
    const iv = setInterval(beat, 10000);
    const leave = () => void syncPost("/presence", { clientId: identity.id, leave: true });
    window.addEventListener("beforeunload", leave);
    return () => { clearInterval(iv); window.removeEventListener("beforeunload", leave); leave(); };
  }, [identity]);

  const onDocInput = useCallback((value: string) => {
    setLocalContent(value);
    clearTimeout(docTimer.current);
    docTimer.current = setTimeout(() => void syncPost("/doc", { content: value, author: identity.name }), 150);
  }, [identity.name]);

  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true); setPrompt("");
    try { await syncPost("/prompt", { prompt: text, author: identity.name, color: identity.color }); }
    finally { setSending(false); }
  }, [prompt, sending, identity]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: Z, display: "flex", flexDirection: "column", background: C.app, color: C.primary, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.purple, fontSize: 18 }}>✦</span>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Smithers Pair</div>
            <div style={{ fontSize: 12, color: C.muted }}>Real-time multiplayer coding · one doc, one model (Codex)</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid="pair-presence">
            <div style={{ display: "flex" }}>
              {peers.map((p) => (
                <span key={p.id} title={p.name} data-testid="pair-peer" data-peer={p.name}
                  style={{ width: 24, height: 24, marginLeft: -6, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", background: p.color, boxShadow: `0 0 0 2px ${C.panel}` }}>
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 12, color: C.muted }} data-testid="pair-peer-count">{peers.length} online</span>
          </div>
          <span data-testid="pair-status" data-connected={connected ? "true" : "false"} style={{ fontSize: 12, color: connected ? C.green : C.yellow }}>
            {connected ? "● live" : "○ connecting…"}
          </span>
          <span style={{ fontSize: 12, color: C.secondary }}>
            you: <span data-testid="pair-me" style={{ fontFamily: "ui-monospace, monospace", color: identity.color }}>{identity.name}</span>
          </span>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Shared doc */}
        <section style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, borderRight: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
            <span style={{ color: C.blue }}>▤ shared.md</span>
            <span style={{ color: C.muted, marginLeft: "auto" }}>v{Number(docRow?.version ?? 0)}{docRow?.updated_by ? ` · last edit: ${docRow.updated_by}` : ""}</span>
          </div>
          <textarea ref={editorRef} data-testid="pair-editor" spellCheck={false} value={localContent} onChange={(e) => onDocInput(e.target.value)}
            placeholder="Start writing — your collaborator sees every keystroke…"
            style={{ flex: 1, resize: "none", background: C.root, color: C.primary, fontFamily: "ui-monospace, monospace", fontSize: 13, lineHeight: 1.6, padding: "12px 16px", border: 0, outline: "none" }} />
        </section>

        {/* Shared AI */}
        <section style={{ display: "flex", flexDirection: "column", width: "42%", minWidth: 360, background: C.panel }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
            <span style={{ color: C.purple }}>🤖 Shared AI console</span>
            <span style={{ color: C.muted, marginLeft: "auto" }}>both of you prompt one model</span>
          </div>
          <div data-testid="pair-messages" style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ color: C.muted, fontSize: 12, textAlign: "center", margin: "auto", maxWidth: 240 }}>
                Prompt the shared model. Its reply appears for everyone and edits shared.md.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} data-testid="pair-message" data-role={m.role} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
                  <span style={{ fontWeight: 600, color: m.role === "assistant" ? C.purple : m.color }}>{m.author}</span>
                  <span style={{ color: C.muted }}>{m.role === "assistant" ? "· model" : "· prompt"}</span>
                </div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: 8, padding: "8px 12px", background: m.role === "assistant" ? C.active : C.app, color: m.role === "assistant" ? C.primary : C.secondary, border: m.role === "user" ? `1px solid ${C.border}` : "none" }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea data-testid="pair-prompt-input" rows={1} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="Ask the shared model to change shared.md…"
                style={{ flex: 1, resize: "none", borderRadius: 8, background: C.root, color: C.primary, border: `1px solid ${C.border}`, fontSize: 13, padding: "8px 12px", minHeight: 40, maxHeight: 140, outline: "none", fontFamily: "inherit" }} />
              <button data-testid="pair-send" onClick={() => void send()} disabled={sending || !prompt.trim()}
                style={{ width: 38, height: 38, borderRadius: 8, border: 0, background: C.blue, color: "#fff", cursor: sending || !prompt.trim() ? "not-allowed" : "pointer", opacity: sending || !prompt.trim() ? 0.5 : 1 }}>
                {sending ? "…" : "➤"}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Enter to send · synced to every collaborator via ElectricSQL</div>
          </div>
        </section>
      </div>
    </div>
  );
}
