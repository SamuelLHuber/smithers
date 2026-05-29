import type { PaletteItem } from "./PaletteItem";

export type PaletteRowProps = {
  item: PaletteItem;
  selected: boolean;
  onHover: () => void;
  onRun: () => void;
};

/** A palette result row: 16px icon + title + subtitle + optional shortcut pill. */
export function PaletteRow({ item, selected, onHover, onRun }: PaletteRowProps) {
  return (
    <button
      className={`palette-row${selected ? " palette-row--selected" : ""}`}
      onClick={onRun}
      onMouseEnter={onHover}
      type="button"
    >
      <span aria-hidden className="palette-row-icon">
        {item.icon}
      </span>
      <span className="palette-row-text">
        <span className="palette-row-title">{item.title}</span>
        <span className="palette-row-subtitle">{item.subtitle}</span>
      </span>
      {item.shortcut ? <kbd className="palette-row-shortcut">{item.shortcut}</kbd> : null}
    </button>
  );
}
