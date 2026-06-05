/** A slash command shown in the "/" menu and routed in the composer. */
export type SlashCommand = {
  name: string;
  summary: string;
  hint?: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "run", summary: "Launch a run", hint: "/run [title]" },
  { name: "diff", summary: "Show what changed" },
  { name: "logs", summary: "Open the transcript" },
  { name: "approvals", summary: "Pending approval gates" },
  { name: "timeline", summary: "Time travel a run" },
  { name: "research", summary: "Deep Research workflow" },
  { name: "agents", summary: "Agents & providers" },
  { name: "memory", summary: "Recall facts", hint: "/memory <query>" },
  { name: "eval", summary: "Run an eval suite" },
  { name: "cron", summary: "Schedules" },
  { name: "prompt", summary: "Prompt templates" },
  { name: "human", summary: "Human task" },
  { name: "signal", summary: "Deliver a signal", hint: "/signal <event>" },
];

/** Filter commands for the menu by the text typed after the leading slash. */
export function matchSlash(input: string): SlashCommand[] {
  const term = input.replace(/^\//, "").trim().toLowerCase();
  if (!term) {
    return SLASH_COMMANDS;
  }
  const head = term.split(/\s+/)[0];
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(head));
}
