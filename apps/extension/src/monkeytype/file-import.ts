import { MIN_VALID_TEST_SECONDS } from "@/shared/constants";
import { hashString } from "@/shared/hash";
import { capturedTestSchema } from "@/shared/schema";
import type { CapturedTest } from "@/shared/types";
import { isTestMode } from "./capture";
import { isLikelyDuplicate, mapApiResult } from "./history-import";

export type ImportFileFormat = "json" | "csv";

export interface FileImportSummary {
	format: ImportFileFormat;
	total: number;
	imported: number;
	duplicates: number;
	invalid: number;
}

export interface FileImportResult {
	tests: CapturedTest[];
	summary: FileImportSummary;
}

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF and commas inside quotes. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	const source = text.replace(/^\uFEFF/, "");
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (inQuotes) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && source[index + 1] === "\n") index += 1;
			row.push(field);
			field = "";
			if (row.some((value) => value.trim() !== "")) rows.push(row);
			row = [];
		} else {
			field += char;
		}
	}
	row.push(field);
	if (row.some((value) => value.trim() !== "")) rows.push(row);
	return rows;
}

const HEADER_ALIASES: Record<string, string> = {
	wpm: "wpm",
	speed: "wpm",
	raw: "rawWpm",
	rawwpm: "rawWpm",
	acc: "acc",
	accuracy: "acc",
	consistency: "consistency",
	cons: "consistency",
	mode: "mode",
	mode2: "mode2",
	time: "testDuration",
	duration: "testDuration",
	seconds: "testDuration",
	timestamp: "timestamp",
	date: "timestamp",
	datetime: "timestamp",
	difficulty: "difficulty",
	language: "language",
	punctuation: "punctuation",
	numbers: "numbers",
	correct: "correct",
	incorrect: "incorrect",
	extra: "extra",
	missed: "missed",
	charstats: "charStats",
	chars: "charStats",
	bailedout: "bailedOut",
	bailed: "bailedOut",
};

const REQUIRED_COLUMNS = ["wpm", "acc", "testDuration"] as const;

function normalizeHeader(header: string): string | null {
	const key = header
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, "");
	return HEADER_ALIASES[key] ?? null;
}

function parseNumber(value: string | undefined): number | null {
	if (value === undefined) return null;
	const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
	if (cleaned === "") return null;
	const number = Number(cleaned);
	return Number.isFinite(number) ? number : null;
}

function parseBoolean(value: string | undefined): boolean {
	if (value === undefined) return false;
	return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

function parseTimestamp(value: string | undefined, fallback: number): number {
	if (value === undefined || value.trim() === "") return fallback;
	const trimmed = value.trim();
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric) && !/[a-z]/i.test(trimmed)) {
		if (numeric > 1e12) return Math.round(numeric);
		if (numeric > 1e9) return Math.round(numeric * 1000);
	}
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function parseCharStats(
	row: Record<string, string>,
): [number, number, number, number] | null {
	const joined = row.charStats;
	if (joined?.includes("/") === true) {
		const parts = joined.split("/").map((part) => parseNumber(part));
		if (parts.length === 4 && parts.every((part) => part !== null)) {
			return parts.map((part) => Math.max(0, Math.round(part ?? 0))) as [
				number,
				number,
				number,
				number,
			];
		}
	}
	const values = ["correct", "incorrect", "extra", "missed"].map((key) =>
		parseNumber(row[key]),
	);
	if (values.every((value) => value === null)) return null;
	return values.map((value) => Math.max(0, Math.round(value ?? 0))) as [
		number,
		number,
		number,
		number,
	];
}

/**
 * CSV columns (case-insensitive, `_`/`-`/space insensitive):
 * required: wpm, acc, duration
 * optional: timestamp/date, mode, mode2, raw, consistency, difficulty, language,
 *           punctuation, numbers, correct, incorrect, extra, missed, charStats ("c/i/e/m"),
 *           bailedOut
 */
