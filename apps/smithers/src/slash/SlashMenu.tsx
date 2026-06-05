import { matchSlash } from "./slashCommands";

/**
 * The "/" command menu above the composer. Click a command to run it. Shown
 * whenever the composer text starts with a slash.
 */
export function SlashMenu({
  query,
  onPick,
}: {
  query: string;
  onPick: (name: string) => void;
}) {
  const matches = matchSlash(query);
  if (matches.length === 0) {
    return null;
  }
  return (
    <div className="slash-menu" role="listbox" data-testid="slash-menu">
      {matches.map((command) => (
        <button
          key={command.name}
          type="button"
          role="option"
          className="slash-item"
          onClick={() => onPick(command.name)}
        >
          <span className="slash-name">/{command.name}</span>
          <span className="slash-summary">{command.summary}</span>
          {command.hint ? <span className="slash-hint">{command.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}
