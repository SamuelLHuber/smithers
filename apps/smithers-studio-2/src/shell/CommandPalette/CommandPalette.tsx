import { useEffect, useMemo } from "react";
import { useStudioStore } from "../../useStudioStore";
import type { NavItem } from "../navRegistry";
import { buildPaletteItems } from "./buildPaletteItems";
import { filterPaletteItems } from "./filterPaletteItems";
import { useDebouncedItems } from "./useDebouncedItems";
import { parseQuery } from "./parseQuery";
import { PaletteRow } from "./PaletteRow";
import { PaletteSectionHeader } from "./PaletteSectionHeader";

export type CommandPaletteProps = {
  registry: NavItem[];
};

/**
 * The universal accelerator (Cmd-K / Cmd-P). Enumerates every registered
 * surface (developer surfaces appear only when registered) plus contextual
 * commands, with prefix pills, 80ms-debounced filtering, grouped results, and
 * keyboard nav. Keeps data-testid="command-palette".
 */
export function CommandPalette({ registry }: CommandPaletteProps) {
  const paletteQuery = useStudioStore((s) => s.paletteQuery);
  const selectedPaletteIndex = useStudioStore((s) => s.selectedPaletteIndex);
  const developerMode = useStudioStore((s) => s.developerMode);
  const { setActiveView, openTerminal, toggleDeveloperMode, closePalette, setPaletteQuery, setSelectedPaletteIndex } =
    useStudioStore.getState();

  const allItems = useMemo(
    () =>
      buildPaletteItems(registry, {
        goToView: (id) => {
          setActiveView(id);
        },
        newTerminal: () => {
          openTerminal();
        },
        toggleDeveloperMode: () => {
          toggleDeveloperMode();
        },
        developerMode,
      }),
    [registry, developerMode, setActiveView, openTerminal, toggleDeveloperMode],
  );

  const items = useDebouncedItems(allItems, paletteQuery);
  const parsed = parseQuery(paletteQuery);

  // Whenever the filtered list identity changes (a keystroke narrowed or
  // reordered the results), snap the selection back to the best match at the
  // top. Without this, a stale index — e.g. 0 still pointing at the first
  // "Go to" nav row while the user typed a command name — makes Enter run the
  // wrong item (and, when filtering is still mid-debounce, navigate away from
  // the surface the command was meant to act on).
  useEffect(() => {
    setSelectedPaletteIndex(() => 0);
  }, [items, setSelectedPaletteIndex]);

  const run = (index: number) => {
    // Resolve the live match list rather than trusting the debounced `items`,
    // which can lag a keystroke behind the query. Running against what was
    // actually typed (falling back to the best match at index 0 if the stale
    // index is out of range) means Enter never fires a phantom command — e.g.
    // a "Go to" nav row while the user typed a command name.
    const liveItems = filterPaletteItems(allItems, paletteQuery);
    const item = liveItems[index] ?? liveItems[0];
    if (!item) return;
    item.run();
    closePalette();
  };

  let lastSection: string | null = null;

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && closePalette()}
    >
      <div aria-label="Command palette" className="command-palette" data-testid="command-palette" role="dialog">
        <div className="palette-input-row">
          {parsed.prefix ? (
            <span className="palette-prefix-pill">
              <span className="palette-prefix-glyph">{parsed.prefix}</span>
              <span className="palette-prefix-title">{parsed.modeTitle}</span>
            </span>
          ) : null}
          <input
            autoFocus
            className="palette-input"
            onChange={(event) => setPaletteQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closePalette();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedPaletteIndex((index) => Math.min(index + 1, items.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedPaletteIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                run(selectedPaletteIndex);
              }
            }}
            placeholder="Type a command, or > / @ ?"
            value={paletteQuery}
          />
        </div>

        <div className="palette-list">
          {items.length === 0 ? (
            <div className="palette-empty">
              <span className="palette-empty-glyph" aria-hidden>
                ✦
              </span>
              <span>No matching results</span>
              {parsed.searchText ? (
                <span className="palette-empty-ask">{`Ask AI: ${parsed.searchText}`}</span>
              ) : null}
            </div>
          ) : (
            items.map((item, index) => {
              const showHeader = item.section !== lastSection;
              lastSection = item.section;
              return (
                <div key={item.id}>
                  {showHeader ? <PaletteSectionHeader title={item.section} /> : null}
                  <PaletteRow
                    item={item}
                    onHover={() => setSelectedPaletteIndex(index)}
                    onRun={() => run(index)}
                    selected={index === selectedPaletteIndex}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
