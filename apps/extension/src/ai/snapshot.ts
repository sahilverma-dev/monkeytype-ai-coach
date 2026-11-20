import { displayChar } from "@/analytics/weaknesses";
import type { AnalysisWindow } from "@/shared/types";
import type { CoachData } from "./context";

export interface SnapshotKey {
	char: string;
	errors: number;
	attempts: number;
	errorRate: number;
}

/**
 * A small, real-data view of the window shown beside the coach. Everything here
 * is computed locally from the same tests that feed the prompt; the model never
 * supplies these numbers.
 */
export interface CoachSnapshot {
	window: AnalysisWindow;
	totalTests: number;
	validTests: number;
	excludedTests: number;
	keyTests: number;
	wpmSeries: number[];
	accSeries: number[];
	stats: {
		wpm: number | null;
		acc: number | null;
		consistency: number | null;
		correctionRate: number | null;
	};
	topKeys: SnapshotKey[];
}

const MAX_POINTS = 30;

export function buildSnapshot(data: CoachData): CoachSnapshot {
	const valid = data.windowed
		.filter((test) => test.excludedReason === null)
		.sort((a, b) => a.timestamp - b.timestamp);
	const series = valid.slice(-MAX_POINTS);

	const topKeys = data.chars.chars
		.filter((entry) => entry.attempts >= 5 && entry.errors > 0)
		.sort((a, b) => b.errors - a.errors)
		.slice(0, 3)
		.map((entry) => ({
			char: displayChar(entry.char),
			errors: entry.errors,
			attempts: entry.attempts,
			errorRate: entry.errorRate,
		}));

	return {
		window: data.context.window,
		totalTests: data.stats.tests,
		validTests: data.stats.validTests,
		excludedTests: data.stats.excludedTests,
		keyTests: data.chars.coverage.testsWithKeys,
		wpmSeries: series.map((test) => Math.round(test.wpm * 10) / 10),
		accSeries: series.map((test) => Math.round(test.acc * 10) / 10),
		stats: {
			wpm: data.stats.wpm.average,
			acc: data.stats.acc.average,
			consistency: data.stats.consistency.average,
			correctionRate: data.stats.correctionRate,
		},
		topKeys,
	};
}
