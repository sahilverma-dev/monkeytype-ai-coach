import type { SnapshotPayload } from "./bridge-protocol";
import type { MonkeytypeConfigSnapshot } from "./capture";

export interface MonkeytypeGlobals {
	lastEventLog?: () => unknown;
	config?: Record<string, unknown>;
}

export function readConfigFromWindow(win: Window): MonkeytypeConfigSnapshot | null {
	const raw = (win as unknown as MonkeytypeGlobals).config;
	if (raw === undefined || raw === null) return null;
	const read = (key: string): unknown => raw[key];
	const mode = read("mode");
	if (typeof mode !== "string") return null;
	const words = read("words");
	const time = read("time");
	const quoteLength = read("quoteLength");
	const funbox = read("funbox");
	const text = (key: string, fallback: string): string =>
		typeof read(key) === "string" ? (read(key) as string) : fallback;
	return {
		mode,
		words: typeof words === "number" ? words : 0,
		time: typeof time === "number" ? time : 0,
		quoteLength:
			typeof quoteLength === "number" || Array.isArray(quoteLength)
				? (quoteLength as number | number[])
				: 0,
		difficulty: text("difficulty", "normal"),
		language: text("language", "english"),
		punctuation: read("punctuation") === true,
		numbers: read("numbers") === true,
		funbox: Array.isArray(funbox) ? (funbox as string[]) : [],
		typingSpeedUnit: text("typingSpeedUnit", "wpm"),
		theme: text("theme", "serika_dark"),
	};
}

/**
 * Built inside the page's own JavaScript context: the event log and config live
 * in memory only, and are not reachable from an isolated content script.
 */
export function buildSnapshotPayload(win: Window, doc: Document): SnapshotPayload {
	const globals = win as unknown as MonkeytypeGlobals;
	let eventLog: unknown = null;
	if (typeof globals.lastEventLog === "function") {
		eventLog = globals.lastEventLog();
	}
	return {
		eventLog,
		config: readConfigFromWindow(win),
		resultVisible: doc.querySelector("#result") !== null,
		href: win.location.href,
		capturedAt: Date.now(),
	};
}
