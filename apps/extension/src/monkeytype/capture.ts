import { MIN_VALID_TEST_SECONDS } from "@/shared/constants";
import { hashString } from "@/shared/hash";
import type { CapturedMetrics, CapturedTest, TestMode } from "@/shared/types";
import { deriveKeyStats } from "./derive-keys";
import type { EventLog } from "./event-log";
import { testStartDate } from "./event-log";

export interface MonkeytypeConfigSnapshot {
	mode: string;
	words: number;
	time: number;
	quoteLength: number | number[];
	difficulty: string;
	language: string;
	punctuation: boolean;
	numbers: boolean;
	funbox: string[];
	typingSpeedUnit: string;
	theme: string;
}

const MODES: readonly TestMode[] = ["time", "words", "quote", "zen", "custom"];

export function isTestMode(value: string): value is TestMode {
	return (MODES as readonly string[]).includes(value);
}

function mode2For(config: MonkeytypeConfigSnapshot): string {
	switch (config.mode) {
		case "time":
			return String(config.time);
		case "words":
			return String(config.words);
		case "quote":
			return Array.isArray(config.quoteLength)
				? config.quoteLength.join(",")
				: String(config.quoteLength);
		case "zen":
			return "zen";
		default:
			return "custom";
	}
}

export type BuildTestResult =
	| { ok: true; test: CapturedTest }
	| { ok: false; reason: string };

/**
 * Turns a page snapshot into the compact record this extension stores.
 *
 * The event log is optional: if the page's in-memory log is unavailable the
 * results screen still gives headline metrics, stored with `summary` fidelity
 * instead of pretending key-level analysis exists.
 */
export function buildCapturedTest(args: {
	log: EventLog | null;
	config: MonkeytypeConfigSnapshot;
	metrics: CapturedMetrics | null;
	now?: number;
}): BuildTestResult {
	const { log, config, metrics } = args;
	const now = args.now ?? Date.now();

	if (!isTestMode(config.mode)) {
		return { ok: false, reason: `unsupported mode "${config.mode}"` };
	}
	if (metrics === null) {
		return { ok: false, reason: "no readable metrics" };
	}
	if (!Number.isFinite(metrics.wpm) || metrics.wpm <= 0 || metrics.wpm > 1000) {
		return { ok: false, reason: "implausible wpm" };
	}
	if (!Number.isFinite(metrics.acc) || metrics.acc < 0 || metrics.acc > 100) {
		return { ok: false, reason: "implausible accuracy" };
	}
	if (!Number.isFinite(metrics.testDuration) || metrics.testDuration <= 0) {
		return { ok: false, reason: "implausible duration" };
	}

	const startedAt = log === null ? null : testStartDate(log);
	const timestamp = startedAt ?? Math.round(now - metrics.testDuration * 1000);
	const bailedOut = log?.context.bailedOut === true;
	const keyStats = log === null ? null : deriveKeyStats(log);

	const fingerprint = [
		timestamp,
		config.mode,
		mode2For(config),
		config.difficulty,
		Math.round(metrics.wpm * 10),
		Math.round(metrics.acc * 10),
		hashString(log?.context.targetWords.join(" ") ?? "no-log"),
	].join("|");

	const excludedReason = bailedOut
		? "bailed out"
		: metrics.testDuration < MIN_VALID_TEST_SECONDS
			? "too short"
			: null;

	return {
		ok: true,
		test: {
			id: `${timestamp}-${hashString(fingerprint)}`,
			fingerprint,
			capturedAt: now,
			startedAt,
			timestamp,
			mode: config.mode,
			mode2: mode2For(config),
			difficulty: config.difficulty,
			language: config.language,
			punctuation: config.punctuation === true,
			numbers: config.numbers === true,
			funbox: Array.isArray(config.funbox) ? config.funbox : [],
			wpm: Math.round(metrics.wpm * 100) / 100,
			rawWpm: Math.round(metrics.rawWpm * 100) / 100,
			acc: Math.round(metrics.acc * 100) / 100,
			consistency:
				metrics.consistency === null ? null : Math.round(metrics.consistency * 100) / 100,
			charStats: metrics.charStats,
			testDuration: Math.round(metrics.testDuration * 100) / 100,
			bailedOut,
			fidelity: keyStats === null ? "summary" : "full",
			metricsSource: metrics.source,
			keyStats,
			excludedReason,
		},
	};
}
