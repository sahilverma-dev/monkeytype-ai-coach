import { describe, expect, it } from "vitest";
import { baseURLFor, createLanguageModel } from "@/ai/providers";
import { type AIConfig, AIServiceError } from "@/ai/types";

function config(overrides: Partial<AIConfig>): AIConfig {
	return {
		provider: "openai",
		model: "test-model",
		baseURL: null,
		temperature: 0.4,
		maxTokens: 400,
		...overrides,
	};
}

describe("createLanguageModel", () => {
	it("builds an OpenRouter model without a custom base URL", () => {
		// Regression: OpenRouter keeps baseURL null because it has a documented
		// default; requiring a custom endpoint made every OpenRouter request fail.
		const aiConfig = config({ provider: "openrouter", model: "openrouter/auto" });
		expect(baseURLFor(aiConfig)).toBe("https://openrouter.ai/api/v1");
		expect(() => createLanguageModel(aiConfig, "sk-or-test")).not.toThrow();
	});

	it("builds a model for each provider", () => {
		expect(() =>
			createLanguageModel(config({ provider: "openai" }), "key"),
		).not.toThrow();
		expect(() =>
			createLanguageModel(config({ provider: "anthropic" }), "key"),
		).not.toThrow();
		expect(() =>
			createLanguageModel(config({ provider: "google" }), "key"),
		).not.toThrow();
		expect(() =>
			createLanguageModel(
				config({ provider: "custom", baseURL: "https://example.com/v1" }),
				"key",
			),
		).not.toThrow();
	});

	it("requires an endpoint for the custom provider", () => {
		expect(() =>
			createLanguageModel(config({ provider: "custom", baseURL: null }), "key"),
		).toThrow(AIServiceError);
	});

	it("requires a model id", () => {
		expect(() => createLanguageModel(config({ model: "   " }), "key")).toThrow(
			AIServiceError,
		);
	});

	it("requires a key where the provider cannot work anonymously", () => {
		expect(() => createLanguageModel(config({ provider: "openrouter" }), "")).toThrow(
			/OpenRouter API key/,
		);
		expect(() =>
			createLanguageModel(
				config({ provider: "custom", baseURL: "https://example.com/v1" }),
				"",
			),
		).toThrow(/needs an API key/);
	});
});
