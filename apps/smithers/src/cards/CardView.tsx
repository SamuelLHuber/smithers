import { AgentsCard } from "../agents/AgentsCard";
import { ApprovalCard } from "../approvals/ApprovalCard";
import { CronsCard } from "../crons/CronsCard";
import { DiffCard } from "../diff/DiffCard";
import { HumanCard } from "../human/HumanCard";
import { SignalCard } from "../human/SignalCard";
import { LaunchCard } from "../launch/LaunchCard";
import { MemoryCard } from "../memory/MemoryCard";
import { PromptsCard } from "../prompts/PromptsCard";
import { RunCard } from "../runs/RunCard";
import { ScoresCard } from "../scores/ScoresCard";
import type { Card } from "./Card";

/** Render the component for an inline card. The one place card.kind is fanned out. */
export function CardView({ card }: { card: Card }) {
  switch (card.kind) {
    case "run":
      return <RunCard runId={card.runId} />;
    case "approval":
      return <ApprovalCard runId={card.runId} />;
    case "diff":
      return <DiffCard runId={card.runId} />;
    case "launch":
      return <LaunchCard workflowId={card.workflowId} />;
    case "agents":
      return <AgentsCard />;
    case "memory":
      return <MemoryCard query={card.query} />;
    case "scores":
      return <ScoresCard reportId={card.reportId} />;
    case "crons":
      return <CronsCard />;
    case "human":
      return <HumanCard />;
    case "signal":
      return <SignalCard event={card.event} />;
    case "prompts":
      return <PromptsCard />;
    default:
      return null;
  }
}
