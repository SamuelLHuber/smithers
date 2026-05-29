import { useEffect, useState } from "react";
import type { PaletteItem } from "./PaletteItem";
import { filterPaletteItems } from "./filterPaletteItems";

const DEBOUNCE_MS = 80;

/**
 * Debounced (80ms) filtered palette items. Each keystroke cancels the prior
 * timer and re-runs the filter after the delay; the caller resets its selection
 * index whenever the returned list identity changes. A request-generation
 * counter is unnecessary here because all sources are synchronous, but the
 * 80ms cancel-on-keystroke timing matches the gui palette feel.
 */
export function useDebouncedItems(allItems: PaletteItem[], query: string): PaletteItem[] {
  const [items, setItems] = useState<PaletteItem[]>(allItems);

  useEffect(() => {
    const timer = setTimeout(() => {
      setItems(filterPaletteItems(allItems, query));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [allItems, query]);

  return items;
}
