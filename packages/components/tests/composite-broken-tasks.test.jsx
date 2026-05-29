/** @jsxImportSource smithers-orchestrator */
import { describe, expect, test } from "bun:test";
import React from "react";
import { z } from "zod";
import { CheckSuite, ScanFixVerify, Supervisor } from "../src/components/index.js";
import { SmithersRenderer } from "@smithers-orchestrator/react-reconciler/dom/renderer";
import { SmithersCtx } from "@smithers-orchestrator/react-reconciler/context";
import { renderFrame } from "smithers-orchestrator";
import { createTestSmithers } from "./helpers.js";
import { Effect } from "effect";

const boss = { id: "boss", generate: async () => ({ text: "ok" }) };
const worker = { id: "worker", generate: async () => ({ text: "ok" }) };
const scanner = { id: "scanner", generate: async () => ({ text: "ok" }) };
const fixer = { id: "fixer", generate: async () => ({ text: "ok" }) };
const verifier = { id: "verifier", generate: async () => ({ text: "ok" }) };

async function render(el) {
	const renderer = new SmithersRenderer();
	return renderer.render(el);
}

describe("Supervisor final summary task (finding 1)", () => {
	test("final summary runs on the boss agent, not as a static task", async () => {
		const result = await render(
			<Supervisor
				id="boss"
				boss={boss}
				workers={{ docs: worker }}
				planOutput="plan_out"
				workerOutput="worker_out"
				reviewOutput="review_out"
				finalOutput="final_out"
			>
				plan work
			</Supervisor>,
		);
		const final = result.tasks.find((task) => task.nodeId === "boss-final");
		expect(final).toBeDefined();
		// Agent task: bound to boss, has a prompt, no static payload.
		expect(final.agent).toBe(boss);
		expect(typeof final.prompt).toBe("string");
		expect(final.prompt).toContain("Summarize");
		expect(final.staticPayload).toBeUndefined();
		expect(final.computeFn).toBeUndefined();
	});
});
