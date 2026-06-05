import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CommandMenu, COMMANDS, type CommandId } from "./CommandMenu";
import { Markdown } from "./chat/Markdown";
import { streamReplyViaApi } from "./chat/streamReplyViaApi";
import {
  GRILL_EDGES,
  GRILL_NODES,
  GRILL_SYSTEM_PROMPT,
} from "./askme/grillMe";
import { WorkflowGraph } from "./askme/WorkflowGraph";
import { Toasts } from "./notifications/Toasts";
import { useNotifications } from "./notifications/useNotifications";
import { WorkflowStore } from "./store/WorkflowStore";
import type { StoreWorkflow } from "./store/workflows";
import { useRailWidth } from "./layout/useRailWidth";
import { getSpeechRecognition } from "./speech/getSpeechRecognition";
import type { SpeechRecognitionLike } from "./speech/SpeechRecognitionLike";
import { PanelLeftIcon } from "./icons/PanelLeftIcon";
import { SunIcon } from "./icons/SunIcon";
import { MoonIcon } from "./icons/MoonIcon";
import { MicIcon } from "./icons/MicIcon";
import { ChevronDownIcon } from "./icons/ChevronDownIcon";
import { CheckIcon } from "./icons/CheckIcon";

const PROJECTS = ["Smithers Web", "Personal", "Sandbox", "Marketing Site"] as const;

/** Dev-only preview: the rotating text of an always-running mock toast. */
const MOCK_TOAST_STEPS = [
  "Planning the run…",
  "Spawning 3 agents…",
  "Reading the codebase…",
  "Drafting the spec…",
  "Reviewing findings…",
  "Synthesizing results…",
];

