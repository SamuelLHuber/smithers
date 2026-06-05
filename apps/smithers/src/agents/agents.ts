/** A coding agent / provider available to Smithers. */
export type Agent = {
  id: string;
  name: string;
  initials: string;
  color: string;
  detail: string;
  auth?: string;
  available: boolean;
};

export const AGENTS: Agent[] = [
  {
    id: "claude",
    name: "Claude Code",
    initials: "C",
    color: "#0f8f78",
    detail: "claude-opus-4-8 · code, review",
    auth: "oauth",
    available: true,
  },
  {
    id: "codex",
    name: "Codex",
    initials: "X",
    color: "#356fd2",
    detail: "gpt-5.5 · code",
    auth: "key set",
    available: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    initials: "Cb",
    color: "#bf5b16",
    detail: "gpt-oss-120b · chat",
    auth: "key set",
    available: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    initials: "G",
    color: "#9a9aa3",
    detail: "not detected",
    available: false,
  },
];
