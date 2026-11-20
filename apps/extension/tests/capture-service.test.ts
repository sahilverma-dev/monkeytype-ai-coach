// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SnapshotResponse } from "@/monkeytype/bridge-protocol";
import type { MonkeytypeConfigSnapshot } from "@/monkeytype/capture";
import { captureCompletedTest } from "@/monkeytype/capture-service";
import type { RuntimeMessage } from "@/shared/messages";
import { capturedTestSchema } from "@/shared/schema";
import { helloWorldLog, resultsScreenHtml, TEST_START } from "./fixtures";

const config: MonkeytypeConfigSnapshot = {
	mode: "time",
	words: 10,
	time: 30,
	quoteLength: 0,
	difficulty: "normal",
	language: "english",
	punctuation: false,
	numbers: false,
	funbox: [],
	typingSpeedUnit: "wpm",
	theme: "serika_dark",
};

function snapshot(eventLog: unknown): SnapshotResponse {
	return {
		source: "mtai-main",
		type: "TEST_SNAPSHOT",
		requestId: "req",
		payload: {
			eventLog,
			config,
			resultVisible: true,
			href: "https://monkeytype.com/",
			capturedAt: TEST_START,
		},
	};
}

function emptyStorage(): Storage {
	return {
		getItem: () => null,
		setItem: () => undefined,
		removeItem: () => undefined,
		clear: () => undefined,
		key: () => null,
		length: 0,
	} as unknown as Storage;
}

describe("captureCompletedTest", () => {
	it("stores a full-fidelity test and validates it at the boundary", async () => {
		document.body.innerHTML = resultsScreenHtml({});
		const sent: RuntimeMessage[] = [];
		const outcome = await captureCompletedTest({
			doc: document,
			storage: emptyStorage(),
			requestSnapshot: async () => snapshot(helloWorldLog()),
			send: async (message) => {
				sent.push(message);
				return { ok: true, data: { stored: true, duplicate: false } };
			},
			now: TEST_START,
		});

		expect(outcome.status).toBe("stored");
		expect(sent).toHaveLength(1);
		const message = sent[0];
		expect(message?.type).toBe("TEST_CAPTURED");
		if (message?.type !== "TEST_CAPTURED") return;

		const parsed = capturedTestSchema.safeParse(message.test);
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.fidelity).toBe("full");
		expect(parsed.data.wpm).toBe(102);
		expect(parsed.data.metricsSource).toBe("monkeytype");
		expect(parsed.data.timestamp).toBe(TEST_START);
		expect(parsed.data.keyStats?.corrections).toBe(1);
	});

	it("falls back to summary fidelity when the event log is unavailable", async () => {
		document.body.innerHTML = resultsScreenHtml({});
		const sent: RuntimeMessage[] = [];
		const outcome = await captureCompletedTest({
			doc: document,
			storage: emptyStorage(),
			requestSnapshot: async () => snapshot(null),
			send: async (message) => {
				sent.push(message);
				return { ok: true, data: { stored: true, duplicate: false } };
			},
			now: TEST_START,
		});

		expect(outcome.status).toBe("stored");
		const message = sent[0];
		if (message?.type !== "TEST_CAPTURED") throw new Error("no message");
		const parsed = capturedTestSchema.parse(message.test);
		expect(parsed.fidelity).toBe("summary");
		expect(parsed.keyStats).toBeNull();
	});

	it("reports duplicates without duplicating storage", async () => {
		document.body.innerHTML = resultsScreenHtml({});
		const outcome = await captureCompletedTest({
			doc: document,
			storage: emptyStorage(),
			requestSnapshot: async () => snapshot(helloWorldLog()),
			send: async () => ({ ok: true, data: { stored: false, duplicate: true } }),
			now: TEST_START,
		});
		expect(outcome.status).toBe("duplicate");
	});

	it("skips cleanly when nothing can be read", async () => {
		document.body.innerHTML = "<div id='result'></div>";
		const outcome = await captureCompletedTest({
			doc: document,
			storage: emptyStorage(),
			requestSnapshot: async () => null,
			send: async () => ({ ok: true }),
		});
		expect(outcome.status).toBe("skipped");
	});
});
