import type { CapturedTest } from "@/shared/types";
import { getApeKey } from "@/storage/ape-key";
import { addTests, getMeta, listTests, setMeta } from "@/storage/tests-repo";
import { fetchResultPage, type ImportSummary, mergeImported } from "./history-import";

const LAST_IMPORT_KEY = "lastHistoryImportAt";
const MAX_PAGES = 3;

/**
 * Incremental import: asks only for results at or after the last imported
 * timestamp, up to a few pages, and merges with what is already stored.
 */
export async function importHistory(): Promise<ImportSummary> {
	const apeKey = await getApeKey();
	if (apeKey === null) {
		throw new Error("Add a Monkeytype ApeKey first (account → ape keys).");
	}

	const since = (await getMeta<number>(LAST_IMPORT_KEY)) ?? null;
	const existing = await listTests();
	const collected: CapturedTest[] = [];
	const summary: ImportSummary = { fetched: 0, imported: 0, duplicates: 0, invalid: 0 };
	let newestTimestamp = since;
	let cursor = since;

	for (let page = 0; page < MAX_PAGES; page++) {
		let rows: unknown[];
		try {
			rows = await fetchResultPage(apeKey, cursor);
		} catch (error) {
			if (error instanceof TypeError) {
				throw new Error(
					"Could not reach api.monkeytype.com. Grant host access in settings (or check your connection) and retry.",
				);
			}
			throw error;
		}
		if (rows.length === 0) break;

		const merged = mergeImported(rows, [...existing, ...collected]);
		collected.push(...merged.tests);
		summary.fetched += merged.summary.fetched;
		summary.imported += merged.summary.imported;
		summary.duplicates += merged.summary.duplicates;
		summary.invalid += merged.summary.invalid;

		for (const row of rows) {
			const timestamp = (row as { timestamp?: unknown }).timestamp;
			if (
				typeof timestamp === "number" &&
				(newestTimestamp === null || timestamp > newestTimestamp)
			) {
				newestTimestamp = timestamp;
			}
		}

		// The endpoint caps a page at 1000; stop unless it was full and no new
		// timestamp was discovered (which would loop forever).
		if (rows.length < 1000) break;
		const pageNewest = rows
			.map((row) => (row as { timestamp?: unknown }).timestamp)
			.filter((value): value is number => typeof value === "number")
			.sort((a, b) => b - a)[0];
		if (pageNewest === undefined || pageNewest === cursor) break;
		cursor = pageNewest;
	}

	if (collected.length > 0) {
		await addTests(collected);
	}
	if (newestTimestamp !== null) {
		await setMeta(LAST_IMPORT_KEY, newestTimestamp);
	}

	return summary;
}
