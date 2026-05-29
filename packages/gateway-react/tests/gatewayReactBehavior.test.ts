// Drives the real gateway-react hooks through React's real reconciler under a
// real DOM (happy-dom) so that useEffect actually runs and state updates flush.
// No hook logic is faked: the test client implements the genuine async-generator
// / rpc contracts and we observe the hooks' real reactions to real inputs.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { describe, expect, test } from "bun:test";
import { act, createElement, useEffect, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GatewayEventFrame, SmithersGatewayClient } from "@smithers-orchestrator/gateway-client";
import { SmithersGatewayClient as RealSmithersGatewayClient } from "@smithers-orchestrator/gateway-client";
import {
  SmithersGatewayContext,
  SmithersGatewayProvider,
  useGatewayRpc,
  useGatewayRunEvents,
} from "../src/index.ts";

// React's act() requires this flag so updates are flushed synchronously and
// warnings are suppressed in the bun + happy-dom test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Harness = {
  render: (element: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
};

async function mountHarness(): Promise<Harness> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
  });
  return {
    render: async (element) => {
      await act(async () => {
        root.render(element);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function eventFrame(seq: number, event = "run.event"): GatewayEventFrame {
  return {
    type: "event",
    event,
    payload: { seq },
    seq,
    stateVersion: seq,
    apiVersion: "v1",
  };
}

function heartbeatFrame(seq: number): GatewayEventFrame {
  return {
    type: "event",
    event: "run.heartbeat",
    payload: { seq },
    seq,
    stateVersion: seq,
    apiVersion: "v1",
  };
}

describe("useGatewayRunEvents", () => {
  test("filters heartbeats into lastHeartbeat and ring-buffer caps the events array", async () => {
    const maxEvents = 5;
    const yielded: GatewayEventFrame[] = [];
    // 8 real run.event frames interleaved with 2 heartbeats. With maxEvents=5,
    // only the last 5 run.event frames may remain; heartbeats never enter events.
    for (let seq = 1; seq <= 8; seq += 1) {
      yielded.push(eventFrame(seq));
      if (seq === 3) yielded.push(heartbeatFrame(100 + seq));
      if (seq === 6) yielded.push(heartbeatFrame(100 + seq));
    }

    const client = {
      async *streamRunEventsResilient() {
        for (const frame of yielded) {
          yield frame;
        }
      },
    } as unknown as SmithersGatewayClient;

    let snapshot: ReturnType<typeof useGatewayRunEvents> | undefined;
    function Probe() {
      snapshot = useGatewayRunEvents("run-1", { maxEvents });
      return null;
    }

    const harness = await mountHarness();
    await harness.render(
      createElement(SmithersGatewayProvider, { client }, createElement(Probe)),
    );

    expect(snapshot).toBeDefined();
    // Heartbeats are surfaced separately, never buffered into events.
    expect(snapshot?.events.every((frame) => frame.event !== "run.heartbeat")).toBe(true);
    // Ring buffer never grows beyond maxEvents.
    expect(snapshot?.events.length).toBe(maxEvents);
    // It retains the most recent run.event frames (seqs 4..8), dropping older ones.
    expect(snapshot?.events.map((frame) => frame.seq)).toEqual([4, 5, 6, 7, 8]);
    // The latest heartbeat (seq 106, emitted after run.event seq 6) is surfaced.
    expect(snapshot?.lastHeartbeat?.event).toBe("run.heartbeat");
    expect(snapshot?.lastHeartbeat?.seq).toBe(106);
    expect(snapshot?.error).toBeUndefined();

    await harness.unmount();
  });

  test("the events array stays capped even when the stream emits far more than maxEvents", async () => {
    const maxEvents = 10;
    const total = 250;
    const client = {
      async *streamRunEventsResilient() {
        for (let seq = 1; seq <= total; seq += 1) {
          yield eventFrame(seq);
        }
      },
    } as unknown as SmithersGatewayClient;

    let snapshot: ReturnType<typeof useGatewayRunEvents> | undefined;
    function Probe() {
      snapshot = useGatewayRunEvents("run-flood", { maxEvents });
      return null;
    }

    const harness = await mountHarness();
    await harness.render(
      createElement(SmithersGatewayProvider, { client }, createElement(Probe)),
    );

    expect(snapshot?.events.length).toBe(maxEvents);
    expect(snapshot?.events.map((frame) => frame.seq)).toEqual([241, 242, 243, 244, 245, 246, 247, 248, 249, 250]);

    await harness.unmount();
  });
});

describe("SmithersGatewayProvider", () => {
  test("an inline options literal does not recreate the client across renders (memoized on baseUrl/token)", async () => {
    const observed: SmithersGatewayClient[] = [];
    function Capture() {
      return createElement(SmithersGatewayContext.Consumer, {
        children: (value: SmithersGatewayClient | null) => {
          if (value) observed.push(value);
          return null;
        },
      });
    }

    // Each render passes a brand-new options object literal with identical
    // baseUrl/token. The provider must memoize on those primitives and keep the
    // same client identity rather than reconnecting every render.
    const tree = () =>
      createElement(
        SmithersGatewayProvider,
        { options: { baseUrl: "http://gateway.test", token: "tok-1" } },
        createElement(Capture),
      );

    const harness = await mountHarness();
    await harness.render(tree());
    await harness.render(tree());
    await harness.render(tree());

    expect(observed.length).toBeGreaterThanOrEqual(2);
    expect(observed[0]).toBeInstanceOf(RealSmithersGatewayClient);
    const first = observed[0];
    for (const client of observed) {
      expect(client).toBe(first);
    }

    await harness.unmount();
  });

  test("a changed baseUrl does recreate the client", async () => {
    const observed: SmithersGatewayClient[] = [];
    function Capture() {
      return createElement(SmithersGatewayContext.Consumer, {
        children: (value: SmithersGatewayClient | null) => {
          if (value) observed.push(value);
          return null;
        },
      });
    }

    const harness = await mountHarness();
    await harness.render(
      createElement(
        SmithersGatewayProvider,
        { options: { baseUrl: "http://a.test" } },
        createElement(Capture),
      ),
    );
    const firstClient = observed[observed.length - 1];
    await harness.render(
      createElement(
        SmithersGatewayProvider,
        { options: { baseUrl: "http://b.test" } },
        createElement(Capture),
      ),
    );
    const secondClient = observed[observed.length - 1];

    expect(firstClient).toBeInstanceOf(RealSmithersGatewayClient);
    expect(secondClient).toBeInstanceOf(RealSmithersGatewayClient);
    expect(secondClient).not.toBe(firstClient);

    await harness.unmount();
  });
});

describe("useGatewayRpc", () => {
  test("the fetch effect re-runs only when its real deps change, not on every render", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const client = {
      rpc: (method: string, params: unknown) => {
        calls.push({ method, params });
        return Promise.resolve({ ok: true });
      },
    } as unknown as SmithersGatewayClient;

    // An unrelated state value changes every render via an effect, forcing
    // multiple commits. The rpc params are structurally identical each render,
    // so useGatewayRpc must NOT re-issue the request on those churn renders.
    let renderCount = 0;
    function Probe(props: { onMount: () => void }) {
      renderCount += 1;
      useGatewayRpc("listRuns", { limit: 5 });
      // Force a second render right after mount to simulate unrelated parent
      // churn — the rpc deps are unchanged, so no second rpc call should fire.
      useEffect(() => {
        if (renderCount === 1) {
          props.onMount();
        }
      });
      return null;
    }

    function Wrapper() {
      const [, setTick] = useState(0);
      const onMount = () => setTick((n) => n + 1);
      return createElement(
        SmithersGatewayProvider,
        { client },
        createElement(Probe, { onMount }),
      );
    }

    const harness = await mountHarness();
    await harness.render(createElement(Wrapper));

    // Despite multiple renders, only one rpc call should have been issued
    // because the serialized params (the real dep) never changed.
    expect(renderCount).toBeGreaterThan(1);
    expect(calls).toEqual([{ method: "listRuns", params: { limit: 5 } }]);

    await harness.unmount();
  });

  test("changing params re-issues exactly one additional rpc call", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const client = {
      rpc: (method: string, params: unknown) => {
        calls.push({ method, params });
        return Promise.resolve({ ok: true });
      },
    } as unknown as SmithersGatewayClient;

    function Probe(props: { limit: number }) {
      useGatewayRpc("listRuns", { limit: props.limit });
      return null;
    }

    const harness = await mountHarness();
    await harness.render(
      createElement(SmithersGatewayProvider, { client }, createElement(Probe, { limit: 5 })),
    );
    // Re-render with identical params: no new call.
    await harness.render(
      createElement(SmithersGatewayProvider, { client }, createElement(Probe, { limit: 5 })),
    );
    expect(calls.length).toBe(1);

    // Re-render with changed params: exactly one new call.
    await harness.render(
      createElement(SmithersGatewayProvider, { client }, createElement(Probe, { limit: 9 })),
    );
    expect(calls).toEqual([
      { method: "listRuns", params: { limit: 5 } },
      { method: "listRuns", params: { limit: 9 } },
    ]);

    await harness.unmount();
  });
});
