import { MAX_STORED_TESTS } from "@/shared/constants";
import type { CapturedTest } from "@/shared/types";
import { clear, count, get, getAll, put, remove } from "./idb";

const TESTS_STORE = "tests";
const META_STORE = "meta";

interface MetaRecord {
	key: string;
	value: unknown;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
	const record = await get<MetaRecord>(META_STORE, key);
	return record?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
	await put(META_STORE, { key, value });
}

/** Bumped on every write so pages can invalidate cached analytics and AI insights. */
export async function getDataVersion(): Promise<number> {
	return (await getMeta<number>("dataVersion")) ?? 0;
}

export async function bumpDataVersion(): Promise<number> {
	const next = (await getDataVersion()) + 1;
	await setMeta("dataVersion", next);
	await setMeta("lastWriteAt", Date.now());
	return next;
}

export async function addTest(test: CapturedTest): Promise<"added" | "duplicate"> {
	const existing = await get<CapturedTest>(TESTS_STORE, test.id);
	if (existing !== undefined) return "duplicate";
	await put(TESTS_STORE, test);
	await bumpDataVersion();
	await prune();
	return "added";
}

async function prune(): Promise<void> {
	const total = await count(TESTS_STORE);
	if (total <= MAX_STORED_TESTS) return;
	const tests = await listTests();
	const excess = tests.slice(MAX_STORED_TESTS);
	for (const test of excess) await remove(TESTS_STORE, test.id);
}

/** Newest first. */
export async function listTests(): Promise<CapturedTest[]> {
	const tests = await getAll<CapturedTest>(TESTS_STORE);
	return tests.sort((a, b) => b.timestamp - a.timestamp);
}

export async function countTests(): Promise<number> {
	return count(TESTS_STORE);
}

export async function clearTests(): Promise<void> {
	await clear(TESTS_STORE);
	await bumpDataVersion();
}

export async function findTestByFingerprint(
	fingerprint: string,
): Promise<CapturedTest | undefined> {
	const tests = await listTests();
	return tests.find((test) => test.fingerprint === fingerprint);
}
