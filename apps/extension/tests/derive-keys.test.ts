import { describe, expect, it } from "vitest";
import { deriveKeyStats } from "@/monkeytype/derive-keys";
import { eventLogSchema, targetText } from "@/monkeytype/event-log";
import { helloWorldLog, inputEvent, makeEventLog } from "./fixtures";

describe("event log parsing", () => {
	it("accepts a realistic log and strips the commit character", () => {
		const parsed = eventLogSchema.safeParse(helloWorldLog());
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(targetText(parsed.data)).toEqual(["hello", "world"]);
	});

	it("rejects a log with an unexpected shape", () => {
		const parsed = eventLogSchema.safeParse({ version: 1, events: [{ type: "input" }] });
		expect(parsed.success).toBe(false);
	});
});

describe("deriveKeyStats", () => {
	it("counts a corrected mistake once and records the confusion", () => {
		const log = eventLogSchema.parse(helloWorldLog());
		const stats = deriveKeyStats(log);
		expect(stats).not.toBeNull();
		if (stats === null) return;

		const r = stats.chars.find((entry) => entry.char === "r");
		expect(r).toBeDefined();
		expect(r?.attempts).toBe(1);
		expect(r?.errors).toBe(1);
		expect(r?.corrected).toBe(1);
		expect(r?.confusion).toEqual([{ typed: "t", count: 1 }]);
		expect(stats.corrections).toBe(1);
		expect(stats.missedChars).toBe(0);
		expect(stats.keystrokes).toBe(11);
	});

	it("counts missed characters when a word is committed short", () => {
		const log = eventLogSchema.parse(
			makeEventLog({
				targetWords: ["hello"],
				durationSeconds: 5,
				events: [
					inputEvent({
						ms: 200,
						wordIndex: 0,
						charIndex: 0,
						data: "h",
						inputValue: "h",
						correct: true,
					}),
					inputEvent({
						ms: 300,
						wordIndex: 0,
						charIndex: 1,
						data: "e",
						inputValue: "he",
						correct: true,
					}),
					inputEvent({
						ms: 400,
						wordIndex: 0,
						charIndex: 2,
						data: "l",
						inputValue: "hel",
						correct: true,
					}),
					inputEvent({
						ms: 500,
						wordIndex: 0,
						charIndex: 3,
						data: "o",
						inputValue: "helo",
						correct: false,
					}),
					inputEvent({
						ms: 600,
						wordIndex: 0,
						charIndex: 4,
						data: " ",
						inputValue: "helo",
						commitsWord: true,
						lastWord: true,
					}),
				],
			}),
		);
		const stats = deriveKeyStats(log);
		expect(stats).not.toBeNull();
		if (stats === null) return;

		const l = stats.chars.find((entry) => entry.char === "l");
		expect(l?.attempts).toBe(2);
		expect(l?.errors).toBe(1);
		expect(l?.missed).toBe(0);
		expect(l?.confusion[0]?.typed).toBe("o");
		expect(stats.missedChars).toBe(1);

		const o = stats.chars.find((entry) => entry.char === "o");
		expect(o?.errors).toBe(0);
		expect(o?.missed).toBe(1);
	});

	it("skips IME languages rather than inventing attributions", () => {
		const log = eventLogSchema.parse({
			...helloWorldLog(),
			context: { ...helloWorldLog().context, hasKorean: true },
		});
		expect(deriveKeyStats(log)).toBeNull();
	});

	it("records typing rhythm for repeated pairs", () => {
		const log = eventLogSchema.parse(helloWorldLog());
		const stats = deriveKeyStats(log);
		expect(stats?.bigrams.length).toBeGreaterThan(0);
		expect(stats?.bigrams.every((entry) => entry.samples >= 1)).toBe(true);
	});
});
