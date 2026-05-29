import type { PaletteItem } from "./PaletteItem";
import { parseQuery } from "./parseQuery";

function matches(item: PaletteItem, searchText: string): boolean {
  if (!searchText) return true;
  const haystack = `${item.title} ${item.subtitle} ${item.section}`.toLowerCase();
  return haystack.includes(searchText.toLowerCase());
}

/**
 * Synchronous query filter shared by the debounced palette hook and the Enter
 * handler. Resolving matches synchronously lets the keyboard action run against
 * exactly what the user typed even when the 80ms debounce has not yet applied —
 * so Enter never fires a phantom command for a stale, still-unfiltered list.
 */
export function filterPaletteItems(allItems: PaletteItem[], query: string): PaletteItem[] {
  const { searchText } = parseQuery(query);
  return allItems.filter((item) => matches(item, searchText));
}
