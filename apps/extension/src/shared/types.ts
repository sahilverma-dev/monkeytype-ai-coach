export type TestMode = "time" | "words" | "quote" | "zen" | "custom";

export type CaptureFidelity = "full" | "summary";

export type MetricsSource = "monkeytype" | "computed";

/** How the headline numbers were obtained, so the UI never pretends. */
export interface CapturedMetrics {
	wpm: number;
	rawWpm: number;
	acc: number;
	consistency: number | null;
	/** [correct, incorrect, extra, missed] */
	charStats: [number, number, number, number];
	testDuration: number;
	source: MetricsSource;
}

export interface CharConfusion {
	typed: string;
	count: number;
}

export interface CharErrorStat {
	char: string;
	/** Times this character was the expected character at a typed position. */
	attempts: number;
	/** Wrong characters typed at that position on the first attempt. */
	errors: number;
	/** Errors that were later fixed. */
	corrected: number;
	/** Characters never typed before the word was committed. */
	missed: number;
	confusion: CharConfusion[];
}

export interface BigramLatency {
	pair: string;
	samples: number;
	meanMs: number;
}

export interface KeyDerivedStats {
	chars: CharErrorStat[];
	bigrams: BigramLatency[];
	keystrokes: number;
	corrections: number;
	missedChars: number;
	extraChars: number;
}

export interface CapturedTest {
	id: string;
	fingerprint: string;
	capturedAt: number;
	/** Epoch ms of the test start when the event log could tell us. */
	startedAt: number | null;
	timestamp: number;
	mode: TestMode;
	mode2: string;
	difficulty: string;
	language: string;
	punctuation: boolean;
	numbers: boolean;
	funbox: string[];
	wpm: number;
	rawWpm: number;
	acc: number;
	consistency: number | null;
	charStats: [number, number, number, number];
	testDuration: number;
	bailedOut: boolean;
	fidelity: CaptureFidelity;
	metricsSource: MetricsSource;
	keyStats: KeyDerivedStats | null;
	/** Set when the test looks unrepresentative; excluded from averages by default. */
	excludedReason: string | null;
}

export type AnalysisWindow = 10 | 20 | 50 | 100 | "all";

export interface ThemeSnapshot {
	bg: string;
	main: string;
	sub: string;
	subAlt: string;
	text: string;
	error: string;
	errorExtra: string;
	roundness: string;
	font: string;
	sampledAt: number;
}
