import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Notification } from "./useNotifications";

/** Transient toasts vanish after this long; workflow toasts only after done. */
const TRANSIENT_MS = 4000;
const DONE_LINGER_MS = 4500;

function Toast({
  notification,
  onView,
  onDismiss,
}: {
  notification: Notification;
  onView: (notification: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const running = notification.status === "running";

  // Close the actions menu and return focus to the trigger, per the APG pattern.
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Auto-dismiss: transient toasts on a timer, workflow toasts once they finish.
  useEffect(() => {
    const timed = notification.kind === "transient" || !running;
    if (!timed) {
      return;
    }
    const delay = running ? TRANSIENT_MS : DONE_LINGER_MS;
    const timer = window.setTimeout(() => onDismiss(notification.id), delay);
    return () => window.clearTimeout(timer);
  }, [notification.kind, notification.id, running, onDismiss]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  // On open, move focus to the first action so the menu is keyboard-operable.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role^="menuitem"]',
    );
    items?.[0]?.focus();
  }, [menuOpen]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
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

  return (
    <div className={`toast toast-${notification.status}`} ref={ref}>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="toast-main"
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {running ? (
          <span className="toast-spinner" aria-hidden="true" />
        ) : (
          <svg
            aria-hidden="true"
            className="toast-check"
            fill="none"
            style={{ color: "var(--success)" }}
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <path
              d="m8 12 3 3 5-6"
              stroke="var(--surface)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        )}
        <span className="toast-text">
          <span className="toast-title">{notification.title}</span>
          {notification.detail ? (
            <span className="toast-detail" key={notification.detail}>
              {notification.detail}
            </span>
          ) : null}
        </span>
        <span className="toast-status">{running ? "Running" : "Done"}</span>
      </button>

      {menuOpen ? (
        <div
          className="toast-menu"
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
        >
          {notification.command ? (
            <button
              className="toast-action"
              role="menuitem"
              type="button"
              onClick={() => {
                onView(notification);
                closeMenu();
              }}
            >
              View workflow
            </button>
          ) : null}
          <button
            className="toast-action"
            role="menuitem"
            type="button"
            onClick={() => {
              onDismiss(notification.id);
              closeMenu();
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Corner stack of toasts for background/workflow runs. */
export function Toasts({
  notifications,
  onView,
  onDismiss,
}: {
  notifications: Notification[];
  onView: (notification: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) {
    return null;
  }
  return (
    <div className="toast-stack" aria-live="polite">
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onView={onView}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