/** How close to the bottom (px) the transcript must be to auto-scroll on a new delta. */
const AUTOSCROLL_THRESHOLD = 80;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function Composer() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [project, setProject] = useState<string>(PROJECTS[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = window.localStorage.getItem("smithers.theme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  // The layout shell: "normal" keeps the centered → bottom-dock flow; "sidebar"
  // is the Arc-style left rail (chat) + main canvas (any view). Persisted so a
  // reload keeps the chosen shell.
  const [layout, setLayout] = useState<"normal" | "sidebar">(() =>
    window.localStorage.getItem("smithers.layout") === "sidebar"
      ? "sidebar"
      : "normal",
  );

  // Drag-to-resize width + collapse state for the sidebar rail (sidebar layout
  // only). Owns its own persistence; see useRailWidth.
  const rail = useRailWidth();

  useEffect(() => {
    try {
      window.localStorage.setItem("smithers.layout", layout);
    } catch {
      // Storage disabled (private mode); the layout still applies this session.
    }
  }, [layout]);

  // Apply the theme to <html> (CSS reads [data-theme]) and remember the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("smithers.theme", theme);
    } catch {
      // Storage disabled (private mode); the theme still applies this session.
    }
  }, [theme]);
  // navDir drives the data-dir CSS transition direction. The active view is set
  // by CommandMenu selection and by slash commands (e.g. "/askme"); there are
  // no arrow buttons. `commandIndex` is the active view.
  const [navDir, setNavDir] = useState<"back" | "forward">("forward");
  const [commandIndex, setCommandIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const idRef = useRef(0);
  const conversationRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLFormElement>(null);
  const prevRectRef = useRef<DOMRect | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const { notifications, notify, update, dismiss } = useNotifications();

  const command = COMMANDS[commandIndex].id;
  const showGraph = command === "askme";
  const showStore = command === "store";
  // Ask Me (graph) and Store both dock the composer immediately.
  const isChat = messages.length > 0 || showGraph || showStore;
  // Sidebar mode wins outright; otherwise it's the centered (home) vs
  // bottom-docked (chat) flow.
  const mode = layout === "sidebar" ? "sidebar" : isChat ? "chat" : "home";

  const toggleLayout = useCallback(() => {
    setLayout((value) => (value === "sidebar" ? "normal" : "sidebar"));
  }, []);

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(COMMANDS.length - 1, index));
      setNavDir(clamped > commandIndex ? "forward" : "back");
      setCommandIndex(clamped);
    },
    [commandIndex],
  );

  const goToCommand = useCallback(
    (id: CommandId) => {
      const index = COMMANDS.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        goToIndex(index);
      }
    },
    [goToIndex],
  );

  // Open a workflow picked from the store: jump to its view, or drop into chat
  // with a starter prompt prefilled.
  const openWorkflow = useCallback(
    (workflow: StoreWorkflow) => {
      if (workflow.command) {
        goToCommand(workflow.command);
      } else if (workflow.starter) {
        goToCommand("chat");
        setQuery(workflow.starter);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      notify({
        title: workflow.name,
        detail: "Workflow opened",
        kind: "transient",
        command: workflow.command,
      });
    },
    [goToCommand, notify],
  );

  const nextId = () => {
    idRef.current += 1;
    return String(idRef.current);
  };

  // Detect dictation support once so the mic button can explain itself when the
  // browser has no Web Speech API.
  useEffect(() => {
    setDictationSupported(getSpeechRecognition() !== null);
  }, []);

  // Abort any in-flight stream when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-scroll the transcript. Use "auto" while a stream is active so the
  // viewport doesn't re-animate on every token, and only follow along when the
  // reader is already near the bottom (so scrolling up to re-read isn't yanked).
  useEffect(() => {
    const el = conversationRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > AUTOSCROLL_THRESHOLD) {
      return;
    }
    el.scrollTo({
      top: el.scrollHeight,
      behavior: streaming ? "auto" : "smooth",
    });
  }, [messages, pending, streaming]);

  // Focus the input on first paint and again after the home → chat transition,
  // so it stays ready to type.
  useEffect(() => {
    inputRef.current?.focus();
  }, [isChat]);

  // Dev-only preview: a never-ending workflow toast whose text keeps updating,
  // so the toast UI stays visible while iterating on it.
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const id = notify({
      title: "Demo workflow",
      detail: MOCK_TOAST_STEPS[0],
      kind: "workflow",
      command: "askme",
    });
    let step = 0;
    const interval = window.setInterval(() => {
      step = (step + 1) % MOCK_TOAST_STEPS.length;
      update(id, { detail: MOCK_TOAST_STEPS[step] });
    }, 1700);
    return () => {
      window.clearInterval(interval);
      dismiss(id);
    };
  }, [notify, update, dismiss]);

  // FLIP: glide the composer from its centered hero position down to the docked
  // position instead of letting it jump when the layout switches. Scoped to the
  // inputs that actually move the card so it doesn't re-measure on every render.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const next = card.getBoundingClientRect();
    const prev = prevRectRef.current;
    prevRectRef.current = next;
    if (!prev) {
      return;
    }
    // When the rail collapses/expands the composer is hidden (zero-size) on one
    // side of the transition — skip FLIP so it doesn't fly in from the corner.
    if (next.width === 0 || prev.width === 0) {
      return;
    }
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (dx === 0 && dy === 0) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    card.style.transition = "none";
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      card.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
      card.style.transform = "";
      const clear = () => {
        card.style.transition = "";
        card.removeEventListener("transitionend", clear);
      };
      card.addEventListener("transitionend", clear);
    });
  }, [mode, layout, isChat]);

  // Close the project menu on outside-click or Escape, returning focus to the
  // trigger when Escape closes it.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!projectRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        projectTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // On open, move focus into the project menu: the checked item if there is one,
  // else the first item (APG menu pattern).
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const items = projectMenuRef.current?.querySelectorAll<HTMLElement>(
      '[role^="menuitem"]',
    );
    if (!items || items.length === 0) {
      return;
    }
    const checked = Array.from(items).find(
      (item) => item.getAttribute("aria-checked") === "true",
    );
    (checked ?? items[0]).focus();
  }, [menuOpen]);

  // Arrow / Home / End roving focus across the project menu items.
  const onProjectMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const container = projectMenuRef.current;
      if (!container) {
        return;
      }
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
      );
      if (items.length === 0) {
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowDown":
          nextIndex = current < 0 ? 0 : (current + 1) % items.length;
          break;
        case "ArrowUp":
          nextIndex =
            current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = items.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      items[nextIndex].focus();
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const raw = query.trim();
      if (!raw || pending || streamingRef.current) {
        return;
      }

      // Asking to open the store, in plain language, opens it.
      if (/^(open |show |go to )?(the )?store$/i.test(raw)) {
        setQuery("");
        goToCommand("store");
        return;
      }

      // "/sidebar" (or "/dock") flips the Arc-style layout — the same view an
      // agent can switch into from chat.
      const layoutSlash = raw.match(/^\/(sidebar|rail|dock|full|normal)$/i);
      if (layoutSlash) {
        const keyword = layoutSlash[1].toLowerCase();
        setLayout(
          keyword === "sidebar" || keyword === "rail" ? "sidebar" : "normal",
        );
        setQuery("");
        return;
      }

      // A leading "/askme", "/chat", or "/store" switches the active view; the
      // rest of the line (if any) is sent as the message.
      let text = raw;
      let active = command;
      const slash = raw.match(/^\/(askme|chat|store)\b\s*([\s\S]*)$/i);
      if (slash) {
        active = slash[1].toLowerCase() as CommandId;
        text = slash[2].trim();
        if (active !== command) {
          goToCommand(active);
        }
      }

      setQuery("");
      // The store is a browse view, not a chat target — opening it is enough.
      if (active === "store") {
        return;
      }
      if (!text) {
        // Bare "/askme" — switch the view, nothing to send yet.
        return;
      }

      setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
      setPending(true);
      streamingRef.current = true;
      setStreaming(true);

      // Abort any prior stream before starting a new one, then track this one's
      // controller so unmount (and the next submit) can cancel it.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Ask Me runs the grill-me interview; plain chat has no system prompt.
      const system = active === "askme" ? GRILL_SYSTEM_PROMPT : undefined;

      // Surface the workflow run as a corner toast that stays until it finishes.
      const notifId =
        active === "askme"
          ? notify({
              title: "Ask Me",
              detail: text.length > 48 ? `${text.slice(0, 48)}…` : text,
              kind: "workflow",
              command: "askme",
            })
          : null;

      // Conversation so far plus the turn we just sent. `messages` doesn't
      // include it yet (state updates are async), so append it explicitly and
      // map to the { role, content } wire shape.
      const wireHistory = [
        ...messages.map((message) => ({
          role: message.role,
          content: message.text,
        })),
        { role: "user" as const, content: text },
      ];

      // Stream the reply from the Cerebras-backed Worker (POST /api/chat),
      // appending deltas to a single assistant bubble.
      const assistantId = nextId();
      let acc = "";
      let started = false;
      try {
        for await (const delta of streamReplyViaApi({
          messages: wireHistory,
          system,
          signal: controller.signal,
        })) {
          acc += delta;
          if (!started) {
            started = true;
            setPending(false);
            setMessages((prev) => [
              ...prev,
              { id: assistantId, role: "assistant", text: acc },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, text: acc }
                  : message,
              ),
            );
          }
        }
        if (!started) {
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", text: "(no response)" },
          ]);
        }
      } catch (error) {
        // A new submit or unmount aborts the previous stream — that's expected,
        // not an error to render.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const offline =
          (typeof navigator !== "undefined" && navigator.onLine === false) ||
          (error instanceof TypeError);
        const message = offline
          ? "You appear to be offline, chat needs a connection."
          : error instanceof Error
            ? error.message
            : "Something went wrong talking to the chat backend.";
        setMessages((prev) =>
          started
            ? prev.map((entry) =>
                entry.id === assistantId
                  ? { ...entry, text: `${acc}\n\n⚠️ ${message}` }
                  : entry,
              )
            : [
                ...prev,
                { id: assistantId, role: "assistant", text: `⚠️ ${message}` },
              ],
        );
      } finally {
        setPending(false);
        streamingRef.current = false;
        setStreaming(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        if (notifId) {
          update(notifId, { status: "done" });
        }
      }
    },
    [query, pending, messages, command, goToCommand, notify, update],
  );

  const toggleDictation = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setDictationSupported(false);
      return;
    }
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setQuery((current) =>
          current ? `${current} ${transcript}` : transcript,
        );
      }
    };
    recognition.onerror = () => {
      setListening(false);
      notify({
        title: "Dictation stopped",
        detail: "The microphone hit an error.",
        kind: "transient",
      });
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, notify]);

  const composer = (
    <form className="composer-card" onSubmit={handleSubmit} ref={cardRef}>
      <div className="composer-top-row">
        <div className="composer-input">
          <input
            aria-label="Message Smithers"
            autoComplete="off"
            placeholder="Ask Smithers to build…"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <nav className="top-controls" aria-label="View navigation">
          <button
            aria-label={
              layout === "sidebar"
                ? "Exit sidebar layout"
                : "Switch to sidebar layout"
            }
            aria-pressed={layout === "sidebar"}
            className="nav-button"
            type="button"
            onClick={toggleLayout}
          >
            <PanelLeftIcon />
          </button>
          <button
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="nav-button"
            type="button"
            onClick={() =>
              setTheme((value) => (value === "dark" ? "light" : "dark"))
            }
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <CommandMenu active={command} onSelect={goToCommand} />
        </nav>
      </div>

      <div className="composer-toolbar">
        <div className="project-control" ref={projectRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="ghost-pill"
            ref={projectTriggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>{project}</span>
            <ChevronDownIcon />
          </button>

          {menuOpen ? (
            <div
              className="project-menu"
              ref={projectMenuRef}
              role="menu"
              onKeyDown={onProjectMenuKeyDown}
            >
              {PROJECTS.map((name) => (
                <button
                  aria-checked={name === project}
                  className="project-option"
                  key={name}
                  role="menuitemradio"
                  type="button"
                  onClick={() => {
                    setProject(name);
                    setMenuOpen(false);
                    projectTriggerRef.current?.focus();
                  }}
                >
                  <span>{name}</span>
                  {name === project ? <CheckIcon /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          aria-label={
            dictationSupported
              ? listening
                ? "Stop dictation"
                : "Start dictation"
              : "Dictation isn't supported in this browser"
          }
          aria-pressed={dictationSupported ? listening : undefined}
          className={listening ? "mic-button is-listening" : "mic-button"}
          disabled={!dictationSupported}
          title={
            dictationSupported
              ? undefined
              : "Dictation isn't supported in this browser"
          }
          type="button"
          onClick={toggleDictation}
        >
          <MicIcon />
        </button>
      </div>
    </form>
  );

  // The scrolling transcript — shared by the bottom-dock view and the rail.
  const messagesLog = (
    <div
      className="conversation"
      ref={conversationRef}
      role="log"
      aria-live="polite"
    >
      <div className="messages">
        {messages.length === 0 && showGraph ? (
          <p className="askme-hint">
            Tell me what to grill you on — type a topic and hit Enter.
          </p>
        ) : null}
        {messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            <div className="bubble">
              {message.role === "assistant" ? (
                <Markdown content={message.text} />
              ) : (
                message.text
              )}
            </div>
          </div>
        ))}
        {pending ? (
          <div className="message assistant">
            <div className="bubble typing" aria-label="Smithers is thinking">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  // The sidebar's main canvas: the workflow graph for Ask Me, otherwise the
  // workflow store (the demo view). Any view can be slotted in here.
  const canvas = showGraph ? (
    <div className="askme-graph askme-graph-full">
      <WorkflowGraph nodes={GRILL_NODES} edges={GRILL_EDGES} theme={theme} />
    </div>
  ) : (
    <WorkflowStore onOpen={openWorkflow} />
  );

  return (
    <main
      className={rail.resizing ? "app-shell is-resizing" : "app-shell"}
      data-mode={mode}
    >
      <Toasts
        notifications={notifications}
        onDismiss={dismiss}
        onView={(notification) => goToCommand(notification.command ?? "askme")}
      />

      {layout === "sidebar" ? (
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
            {messagesLog}
            <div className="composer-dock">{composer}</div>
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
          <section className="main-canvas" data-dir={navDir} key={commandIndex}>
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
            {canvas}
          </section>
        </>
      ) : (
        <>
          <div className="view" data-dir={navDir} key={commandIndex}>
            {showStore ? (
              <WorkflowStore onOpen={openWorkflow} />
            ) : isChat ? (
              <>
                {showGraph ? (
                  <div className="askme-graph">
                    <WorkflowGraph
                      nodes={GRILL_NODES}
                      edges={GRILL_EDGES}
                      theme={theme}
                    />
                  </div>
                ) : null}
                {messagesLog}
              </>
            ) : (
              <h1 className="composer-title">How can I help you?</h1>
            )}
          </div>

          <div className="composer-dock">{composer}</div>
        </>
      )}
    </main>
  );
}
