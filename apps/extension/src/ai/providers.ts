import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
	type AIConfig,
	AIServiceError,
	type ProviderId,
	type ProviderMeta,
} from "./types";

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
	openai: {
		id: "openai",
		label: "OpenAI",
		origin: "https://api.openai.com/*",
		defaultBaseURL: "https://api.openai.com/v1",
		keyHint: "sk-…",
		allowsCustomBaseURL: false,
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic Claude",
		origin: "https://api.anthropic.com/*",
		defaultBaseURL: "https://api.anthropic.com/v1",
		keyHint: "sk-ant-…",
		allowsCustomBaseURL: false,
	},
	google: {
		id: "google",
		label: "Google Gemini",
		origin: "https://generativelanguage.googleapis.com/*",
		defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta",
		keyHint: "AIza…",
		allowsCustomBaseURL: false,
	},
	openrouter: {
		id: "openrouter",
		label: "OpenRouter",
		origin: "https://openrouter.ai/*",
		defaultBaseURL: "https://openrouter.ai/api/v1",
		keyHint: "sk-or-…",
		allowsCustomBaseURL: false,
	},
	custom: {
		id: "custom",
		label: "Custom OpenAI-compatible",
		origin: "",
		defaultBaseURL: null,
		keyHint: "key, if the endpoint needs one",
		allowsCustomBaseURL: true,
	},
};

/** Origin pattern to request as an optional host permission, or null if unusable. */
export function permissionOrigin(
	config: Pick<AIConfig, "provider" | "baseURL">,
): string | null {
	const meta = PROVIDER_META[config.provider];
	if (config.provider !== "custom") return meta.origin;
	if (config.baseURL === null || config.baseURL === "") return null;
	try {
		const url = new URL(config.baseURL);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return `${url.origin}/*`;
	} catch {
		return null;
	}
}

export function baseURLFor(config: AIConfig): string | null {
	if (config.provider === "custom") return config.baseURL;
	return PROVIDER_META[config.provider].defaultBaseURL;
}

function openAICompatibleOptions(config: AIConfig, apiKey: string) {
	// OpenRouter has a documented default base URL, so `config.baseURL` is null
	// for it; only the custom provider requires a user-supplied endpoint.
	const baseURL = baseURLFor(config) ?? "";
	if (baseURL === "") {
		throw new AIServiceError(
			"invalid_request",
			"Set the endpoint URL for the custom provider.",
		);
	}
	if (config.provider === "openrouter") {
		return {
			name: "openrouter",
			baseURL,
			apiKey,
			headers: {
				"X-Title": "Monkeytype AI Companion",
				"HTTP-Referer": "https://monkeytype.com/",
			},
		};
	}
	return { name: "custom-openai", baseURL, apiKey };
}

/**
 * One place where a provider SDK client is created. Model ids always come from
 * user configuration, never from constants scattered through the app.
 */
export function createLanguageModel(config: AIConfig, apiKey: string): LanguageModel {
	if (config.model.trim() === "") {
		throw new AIServiceError("no_model", "Choose a model in settings first.");
	}
	const model = config.model.trim();

	switch (config.provider) {
		case "openai": {
			const provider = createOpenAI({ apiKey });
			return provider.chat(model);
		}
		case "anthropic": {
			const provider = createAnthropic({
				apiKey,
				headers: { "anthropic-dangerous-direct-browser-access": "true" },
			});
			return provider(model);
		}
		case "google": {
			const provider = createGoogle({ apiKey });
			return provider(model);
		}
		case "openrouter":
		case "custom": {
			if (apiKey === "") {
				throw new AIServiceError(
					"no_key",
					config.provider === "custom"
						? "This endpoint needs an API key. Add one in settings."
						: "Add an OpenRouter API key in settings.",
				);
			}
			const provider = createOpenAICompatible(openAICompatibleOptions(config, apiKey));
			return provider(model);
		}
		default: {
			const exhaustive: never = config.provider;
			throw new AIServiceError("unknown", `Unsupported provider: ${String(exhaustive)}`);
		}
	}
}

interface ProviderErrorShape {
	name?: string;
	message?: string;
	statusCode?: number;
	status?: number;
	responseBody?: string;
	isRetryable?: boolean;
}

function parseRetryAfter(body: string | undefined): number | null {
	if (body === undefined) return null;
	const match = /"retry_after"\s*:\s*(\d+)/.exec(body);
	return match === null ? null : Number(match[1]);
}

/** Maps SDK/provider failures onto a small set of actionable errors. */
export function toServiceError(error: unknown): AIServiceError {
	if (error instanceof AIServiceError) return error;
	const candidate = error as ProviderErrorShape;
	const name = candidate.name ?? "";
	const message = candidate.message ?? String(error);
	const status = candidate.statusCode ?? candidate.status ?? null;

	if (name === "AbortError" || name === "TimeoutError" || /aborted/i.test(message)) {
		return new AIServiceError("aborted", "Request cancelled.", { cause: error });
	}

	if (status === 401 || status === 403) {
		return new AIServiceError(
			"auth",
			`The provider rejected the API key (${status}). Check the key and that it is allowed to use this model.`,
			{ status, cause: error },
		);
	}
	if (status === 404) {
		return new AIServiceError(
			"invalid_model",
			"That model or endpoint was not found. Load the model list or check the model id.",
			{ status, cause: error },
		);
	}
	if (status === 429) {
		return new AIServiceError(
			"rate_limit",
			"The provider is rate limiting requests. Wait a moment and retry.",
			{
				status,
				retryAfterSeconds: parseRetryAfter(candidate.responseBody),
				cause: error,
			},
		);
	}
	if (status === 400 || status === 422) {
		const detail = candidate.responseBody?.slice(0, 300);
		return new AIServiceError(
			"invalid_request",
			`The provider rejected the request${detail === undefined ? "." : `: ${detail}`}`,
			{ status, cause: error },
		);
	}
	if (status !== null && status >= 500) {
		return new AIServiceError(
			"network",
			`The provider had a server error (${status}). Try again shortly.`,
			{
				status,
				cause: error,
			},
		);
	}
	if (/failed to fetch|networkerror|load failed/i.test(message)) {
		return new AIServiceError(
			"network",
			"Could not reach the provider. Check the endpoint and connection; if the provider blocks browser requests, grant host access in settings.",
			{ cause: error },
		);
	}
	return new AIServiceError("unknown", message === "" ? "The request failed." : message, {
		status,
		cause: error,
	});
}
