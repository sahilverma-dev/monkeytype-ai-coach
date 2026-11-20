import { z } from "zod";
import { MIN_VALID_TEST_SECONDS } from "@/shared/constants";
import type { CapturedTest, TestMode } from "@/shared/types";
import { isTestMode } from "./capture";

/**
 * Imports past results through Monkeytype's documented API.
 *
 * Results are no longer kept in page storage, so the only way to see tests from
 * before the extension was installed is `GET /results` with the user's own
 * ApeKey. That endpoint returns headline metrics only: no chart and no
 * keystroke data, which is why imported tests are stored as `summary` fidelity.
 */
export const apiResultSchema = z.object({
	_id: z.string().min(1),
	timestamp: z.number().int().nonnegative(),
	wpm: z.number().nonnegative(),
	rawWpm: z.number().nonnegative(),
	acc: z.number().min(0).max(100),
	consistency: z.number().min(0).max(100).nullable().optional(),
	charStats: z
		.tuple([z.number(), z.number(), z.number(), z.number()])
		.nullable()
		.optional(),
	mode: z.string(),
	mode2: z.union([z.string(), z.number()]),
	testDuration: z.number().positive(),
	difficulty: z.string().optional(),
	language: z.string().optional(),
	punctuation: z.boolean().optional(),
	numbers: z.boolean().optional(),
	funbox: z.array(z.string()).optional(),
	bailedOut: z.boolean().optional(),
});

export type ApiResult = z.infer<typeof apiResultSchema>;

function intCharStats(stats: ApiResult["charStats"]): [number, number, number, number] {
	if (stats === null || stats === undefined) return [0, 0, 0, 0];
	return stats.map((value) => Math.max(0, Math.round(value))) as [
		number,
		number,
		number,
		number,
	];
}

export function mapApiResult(raw: unknown, now = Date.now()): CapturedTest | null {
	const parsed = apiResultSchema.safeParse(raw);
	if (!parsed.success) return null;
	const result = parsed.data;
	if (!isTestMode(result.mode)) return null;
	if (result.wpm <= 0 || result.wpm > 1000) return null;
	if (result.testDuration <= 0) return null;

	const bailedOut = result.bailedOut === true;
	const mode = result.mode as TestMode;
	return {
		id: `api-${result._id}`,
		fingerprint: `api|${result._id}`,
		capturedAt: now,
		startedAt: null,
		timestamp: result.timestamp,
		mode,
		mode2: String(result.mode2),
		difficulty: result.difficulty ?? "normal",
		language: result.language ?? "english",
		punctuation: result.punctuation === true,
		numbers: result.numbers === true,
		funbox: result.funbox ?? [],
		wpm: Math.round(result.wpm * 100) / 100,
		rawWpm: Math.round(result.rawWpm * 100) / 100,
		acc: Math.round(result.acc * 100) / 100,
		consistency:
			result.consistency === null || result.consistency === undefined
				? null
				: Math.round(result.consistency * 100) / 100,
		charStats: intCharStats(result.charStats),
		testDuration: Math.round(result.testDuration * 100) / 100,
		bailedOut,
		fidelity: "summary",
		metricsSource: "monkeytype",
		keyStats: null,
		excludedReason: bailedOut
			? "bailed out"
			: result.testDuration < MIN_VALID_TEST_SECONDS
				? "too short"
				: null,
	};
}

const DUPLICATE_WINDOW_MS = 2_000;

/**
 * A live capture and its API row usually differ by a second or two, so ids alone
 * are not enough to avoid importing a test the extension already recorded.
 */
export function isLikelyDuplicate(
	candidate: CapturedTest,
	existing: CapturedTest[],
): boolean {
	return existing.some(
		(test) =>
			test.id === candidate.id ||
			(Math.abs(test.timestamp - candidate.timestamp) <= DUPLICATE_WINDOW_MS &&
				test.mode === candidate.mode &&
				test.mode2 === candidate.mode2 &&
				Math.abs(test.wpm - candidate.wpm) < 0.5),
	);
}

export interface ImportSummary {
	fetched: number;
	imported: number;
	duplicates: number;
	invalid: number;
}

const API_ORIGIN = "https://api.monkeytype.com";

export class MonkeytypeApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "MonkeytypeApiError";
		this.status = status;
	}
}

export async function fetchResultPage(
	apeKey: string,
	onOrAfterTimestamp: number | null,
): Promise<unknown[]> {
	const url = new URL("/results", API_ORIGIN);
	url.searchParams.set("limit", "1000");
	if (onOrAfterTimestamp !== null) {
		url.searchParams.set("onOrAfterTimestamp", String(onOrAfterTimestamp));
	}
	const response = await fetch(url, {
		headers: { Authorization: `ApeKey ${apeKey.trim()}` },
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		const detail = body.slice(0, 200);
		if (response.status === 470 || response.status === 471 || response.status === 472) {
			throw new MonkeytypeApiError(
				"The ApeKey was rejected. Create a new one in Monkeytype → account → ape keys.",
				response.status,
			);
		}
		if (response.status === 429 || response.status === 479) {
			throw new MonkeytypeApiError(
				"Monkeytype's API rate limit was hit (30 imports per day). Try again later.",
				response.status,
			);
		}
		throw new MonkeytypeApiError(
			`Monkeytype API error ${response.status}${detail === "" ? "" : `: ${detail}`}`,
			response.status,
		);
	}
	const payload = (await response.json()) as { data?: unknown };
	return Array.isArray(payload.data) ? payload.data : [];
}

export function mergeImported(
	rows: unknown[],
	existing: CapturedTest[],
	now = Date.now(),
): { tests: CapturedTest[]; summary: ImportSummary } {
	const summary: ImportSummary = {
		fetched: rows.length,
		imported: 0,
		duplicates: 0,
		invalid: 0,
	};
	const imported: CapturedTest[] = [];
	const seen = [...existing];

	for (const row of rows) {
		const candidate = mapApiResult(row, now);
		if (candidate === null) {
			summary.invalid += 1;
			continue;
		}
		if (isLikelyDuplicate(candidate, seen)) {
			summary.duplicates += 1;
			continue;
		}
		seen.push(candidate);
		imported.push(candidate);
		summary.imported += 1;
	}

	// Stable id guard: the same API id can only be imported once.
	const byId = new Map(imported.map((test) => [test.id, test]));
	return { tests: [...byId.values()], summary };
}
