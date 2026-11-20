import { baseURLFor, PROVIDER_META, toServiceError } from "./providers";
import {
	type AIConfig,
	AIServiceError,
	type ModelOption,
	type ProviderId,
} from "./types";

const LIST_TIMEOUT_MS = 15_000;

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { ...init, signal: controller.signal });
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw {
				name: "ProviderHttpError",
				status: response.status,
				responseBody: body.slice(0, 500),
				message: `HTTP ${response.status}`,
			};
		}
		return await response.json();
	} finally {
		clearTimeout(timeout);
	}
}

function strings(values: unknown[]): string[] {
	return values.filter(
		(value): value is string => typeof value === "string" && value.trim() !== "",
	);
}

function dedupe(options: ModelOption[]): ModelOption[] {
	const seen = new Set<string>();
	const result: ModelOption[] = [];
	for (const option of options) {
		if (seen.has(option.id)) continue;
		seen.add(option.id);
		result.push(option);
	}
	return result.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Model lists come from the provider when it exposes them, so no model ids are
 * baked into the extension. Anthropic, OpenAI, Gemini and OpenRouter all have a
 * listing endpoint; a custom endpoint is attempted with the OpenAI shape and
 * failure is not fatal (the user can type the id).
 */
export async function listModels(
	config: AIConfig,
	apiKey: string,
): Promise<ModelOption[]> {
	const baseURL = baseURLFor(config);
	if (baseURL === null) {
		throw new AIServiceError("invalid_request", "Set the endpoint URL first.");
	}

	try {
		switch (config.provider) {
			case "openai":
			case "openrouter":
			case "custom": {
				const headers: Record<string, string> = {};
				if (apiKey !== "") headers.Authorization = `Bearer ${apiKey}`;
				if (config.provider === "openrouter")
					headers["X-Title"] = "Monkeytype AI Companion";
				const payload = (await fetchJson(`${baseURL}/models`, { headers })) as {
					data?: { id?: unknown; name?: unknown }[];
				};
				const rows = Array.isArray(payload.data) ? payload.data : [];
				return dedupe(
					rows
						.map((row) => ({
							id: typeof row.id === "string" ? row.id : "",
							label:
								typeof row.name === "string" && row.name !== ""
									? `${row.name} (${String(row.id)})`
									: String(row.id ?? ""),
						}))
						.filter((row) => row.id !== ""),
				);
			}
			case "anthropic": {
				const payload = (await fetchJson(`${baseURL}/models?limit=100`, {
					headers: {
						"x-api-key": apiKey,
						"anthropic-version": "2023-06-01",
						"anthropic-dangerous-direct-browser-access": "true",
					},
				})) as { data?: { id?: unknown; display_name?: unknown }[] };
				const rows = Array.isArray(payload.data) ? payload.data : [];
				return dedupe(
					rows
						.map((row) => ({
							id: typeof row.id === "string" ? row.id : "",
							label:
								typeof row.display_name === "string" && row.display_name !== ""
									? `${row.display_name} (${String(row.id)})`
									: String(row.id ?? ""),
						}))
						.filter((row) => row.id !== ""),
				);
			}
			case "google": {
				const payload = (await fetchJson(
					`${baseURL}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
				)) as {
					models?: {
						name?: unknown;
						displayName?: unknown;
						supportedGenerationMethods?: unknown;
					}[];
				};
				const rows = Array.isArray(payload.models) ? payload.models : [];
				return dedupe(
					rows
						.filter((row) => {
							const methods = Array.isArray(row.supportedGenerationMethods)
								? strings(row.supportedGenerationMethods)
								: [];
							return methods.length === 0 || methods.includes("generateContent");
						})
						.map((row) => {
							const name = typeof row.name === "string" ? row.name : "";
							const id = name.startsWith("models/") ? name.slice("models/".length) : name;
							return {
								id,
								label:
									typeof row.displayName === "string" && row.displayName !== ""
										? `${row.displayName} (${id})`
										: id,
							};
						})
						.filter((row) => row.id !== ""),
				);
			}
		}
		throw new AIServiceError(
			"unknown",
			`Model listing is not supported for ${PROVIDER_META[config.provider as ProviderId].label}.`,
		);
	} catch (error) {
		throw toServiceError(error);
	}
}
