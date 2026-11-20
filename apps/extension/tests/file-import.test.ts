import { describe, expect, it } from "vitest";
import { importFromFile, parseCsv } from "@/monkeytype/file-import";
import { makeTest, TEST_START } from "./fixtures";

const CSV_HEADER =
	"wpm,acc,duration,timestamp,mode,mode2,raw,consistency,correct,incorrect,extra,missed";

function csv(...rows: string[]): string {
	return [CSV_HEADER, ...rows].join("\n");
}

describe("parseCsv", () => {
	it("handles quotes, escaped quotes, commas and CRLF", () => {
		const rows = parseCsv('a,b\r\n"x,y",2\r\n"say ""hi""",3\r\n');
		expect(rows).toEqual([
			["a", "b"],
			["x,y", "2"],
			['say "hi"', "3"],
		]);
	});

	it("ignores blank lines and a BOM", () => {
		const rows = parseCsv("\uFEFFa,b\n\n1,2\n");
		expect(rows).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});
});

describe("CSV import", () => {
	it("imports rows with the documented columns", () => {
		const text = csv(
			"80,96.5,30,2026-01-01T00:00:00Z,time,30,85,80,400,10,0,2",
			"70,95,30,1700000000,words,50,75,70,350,12,1,1",
		);
		const { tests, summary } = importFromFile(text, "history.csv", []);
		expect(summary.format).toBe("csv");
		expect(summary.imported).toBe(2);
		expect(summary.invalid).toBe(0);

		const first = tests[0];
		expect(first?.wpm).toBe(80);
		expect(first?.acc).toBe(96.5);
		expect(first?.rawWpm).toBe(85);
		expect(first?.consistency).toBe(80);
		expect(first?.charStats).toEqual([400, 10, 0, 2]);
		expect(first?.metricsSource).toBe("file");
		expect(first?.fidelity).toBe("summary");
		expect(first?.timestamp).toBe(Date.parse("2026-01-01T00:00:00Z"));

		// epoch seconds are converted to milliseconds
		expect(tests[1]?.timestamp).toBe(1_700_000_000_000);
	});

	it("counts rows that cannot be read instead of guessing", () => {
		const text = csv(
			"80,96.5,30,2026-01-01T00:00:00Z,time,30",
			",95,30,2026-01-02T00:00:00Z,time,30",
			"70,not-a-number,30,2026-01-03T00:00:00Z,time,30",
			"60,94,,2026-01-04T00:00:00Z,time,30",
			"50,93,30,2026-01-05T00:00:00Z,unknown,30",
		);
		const { summary } = importFromFile(text, "history.csv", []);
		expect(summary.imported).toBe(1);
		expect(summary.invalid).toBe(4);
	});

	it("rejects a file without the required columns", () => {
		const { tests, summary } = importFromFile(
			"wpm,date\n80,2026-01-01\n",
			"history.csv",
			[],
		);
		expect(tests).toHaveLength(0);
		expect(summary.invalid).toBe(1);
	});

	it("deduplicates against existing tests", () => {
		const text = csv("80,96.5,30,2026-01-01T00:00:00Z,time,30");
		const first = importFromFile(text, "history.csv", []);
		expect(first.summary.imported).toBe(1);

		const second = importFromFile(text, "history.csv", first.tests);
		expect(second.summary.imported).toBe(0);
		expect(second.summary.duplicates).toBe(1);
	});
});

describe("JSON import", () => {
	it("round-trips this extension's export", () => {
		const test = makeTest({ id: "exported", timestamp: TEST_START, wpm: 80 });
		const text = JSON.stringify({ tests: [test] });
		const { tests, summary } = importFromFile(text, "export.json", []);
		expect(summary.format).toBe("json");
		expect(summary.imported).toBe(1);
		expect(tests[0]?.id).toBe("exported");
		expect(tests[0]?.wpm).toBe(80);
	});

	it("accepts a bare array of captured tests", () => {
		const test = makeTest({ id: "bare", timestamp: TEST_START });
		const { tests } = importFromFile(JSON.stringify([test]), "export.json", []);
		expect(tests).toHaveLength(1);
		expect(tests[0]?.id).toBe("bare");
	});

	it("accepts Monkeytype API results", () => {
		const text = JSON.stringify([
			{
				_id: "api-row",
				timestamp: TEST_START,
				wpm: 83,
				rawWpm: 88,
				acc: 97,
				mode: "time",
				mode2: "30",
				testDuration: 30,
			},
		]);
		const { tests, summary } = importFromFile(text, "api.json", []);
		expect(summary.imported).toBe(1);
		expect(tests[0]?.id).toBe("api-api-row");
		expect(tests[0]?.fidelity).toBe("summary");
	});

	it("reports unreadable JSON without inventing rows", () => {
		const { tests, summary } = importFromFile("not json at all", "broken.json", []);
		expect(tests).toHaveLength(0);
		expect(summary.imported).toBe(0);
	});

	it("skips items that match nothing", () => {
		const { tests, summary } = importFromFile(
			JSON.stringify([{ hello: "world" }]),
			"x.json",
			[],
		);
		expect(tests).toHaveLength(0);
		expect(summary.invalid).toBe(1);
	});
});