function testFromCsvRow(
	row: Record<string, string>,
	filename: string,
	index: number,
	now: number,
): CapturedTest | null {
	const wpm = parseNumber(row.wpm);
	const acc = parseNumber(row.acc);
	const duration = parseNumber(row.testDuration);
	if (wpm === null || acc === null || duration === null) return null;
	if (wpm <= 0 || wpm > 1000 || acc < 0 || acc > 100 || duration <= 0) return null;

	const mode = (row.mode ?? "time").trim().toLowerCase();
	if (!isTestMode(mode)) return null;
	const mode2 = (row.mode2 ?? "").trim();
	const timestamp = parseTimestamp(row.timestamp, now - index * 1000);
	const bailedOut = parseBoolean(row.bailedOut);
	const charStats = parseCharStats(row) ?? [0, 0, 0, 0];
	const rawWpm = parseNumber(row.rawWpm) ?? wpm;
	const consistency = parseNumber(row.consistency);
	const id = `file-${hashString(`${filename}|${timestamp}|${mode}|${mode2}|${wpm}|${acc}|${index}`)}`;

	return {
		id,
		fingerprint: `file|${id}`,
		capturedAt: now,
		startedAt: null,
		timestamp,
		mode,
		mode2,
		difficulty: (row.difficulty ?? "normal").trim() || "normal",
		language: (row.language ?? "english").trim() || "english",
		punctuation: parseBoolean(row.punctuation),
		numbers: parseBoolean(row.numbers),
		funbox: [],
		wpm: Math.round(wpm * 100) / 100,
		rawWpm: Math.round(rawWpm * 100) / 100,
		acc: Math.round(acc * 100) / 100,
		consistency:
			consistency === null
				? null
				: Math.round(Math.min(100, Math.max(0, consistency)) * 100) / 100,
		charStats,
		testDuration: Math.round(duration * 100) / 100,
		bailedOut,
		fidelity: "summary",
		metricsSource: "file",
		keyStats: null,
		excludedReason: bailedOut
			? "bailed out"
			: duration < MIN_VALID_TEST_SECONDS
				? "too short"
				: null,
	};
}

function importCsv(
	text: string,
	filename: string,
	now: number,
): { candidates: CapturedTest[]; invalid: number; total: number } {
	const rows = parseCsv(text);
	const headerRow = rows[0];
	if (headerRow === undefined) return { candidates: [], invalid: 0, total: 0 };

	const columns = headerRow.map((header) => normalizeHeader(header));
	if (!REQUIRED_COLUMNS.every((column) => columns.includes(column))) {
		return {
			candidates: [],
			invalid: rows.length - 1,
			total: Math.max(0, rows.length - 1),
		};
	}

	const candidates: CapturedTest[] = [];
	let invalid = 0;
	for (const [index, values] of rows.slice(1).entries()) {
		const record: Record<string, string> = {};
		for (const [columnIndex, column] of columns.entries()) {
			if (column === null) continue;
			const value = values[columnIndex];
			if (value !== undefined) record[column] = value;
		}
		const test = testFromCsvRow(record, filename, index, now);
		if (test === null) {
			invalid += 1;
			continue;
		}
		candidates.push(test);
	}

	return { candidates, invalid, total: rows.length - 1 };
}

function importJson(
	text: string,
	filename: string,
	now: number,
): { candidates: CapturedTest[]; invalid: number; total: number } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { candidates: [], invalid: 0, total: 0 };
	}

	const list = Array.isArray(parsed)
		? parsed
		: typeof parsed === "object" &&
				parsed !== null &&
				Array.isArray((parsed as { tests?: unknown }).tests)
			? (parsed as { tests: unknown[] }).tests
			: [];

	const candidates: CapturedTest[] = [];
	let invalid = 0;

	for (const [index, item] of list.entries()) {
		const full = capturedTestSchema.safeParse(item);
		if (full.success) {
			candidates.push(full.data);
			continue;
		}
		const fromApi = mapApiResult(item, now);
		if (fromApi !== null) {
			candidates.push(fromApi);
			continue;
		}
		const record =
			typeof item === "object" && item !== null ? (item as Record<string, string>) : null;
		const fromRecord =
			record === null ? null : testFromCsvRow(record, filename, index, now);
		if (fromRecord !== null) {
			candidates.push(fromRecord);
			continue;
		}
		invalid += 1;
	}

	return { candidates, invalid, total: list.length };
}

/**
 * Imports a user-selected file: this extension's JSON export, a JSON array of
 * Monkeytype API results, or a CSV with the documented columns. Everything is
 * deduplicated against stored tests and validated before it is returned.
 */
export function importFromFile(
	text: string,
	filename: string,
	existing: CapturedTest[],
	now = Date.now(),
): FileImportResult {
	const looksJson = filename.toLowerCase().endsWith(".json") || /^\s*[[{]/.test(text);
	const format: ImportFileFormat = looksJson ? "json" : "csv";
	const seen = [...existing];

	if (format === "json") {
		const { candidates, invalid, total } = importJson(text, filename, now);
		return merge(candidates, format, total, invalid, seen);
	}

	const { candidates, invalid, total } = importCsv(text, filename, now);
	return merge(candidates, format, total, invalid, seen);
}

function merge(
	candidates: CapturedTest[],
	format: ImportFileFormat,
	total: number,
	invalid: number,
	seen: CapturedTest[],
): FileImportResult {
	const tests: CapturedTest[] = [];
	let duplicates = 0;
	for (const candidate of candidates) {
		if (isLikelyDuplicate(candidate, seen)) {
			duplicates += 1;
			continue;
		}
		seen.push(candidate);
		tests.push(candidate);
	}
	return {
		tests,
		summary: {
			format,
			total,
			imported: tests.length,
			duplicates,
			invalid,
		},
	};
}
