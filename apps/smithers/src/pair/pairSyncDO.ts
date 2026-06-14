/**
 * PairSync — Durable Object that hosts the realtime backend for Smithers Pair.
 *
 * It implements the ElectricSQL shape read-protocol (offset/handle/live
 * long-poll + up-to-date control) for three shapes — doc, messages, presence —
 * plus write endpoints. A prompt to the shared model runs **Codex on a ChatGPT
 * subscription inside a Freestyle sandbox** via `exec-await` (auto-resumes the
 * VM; no tunnel, no always-on requirement), and the agent's edit to shared.md
 * flows back to every collaborator through the doc shape.
 *
 * Living in a DO means the production Worker URL is the stable, always-available
 * endpoint — the Freestyle VM is only touched on demand for model calls.
 */

const SEED_DOC = `# shared.md

This document is edited by two people **and** one shared AI (Codex), live.

- Type in the editor — your collaborator sees every keystroke.
- Prompt the shared model — the reply lands in both consoles and edits this doc.
`;

const LIVE_TIMEOUT_MS = 20_000;
const PRESENCE_TTL_MS = 30_000;
const DOC_KEY = "doc:main";

type Operation = "insert" | "update" | "delete";
interface LogEntry { offset: number; key: string; operation: Operation; value: Record<string, unknown> }

interface MinimalStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
interface DOState { storage: MinimalStorage }
interface PairEnv {
  PAIR_FREESTYLE_API_KEY?: string;
  PAIR_VM_ID?: string;
  PAIR_CODEX_WORKDIR?: string;
}

