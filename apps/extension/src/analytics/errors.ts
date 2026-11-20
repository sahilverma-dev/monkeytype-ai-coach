import type { BigramLatency, CapturedTest } from "@/shared/types";
import { round } from "./stats";

export interface CharAggregate {
	char: string;
	attempts: number;
	errors: number;
	missed: number;
	corrected: number;
	errorRate: number;
	confusion: { typed: string; count: number }[];
}

export interface CharAnalysis {
	chars: CharAggregate[];
	totals: {
		attempts: number;
		errors: number;
		corrected: number;
		missed: number;
		extra: number;
		keystrokes: number;
	};
	/** Overall first-attempt error rate across every analysed character. */
	overallErrorRate: number | null;
	confusions: { expected: string; typed: string; count: number }[];
	slowBigrams: BigramLatency[];
	coverage: { testsTotal: number; testsWithKeys: number };
}

interface Aggregate {
	char: string;
	attempts: number;
	errors: number;
	missed: number;
	corrected: number;
	confusion: Map<string, number>;
}

/**
 * Aggregates the per-character data captured from event logs.
 *
 * Only tests with key-level data contribute; the coverage block reports how
 * many tests that was, so the UI can say "based on 8 tests" instead of implying
 * it analysed everything.
 */
export function analyzeChars(tests: CapturedTest[]): CharAnalysis {
	const aggregates = new Map<string, Aggregate>();
	const confusions = new Map<string, number>();
	const bigramTotals = new Map<string, { samples: number; weighted: number }>();
	let attempts = 0;
	let errors = 0;
	let corrected = 0;
	let missed = 0;
	let extra = 0;
	let keystrokes = 0;
	let testsWithKeys = 0;

	for (const test of tests) {
		if (test.excludedReason !== null) continue;
		const keyStats = test.keyStats;
		if (keyStats === null) continue;
		testsWithKeys += 1;
		keystrokes += keyStats.keystrokes;
		extra += keyStats.extraChars;

		for (const stat of keyStats.chars) {
			let aggregate = aggregates.get(stat.char);
			if (aggregate === undefined) {
				aggregate = {
					char: stat.char,
					attempts: 0,
					errors: 0,
					missed: 0,
					corrected: 0,
					confusion: new Map(),
				};
				aggregates.set(stat.char, aggregate);
			}
			aggregate.attempts += stat.attempts;
			aggregate.errors += stat.errors;
			aggregate.missed += stat.missed;
			aggregate.corrected += stat.corrected;
			for (const entry of stat.confusion) {
				aggregate.confusion.set(
					entry.typed,
					(aggregate.confusion.get(entry.typed) ?? 0) + entry.count,
				);
				const key = `${stat.char}\u0000${entry.typed}`;
				confusions.set(key, (confusions.get(key) ?? 0) + entry.count);
			}
			attempts += stat.attempts;
			errors += stat.errors;
			corrected += stat.corrected;
			missed += stat.missed;
		}

		for (const bigram of keyStats.bigrams) {
			const current = bigramTotals.get(bigram.pair) ?? { samples: 0, weighted: 0 };
			current.samples += bigram.samples;
			current.weighted += bigram.meanMs * bigram.samples;
			bigramTotals.set(bigram.pair, current);
		}
	}

	const chars: CharAggregate[] = [...aggregates.values()]
		.map((aggregate) => ({
			char: aggregate.char,
			attempts: aggregate.attempts,
			errors: aggregate.errors,
			missed: aggregate.missed,
			corrected: aggregate.corrected,
			errorRate:
				aggregate.attempts === 0
					? 0
					: round((aggregate.errors / aggregate.attempts) * 100),
			confusion: [...aggregate.confusion.entries()]
				.map(([typed, count]) => ({ typed, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 5),
		}))
		.sort((a, b) => b.errors - a.errors || b.attempts - a.attempts);

	const slowBigrams: BigramLatency[] = [...bigramTotals.entries()]
		.filter(([, value]) => value.samples >= 3)
		.map(([pair, value]) => ({
			pair,
			samples: value.samples,
			meanMs: Math.round(value.weighted / value.samples),
		}))
		.sort((a, b) => b.meanMs - a.meanMs)
		.slice(0, 15);

	return {
		chars,
		totals: { attempts, errors, corrected, missed, extra, keystrokes },
		overallErrorRate: attempts === 0 ? null : round((errors / attempts) * 100),
		confusions: [...confusions.entries()]
			.map(([key, count]) => {
				const [expected = "", typed = ""] = key.split("\u0000");
				return { expected, typed, count };
			})
			.sort((a, b) => b.count - a.count)
			.slice(0, 10),
		slowBigrams,
		coverage: { testsTotal: tests.length, testsWithKeys },
	};
}
