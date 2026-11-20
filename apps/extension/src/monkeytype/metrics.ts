import type { CapturedMetrics } from "@/shared/types";
import type { EventLog } from "./event-log";
import { inputEvents, targetText } from "./event-log";

const UNIT_TO_WPM: Record<string, number> = {
	wpm: 1,
	cpm: 1 / 5,
	wps: 60,
	cps: 12,
	wph: 1 / 60,
	cph: 1 / 300,
};

function firstNumber(text: string): number | null {
	const match = /-?\d+(?:[.,]\d+)?/.exec(text);
	if (match === null) return null;
	const value = Number(match[0].replace(",", "."));
	return Number.isFinite(value) ? value : null;
}

function parseSpeed(text: string, unit: string): number | null {
	if (/infinite/i.test(text)) return 1000;
	const value = firstNumber(text);
	if (value === null) return null;
	const factor = UNIT_TO_WPM[unit] ?? 1;
	return value * factor;
}

function parseDuration(text: string): number | null {
	// "30s", "1:00", "1:23.45"
	const clock = /^(\d+):(\d+(?:[.,]\d+)?)/.exec(text.trim());
	if (clock !== null) {
		return Number(clock[1]) * 60 + Number((clock[2] ?? "0").replace(",", "."));
	}
	return firstNumber(text);
}

function parseCharStats(text: string): [number, number, number, number] | null {
	const parts = text
		.split("/")
		.map((part) => firstNumber(part))
		.filter((value): value is number => value !== null);
	if (parts.length !== 4) return null;
	return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/**
 * Reads the headline numbers straight from the results screen, so they match
 * exactly what the user saw. Formatting (units, decimals, "Infinite") is
 * normalised here; anything unreadable returns null and the caller falls back
 * to numbers computed from the event log.
 */
export function readResultMetrics(
	root: ParentNode,
	typingSpeedUnit: string,
): CapturedMetrics | null {
	const stats = root.querySelectorAll('[data-ui-element="resultStat"]');
	if (stats.length === 0) return null;

	const byLabel = new Map<string, string>();
	for (const element of stats) {
		const label = element.querySelector(".text-sub")?.textContent?.trim().toLowerCase();
		if (label === undefined || label === "") continue;
		const valueElement = element.querySelector('[data-ui-element="resultStatValue"]');
		const value =
			valueElement?.firstElementChild?.textContent ?? valueElement?.textContent;
		if (value === undefined) continue;
		if (!byLabel.has(label)) byLabel.set(label, value.trim());
	}

	const unit = typingSpeedUnit.toLowerCase();
	const speedText = byLabel.get(unit) ?? byLabel.get("wpm") ?? "";
	const accText = byLabel.get("acc") ?? "";
	const rawText = byLabel.get("raw") ?? "";
	const consistencyText = byLabel.get("consistency");
	const charsText = byLabel.get("characters");
	const timeText = byLabel.get("time") ?? "";

	const wpm = parseSpeed(speedText, unit);
	const acc = firstNumber(accText);
	const raw = rawText === "" ? wpm : parseSpeed(rawText, unit);
	const duration = parseDuration(timeText);
	const charStats = charsText === undefined ? null : parseCharStats(charsText);

	if (wpm === null || acc === null || raw === null || duration === null) return null;

	return {
		wpm,
		rawWpm: raw,
		acc,
		consistency: consistencyText === undefined ? null : firstNumber(consistencyText),
		charStats: charStats ?? [0, 0, 0, 0],
		testDuration: duration,
		source: "monkeytype",
	};
}

/**
 * Independent reconstruction from the event log, used when the results screen
 * cannot be read. Follows the standard definitions (net wpm from correctly typed
 * characters, raw from all typed characters, accuracy from keystrokes) and is
 * labelled as computed in the UI, never as Monkeytype's own number.
 */
export function computeMetrics(log: EventLog): CapturedMetrics | null {
	const words = targetText(log);
	const events = inputEvents(log);
	if (events.length === 0) return null;

	let correctInserts = 0;
	let incorrectInserts = 0;
	let extra = 0;
	let missed = 0;

	const lastValueByWord = new Map<number, string>();
	for (const event of events) {
		const data = event.data;
		if (data.wordIndex === undefined) continue;
		if (data.inputValue === undefined) continue;
		lastValueByWord.set(data.wordIndex, data.inputValue);
		if (data.inputType !== "insertText") continue;
		if (data.automatic === true) continue;
		if (data.commitsWord === true) continue;
		if (data.correct === true) correctInserts += 1;
		else if (data.correct === false) incorrectInserts += 1;
	}

	for (const [wordIndex, value] of lastValueByWord) {
		const target = words[wordIndex];
		if (target === undefined) continue;
		if (value.length > target.length) extra += value.length - target.length;
		for (let position = value.length; position < target.length; position++) {
			missed += 1;
		}
	}

	let startedAt: number | null = null;
	let endedAt: number | null = null;
	for (const event of log.events) {
		if (event.type !== "timer") continue;
		if (event.data.event === "start" && event.data.date !== undefined) {
			startedAt = event.data.date;
		}
		if (event.data.event === "end" && event.data.date !== undefined) {
			endedAt = event.data.date;
		}
	}

	const duration =
		startedAt !== null && endedAt !== null && endedAt > startedAt
			? (endedAt - startedAt) / 1000
			: null;
	if (duration === null || duration <= 0) return null;

	const minutes = duration / 60;
	const correct = correctInserts;
	const total = correctInserts + incorrectInserts;
	if (total === 0) return null;

	return {
		wpm: Math.round((correct / 5 / minutes) * 100) / 100,
		rawWpm: Math.round(((correct + incorrectInserts + extra) / 5 / minutes) * 100) / 100,
		acc: Math.round((correct / total) * 10000) / 100,
		consistency: null,
		charStats: [correct, incorrectInserts, extra, missed],
		testDuration: duration,
		source: "computed",
	};
}
