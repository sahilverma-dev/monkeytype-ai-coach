import { describe, expect, it } from "vitest";
import { analyzeChars } from "@/analytics/errors";
import { computeWindowStats } from "@/analytics/overview";
import { detectWeaknesses } from "@/analytics/weaknesses";
import { makeKeyStats, makeTest, TEST_START } from "./fixtures";

const DAY = 86_400_000;

describe("computeWindowStats", () => {
	it("averages real values and keeps excluded tests out of them", () => {
		const tests = [
			makeTest({
				wpm: 100,
				acc: 98,
				timestamp: TEST_START + 2 * DAY,
				charStats: [500, 5, 0, 0],
			}),
			makeTest({
				wpm: 80,
				acc: 96,
				timestamp: TEST_START + DAY,
				charStats: [400, 10, 0, 0],
			}),
			makeTest({ wpm: 70, acc: 94, timestamp: TEST_START, charStats: [300, 8, 0, 0] }),
			makeTest({
				wpm: 20,
				acc: 60,
				timestamp: TEST_START - DAY,
				excludedReason: "bailed out",
				bailedOut: true,
			}),
		];

		const stats = computeWindowStats(tests, "all");
		expect(stats.tests).toBe(4);
		expect(stats.validTests).toBe(3);
		expect(stats.excludedTests).toBe(1);
		expect(stats.wpm.average).toBe(83.33);
		expect(stats.wpm.best).toBe(100);
		expect(stats.wpm.worst).toBe(70);
		expect(stats.acc.average).toBe(96);
		expect(stats.charTotals).toEqual({
			correct: 1200,
			incorrect: 23,
			extra: 0,
			missed: 0,
		});
		expect(stats.trend?.direction).toBe("up");
		expect(stats.pbs[0]?.wpm).toBe(100);
	});

	it("limits the window to the newest tests", () => {
		const tests = Array.from({ length: 30 }, (_, index) =>
			makeTest({ wpm: 50 + index, timestamp: TEST_START + index * DAY }),
		);
		const stats = computeWindowStats(tests, 10);
		expect(stats.tests).toBe(10);
		expect(stats.wpm.average).toBe(74.5);
		expect(stats.firstTimestamp).toBe(TEST_START + 20 * DAY);
	});

	it("reports coverage so the UI can be honest about key data", () => {
		const tests = [
			makeTest({ fidelity: "full", keyStats: makeKeyStats() }),
			makeTest({ fidelity: "summary", keyStats: null, timestamp: TEST_START + DAY }),
		];
		const stats = computeWindowStats(tests, "all");
		expect(stats.coverage).toEqual({ full: 1, summary: 1 });
		expect(stats.correctionRate).toBeCloseTo(2.5);
	});

	it("does not invent a trend from two tests", () => {
		const tests = [
			makeTest({ wpm: 70 }),
			makeTest({ wpm: 90, timestamp: TEST_START + DAY }),
		];
		expect(computeWindowStats(tests, "all").trend).toBeNull();
	});
});

describe("analyzeChars", () => {
	it("aggregates per-key errors across tests", () => {
		const tests = [
			makeTest({
				keyStats: makeKeyStats({
					chars: [
						{
							char: "r",
							attempts: 20,
							errors: 5,
							corrected: 4,
							missed: 0,
							confusion: [{ typed: "t", count: 4 }],
						},
						{
							char: "e",
							attempts: 60,
							errors: 1,
							corrected: 1,
							missed: 0,
							confusion: [],
						},
					],
				}),
			}),
			makeTest({
				timestamp: TEST_START + DAY,
				keyStats: makeKeyStats({
					chars: [
						{
							char: "r",
							attempts: 10,
							errors: 1,
							corrected: 1,
							missed: 0,
							confusion: [{ typed: "t", count: 1 }],
						},
					],
					bigrams: [{ pair: "rt", samples: 4, meanMs: 320 }],
				}),
			}),
		];

		const analysis = analyzeChars(tests);
		expect(analysis.coverage).toEqual({ testsTotal: 2, testsWithKeys: 2 });
		const r = analysis.chars.find((entry) => entry.char === "r");
		expect(r?.attempts).toBe(30);
		expect(r?.errors).toBe(6);
		expect(r?.errorRate).toBe(20);
		expect(r?.confusion[0]).toEqual({ typed: "t", count: 5 });
		expect(analysis.overallErrorRate).toBeCloseTo(7.78, 1);
		expect(analysis.slowBigrams[0]?.pair).toBe("rt");
	});

	it("ignores tests without key data and excluded tests", () => {
		const analysis = analyzeChars([
			makeTest({ fidelity: "summary", keyStats: null }),
			makeTest({ keyStats: makeKeyStats(), excludedReason: "too short" }),
		]);
		expect(analysis.coverage.testsWithKeys).toBe(0);
		expect(analysis.chars).toHaveLength(0);
	});
});

describe("detectWeaknesses", () => {
	it("flags low accuracy with the numbers behind it", () => {
		const tests = [makeTest({ acc: 88, keyStats: makeKeyStats() })];
		const stats = computeWindowStats(tests, "all");
		const weaknesses = detectWeaknesses(stats, analyzeChars(tests));
		const accuracy = weaknesses.find((entry) => entry.kind === "accuracy");
		expect(accuracy).toBeDefined();
		expect(accuracy?.severity).toBe("high");
		expect(accuracy?.evidence).toContain("88.0%");
	});

	it("flags a specific key only when it stands out", () => {
		const tests = [
			makeTest({
				keyStats: makeKeyStats({
					chars: [
						{
							char: "q",
							attempts: 20,
							errors: 6,
							corrected: 5,
							missed: 0,
							confusion: [{ typed: "a", count: 5 }],
						},
						{
							char: "n",
							attempts: 100,
							errors: 4,
							corrected: 4,
							missed: 0,
							confusion: [{ typed: "m", count: 4 }],
						},
						{
							char: "e",
							attempts: 200,
							errors: 2,
							corrected: 2,
							missed: 0,
							confusion: [],
						},
					],
				}),
			}),
		];
		const stats = computeWindowStats(tests, "all");
		const weaknesses = detectWeaknesses(stats, analyzeChars(tests));
		expect(weaknesses.some((entry) => entry.kind === "key" && entry.id === "key-q")).toBe(
			true,
		);
		expect(weaknesses.some((entry) => entry.kind === "confusion")).toBe(true);
	});

	it("says nothing when there is no data", () => {
		const stats = computeWindowStats([], "all");
		expect(detectWeaknesses(stats, analyzeChars([]))).toEqual([]);
	});

	it("explains missing key data instead of faking key findings", () => {
		const tests = [makeTest({ fidelity: "summary", keyStats: null })];
		const weaknesses = detectWeaknesses(
			computeWindowStats(tests, "all"),
			analyzeChars(tests),
		);
		expect(weaknesses.some((entry) => entry.kind === "coverage")).toBe(true);
		expect(weaknesses.some((entry) => entry.kind === "key")).toBe(false);
	});
});
