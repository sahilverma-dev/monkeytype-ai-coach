import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addTest,
	clearTests,
	countTests,
	getDataVersion,
	listTests,
} from "@/storage/tests-repo";
import { makeTest, TEST_START } from "./fixtures";

describe("tests repository", () => {
	beforeEach(async () => {
		await clearTests();
	});

	it("stores a test and bumps the data version", async () => {
		const before = await getDataVersion();
		const result = await addTest(makeTest({ id: "a", timestamp: TEST_START }));
		expect(result).toBe("added");
		expect(await countTests()).toBe(1);
		expect(await getDataVersion()).toBe(before + 1);
	});

	it("is idempotent for the same id", async () => {
		const test = makeTest({ id: "same", timestamp: TEST_START });
		expect(await addTest(test)).toBe("added");
		expect(await addTest(test)).toBe("duplicate");
		expect(await countTests()).toBe(1);
	});

	it("lists newest first", async () => {
		await addTest(makeTest({ id: "old", timestamp: TEST_START }));
		await addTest(makeTest({ id: "new", timestamp: TEST_START + 1000 }));
		const tests = await listTests();
		expect(tests.map((test) => test.id)).toEqual(["new", "old"]);
	});

	it("clears everything and invalidates caches", async () => {
		await addTest(makeTest({ id: "x" }));
		const before = await getDataVersion();
		await clearTests();
		expect(await countTests()).toBe(0);
		expect(await getDataVersion()).toBe(before + 1);
	});
});
