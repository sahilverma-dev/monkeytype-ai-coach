import { analyzeChars, type CharAnalysis } from "@/analytics/errors";
import {
	computeWindowStats,
	selectTestsForWindow,
	type WindowStats,
} from "@/analytics/overview";
import { detectWeaknesses, displayChar, type Weakness } from "@/analytics/weaknesses";
import type { AnalysisWindow, CapturedTest } from "@/shared/types";

/**
 * The only shape of typing data that ever leaves the browser.
 *
 * Aggregates and short recent summaries only: no target words, no raw keystroke
 * logs, no account data, no browsing information. Built deterministically so the
 * same window always produces the same prompt and the user can preview it.
 */
export interface CoachContext {
	window: AnalysisWindow;
	counts: { total: number; valid: number; excluded: number };
	dates: { first: string | null; last: string | null };
	averages: {
		wpm: number | null;
		rawWpm: number | null;
		acc: number | null;
		consistency: number | null;
		bestWpm: number | null;
		medianWpm: number | null;
	};
	chars: {
		correct: number;
		incorrect: number;
		extra: number;
		missed: number;
		errorRate: number | null;
		correctionRate: number | null;
	};
	trend: { direction: string; changeOverWindow: number } | null;
	recentVsEarlier: {
		recentWpm: number | null;
		earlierWpm: number | null;
		changePct: number | null;
	};
	previousWindow: {
		tests: number;
		averageWpm: number | null;
		averageAcc: number | null;
	} | null;
	keyData: {
		testsWithKeys: number;
		testsTotal: number;
		overallErrorRate: number | null;
		problemKeys: {
			char: string;
			errors: number;
			attempts: number;
			errorRate: number;
			typedAs: string | null;
		}[];
		confusions: { expected: string; typed: string; count: number }[];
		slowPairs: { pair: string; meanMs: number; samples: number }[];
	} | null;
	modes: {
		label: string;
		tests: number;
		averageWpm: number | null;
		averageAcc: number | null;
	}[];
	recentTests: {
		date: string;
		mode: string;
		wpm: number;
		acc: number;
		consistency: number | null;
		durationSeconds: number;
	}[];
}

export interface CoachData {
	stats: WindowStats;
	chars: CharAnalysis;
	weaknesses: Weakness[];
	context: CoachContext;
}

function isoDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function round(value: number | null, digits = 1): number | null {
	if (value === null) return null;
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

export function buildCoachData(
	tests: CapturedTest[],
	window: AnalysisWindow,
	options: { includeKeyData: boolean; includeRecentTests: boolean },
): CoachData {
	const windowed = selectTestsForWindow(tests, window);
	const stats = computeWindowStats(tests, window);
	const chars = analyzeChars(windowed);
	const weaknesses = detectWeaknesses(stats, chars);

	const size = window === "all" ? 0 : window;
	const previousSlice = size === 0 ? [] : tests.slice(size, size * 2);
	const previousStats =
		previousSlice.length >= 3 ? computeWindowStats(previousSlice, "all") : null;

	const problemKeys = chars.chars
		.filter((entry) => entry.errors > 0 && entry.attempts >= 5)
		.slice(0, 6)
		.map((entry) => ({
			char: displayChar(entry.char),
			errors: entry.errors,
			attempts: entry.attempts,
			errorRate: entry.errorRate,
			typedAs:
				entry.confusion[0] === undefined ? null : displayChar(entry.confusion[0].typed),
		}));

	const context: CoachContext = {
		window,
		counts: {
			total: stats.tests,
			valid: stats.validTests,
			excluded: stats.excludedTests,
		},
		dates: {
			first: stats.firstTimestamp === null ? null : isoDate(stats.firstTimestamp),
			last: stats.lastTimestamp === null ? null : isoDate(stats.lastTimestamp),
		},
		averages: {
			wpm: round(stats.wpm.average),
			rawWpm: round(stats.rawWpm.average),
			acc: round(stats.acc.average),
			consistency: round(stats.consistency.average),
			bestWpm: round(stats.wpm.best),
			medianWpm: round(stats.wpm.median),
		},
		chars: {
			correct: stats.charTotals.correct,
			incorrect: stats.charTotals.incorrect,
			extra: stats.charTotals.extra,
			missed: stats.charTotals.missed,
			errorRate: round(stats.errorRate),
			correctionRate: round(stats.correctionRate),
		},
		trend:
			stats.trend === null
				? null
				: {
						direction: stats.trend.direction,
						changeOverWindow: round(stats.trend.changeOverWindow) ?? 0,
					},
		recentVsEarlier: {
			recentWpm: round(stats.recentVsEarlier.recentWpm),
			earlierWpm: round(stats.recentVsEarlier.earlierWpm),
			changePct: round(stats.recentVsEarlier.changePct),
		},
		previousWindow:
			previousStats === null
				? null
				: {
						tests: previousStats.validTests,
						averageWpm: round(previousStats.wpm.average),
						averageAcc: round(previousStats.acc.average),
					},
		keyData: options.includeKeyData
			? {
					testsWithKeys: chars.coverage.testsWithKeys,
					testsTotal: chars.coverage.testsTotal,
					overallErrorRate: round(chars.overallErrorRate),
					problemKeys,
					confusions: chars.confusions
						.filter((entry) => entry.expected !== entry.typed)
						.slice(0, 6)
						.map((entry) => ({
							expected: displayChar(entry.expected),
							typed: displayChar(entry.typed),
							count: entry.count,
						})),
					slowPairs: chars.slowBigrams
						.filter((entry) => entry.samples >= 3)
						.slice(0, 6)
						.map((entry) => ({
							pair: entry.pair,
							meanMs: entry.meanMs,
							samples: entry.samples,
						})),
				}
			: null,
		modes: stats.byMode.slice(0, 5).map((mode) => ({
			label: mode.key,
			tests: mode.tests,
			averageWpm: round(mode.averageWpm),
			averageAcc: round(mode.averageAcc),
		})),
		recentTests: options.includeRecentTests
			? windowed
					.filter((test) => test.excludedReason === null)
					.slice(0, 8)
					.map((test) => ({
						date: isoDate(test.timestamp),
						mode: `${test.mode} ${test.mode === "zen" || test.mode === "custom" ? "" : test.mode2}`.trim(),
						wpm: round(test.wpm) ?? 0,
						acc: round(test.acc) ?? 0,
						consistency: round(test.consistency),
						durationSeconds: round(test.testDuration) ?? 0,
					}))
			: [],
	};

	return { stats, chars, weaknesses, context };
}

function line(label: string, value: string | number | null): string {
	if (value === null || value === "") return `${label}: unknown`;
	return `${label}: ${value}`;
}

/** Compact, stable text form used inside the system prompt. */
export function serializeContext(context: CoachContext): string {
	const lines: string[] = [];
	lines.push("MONKEYTYPE DATA (computed locally from the user's captured tests)");
	lines.push(
		line(
			"window",
			context.window === "all"
				? `${context.counts.valid} valid tests (all available, ${context.counts.excluded} excluded)`
				: `last ${context.window} tests (${context.counts.valid} valid, ${context.counts.excluded} excluded)`,
		),
	);
	if (context.dates.first !== null && context.dates.last !== null) {
		lines.push(`dates: ${context.dates.first} to ${context.dates.last}`);
	}
	lines.push(
		`averages: ${context.averages.wpm ?? "unknown"} wpm (median ${context.averages.medianWpm ?? "unknown"}, best ${context.averages.bestWpm ?? "unknown"}), ${context.averages.rawWpm ?? "unknown"} raw, ${context.averages.acc ?? "unknown"}% accuracy, ${context.averages.consistency ?? "unknown"}% consistency`,
	);
	lines.push(
		`characters: ${context.chars.correct} correct, ${context.chars.incorrect} incorrect, ${context.chars.extra} extra, ${context.chars.missed} missed (error rate ${context.chars.errorRate ?? "unknown"}%)`,
	);
	if (context.chars.correctionRate !== null) {
		lines.push(
			`corrections: ${context.chars.correctionRate}% of keystrokes were fixed later`,
		);
	}
	lines.push(
		context.trend === null
			? "trend: not enough tests"
			: `trend: ${context.trend.direction}, ${context.trend.changeOverWindow} wpm across the window`,
	);
	if (context.recentVsEarlier.changePct !== null) {
		lines.push(
			`recent vs earlier third: ${context.recentVsEarlier.changePct}% (${context.recentVsEarlier.recentWpm} vs ${context.recentVsEarlier.earlierWpm} wpm)`,
		);
	}
	if (context.previousWindow !== null) {
		lines.push(
			`previous window: ${context.previousWindow.tests} tests, ${context.previousWindow.averageWpm} wpm, ${context.previousWindow.averageAcc}% accuracy`,
		);
	}
	if (context.modes.length > 0) {
		lines.push(
			`modes: ${context.modes
				.map(
					(mode) =>
						`${mode.label} (${mode.tests} tests, ${mode.averageWpm} wpm, ${mode.averageAcc}%)`,
				)
				.join("; ")}`,
		);
	}
	if (context.keyData === null) {
		lines.push("key-level data: not shared (disabled by the user)");
	} else if (context.keyData.testsWithKeys === 0) {
		lines.push("key-level data: none captured yet");
	} else {
		lines.push(
			`key-level data: ${context.keyData.testsWithKeys} of ${context.keyData.testsTotal} tests, overall key error rate ${context.keyData.overallErrorRate ?? "unknown"}%`,
		);
		if (context.keyData.problemKeys.length > 0) {
			lines.push(
				`problem keys: ${context.keyData.problemKeys
					.map(
						(entry) =>
							`"${entry.char}" ${entry.errors} errors in ${entry.attempts} attempts (${entry.errorRate}%)${entry.typedAs === null ? "" : `, often typed as "${entry.typedAs}"`}`,
					)
					.join("; ")}`,
			);
		}
		if (context.keyData.confusions.length > 0) {
			lines.push(
				`confusions: ${context.keyData.confusions
					.map((entry) => `"${entry.expected}" typed as "${entry.typed}" ${entry.count}x`)
					.join("; ")}`,
			);
		}
		if (context.keyData.slowPairs.length > 0) {
			lines.push(
				`slow pairs: ${context.keyData.slowPairs
					.map((entry) => `"${entry.pair}" ${entry.meanMs}ms (${entry.samples} samples)`)
					.join("; ")}`,
			);
		}
	}
	if (context.recentTests.length > 0) {
		lines.push(
			`recent tests (newest first): ${context.recentTests
				.map(
					(test) =>
						`${test.date} ${test.mode} ${test.wpm}wpm ${test.acc}%${test.consistency === null ? "" : ` ${test.consistency}% cons`} ${test.durationSeconds}s`,
				)
				.join(" | ")}`,
		);
	}
	lines.push("END OF DATA");
	return lines.join("\n");
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
