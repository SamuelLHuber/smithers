/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { fieldKey, selectLifetimeVerificationRows, stableNodeId, summarizeLifetimeRows } from "../porting-rules";
import { lifetimeClassifier, lifetimeVerifier } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  approvalSchema,
  lifetimeClassificationSchema,
  lifetimeInputSchema,
  lifetimeSelectionSchema,
  lifetimeSummarySchema,
  lifetimeVoteSchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, Approval, smithers, outputs } = createBunPortSmithers({
  input: lifetimeInputSchema,
  lifetimeClassification: lifetimeClassificationSchema,
  lifetimeSelection: lifetimeSelectionSchema,
  lifetimeVote: lifetimeVoteSchema,
  lifetimeSummary: lifetimeSummarySchema,
  approval: approvalSchema,
});

export default smithers((ctx) => {
  const files = ctx.input.files ?? [];
  type LifetimeClassification = z.infer<typeof lifetimeClassificationSchema>;
  type LifetimeSelection = z.infer<typeof lifetimeSelectionSchema>;
  type LifetimeVote = z.infer<typeof lifetimeVoteSchema>;
  type LifetimeSummary = z.infer<typeof lifetimeSummarySchema>;
  const classifications = (ctx.outputs.lifetimeClassification ?? []) as LifetimeClassification[];
  const flatFields = classifications.flatMap((row) => row.fields.map((field) => ({
    ...field,
    file: row.file,
    crate: row.crate,
  })));
  const selected = ctx.outputMaybe(outputs.lifetimeSelection, { nodeId: "lifetime:select-verify" }) as LifetimeSelection | undefined;
  const votes = (ctx.outputs.lifetimeVote ?? []) as LifetimeVote[];
  const summary = ctx.outputMaybe(outputs.lifetimeSummary, { nodeId: "lifetime:synthesize" }) as LifetimeSummary | undefined;
  const approval = ctx.outputMaybe(outputs.approval, { nodeId: "lifetime:unknown-rate-approval" });
  const expectedVotes = (selected?.selectedCount ?? 0) * 3;

  return (
    <Workflow name="bun-port-lifetime-classify">
      <Sequence>
        <Parallel maxConcurrency={ctx.input.files.length || 1}>
          {files.map((file) => (
            <Task
              key={file.zig}
              id={`lifetime:classify:${stableNodeId(file.zig)}`}
              output={outputs.lifetimeClassification}
              agent={lifetimeClassifier}
              timeoutMs={20 * 60_000}
              cache={{ by: () => ({ zig: file.zig, crate: file.crate ?? "" }), version: "v1" }}
            >
              OUTPUT_KIND: lifetime-classify
              ZIG: {file.zig}
              CRATE: {file.crate ?? ""}
              REPO: {ctx.input.repo}

              Classify every pointer struct field in this Zig file using the Bun
              ownership taxonomy. Return fields with evidence and confidence.
            </Task>
          ))}
        </Parallel>

        {classifications.length >= files.length ? (
          <Task id="lifetime:select-verify" output={outputs.lifetimeSelection}>
            {() => {
              const rows = selectLifetimeVerificationRows(flatFields, ctx.input.sampleRate ?? 0.12);
              return {
                totalFields: flatFields.length,
                selectedCount: rows.length,
                selected: rows.map((field) => ({
                  key: fieldKey(field),
                  file: field.file,
                  struct: field.struct,
                  field: field.field,
                  class: field.class,
                  rustType: field.rustType,
                })),
              };
            }}
          </Task>
        ) : null}

        {selected ? (
          <Parallel maxConcurrency={Math.max(1, Math.min(24, selected.selectedCount * 3))}>
            {selected.selected.flatMap((field) =>
              [0, 1, 2].map((vote) => (
                <Task
                  key={`${field.key}:${vote}`}
                  id={`lifetime:verify:${stableNodeId(field.key)}:${vote}`}
                  output={outputs.lifetimeVote}
                  agent={lifetimeVerifier}
                  timeoutMs={10 * 60_000}
                >
                  OUTPUT_KIND: lifetime-verify
                  FIELD_KEY: {field.key}
                  VOTER: verifier-{vote + 1}
                  ZIG: {field.file}

                  Adversarially verify the claimed lifetime class {field.class}
                  and Rust type {field.rustType}. Refute if evidence is weak.
                </Task>
              )),
            )}
          </Parallel>
        ) : null}

        {selected && votes.length >= expectedVotes ? (
          <Task id="lifetime:synthesize" output={outputs.lifetimeSummary}>
            {() => {
              const base = summarizeLifetimeRows(flatFields);
              const refutedKeys = new Set(
                votes
                  .filter((vote) => vote.refuted)
                  .map((vote) => vote.key),
              );
              const tsvPreview = flatFields
                .slice(0, 20)
                .map((field) => [
                  field.file,
                  field.struct,
                  field.field,
                  field.zigType,
                  field.class,
                  field.rustType,
                  field.evidence,
                ].join("\t"))
                .join("\n");
              return {
                totalFields: base.totalFields,
                unknownRate: base.unknownRate,
                verifiedCount: selected.selectedCount,
                overturned: refutedKeys.size,
                byClass: base.byClass,
                tsvPreview,
              };
            }}
          </Task>
        ) : null}

        {summary && summary.unknownRate > (ctx.input.unknownApprovalThreshold ?? 0.05) && !approval ? (
          <Approval
            id="lifetime:unknown-rate-approval"
            output={outputs.approval}
            request={{
              title: "Approve high UNKNOWN lifetime rate?",
              summary: `UNKNOWN rate ${summary.unknownRate}; ${summary.totalFields} fields classified.`,
              metadata: { byClass: summary.byClass },
            }}
            onDeny="fail"
          />
        ) : null}
      </Sequence>
    </Workflow>
  );
});
