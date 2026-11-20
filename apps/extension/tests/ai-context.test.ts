import { describe, expect, it } from "vitest";
import { buildCoachData, estimateTokens, serializeContext } from "@/ai/context";
import { buildPreview, buildSuggestions } from "@/ai/prompt";
import { permissionOrigin, toServiceError } from "@/ai/providers";
import { AIServiceError } from "@/ai/types";
import { makeKeyStats, makeTest, TEST_START } from "./fixtures";

const DAY = 86_400_000;

function history(count: number) {
	return Array.from({ length: count }, (_, index) =>
		makeTest({
			id: `t${index}`,
			wpm: 70 + index,
			acc: 95 + index * 0.2,
			timestamp: TEST_START + index * DAY,
			charStats: [400, 10 + index, 0, 1],
			keyStats:
				index % 2 === 0
					? makeKeyStats({
							corrections: 5,
							chars: [
								{
									char: "r",
									attempts: 20,
									errors: 4,
									corrected: 3,
									missed: 0,
									confusion: [{ typed: "t", count: 3 }],
								},
								{
									char: "e",
									attempts: 60,
									errors: 1,
									corrected: 1,
									missed: 0,
									confusion: [],
								},
							],
							bigrams: [{ pair: "rt", samples: 4, meanMs: 340 }],
						})
					: null,
			fidelity: index % 2 === 0 ? "full" : "summary",
		}),
	);
}

describe("coach context", () => {
	it("serialises real numbers and nothing that identifies the user", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: true,
			includeRecentTests: true,
		});
		const text = serializeContext(data.context);

		expect(text).toContain("MONKEYTYPE DATA");
		expect(text).toContain("averages:");
		expect(text).toContain("problem keys:");
		expect(text).toContain('"r"');
		expect(text).toContain("slow pairs:");
		expect(text).not.toContain("fingerprint");
		expect(text).not.toContain("id:");
		expect(text).not.toContain("t0");
		expect(estimateTokens(text)).toBeGreaterThan(20);
	});

	it("omits key-level data when the user disables it", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: false,
			includeRecentTests: true,
		});
		expect(data.context.keyData).toBeNull();
		expect(serializeContext(data.context)).toContain("key-level data: not shared");
	});

	it("omits recent tests when disabled", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: true,
			includeRecentTests: false,
		});
		expect(data.context.recentTests).toEqual([]);
		expect(serializeContext(data.context)).not.toContain("recent tests");
	});

	it("includes the previous window for comparisons", () => {
		const data = buildCoachData(history(20), 10, {
			includeKeyData: true,
			includeRecentTests: true,
		});
		expect(data.context.previousWindow).not.toBeNull();
		expect(data.context.previousWindow?.tests).toBe(10);
		expect(serializeContext(data.context)).toContain("previous window");
	});

	it("states the window and coverage honestly", () => {
		const withExcluded = [
			...history(4),
			makeTest({
				id: "bailed",
				timestamp: TEST_START + 10 * DAY,
				excludedReason: "bailed out",
			}),
		];
		const data = buildCoachData(withExcluded, "all", {
			includeKeyData: true,
			includeRecentTests: true,
		});
		expect(data.context.counts).toEqual({ total: 5, valid: 4, excluded: 1 });
		expect(serializeContext(data.context)).toContain("1 excluded");
	});
});

describe("prompt", () => {
	it("embeds the data block and the grounding rules", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: true,
			includeRecentTests: true,
		});
		const preview = buildPreview(data.context, [
			{ role: "user", content: "why am I stuck?" },
		]);
		expect(preview.system).toContain("Never invent a statistic");
		expect(preview.system).toContain("MONKEYTYPE DATA");
		expect(preview.messages).toHaveLength(1);
		expect(preview.estimatedTokens).toBeGreaterThan(50);
		expect(preview.overBudget).toBe(false);
	});

	it("suggests a question about the actual weak key", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: true,
			includeRecentTests: true,
		});
		const suggestions = buildSuggestions(data);
		expect(suggestions.some((suggestion) => suggestion.includes('"r"'))).toBe(true);
		expect(suggestions.length).toBeLessThanOrEqual(6);
	});

	it("falls back to headline questions without key data", () => {
		const data = buildCoachData(history(10), 10, {
			includeKeyData: false,
			includeRecentTests: true,
		});
		const suggestions = buildSuggestions(data);
		expect(suggestions.some((suggestion) => suggestion.includes("headline"))).toBe(true);
	});
});

describe("provider helpers", () => {
	it("requests only the domain of the selected provider", () => {
		expect(permissionOrigin({ provider: "openai", baseURL: null })).toBe(
			"https://api.openai.com/*",
		);
		expect(
			permissionOrigin({ provider: "custom", baseURL: "https://models.example.com/v1" }),
		).toBe("https://models.example.com/*");
		expect(permissionOrigin({ provider: "custom", baseURL: "not a url" })).toBeNull();
	});

	it("maps provider failures to actionable errors", () => {
		expect(toServiceError({ statusCode: 401, message: "unauthorized" }).kind).toBe(
			"auth",
		);
		expect(toServiceError({ statusCode: 404, message: "not found" }).kind).toBe(
			"invalid_model",
		);
		expect(
			toServiceError({ statusCode: 429, responseBody: '{"retry_after":12}' })
				.retryAfterSeconds,
		).toBe(12);
		expect(toServiceError({ name: "AbortError", message: "aborted" }).kind).toBe(
			"aborted",
		);
		expect(toServiceError({ message: "Failed to fetch" }).kind).toBe("network");
		expect(toServiceError(new AIServiceError("no_key", "no key")).kind).toBe("no_key");
	});
});
