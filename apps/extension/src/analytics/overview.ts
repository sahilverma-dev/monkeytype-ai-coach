import type { AnalysisWindow, CapturedTest } from "@/shared/types";
import {
	coefficientOfVariation,
	linearSlope,
	mean,
	median,
	pearsonCorrelation,
	round,
	standardDeviation,
	sum,
} from "./stats";

export interface MetricSummary {
	average: number | null;
	median: number | null;
	best: number | null;
	worst: number | null;
	sd: number | null;
	cv: number | null;
}

export interface ModeSummary {
	key: string;
	mode: string;
	mode2: string;
	tests: number;
	averageWpm: number | null;
	averageAcc: number | null;
	bestWpm: number | null;
}

export interface WindowStats {
	requestedWindow: AnalysisWindow;
	tests: number;
	validTests: number;
	excludedTests: number;
	firstTimestamp: number | null;
	lastTimestamp: number | null;
	wpm: MetricSummary;
	rawWpm: MetricSummary;
	acc: MetricSummary;
	consistency: MetricSummary;
	charTotals: { correct: number; incorrect: number; extra: number; missed: number };
	errorRate: number | null;
	/** Share of keystrokes that were fixed later, from tests with key-level data. */
	correctionRate: number | null;
	trend: {
		slopePerTest: number;
		changeOverWindow: number;
		direction: "up" | "down" | "flat";
	} | null;
	tradeoffCorrelation: number | null;
	byMode: ModeSummary[];
	pbs: { key: string; wpm: number; acc: number; timestamp: number }[];
	coverage: { full: number; summary: number };
	/** Average of the most recent third vs the oldest third, i.e. "now vs then". */
	recentVsEarlier: {
		recentWpm: number | null;
		earlierWpm: number | null;
		changePct: number | null;
	};
}

function summarize(values: readonly number[]): MetricSummary {
	const average = mean(values);
	const middle = median(values);
	const sd = standardDeviation(values);
	const cv = coefficientOfVariation(values);
	return {
		average: average === null ? null : round(average),
		median: middle === null ? null : round(middle),
		best: values.length === 0 ? null : Math.max(...values),
		worst: values.length === 0 ? null : Math.min(...values),
		sd: sd === null ? null : round(sd),
		cv: cv === null ? null : round(cv),
	};
}

function selectWindow(tests: CapturedTest[], window: AnalysisWindow): CapturedTest[] {
	const newestFirst = [...tests].sort((a, b) => b.timestamp - a.timestamp);
	if (window === "all") return newestFirst;
	return newestFirst.slice(0, window);
}

function isUsable(test: CapturedTest): boolean {
	return test.excludedReason === null;
}

/** Tests in the analysis window, newest first. Exposed so every view uses one definition. */
export function selectTestsForWindow(
	tests: CapturedTest[],
	window: AnalysisWindow,
): CapturedTest[] {
	return selectWindow(tests, window);
}

/**
 * Deterministic statistics over real captured tests.
 *
 * Excluded tests (bailed out, too short) are counted but kept out of averages so
 * one abandoned test cannot move the numbers. Everything here is arithmetic;
 * interpretation is the AI layer's job.
 */
