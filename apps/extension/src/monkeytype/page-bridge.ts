import type { ThemeSnapshot } from "@/shared/types";
import {
	ISOLATED_SOURCE,
	isSnapshotResponse,
	requestId,
	type SnapshotResponse,
} from "./bridge-protocol";
import type { MonkeytypeConfigSnapshot } from "./capture";

/**
 * Asks the main-world script for the page's in-memory state.
 * The bridge is a debugging global, so failure is expected and survivable:
 * callers fall back to the results screen.
 */
export function requestSnapshot(timeoutMs = 1500): Promise<SnapshotResponse | null> {
	return new Promise((resolve) => {
		const id = requestId();
		let settled = false;

		const finish = (value: SnapshotResponse | null): void => {
			if (settled) return;
			settled = true;
			window.removeEventListener("message", onMessage);
			clearTimeout(timer);
			resolve(value);
		};

		const onMessage = (event: MessageEvent<unknown>): void => {
			if (event.source !== window) return;
			if (!isSnapshotResponse(event.data)) return;
			if (event.data.requestId !== id) return;
			finish(event.data);
		};

		const timer = setTimeout(() => finish(null), timeoutMs);
		window.addEventListener("message", onMessage);
		window.postMessage(
			{ source: ISOLATED_SOURCE, type: "REQUEST_TEST_SNAPSHOT", requestId: id },
			"*",
		);
	});
}

const CONFIG_DEFAULTS: MonkeytypeConfigSnapshot = {
	mode: "time",
	words: 0,
	time: 30,
	quoteLength: 0,
	difficulty: "normal",
	language: "english",
	punctuation: false,
	numbers: false,
	funbox: [],
	typingSpeedUnit: "wpm",
	theme: "serika_dark",
};

/** Config fallback when the main-world bridge is unavailable. */
export function readConfigFromStorage(storage: Storage): MonkeytypeConfigSnapshot | null {
	let raw: unknown;
	try {
		const text = storage.getItem("config");
		if (text === null) return null;
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof raw !== "object" || raw === null) return null;
	const config = { ...CONFIG_DEFAULTS, ...(raw as Record<string, unknown>) };
	const quoteLength = config.quoteLength;
	return {
		mode: typeof config.mode === "string" ? config.mode : CONFIG_DEFAULTS.mode,
		words: typeof config.words === "number" ? config.words : CONFIG_DEFAULTS.words,
		time: typeof config.time === "number" ? config.time : CONFIG_DEFAULTS.time,
		quoteLength:
			typeof quoteLength === "number" || Array.isArray(quoteLength)
				? (quoteLength as number | number[])
				: 0,
		difficulty: typeof config.difficulty === "string" ? config.difficulty : "normal",
		language: typeof config.language === "string" ? config.language : "english",
		punctuation: config.punctuation === true,
		numbers: config.numbers === true,
		funbox: Array.isArray(config.funbox) ? (config.funbox as string[]) : [],
		typingSpeedUnit:
			typeof config.typingSpeedUnit === "string" ? config.typingSpeedUnit : "wpm",
		theme: typeof config.theme === "string" ? config.theme : CONFIG_DEFAULTS.theme,
	};
}

export function sampleTheme(doc: Document = document): ThemeSnapshot | null {
	const style = doc.defaultView?.getComputedStyle(doc.documentElement);
	if (style === undefined) return null;
	const read = (name: string): string => style.getPropertyValue(name).trim();
	const bg = read("--bg-color");
	const main = read("--main-color");
	const text = read("--text-color");
	if (bg === "" || main === "" || text === "") return null;
	return {
		bg,
		main,
		sub: read("--sub-color"),
		subAlt: read("--sub-alt-color"),
		text,
		error: read("--error-color"),
		errorExtra: read("--error-extra-color"),
		roundness: read("--roundness") || "0.5rem",
		font: read("--font") || '"Roboto Mono", monospace',
		sampledAt: Date.now(),
	};
}
