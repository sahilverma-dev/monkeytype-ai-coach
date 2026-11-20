import { describe, expect, it } from "vitest";
import { buildCoachData } from "@/ai/context";
import { buildSnapshot } from "@/ai/snapshot";
import { sparklineSvg } from "@/shared/sparkline";
import { makeKeyStats, makeTest, TEST_START } from "./fixtures";

const DAY = 86_400_000;

function history(count: number) {
	return Array.from({ length: count }, (_, index) =>
		makeTest({
			id: `snap-${index}`,
			timestamp: TEST_START + index * DAY,
			wpm: 60 + index,
			acc: 95 + index * 0.2,
			keyStats: makeKeyStats({
				chars: [
					{
						char: "r",
						attempts: 20,
						errors: 4,
						corrected: 3,
						missed: 0,
						confusion: [{ typed: "t", count: 3 }],
					},
					{ char: "n", attempts: 20, errors: 2, corrected: 2, missed: 0, confusion: [] },
				],
			}),
		}),
	);
}

describe("buildSnapshot", () => {
	it("describes the same window as the stats", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: true,
			includeRecentTests: true,
		});
		const snapshot = buildSnapshot(data);
		expect(snapshot.validTests).toBe(10);
		expect(snapshot.wpmSeries).toHaveLength(10);
		expect(snapshot.wpmSeries[0]).toBe(60);
		expect(snapshot.wpmSeries.at(-1)).toBe(69);
		expect(snapshot.accSeries).toHaveLength(10);
		expect(snapshot.stats.wpm).toBeCloseTo(64.5);
		expect(snapshot.topKeys[0]?.char).toBe("r");
		expect(snapshot.topKeys[0]?.errors).toBe(40);
		expect(snapshot.keyTests).toBe(10);
	});

	it("handles a window without key data", () => {
		const data = buildCoachData(history(3), 10, {
			includeKeyData: true,
			includeRecentTests: true,
		});
		const snapshot = buildSnapshot({
			...data,
			chars: { ...data.chars, chars: [], coverage: { testsTotal: 3, testsWithKeys: 0 } },
		});
		expect(snapshot.topKeys).toEqual([]);
		expect(snapshot.wpmSeries).toHaveLength(3);
	});
});

describe("sparklineSvg", () => {
	it("renders a line for the series", () => {
		const svg = sparklineSvg([1, 3, 2], "wpm");
		expect(svg).toContain('class="mtai-spark"');
		expect(svg).toContain('class="mtai-spark__line"');
		expect(svg).toContain('aria-label="wpm: 3 points from 1.0 to 3.0"');
	});

	it("escapes the label and never emits markup from it", () => {
		const svg = sparklineSvg([1, 2], "<script>alert(1)</script>");
		expect(svg).not.toContain("<script>");
		expect(svg).toContain("&lt;script&gt;");
	});

	it("returns an empty labelled chart when there is no data", () => {
		const svg = sparklineSvg([], "accuracy");
		expect(svg).toContain("no data");
		expect(svg).not.toContain("mtai-spark__line");
	});
});