export function computeWindowStats(
	tests: CapturedTest[],
	window: AnalysisWindow,
): WindowStats {
	const selected = selectWindow(tests, window);
	const valid = selected.filter(isUsable);
	const chronological = [...valid].sort((a, b) => a.timestamp - b.timestamp);

	const wpms = chronological.map((test) => test.wpm);
	const raws = chronological.map((test) => test.rawWpm);
	const accs = chronological.map((test) => test.acc);
	const consistencies = chronological
		.map((test) => test.consistency)
		.filter((value): value is number => value !== null);

	const correct = sum(chronological.map((test) => test.charStats[0]));
	const incorrect = sum(chronological.map((test) => test.charStats[1]));
	const extra = sum(chronological.map((test) => test.charStats[2]));
	const missed = sum(chronological.map((test) => test.charStats[3]));
	const typedTotal = correct + incorrect + extra + missed;

	const points = chronological.map((test, index) => ({ x: index, y: test.wpm }));
	const slope = linearSlope(points);
	const tradeoff = pearsonCorrelation(wpms, accs);

	const modeMap = new Map<string, CapturedTest[]>();
	for (const test of chronological) {
		const key = `${test.mode} ${test.mode2}`;
		const bucket = modeMap.get(key);
		if (bucket === undefined) modeMap.set(key, [test]);
		else bucket.push(test);
	}

	const byMode: ModeSummary[] = [...modeMap.entries()]
		.map(([key, bucket]) => ({
			key,
			mode: bucket[0]?.mode ?? "",
			mode2: bucket[0]?.mode2 ?? "",
			tests: bucket.length,
			averageWpm: round(mean(bucket.map((test) => test.wpm)) ?? 0),
			averageAcc: round(mean(bucket.map((test) => test.acc)) ?? 0),
			bestWpm: round(Math.max(...bucket.map((test) => test.wpm))),
		}))
		.sort((a, b) => b.tests - a.tests);

	const pbMap = new Map<string, CapturedTest>();
	for (const test of chronological) {
		const key = `${test.mode} ${test.mode2}`;
		const current = pbMap.get(key);
		if (current === undefined || test.wpm > current.wpm) pbMap.set(key, test);
	}
	const pbs = [...pbMap.entries()]
		.map(([key, test]) => ({
			key,
			wpm: test.wpm,
			acc: test.acc,
			timestamp: test.timestamp,
		}))
		.sort((a, b) => b.wpm - a.wpm)
		.slice(0, 6);

	const withKeys = valid.filter((test) => test.keyStats !== null);
	const keyKeystrokes = sum(withKeys.map((test) => test.keyStats?.keystrokes ?? 0));
	const keyCorrections = sum(withKeys.map((test) => test.keyStats?.corrections ?? 0));

	const third = Math.floor(chronological.length / 3);
	const earlier = third > 0 ? chronological.slice(0, third).map((test) => test.wpm) : [];
	const recent =
		third > 0
			? chronological.slice(chronological.length - third).map((test) => test.wpm)
			: [];
	const earlierWpm = mean(earlier);
	const recentWpm = mean(recent);

	return {
		requestedWindow: window,
		tests: selected.length,
		validTests: valid.length,
		excludedTests: selected.length - valid.length,
		firstTimestamp: chronological[0]?.timestamp ?? null,
		lastTimestamp: chronological[chronological.length - 1]?.timestamp ?? null,
		wpm: summarize(wpms),
		rawWpm: summarize(raws),
		acc: summarize(accs),
		consistency: summarize(consistencies),
		charTotals: { correct, incorrect, extra, missed },
		errorRate:
			typedTotal === 0 ? null : round(((incorrect + extra + missed) / typedTotal) * 100),
		correctionRate:
			keyKeystrokes === 0 ? null : round((keyCorrections / keyKeystrokes) * 100),
		trend:
			slope === null || chronological.length < 3
				? null
				: {
						slopePerTest: round(slope),
						changeOverWindow: round(slope * (chronological.length - 1)),
						direction: slope > 0.15 ? "up" : slope < -0.15 ? "down" : "flat",
					},
		tradeoffCorrelation: tradeoff === null ? null : round(tradeoff),
		byMode,
		pbs,
		coverage: {
			full: valid.filter((test) => test.fidelity === "full").length,
			summary: valid.filter((test) => test.fidelity === "summary").length,
		},
		recentVsEarlier: {
			recentWpm: recentWpm === null ? null : round(recentWpm),
			earlierWpm: earlierWpm === null ? null : round(earlierWpm),
			changePct:
				earlierWpm === null || recentWpm === null || earlierWpm === 0
					? null
					: round(((recentWpm - earlierWpm) / earlierWpm) * 100),
		},
	};
}