class ShapeLog {
  readonly handle: string;
  private rows = new Map<string, Record<string, unknown>>();
  private log: LogEntry[] = [];
  private cursor = 0;
  private waiters = new Set<() => void>();
  constructor(public readonly name: string) { this.handle = `${name}-shape-1`; }
  get offset(): number { return this.cursor; }
  private append(operation: Operation, key: string, value: Record<string, unknown>) {
    this.cursor += 1;
    this.log.push({ offset: this.cursor, key, operation, value });
    const pending = [...this.waiters]; this.waiters.clear();
    for (const fn of pending) fn();
  }
  upsert(key: string, value: Record<string, unknown>) {
    this.append(this.rows.has(key) ? "update" : "insert", key, value);
    this.rows.set(key, value);
  }
  remove(key: string) {
    const v = this.rows.get(key); if (!v) return;
    this.rows.delete(key); this.append("delete", key, v);
  }
  get(key: string) { return this.rows.get(key); }
  snapshot(): LogEntry[] {
    let i = 0;
    return [...this.rows.entries()].map(([key, value]) => ({ offset: ++i, key, operation: "insert" as Operation, value }));
  }
  since(n: number): LogEntry[] { return this.log.filter((e) => e.offset > n); }
  waitForChange(n: number, signal?: AbortSignal): Promise<LogEntry[]> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(t); this.waiters.delete(w); resolve(this.since(n)); };
      const w = finish;
      const t = setTimeout(finish, LIVE_TIMEOUT_MS);
      this.waiters.add(w);
      signal?.addEventListener("abort", () => { if (done) return; done = true; clearTimeout(t); this.waiters.delete(w); resolve([]); });
    });
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "electric-handle, electric-offset, electric-schema",
};
function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...CORS, ...(init.headers ?? {}) } });
}
function toMessages(entries: LogEntry[]): unknown[] {
  return entries.map((e) => ({ headers: { operation: e.operation }, key: e.key, value: e.value, offset: String(e.offset) }));
}
function b64encode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64decode(s: string): string {
  const bin = atob(s.trim());
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class PairSync {
  private shapes: Record<string, ShapeLog>;
  private presenceSeen = new Map<string, number>();
  private msgSeq = 0;
  private docVersion = 1;
  private msgList: Record<string, unknown>[] = [];
  private initialized = false;
  private codexQueue: Promise<unknown> = Promise.resolve();

  constructor(private state: DOState, private env: PairEnv) {
    this.shapes = { doc: new ShapeLog("doc"), messages: new ShapeLog("messages"), presence: new ShapeLog("presence") };
  }

  private async init() {
    if (this.initialized) return;
    this.initialized = true;
    const content = (await this.state.storage.get<string>("doc:content")) ?? SEED_DOC;
    this.docVersion = (await this.state.storage.get<number>("doc:version")) ?? 1;
    this.msgSeq = (await this.state.storage.get<number>("msg:seq")) ?? 0;
    this.msgList = (await this.state.storage.get<Record<string, unknown>[]>("messages")) ?? [];
    this.shapes.doc.upsert(DOC_KEY, { id: "main", title: "shared.md", content, version: this.docVersion, updated_by: "smithers" });
    for (const m of this.msgList) this.shapes.messages.upsert(String(m.id), m);
  }

  private currentDoc(): string { return String(this.shapes.doc.get(DOC_KEY)?.content ?? ""); }

  private async writeDoc(content: string, updatedBy: string) {
    this.docVersion += 1;
    this.shapes.doc.upsert(DOC_KEY, { id: "main", title: "shared.md", content, version: this.docVersion, updated_by: updatedBy });
    await this.state.storage.put("doc:content", content);
    await this.state.storage.put("doc:version", this.docVersion);
  }

  private async appendMessage(msg: { author: string; color: string; role: "user" | "assistant"; text: string }) {
    this.msgSeq += 1;
    const row = { id: `m${this.msgSeq}`, seq: this.msgSeq, ...msg, created_at: new Date().toISOString() };
    this.shapes.messages.upsert(row.id, row);
    this.msgList.push(row);
    if (this.msgList.length > 200) this.msgList = this.msgList.slice(-200);
    await this.state.storage.put("messages", this.msgList);
    await this.state.storage.put("msg:seq", this.msgSeq);
  }

  private reapPresence() {
    const now = Date.now();
    for (const [k, seen] of this.presenceSeen) {
      if (now - seen > PRESENCE_TTL_MS) { this.presenceSeen.delete(k); this.shapes.presence.remove(k); }
    }
  }

  // --- Codex (ChatGPT subscription) via Freestyle exec-await ---
  private runCodex(prompt: string, doc: string): Promise<{ reply: string; docContent: string }> {
    const run = this.codexQueue.then(() => this.codexExec(prompt, doc));
    this.codexQueue = run.catch(() => {});
    return run;
  }
  private async codexExec(prompt: string, doc: string): Promise<{ reply: string; docContent: string }> {
    const key = this.env.PAIR_FREESTYLE_API_KEY, vm = this.env.PAIR_VM_ID;
    const dir = this.env.PAIR_CODEX_WORKDIR ?? "/opt/pair/workspace";
    if (!key || !vm) throw new Error("Freestyle backend not configured");
    const instruction =
      "Two developers are pair-programming on shared.md in this directory. Apply their request by editing " +
      "shared.md directly (Markdown). Do not create other files. End with ONE short sentence describing the change.\n\nRequest: " +
      prompt;
    const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const cmd =
      `export HOME=/root PATH=/usr/local/bin:/root/.bun/bin:/usr/bin:/bin; mkdir -p ${dir}; ` +
      `printf '%s' ${q(b64encode(doc))} | base64 -d > ${dir}/shared.md; ` +
      `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C ${dir} ${q(instruction)} > /tmp/cx.out 2>/tmp/cx.err; ` +
      `echo '===REPLY==='; tail -2 /tmp/cx.out | tr -cd '[:print:]\\n'; echo; echo '===DOC==='; base64 -w0 ${dir}/shared.md`;
    const res = await fetch(`https://api.freestyle.sh/v1/vms/${vm}/exec-await`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ command: cmd, timeoutMs: 240_000 }),
    });
    if (!res.ok) throw new Error(`exec-await ${res.status}`);
    const data = (await res.json()) as { stdout?: string };
    const out = data.stdout ?? "";
    const docB64 = out.split("===DOC===")[1]?.trim() ?? "";
    const replyRaw = (out.split("===DOC===")[0].split("===REPLY===")[1] ?? "").trim();
    let docContent = doc;
    try { if (docB64) docContent = b64decode(docB64); } catch { /* keep old */ }
    return { reply: (replyRaw || "Updated shared.md.").slice(0, 400), docContent };
  }

  private async processPrompt(prompt: string) {
    const before = this.currentDoc();
    try {
      const { reply, docContent } = await this.runCodex(prompt, before);
      await this.appendMessage({ author: "Smithers AI", color: "#9061F9", role: "assistant", text: reply });
      if (docContent && docContent !== before) await this.writeDoc(docContent, "Smithers AI");
    } catch (err) {
      await this.appendMessage({ author: "Smithers AI", color: "#F05252", role: "assistant", text: `⚠️ ${String(err).slice(0, 200)}` });
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.init();
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/sync/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET" && (path === "/" || path === "/health")) return json({ ok: true, service: "smithers-pair-do" });
    if (request.method === "GET" && path === "/v1/shape") return this.handleShape(request, url);
    if (request.method === "POST" && path === "/doc") return this.handleDoc(request);
    if (request.method === "POST" && path === "/prompt") return this.handlePrompt(request);
    if (request.method === "POST" && path === "/presence") return this.handlePresence(request);
    return json({ message: "not found" }, { status: 404 });
  }

  private async handleShape(request: Request, url: URL): Promise<Response> {
    const table = url.searchParams.get("table") ?? "";
    const shape = this.shapes[table];
    if (!shape) return json({ message: `unknown shape: ${table}` }, { status: 400 });
    if (table === "presence") this.reapPresence();
    const handleParam = url.searchParams.get("handle");
    const headers = (offset: number) => ({ "electric-handle": shape.handle, "electric-offset": String(offset), "electric-schema": "{}" });
    if (handleParam && handleParam !== shape.handle) {
      return new Response(JSON.stringify([{ headers: { control: "must-refetch" } }]), { status: 409, headers: { "content-type": "application/json", "electric-handle": shape.handle, ...CORS } });
    }
    const raw = url.searchParams.get("offset") ?? "-1";
    if (raw === "-1") {
      return json([...toMessages(shape.snapshot()), { headers: { control: "up-to-date" } }], { headers: headers(shape.offset) });
    }
    const since = Number(raw);
    let entries = shape.since(since);
    if (entries.length === 0 && url.searchParams.get("live") === "true") {
      entries = await shape.waitForChange(since, request.signal);
    }
    if (entries.length === 0) return new Response(null, { status: 204, headers: headers(shape.offset) });
    return json([...toMessages(entries), { headers: { control: "up-to-date" } }], { headers: headers(shape.offset) });
  }

  private async handleDoc(request: Request): Promise<Response> {
    const { content, author } = await request.json() as { content: string; author: string };
    if (typeof content !== "string") return json({ message: "content required" }, { status: 400 });
    await this.writeDoc(content, author || "anon");
    return json({ ok: true });
  }

  private async handlePrompt(request: Request): Promise<Response> {
    const { prompt, author, color } = await request.json() as { prompt: string; author: string; color: string };
    if (!prompt?.trim()) return json({ message: "prompt required" }, { status: 400 });
    await this.appendMessage({ author: author || "anon", color: color || "#7B93D9", role: "user", text: prompt });
    void this.processPrompt(prompt);
    return json({ ok: true });
  }

  private async handlePresence(request: Request): Promise<Response> {
    const { clientId, name, color, leave } = await request.json() as { clientId: string; name?: string; color?: string; leave?: boolean };
    if (!clientId) return json({ message: "clientId required" }, { status: 400 });
    if (leave) { this.presenceSeen.delete(clientId); this.shapes.presence.remove(clientId); return json({ ok: true }); }
    this.presenceSeen.set(clientId, Date.now());
    this.shapes.presence.upsert(clientId, { id: clientId, name: name || "anon", color: color || "#7B93D9", last_seen: new Date().toISOString() });
    this.reapPresence();
    return json({ ok: true });
  }
}
