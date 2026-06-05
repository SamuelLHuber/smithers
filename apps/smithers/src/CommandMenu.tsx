import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type CommandId = "chat" | "askme" | "store";

export type Command = {
  id: CommandId;
  label: string;
  color: string;
  hint: string;
};

export const COMMANDS: Command[] = [
  { id: "chat", label: "Chat", color: "#356fd2", hint: "Talk to Smithers" },
  {
    id: "askme",
    label: "Ask Me",
    color: "#6d56d8",
    hint: "Smithers grills you to sharpen an idea",
  },
  {
    id: "store",
    label: "Store",
    color: "#bf5b16",
    hint: "Browse the workflow app store",
  },
];

const ChevronDown = () => (
  <svg aria-hidden="true" className="chevron" fill="none" viewBox="0 0 24 24">
    <path
      d="m6 9 6 6 6-6"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

/** A colored dropdown pill that selects the active command/view. */
export function CommandMenu({
  active,
  onSelect,
}: {
  active: CommandId;
  onSelect: (id: CommandId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the menu and hand focus back to the trigger, per the APG menu pattern.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // On open, move focus into the menu: the checked item if present, else the first.
  useEffect(() => {
    if (!open) {
      return;
    }
    const items = listRef.current?.querySelectorAll<HTMLElement>(
      '[role^="menuitem"]',
    );
    if (!items || items.length === 0) {
      return;
    }
    const checked = Array.from(items).find(
      (item) => item.getAttribute("aria-checked") === "true",
    );
    (checked ?? items[0]).focus();
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    );
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + items.length) % items.length;
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
  };

  const current = COMMANDS.find((command) => command.id === active) ?? COMMANDS[0];

  return (
    <div className="command-menu" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="command-pill"
        ref={triggerRef}
        style={{ "--cmd-color": current.color } as CSSProperties}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="command-dot" />
        <span>{current.label}</span>
        <ChevronDown />
      </button>

      {open ? (
        <div
          className="command-list"
          ref={listRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
        >
          {COMMANDS.map((command) => (
            <button
              aria-checked={command.id === active}
              className="command-option"
              key={command.id}
              role="menuitemradio"
              style={{ "--cmd-color": command.color } as CSSProperties}
              type="button"
              onClick={() => {
                onSelect(command.id);
                close();
              }}
            >
              <span className="command-dot" />
              <span className="command-text">
                <span className="command-label">{command.label}</span>
                <span className="command-hint">{command.hint}</span>
              </span>
              {command.id === active ? (
                <svg
                  aria-hidden="true"
                  className="check"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="m5 13 4 4L19 7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
