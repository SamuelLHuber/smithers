// smithers-source: authored
// smithers-display-name: Open Code Review
/** @jsxImportSource smithers-orchestrator */
import { createSmithers, Sequence, type AgentLike } from "smithers-orchestrator";
import { agents } from "../agents";
import {
  buildNativeReviewPrompt,
  finalizeNativeReview,
  nativeReviewAgentOutputSchema,
  nativeReviewPromptSchema,
  openCodeReviewInputSchema,
  normalizeOpenCodeReviewInput,
  previewOpenCodeReview,
  previewOutputSchema,
  resolveReviewTarget,
  reviewRunOutputSchema,
  reviewTargetSchema,
  workflowSummarySchema,
} from "../lib/open-code-review";

const { Workflow, Task, smithers, outputs } = createSmithers({
  input: openCodeReviewInputSchema,
  target: reviewTargetSchema,
  preview: previewOutputSchema,
  reviewPrompt: nativeReviewPromptSchema,
  agentReview: nativeReviewAgentOutputSchema,
  review: reviewRunOutputSchema,
  summary: workflowSummarySchema,
});

export function createOpenCodeReviewWorkflow(reviewAgents: AgentLike[] = agents.smart) {
  return smithers((ctx) => {
    const input = normalizeOpenCodeReviewInput(ctx.input);
    const prepared = ctx.outputMaybe(outputs.reviewPrompt, { nodeId: "prepare-review" });
    return (
      <Workflow name="open-code-review">
        <Sequence>
          <Task id="resolve-target" output={outputs.target} noRetry>
            {async () => resolveReviewTarget(input)}
          </Task>

          <Task id="preview" output={outputs.preview} noRetry>
            {async () => previewOpenCodeReview(input)}
          </Task>

          <Task id="prepare-review" output={outputs.reviewPrompt} dependsOn={["preview"]} noRetry>
            {async () => {
              const preview = ctx.outputMaybe(outputs.preview, { nodeId: "preview" });
              if (!preview) throw new Error("preview did not complete");
              return buildNativeReviewPrompt(input, preview);
            }}
          </Task>

          <Task
            id="review-agent"
            output={outputs.agentReview}
            agent={reviewAgents}
            dependsOn={["prepare-review"]}
            skipIf={prepared ? !prepared.shouldReview : false}
            timeoutMs={input.timeout * 60_000}
            heartbeatTimeoutMs={Math.max(60_000, Math.min(input.timeout * 60_000, 600_000))}
            noRetry
          >
            {prepared?.prompt ?? "Review prompt is not ready yet."}
          </Task>

          <Task id="review" output={outputs.review} dependsOn={["prepare-review", "review-agent"]} noRetry>
            {() => {
              const preview = ctx.outputMaybe(outputs.preview, { nodeId: "preview" });
              const reviewPrompt = ctx.outputMaybe(outputs.reviewPrompt, { nodeId: "prepare-review" });
              const agentReview = ctx.outputMaybe(outputs.agentReview, { nodeId: "review-agent" });
              if (!preview) throw new Error("preview did not complete");
              if (!reviewPrompt) throw new Error("review prompt did not complete");
              return finalizeNativeReview(input, reviewPrompt, preview, agentReview);
            }}
          </Task>

          <Task
            id="summary"
            output={outputs.summary}
            noRetry
          >
            {() => {
              const target = ctx.outputMaybe(outputs.target, { nodeId: "resolve-target" });
              const preview = ctx.outputMaybe(outputs.preview, { nodeId: "preview" });
              const review = ctx.outputMaybe(outputs.review, { nodeId: "review" });
              if (!target) throw new Error("target did not complete");
              if (!preview) throw new Error("preview did not complete");
              if (!review) throw new Error("review did not complete");
              return {
                status: review.status,
                repoDir: target.repoDir,
                mode: target.mode,
                reviewableFiles: preview.reviewableCount,
                excludedFiles: preview.excludedCount,
                comments: review.comments.length,
                warnings: review.warnings.length,
                totalTokens: review.summary?.totalTokens ?? 0,
                message:
                  review.message ||
                  (review.ok
                    ? `Reviewed ${preview.reviewableCount} file(s) and produced ${review.comments.length} comment(s).`
                    : review.error || "Native Smithers review failed."),
              };
            }}
          </Task>
        </Sequence>
      </Workflow>
    );
  });
}

export default createOpenCodeReviewWorkflow();
