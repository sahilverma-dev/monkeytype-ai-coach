import { MAX_PLAUSIBLE_LATENCY_MS } from "@/shared/constants";
import type { BigramLatency, CharErrorStat, KeyDerivedStats } from "@/shared/types";
import { type EventLog, inputEvents, targetText } from "./event-log";

/**
 * Key-level analysis derived from Monkeytype's in-memory event log.
 *
 * Input events carry the hidden input's value (`inputValue`) for the active word,
 * which lets us read the position of each keystroke without replaying text
 * mutations ourselves. Every wrong keystroke is recorded (matching Monkeytype's
 * own accuracy definition), and later fixes are counted separately.
 *
 * Deliberate limits:
 * - only committed words are finalised, so a timed test ending mid-word does not
 *   invent "missed" characters for a word the user never had to finish;
 * - IME composition (Korean etc.) is not disassembled, so key stats are skipped.
 */
export function deriveKeyStats(log: EventLog): KeyDerivedStats | null {
	if (log.context.hasKorean === true) return null;

	const words = targetText(log);
	const events = inputEvents(log);
	if (words.length === 0 || events.length === 0) return null;

	const chars = new Map<string, CharErrorStat>();
	const firstAttempt = new Map<string, boolean>();
	const correctedPositions = new Set<string>();
	const bigramSamples = new Map<string, number[]>();

	let keystrokes = 0;
	let corrections = 0;
	let missedChars = 0;
	let extraChars = 0;
	let lastInsert: { ms: number; char: string } | null = null;

	const statFor = (char: string): CharErrorStat => {
		let stat = chars.get(char);
		if (stat === undefined) {
			stat = { char, attempts: 0, errors: 0, corrected: 0, missed: 0, confusion: [] };
			chars.set(char, stat);
		}
		return stat;
	};

	const addConfusion = (stat: CharErrorStat, typed: string): void => {
		if (typed === "") return;
		const existing = stat.confusion.find((entry) => entry.typed === typed);
		if (existing === undefined) {
			stat.confusion.push({ typed, count: 1 });
		} else {
			existing.count += 1;
		}
	};

	const finalizeWord = (wordIndex: number, value: string): void => {
		const target = words[wordIndex];
		if (target === undefined) return;
		for (let position = value.length; position < target.length; position++) {
			const expected = target[position];
			if (expected === undefined) continue;
			const key = `${wordIndex}:${position}`;
			if (firstAttempt.has(key)) continue;
			const stat = statFor(expected);
			stat.attempts += 1;
			stat.missed += 1;
			missedChars += 1;
			firstAttempt.set(key, false);
		}
		if (value.length > target.length) {
			extraChars += value.length - target.length;
		}
	};

	for (const event of events) {
		const data = event.data;
		const wordIndex = data.wordIndex;
		if (wordIndex === undefined || wordIndex < 0) continue;

		const target = words[wordIndex] ?? "";
		const isInsert =
			data.inputType === "insertText" || data.inputType === "insertCompositionText";

		if (isInsert) {
			const value = data.inputValue ?? "";

			if (data.commitsWord === true) {
				finalizeWord(wordIndex, value);
				lastInsert = null;
				continue;
			}

			if (data.automatic === true) continue;

			keystrokes += 1;
			const typed = data.data ?? "";
			// Multi-character inserts come from composition/autofill; position maths
			// and per-character error attribution are not reliable there.
			if (typed.length !== 1) {
				lastInsert = null;
				continue;
			}

			const position = (data.charIndex ?? value.length - 1) as number;
			if (position < 0) continue;
			const expected = target[position];

			if (expected !== undefined) {
				const key = `${wordIndex}:${position}`;
				const stat = statFor(expected);
				const priorWasError = firstAttempt.get(key);
				const isError = data.correct === false || typed !== expected;

				if (priorWasError === undefined) {
					stat.attempts += 1;
					firstAttempt.set(key, isError);
					if (isError) {
						stat.errors += 1;
						addConfusion(stat, typed);
					}
				} else if (priorWasError && !isError) {
					if (!correctedPositions.has(key)) {
						correctedPositions.add(key);
						corrections += 1;
						stat.corrected += 1;
					}
				}

				if (lastInsert !== null) {
					const gap = event.ms - lastInsert.ms;
					if (gap > 0 && gap <= MAX_PLAUSIBLE_LATENCY_MS) {
						const pair = lastInsert.char + expected;
						const samples = bigramSamples.get(pair);
						if (samples === undefined) {
							bigramSamples.set(pair, [gap]);
						} else {
							samples.push(gap);
						}
					}
				}
				lastInsert = { ms: event.ms, char: expected };
			} else {
				lastInsert = null;
			}
		}
	}

	if (keystrokes === 0) return null;

	const charList = [...chars.values()]
		.map((stat) => ({
			...stat,
			confusion: stat.confusion
				.filter((entry) => entry.count > 0)
				.sort((a, b) => b.count - a.count)
				.slice(0, 8),
		}))
		.sort((a, b) => b.errors - a.errors || b.attempts - a.attempts);

	const bigrams: BigramLatency[] = [...bigramSamples.entries()]
		.map(([pair, samples]) => ({
			pair,
			samples: samples.length,
			meanMs: Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
		}))
		.sort((a, b) => b.meanMs - a.meanMs)
		.slice(0, 20);

	return {
		chars: charList,
		bigrams,
		keystrokes,
		corrections,
		missedChars,
		extraChars,
	};
}
