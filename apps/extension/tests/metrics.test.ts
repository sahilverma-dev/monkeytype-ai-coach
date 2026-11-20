// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { eventLogSchema } from "@/monkeytype/event-log";
import { computeMetrics, readResultMetrics } from "@/monkeytype/metrics";
import { helloWorldLog, resultsScreenHtml } from "./fixtures";

function render(html: string): HTMLElement {
	document.body.innerHTML = html;
	const element = document.querySelector("#result");
	if (element === null) throw new Error("missing #result");
	return element as HTMLElement;
}

describe("readResultMetrics", () => {
	it("reads the numbers users actually see", () => {
		const metrics = readResultMetrics(render(resultsScreenHtml({})), "wpm");
		expect(metrics).not.toBeNull();
		expect(metrics?.wpm).toBe(102);
		expect(metrics?.rawWpm).toBe(110);
		expect(metrics?.acc).toBe(97.5);
		expect(metrics?.consistency).toBe(78);
		expect(metrics?.charStats).toEqual([450, 12, 3, 5]);
		expect(metrics?.testDuration).toBe(30);
		expect(metrics?.source).toBe("monkeytype");
	});

	it("normalises characters-per-minute into wpm", () => {
		const html = resultsScreenHtml({ speed: "500", raw: "550", unit: "cpm" });
		const metrics = readResultMetrics(render(html), "cpm");
		expect(metrics?.wpm).toBe(100);
		expect(metrics?.rawWpm).toBe(110);
	});

	it("parses clock-style durations and infinite speed", () => {
		const html = resultsScreenHtml({ time: "1:00", speed: "Infinite" });
		const metrics = readResultMetrics(render(html), "wpm");
		expect(metrics?.testDuration).toBe(60);
		expect(metrics?.wpm).toBe(1000);
	});

	it("returns null instead of guessing when the screen is unreadable", () => {
		const metrics = readResultMetrics(render("<div id='result'></div>"), "wpm");
		expect(metrics).toBeNull();
	});

	it("keeps working when optional stats are hidden", () => {
		const html = `
			<div id="result">
				<div data-ui-element="resultStat"><div class="text-sub">wpm</div><div data-ui-element="resultStatValue">80</div></div>
				<div data-ui-element="resultStat"><div class="text-sub">acc</div><div data-ui-element="resultStatValue">96%</div></div>
				<div data-ui-element="resultStat"><div class="text-sub">time</div><div data-ui-element="resultStatValue"><div>15s</div></div></div>
			</div>`;
		const metrics = readResultMetrics(render(html), "wpm");
		expect(metrics?.consistency).toBeNull();
		expect(metrics?.charStats).toEqual([0, 0, 0, 0]);
		expect(metrics?.rawWpm).toBe(80);
	});
});

describe("computeMetrics", () => {
	it("reconstructs metrics from the event log", () => {
		const log = eventLogSchema.parse(helloWorldLog());
		const metrics = computeMetrics(log);
		expect(metrics).not.toBeNull();
		expect(metrics?.source).toBe("computed");
		expect(metrics?.testDuration).toBe(4);
		expect(metrics?.acc).toBe(90.91);
		expect(metrics?.charStats).toEqual([10, 1, 0, 0]);
		expect(metrics?.wpm).toBe(30);
	});
});
