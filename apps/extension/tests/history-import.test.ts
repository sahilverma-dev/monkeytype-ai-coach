import { describe, expect, it, vi } from "vitest";
import {
	fetchResultPage,
	isLikelyDuplicate,
	mapApiResult,
	mergeImported,
} from "@/monkeytype/history-import";
import { makeTest, TEST_START } from "./fixtures";

const apiRow = {
	_id: "abc123",
	timestamp: TEST_START,
	wpm: 93.4,
	rawWpm: 99.1,
	acc: 96.2,
	consistency: 81.5,
	charStats: [420, 12, 2, 3],
	mode: "time",
	mode2: "30",
	testDuration: 30,
	difficulty: "normal",
	language: "english",
	punctuation: false,
	numbers: false,
	funbox: [],
	bailedOut: false,
};

describe("history import mapping", () => {
	it("maps an API row into a summary-fidelity test", () => {
		const test = mapApiResult(apiRow);
		expect(test).not.toBeNull();
		expect(test?.id).toBe("api-abc123");
		expect(test?.wpm).toBe(93.4);
		expect(test?.acc).toBe(96.2);
		expect(test?.fidelity).toBe("summary");
		expect(test?.metricsSource).toBe("monkeytype");
		expect(test?.keyStats).toBeNull();
		expect(test?.charStats).toEqual([420, 12, 2, 3]);
		expect(test?.excludedReason).toBeNull();
	});

	it("handles missing optional fields without inventing data", () => {
		const test = mapApiResult({
			...apiRow,
			consistency: null,
			charStats: null,
			difficulty: undefined,
			language: undefined,
			funbox: undefined,
		});
		expect(test?.consistency).toBeNull();
		expect(test?.charStats).toEqual([0, 0, 0, 0]);
		expect(test?.difficulty).toBe("normal");
		expect(test?.language).toBe("english");
		expect(test?.funbox).toEqual([]);
	});

	it("flags bailed out and very short results", () => {
		const bailed = mapApiResult({ ...apiRow, bailedOut: true });
		expect(bailed?.excludedReason).toBe("bailed out");
		const short = mapApiResult({ ...apiRow, testDuration: 3 });
		expect(short?.excludedReason).toBe("too short");
	});

	it("rejects unreadable rows instead of storing guesses", () => {
		expect(mapApiResult({ ...apiRow, mode: "wizard" })).toBeNull();
		expect(mapApiResult({ ...apiRow, wpm: 0 })).toBeNull();
		expect(mapApiResult({ ...apiRow, testDuration: 0 })).toBeNull();
		expect(mapApiResult({ ...apiRow, timestamp: -1 })).toBeNull();
		expect(mapApiResult("nope")).toBeNull();
	});
});

describe("duplicate detection", () => {
	it("matches the same API id", () => {
		const existing = makeTest({ id: "api-abc123" });
		const candidate = mapApiResult(apiRow);
		if (candidate === null) throw new Error("mapping failed");
		expect(isLikelyDuplicate(candidate, [existing])).toBe(true);
	});

	it("matches a live capture of the same test within two seconds", () => {
		const existing = makeTest({
			id: "live-1",
			timestamp: TEST_START + 900,
			mode: "time",
			mode2: "30",
			wpm: 93.4,
		});
		const candidate = mapApiResult(apiRow);
		if (candidate === null) throw new Error("mapping failed");
		expect(isLikelyDuplicate(candidate, [existing])).toBe(true);
	});

	it("does not match a different mode or a distant test", () => {
		const candidate = mapApiResult(apiRow);
		if (candidate === null) throw new Error("mapping failed");
		expect(
			isLikelyDuplicate(candidate, [
				makeTest({ mode: "words", mode2: "50", wpm: 93.4, timestamp: TEST_START }),
			]),
		).toBe(false);
		expect(
			isLikelyDuplicate(candidate, [
				makeTest({
					mode: "time",
					mode2: "30",
					wpm: 93.4,
					timestamp: TEST_START + 60_000,
				}),
			]),
		).toBe(false);
	});
});

describe("mergeImported", () => {
	it("counts imported, duplicates and invalid rows", () => {
		const existing = [
			makeTest({
				id: "api-abc123",
				timestamp: TEST_START,
				mode: "time",
				mode2: "30",
				wpm: 93.4,
			}),
		];
		const rows = [
			apiRow,
			{ ...apiRow, _id: "new1", timestamp: TEST_START - 60_000 },
			{ ...apiRow, _id: "bad", mode: "nope" },
		];
		const { tests, summary } = mergeImported(rows, existing);
		expect(summary).toEqual({ fetched: 3, imported: 1, duplicates: 1, invalid: 1 });
		expect(tests).toHaveLength(1);
		expect(tests[0]?.id).toBe("api-new1");
	});
});

describe("API errors", () => {
	it("explains a rejected ApeKey", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("no", { status: 470 })),
		);
		await expect(fetchResultPage("key", null)).rejects.toThrow(/ApeKey was rejected/);
	});

	it("explains rate limiting", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("slow down", { status: 429 })),
		);
		await expect(fetchResultPage("key", null)).rejects.toThrow(/rate limit/);
	});

	it("sends the ApeKey header and the incremental timestamp", async () => {
		const calls: { url: string; headers: unknown }[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: URL, init: RequestInit) => {
				calls.push({ url: url.toString(), headers: init.headers });
				return new Response(JSON.stringify({ data: [] }), { status: 200 });
			}),
		);
		const rows = await fetchResultPage("my-key", 1234);
		expect(rows).toEqual([]);
		expect(calls[0]?.url).toContain("limit=1000");
		expect(calls[0]?.url).toContain("onOrAfterTimestamp=1234");
		expect(calls[0]?.headers).toEqual({ Authorization: "ApeKey my-key" });
	});
});
