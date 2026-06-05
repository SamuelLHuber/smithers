import type { CommandId } from "../commands";

export type StoreWorkflow = {
  id: string;
  name: string;
  description: string;
  /** Emoji shown in the card badge. */
  icon: string;
  category: string;
  /** Accent color for the card. */
  color: string;
  /** If set, opening the workflow switches to this view. */
  command?: CommandId;
  /** If set, opening prefills the chat composer with this starter prompt. */
  starter?: string;
};

/**
 * The browsable catalog shown in the workflow store. These mirror the workflow
 * pack that `smithers init` writes into `.smithers/workflows/` — same ids,
 * display names, and descriptions as the seeded `.tsx` files (see
 * apps/cli/src/workflow-pack.js `DEFAULT_WORKFLOW_METADATA`). Keep this list in
 * sync when the init pack changes.
 */
export const STORE_WORKFLOWS: StoreWorkflow[] = [
  {
    id: "implement",
    name: "Implement",
    description:
      "Implement a focused change with validation and review feedback loops.",
    icon: "🛠️",
    category: "Coding",
    color: "#2670a9",
    starter: "Implement this change with validation and review:\n\n",
  },
  {
    id: "research-plan-implement",
    name: "Research Plan Implement",
    description:
      "Research a request, produce a plan, then implement it with validation and review.",
    icon: "🚀",
    category: "Coding",
    color: "#6d56d8",
    starter: "Research, plan, then implement this:\n\n",
  },
  {
    id: "review",
    name: "Review",
    description:
      "Review current repository changes with one or more configured agents.",
    icon: "🔍",
    category: "Review",
    color: "#356fd2",
    starter: "Review these changes and flag bugs and improvements:\n\n",
  },
  {
    id: "plan",
    name: "Plan",
    description: "Create a practical implementation plan before code changes begin.",
    icon: "🗺️",
    category: "Planning",
    color: "#bf5b16",
    starter: "Create a step-by-step implementation plan for: ",
  },
  {
    id: "research",
    name: "Research",
    description:
      "Gather repository and external context before planning or building.",
    icon: "🔬",
    category: "Research",
    color: "#0f8f78",
    starter: "Research this before we build:\n\n",
  },
  {
    id: "ticket-create",
    name: "Ticket Create",
    description: "Turn a request into one structured implementation ticket.",
    icon: "🎫",
    category: "Tickets",
    color: "#a34d9f",
    starter: "Turn this request into one structured implementation ticket:\n\n",
  },
  {
    id: "tickets-create",
    name: "Tickets Create",
    description: "Break a larger request into multiple implementable tickets.",
    icon: "🗂️",
    category: "Tickets",
    color: "#8a4fbf",
    starter: "Break this request into multiple implementable tickets:\n\n",
  },
  {
    id: "ralph",
    name: "Ralph",
    description: "Keep working continuously on an open-ended maintenance prompt.",
    icon: "🔁",
    category: "Maintenance",
    color: "#c2691c",
    starter: "Keep working continuously on this maintenance prompt:\n\n",
  },
  {
    id: "improve-test-coverage",
    name: "Improve Test Coverage",
    description:
      "Find and add high-impact missing tests for the current repository.",
    icon: "✅",
    category: "Testing",
    color: "#1f9d6b",
    starter: "Find and add high-impact missing tests for: ",
  },
  {
    id: "debug",
    name: "Debug",
    description: "Reproduce, fix, validate, and review a reported bug.",
    icon: "🐛",
    category: "Debugging",
    color: "#d6336c",
    starter: "Reproduce, fix, validate, and review this bug:\n\n",
  },
  {
    id: "grill-me",
    name: "Grill Me",
    description:
      "Ask targeted questions until vague requirements become actionable.",
    icon: "🎤",
    category: "Planning",
    color: "#6d56d8",
    command: "askme",
  },
  {
    id: "feature-enum",
    name: "Feature Enum",
    description: "Build or refine a code-backed feature inventory for a repository.",
    icon: "📋",
    category: "Audit",
    color: "#2f7d9a",
    starter: "Build a code-backed feature inventory for: ",
  },
  {
    id: "audit",
    name: "Audit",
    description:
      "Audit feature groups for tests, docs, observability, and maintainability gaps.",
    icon: "🔎",
    category: "Audit",
    color: "#b5532a",
    starter:
      "Audit these feature groups for tests, docs, observability, and maintainability gaps:\n\n",
  },
  {
    id: "mission",
    name: "Mission",
    description:
      "Run long-horizon work as approved milestones with focused workers and validation.",
    icon: "🎯",
    category: "Coding",
    color: "#4a63d0",
    starter: "Plan this long-horizon work as approved milestones:\n\n",
  },
  {
    id: "kanban",
    name: "Kanban",
    description:
      "Implement ticket files from `.smithers/tickets/` in worktree branches with a Kanban UI.",
    icon: "📌",
    category: "Tickets",
    color: "#d18b1a",
    starter:
      "Implement the ticket files in .smithers/tickets/ on worktree branches:\n\n",
  },
  {
    id: "workflow-skill",
    name: "Workflow Skill",
    description:
      "Generate agent-facing skill documentation from local Smithers workflows.",
    icon: "📚",
    category: "Docs",
    color: "#356fd2",
    starter:
      "Generate agent-facing skill documentation from the local Smithers workflows.",
  },
];
