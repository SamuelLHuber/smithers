import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

const WIDTH_STORAGE = "smithers.railWidth";
const COLLAPSED_STORAGE = "smithers.railCollapsed";

/**
 * Resize bounds for the chat rail, in pixels. A drag narrower than COLLAPSE_AT
 * snaps the rail shut; between COLLAPSE_AT and MIN the width holds at MIN, so
 * there's a small dead zone before it disappears (VS Code-style).
 */
const RAIL_MIN = 260;
const RAIL_MAX = 560;
const RAIL_DEFAULT = 320;
const COLLAPSE_AT = 170;

export type RailWidth = {
  /** Current expanded width in px (meaningless while `collapsed`). */
  width: number;
  /** Whether the rail is dragged fully shut. */
  collapsed: boolean;
  /** True while a drag is in flight — lets the shell lock the cursor. */
  resizing: boolean;
  /** Reopen a collapsed rail at its last width. */
  expand: () => void;
  onResizeStart: (event: PointerEvent<HTMLElement>) => void;
  onResizeMove: (event: PointerEvent<HTMLElement>) => void;
  onResizeEnd: (event: PointerEvent<HTMLElement>) => void;
};

function readWidth(): number {
  const stored = Number(window.localStorage.getItem(WIDTH_STORAGE));
  if (Number.isFinite(stored) && stored >= RAIL_MIN && stored <= RAIL_MAX) {
    return stored;
  }
  return RAIL_DEFAULT;
}

/**
 * Drag-to-resize state for the sidebar chat rail. The rail hugs the viewport's
 * left edge, so the pointer's clientX is the rail's width — no measuring needed.
 * Width and collapsed state persist to localStorage so a reload restores them.
 */
export function useRailWidth(): RailWidth {
  const [width, setWidth] = useState<number>(() => readWidth());
  const [collapsed, setCollapsed] = useState<boolean>(
    () => window.localStorage.getItem(COLLAPSED_STORAGE) === "1",
  );
  const [resizing, setResizing] = useState(false);
  // Remember the width to restore to when expanding from collapsed, even if the
  // collapsing drag clamped `width` to MIN on the way down.
  const lastOpenWidth = useRef(width);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_STORAGE, String(width));
    } catch {
      // Storage disabled (private mode); the width still applies this session.
    }
  }, [width]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE, collapsed ? "1" : "0");
    } catch {
      // Storage disabled (private mode); the state still applies this session.
    }
  }, [collapsed]);

  const expand = useCallback(() => setCollapsed(false), []);

  const onResizeStart = useCallback((event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }, []);

  const onResizeMove = useCallback((event: PointerEvent<HTMLElement>) => {
    // Only react to the captured drag, not stray hover moves over the handle.
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const next = event.clientX;
    if (next < COLLAPSE_AT) {
      setCollapsed(true);
      return;
    }
    const clamped = Math.min(RAIL_MAX, Math.max(RAIL_MIN, next));
    lastOpenWidth.current = clamped;
    setCollapsed(false);
    setWidth(clamped);
  }, []);

  const onResizeEnd = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizing(false);
  }, []);

  return {
    width,
    collapsed,
    resizing,
    expand,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  };
}
