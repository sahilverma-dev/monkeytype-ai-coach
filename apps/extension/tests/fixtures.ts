import type { CapturedTest, KeyDerivedStats } from "@/shared/types";

export const TEST_START = 1_700_000_000_000;

export function makeTest(overrides: Partial<CapturedTest> = {}): CapturedTest {
	const base: CapturedTest = {
		id: `test-${Math.random().toString(36).slice(2)}`,
		fingerprint: "fingerprint",
		capturedAt: TEST_START,
		startedAt: TEST_START,
		timestamp: TEST_START,
		mode: "time",
		mode2: "30",
		difficulty: "normal",
		language: "english",
		punctuation: false,
		numbers: false,
		funbox: [],
		wpm: 80,
		rawWpm: 85,
		acc: 97,
		consistency: 80,
		charStats: [400, 10, 0, 2],
		testDuration: 30,
		bailedOut: false,
		fidelity: "full",
		metricsSource: "monkeytype",
		keyStats: null,
		excludedReason: null,
	};
	return { ...base, ...overrides };
}

export function makeKeyStats(overrides: Partial<KeyDerivedStats> = {}): KeyDerivedStats {
	return {
		chars: [],
		bigrams: [],
		keystrokes: 400,
		corrections: 10,
		missedChars: 2,
		extraChars: 0,
		...overrides,
	};
}

type RawEvent = Record<string, unknown> & { type: string };

export function inputEvent(args: {
	ms: number;
	wordIndex: number;
	charIndex: number;
	data: string;
	inputValue: string;
	inputType?: string;
	correct?: boolean;
	commitsWord?: boolean;
	lastWord?: boolean;
	automatic?: boolean;
}): RawEvent {
	return {
		type: "input",
		ms: args.ms,
		testMs: args.ms,
		data: {
			inputType: args.inputType ?? "insertText",
			data: args.data,
			wordIndex: args.wordIndex,
			charIndex: args.charIndex,
			inputValue: args.inputValue,
			correct: args.correct,
			commitsWord: args.commitsWord,
			lastWord: args.lastWord,
			automatic: args.automatic,
		},
	};
}

export function makeEventLog(args: {
	targetWords: string[];
	durationSeconds: number;
	events: RawEvent[];
	hasKorean?: boolean;
	bailedOut?: boolean;
}) {
	return {
		version: 1,
		events: [
			{
				type: "timer",
				ms: 0,
				testMs: 0,
				data: { event: "start", timer: 0, date: TEST_START },
			},
			...args.events,
			{
				type: "timer",
				ms: args.durationSeconds * 1000,
				testMs: args.durationSeconds * 1000,
				data: {
					event: "end",
					timer: args.durationSeconds,
					date: TEST_START + args.durationSeconds * 1000,
				},
			},
		],
		context: {
			targetWords: args.targetWords,
			mode: "words",
			mode2: "2",
			hasKorean: args.hasKorean ?? false,
			bailedOut: args.bailedOut ?? false,
		},
	};
}

/** A complete "hello world" test: one corrected mistake in "world". */
export function helloWorldLog() {
	return makeEventLog({
		targetWords: ["hello ", "world"],
		durationSeconds: 4,
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
				ms: 320,
				wordIndex: 0,
				charIndex: 1,
				data: "e",
				inputValue: "he",
				correct: true,
			}),
			inputEvent({
				ms: 430,
				wordIndex: 0,
				charIndex: 2,
				data: "l",
				inputValue: "hel",
				correct: true,
			}),
			inputEvent({
				ms: 520,
				wordIndex: 0,
				charIndex: 3,
				data: "l",
				inputValue: "hell",
				correct: true,
			}),
			inputEvent({
				ms: 610,
				wordIndex: 0,
				charIndex: 4,
				data: "o",
				inputValue: "hello",
				correct: true,
			}),
			inputEvent({
				ms: 700,
				wordIndex: 0,
				charIndex: 5,
				data: " ",
				inputValue: "hello",
				correct: true,
				commitsWord: true,
			}),
			inputEvent({
				ms: 900,
				wordIndex: 1,
				charIndex: 0,
				data: "w",
				inputValue: "w",
				correct: true,
			}),
			inputEvent({
				ms: 990,
				wordIndex: 1,
				charIndex: 1,
				data: "o",
				inputValue: "wo",
				correct: true,
			}),
			inputEvent({
				ms: 1_080,
				wordIndex: 1,
				charIndex: 2,
				data: "t",
				inputValue: "wot",
				correct: false,
			}),
			inputEvent({
				ms: 1_200,
				wordIndex: 1,
				charIndex: 2,
				data: "",
				inputType: "deleteContentBackward",
				inputValue: "wo",
			}),
			inputEvent({
				ms: 1_330,
				wordIndex: 1,
				charIndex: 2,
				data: "r",
				inputValue: "wor",
				correct: true,
			}),
			inputEvent({
				ms: 1_420,
				wordIndex: 1,
				charIndex: 3,
				data: "l",
				inputValue: "worl",
				correct: true,
			}),
			inputEvent({
				ms: 1_500,
				wordIndex: 1,
				charIndex: 4,
				data: "d",
				inputValue: "world",
				correct: true,
			}),
			inputEvent({
				ms: 1_600,
				wordIndex: 1,
				charIndex: 5,
				data: " ",
				inputValue: "world",
				correct: true,
				commitsWord: true,
				lastWord: true,
			}),
		],
	});
}

export function resultsScreenHtml(args: {
	speed?: string;
	raw?: string;
	acc?: string;
	consistency?: string;
	characters?: string;
	time?: string;
	unit?: string;
}): string {
	const unit = args.unit ?? "wpm";
	return `
	<div id="result">
		<div data-ui-element="resultStat">
			<div class="text-sub">${unit}</div>
			<div data-ui-element="resultStatValue">${args.speed ?? "102"}</div>
		</div>
		<div data-ui-element="resultStat">
			<div class="text-sub">acc</div>
			<div data-ui-element="resultStatValue">${args.acc ?? "97.5%"}</div>
		</div>
		<div data-ui-element="resultStat">
			<div class="text-sub">test type</div>
			<div data-ui-element="resultStatValue"><div>time 30</div></div>
		</div>
		<div data-ui-element="resultStat">
			<div class="text-sub">raw</div>
			<div data-ui-element="resultStatValue">${args.raw ?? "110"}</div>
		</div>
		<div data-ui-element="resultStat">
			<div class="text-sub">characters</div>
			<div data-ui-element="resultStatValue">${args.characters ?? "450/12/3/5"}</div>
		</div>
		<div data-ui-element="resultStat">
			<div class="text-sub">consistency</div>
			<div data-ui-element="resultStatValue">${args.consistency ?? "78%"}</div>
		</div>
		<div data-ui-element="resultStat">
			<div class="text-sub">time</div>
			<div data-ui-element="resultStatValue"><div>${args.time ?? "30s"}</div><div>0% afk</div></div>
		</div>
	</div>`;
}
