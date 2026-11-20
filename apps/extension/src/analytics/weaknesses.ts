import type { CharAnalysis } from "./errors";
import type { WindowStats } from "./overview";

export type WeaknessKind =
	| "accuracy"
	| "consistency"
	| "key"
	| "confusion"
	| "bigram"
	| "skipped"
	| "plateau"
	| "tradeoff"
	| "coverage";

export interface Weakness {
	id: string;
	kind: WeaknessKind;
	severity: "high" | "medium" | "low";
	title: string;
	/** Always contains the numbers behind the claim. */
	evidence: string;
	recommendation: string;
}

const SEVERITY_ORDER: Record<Weakness["severity"], number> = {
	high: 0,
	medium: 1,
	low: 2,
};

const LABELS: Record<string, string> = {
	" ": "space",
	"\n": "enter",
	"\t": "tab",
};

export function displayChar(char: string): string {
	return LABELS[char] ?? char;
}

function percent(value: number | null): string {
	return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

/**
 * Evidence-backed weaknesses. Each rule needs a minimum amount of data and every
 * claim carries the numbers that produced it; nothing is invented when the data
 * cannot support it.
 */
export function detectWeaknesses(stats: WindowStats, chars: CharAnalysis): Weakness[] {
	const weaknesses: Weakness[] = [];
	if (stats.validTests === 0) return weaknesses;

	const acc = stats.acc.average;
	if (acc !== null && acc < 95) {
		weaknesses.push({
			id: "accuracy",
			kind: "accuracy",
			severity: acc < 90 ? "high" : "medium",
			title: "Accuracy is capping your speed",
			evidence: `Average accuracy ${percent(acc)} over ${stats.validTests} tests, with ${stats.charTotals.incorrect} incorrect and ${stats.charTotals.missed} missed characters.`,
			recommendation:
				"Slow to roughly 90% of your current speed until accuracy holds above 97%, then increase speed again. Correct every misspelling instead of skipping it.",
		});
	}

	const consistency = stats.consistency.average;
	if (consistency !== null && consistency < 70 && stats.validTests >= 5) {
		weaknesses.push({
			id: "consistency",
			kind: "consistency",
			severity: "medium",
			title: "Your pace fluctuates between words",
			evidence: `Average consistency ${percent(consistency)} across ${stats.validTests} tests.`,
			recommendation:
				"Type to a metronome-like rhythm on familiar word lists before pushing speed. Even pacing usually raises net speed before raw speed does.",
		});
	}

	const typedTotal =
		stats.charTotals.correct +
		stats.charTotals.incorrect +
		stats.charTotals.extra +
		stats.charTotals.missed;
	const missedShare =
		typedTotal === 0 ? null : (stats.charTotals.missed / typedTotal) * 100;
	if (missedShare !== null && missedShare >= 4) {
		weaknesses.push({
			id: "skipped",
			kind: "skipped",
			severity: missedShare >= 8 ? "high" : "medium",
			title: "Characters are being left out",
			evidence: `${stats.charTotals.missed} missed characters (${percent(missedShare)} of typed characters).`,
			recommendation:
				"Finish every word before pressing space. Practise in word mode with the same list length rather than timed mode, where skipping is easier to hide.",
		});
	}

	const attemptFloor = Math.max(8, Math.round(chars.totals.attempts * 0.005));
	const keyCandidates = chars.chars
		.filter(
			(entry) =>
				entry.attempts >= attemptFloor &&
				entry.errorRate >= 8 &&
				(chars.overallErrorRate === null ||
					entry.errorRate >= chars.overallErrorRate * 1.4),
		)
		.slice(0, 3);

	for (const entry of keyCandidates) {
		const topConfusion = entry.confusion[0];
		weaknesses.push({
			id: `key-${entry.char}`,
			kind: "key",
			severity: entry.errorRate >= 15 ? "high" : "medium",
			title: `"${displayChar(entry.char)}" is a recurring miss`,
			evidence:
				`${entry.errors} errors across ${entry.attempts} attempts (${percent(entry.errorRate)} error rate)` +
				(topConfusion === undefined
					? "."
					: `, most often typed as "${displayChar(topConfusion.typed)}" (${topConfusion.count}x).`),
			recommendation: `Add words with "${displayChar(entry.char)}" to your practice list and slow down on that key until the error rate drops below 5%.`,
		});
	}

	const flaggedChars = new Set(keyCandidates.map((entry) => entry.char));
	const confusion = chars.confusions.find(
		(entry) =>
			entry.count >= 3 &&
			entry.expected !== entry.typed &&
			!flaggedChars.has(entry.expected),
	);
	if (confusion !== undefined) {
		weaknesses.push({
			id: `confusion-${confusion.expected}-${confusion.typed}`,
			kind: "confusion",
			severity: "medium",
			title: `"${displayChar(confusion.expected)}" is often replaced by "${displayChar(confusion.typed)}"`,
			evidence: `${confusion.count} occurrences in the captured tests.`,
			recommendation: `Drill "${displayChar(confusion.expected)}" versus "${displayChar(confusion.typed)}" pairs in custom text, 20 reps each.`,
		});
	}

	const slowBigram = chars.slowBigrams.find(
		(entry) => entry.samples >= 5 && entry.meanMs >= 250,
	);
	if (slowBigram !== undefined) {
		weaknesses.push({
			id: `bigram-${slowBigram.pair}`,
			kind: "bigram",
			severity: slowBigram.meanMs >= 400 ? "medium" : "low",
			title: `"${slowBigram.pair}" is slow to type`,
			evidence: `Average gap of ${slowBigram.meanMs}ms between those keys over ${slowBigram.samples} samples.`,
			recommendation: `Practise common words containing "${slowBigram.pair}" and aim for an even interval between the two keys.`,
		});
	}

	if (
		stats.validTests >= 15 &&
		stats.trend !== null &&
		stats.trend.direction === "flat" &&
		Math.abs(stats.trend.changeOverWindow) < 3
	) {
		weaknesses.push({
			id: "plateau",
			kind: "plateau",
			severity: "low",
			title: "Progress has plateaued",
			evidence: `${stats.validTests} tests with ${stats.trend.changeOverWindow.toFixed(1)} WPM net change and no clear direction.`,
			recommendation:
				"Change one variable for the next 10 tests: a harder word list, longer tests, or strict accuracy. Repeating the same easy configuration tends to flatten progress.",
		});
	}

	if (
		stats.tradeoffCorrelation !== null &&
		stats.tradeoffCorrelation <= -0.4 &&
		stats.validTests >= 10
	) {
		weaknesses.push({
			id: "tradeoff",
			kind: "tradeoff",
			severity: "medium",
			title: "Faster tests come with lower accuracy",
			evidence: `Correlation of ${stats.tradeoffCorrelation.toFixed(2)} between WPM and accuracy over ${stats.validTests} tests.`,
			recommendation:
				"Pace yourself at a speed where accuracy stays above 97%. Speed built on corrected errors is the more durable path.",
		});
	}

	if (chars.coverage.testsWithKeys === 0 && stats.validTests > 0) {
		weaknesses.push({
			id: "coverage",
			kind: "coverage",
			severity: "low",
			title: "No key-level data yet",
			evidence: `${stats.validTests} tests captured, but none carried keystroke detail.`,
			recommendation:
				"Keep the extension enabled while typing on Monkeytype. Key-level analysis needs the page's in-memory test log.",
		});
	}

	return weaknesses.sort(
		(a, b) =>
			SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
	);
}
