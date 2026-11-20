import { describe, expect, it } from "vitest";
import { deriveKeyStats } from "@/monkeytype/derive-keys";
import { eventLogSchema, targetText } from "@/monkeytype/event-log";
import realLog from "./fixtures/eventlog.real-messy.json";

/**
 * A log captured from production on 2026-11-20 while deliberately mistyping one
 * character, correcting it, and committing one word short. It pins the shape the
 * live page actually delivers (not just the shapes the source suggests):
 * `testMs` only, no `ms`, and the commit space inside `inputValue`.
 */
describe("production event log", () => {
	const parsed = eventLogSchema.safeParse(realLog);

	it("matches the schema the reader expects", () => {
		expect(parsed.success).toBe(true);
	});

	it("records the corrected mistake, the miss, and the confusion", () => {
		if (!parsed.success) throw new Error("fixture failed to parse");
		const stats = deriveKeyStats(parsed.data);
		expect(stats).not.toBeNull();
		if (stats === null) return;

		expect(stats.corrections).toBeGreaterThanOrEqual(1);
		expect(stats.missedChars).toBeGreaterThanOrEqual(1);
		expect(stats.extraChars).toBe(0);
		expect(stats.chars.some((entry) => entry.errors > 0)).toBe(true);
		expect(stats.chars.some((entry) => entry.confusion.length > 0)).toBe(true);
	});

	it("does not turn the commit space into an extra character", () => {
		if (!parsed.success) throw new Error("fixture failed to parse");
		const stats = deriveKeyStats(parsed.data);
		expect(stats?.extraChars).toBe(0);
	});

	it("accounts for every letter of every word that was finished", () => {
		if (!parsed.success) throw new Error("fixture failed to parse");
		const stats = deriveKeyStats(parsed.data);
		if (stats === null) throw new Error("no key stats");

		const words = targetText(parsed.data);
		const totalLetters = words.reduce((sum, word) => sum + word.length, 0);
		const attempts = stats.chars.reduce((sum, entry) => sum + entry.attempts, 0);
		const missed = stats.chars.reduce((sum, entry) => sum + entry.missed, 0);

		// Attempts cover every expected letter of the finished words, including the
		// two that were skipped when one word was committed short. The final word was
		// typed but never committed, so its letters are attempted without a miss.
		expect(attempts).toBe(totalLetters);
		expect(missed).toBe(2);
		expect(attempts - missed).toBe(totalLetters - 2);
	});
});
