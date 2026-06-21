/**
 * The event/signal sequence numbers are the ordering backbone every consumer
 * depends on: deterministic replay, live-stream tailing, and reconnect-after-seq.
 * `insertEventWithNextSeq`/`insertSignalWithNextSeq` must allocate a gapless,
 * monotonic, collision-free seq even when many writers race on one run — a
 * dropped or duplicated seq silently corrupts the durable log. These tests pin
 * that invariant on the bun:sqlite path (BEGIN IMMEDIATE + transaction turn).
 */
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SmithersDb } from "../src/adapter.js";
import { ensureSmithersTables } from "../src/ensure.js";

function createAdapter() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  ensureSmithersTables(db);
  return new SmithersDb(db);
}

const RUN = "race-run";

async function seedRun(adapter) {
  await adapter.insertRun({
    runId: RUN,
    workflowName: "wf",
    status: "running",
    createdAtMs: Date.now(),
  });
}

describe("event seq allocation under concurrency (bun:sqlite)", () => {
  test("50 concurrent insertEventWithNextSeq produce seqs 0..49 with no drops or dups", async () => {
    const adapter = createAdapter();
    await seedRun(adapter);
    const N = 50;
    const seqs = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        adapter.insertEventWithNextSeq({
          runId: RUN,
          timestampMs: 1000 + i,
          type: "test.event",
          payloadJson: JSON.stringify({ i }),
        }),
      ),
    );
    const sorted = [...seqs].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i));
    expect(new Set(seqs).size).toBe(N); // no two writers got the same seq
    expect(await adapter.getLastEventSeq(RUN)).toBe(N - 1);
    const history = await adapter.listEventHistory(RUN, { limit: N * 2 });
    expect(history.length).toBe(N); // no event silently dropped
  });

  test("re-inserting an identical event returns the same seq (replay dedup)", async () => {
    const adapter = createAdapter();
    await seedRun(adapter);
    const row = {
      runId: RUN,
      timestampMs: 5,
      type: "dup",
      payloadJson: JSON.stringify({ x: 1 }),
    };
    const first = await adapter.insertEventWithNextSeq(row);
    const second = await adapter.insertEventWithNextSeq(row);
    expect(second).toBe(first);
    const history = await adapter.listEventHistory(RUN, { limit: 100 });
    expect(history.length).toBe(1);
  });
});

describe("signal seq allocation under concurrency (bun:sqlite)", () => {
  test("40 concurrent insertSignalWithNextSeq produce seqs 0..39 with no drops", async () => {
    const adapter = createAdapter();
    await seedRun(adapter);
    const N = 40;
    const seqs = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        adapter.insertSignalWithNextSeq({
          runId: RUN,
          signalName: "sig",
          correlationId: `c-${i}`,
          payloadJson: JSON.stringify({ i }),
          receivedAtMs: 2000 + i,
        }),
      ),
    );
    const sorted = [...seqs].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i));
    expect(new Set(seqs).size).toBe(N);
    expect(await adapter.getLastSignalSeq(RUN)).toBe(N - 1);
  });

  test("re-inserting an identical signal returns the same seq (replay dedup)", async () => {
    const adapter = createAdapter();
    await seedRun(adapter);
    const row = {
      runId: RUN,
      signalName: "sig",
      correlationId: "c-dup",
      payloadJson: JSON.stringify({ x: 1 }),
      receivedAtMs: 9,
    };
    const first = await adapter.insertSignalWithNextSeq(row);
    const second = await adapter.insertSignalWithNextSeq(row);
    expect(second).toBe(first);
  });
});
