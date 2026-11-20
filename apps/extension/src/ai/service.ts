import { generateText, type ModelMessage, streamText } from "ai";
import { browser } from "wxt/browser";
import {
	getConversation,
	newId,
	type StoredConversation,
	type StoredMessage,
	saveConversation,
} from "@/storage/conversations";
import { getApiKey } from "@/storage/credentials";
import { getSettings, type Settings } from "@/storage/settings";
import { getDataVersion, listTests } from "@/storage/tests-repo";
import { buildCoachData, type CoachData } from "./context";
import { buildSystemPrompt, CONNECTION_TEST_PROMPT } from "./prompt";
import { createLanguageModel, toServiceError } from "./providers";
import { AIServiceError, type ChatMessage, type GenerateResult } from "./types";

const HISTORY_LIMIT = 12;

export interface CoachRequest {
	conversationId: string | null;
	text: string;
}

export interface CoachReply {
	conversation: StoredConversation;
	message: StoredMessage;
	usage: GenerateResult["usage"];
}

export async function loadCoachData(): Promise<CoachData> {
	const settings = await getSettings();
	const tests = await listTests();
	return buildCoachData(tests, settings.analysisWindow, {
		includeKeyData: settings.ai.includeKeyData,
		includeRecentTests: settings.ai.includeRecentTests,
	});
}

async function requireCredentials(): Promise<{ config: Settings["ai"]; apiKey: string }> {
	const settings = await getSettings();
	const apiKey = await getApiKey(settings.ai.provider);
	if (apiKey === null) {
		throw new AIServiceError(
			"no_key",
			`No API key saved for ${settings.ai.provider}. Add one in settings.`,
		);
	}
	return { config: settings.ai, apiKey };
}

function toModelMessages(messages: StoredMessage[]): ModelMessage[] {
	return messages.slice(-HISTORY_LIMIT).map((message) => ({
		role: message.role,
		content: message.content,
	}));
}

function titleFor(text: string): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}…`;
}

/**
 * One coach reply. The context is rebuilt for every message, so a follow-up
 * question sees the latest captured tests without the user re-explaining anything.
 */
export async function streamCoachReply(
	request: CoachRequest,
	options: { onChunk?: (chunk: string) => void; signal?: AbortSignal } = {},
): Promise<CoachReply> {
	const { config, apiKey } = await requireCredentials();
	if (config.model.trim() === "") {
		throw new AIServiceError("no_model", "Choose a model in settings first.");
	}

	const data = await loadCoachData();
	if (data.context.counts.valid === 0) {
		throw new AIServiceError(
			"invalid_request",
			"No captured tests yet. Complete a test on Monkeytype first.",
		);
	}

	const now = Date.now();
	const conversation: StoredConversation = (request.conversationId === null
		? null
		: await getConversation(request.conversationId)) ?? {
		id: newId("conv"),
		title: titleFor(request.text),
		createdAt: now,
		updatedAt: now,
		messages: [],
	};

	const userMessage: StoredMessage = {
		id: newId("msg"),
		role: "user",
		content: request.text.trim(),
		createdAt: now,
	};
	conversation.messages = [...conversation.messages, userMessage];
	conversation.updatedAt = now;
	await saveConversation(conversation);

	const system = buildSystemPrompt(data.context);
	const model = createLanguageModel(config, apiKey);

	let text = "";
	let usage: GenerateResult["usage"] = null;

	try {
		const result = streamText({
			model,
			system,
			messages: toModelMessages(conversation.messages),
			temperature: config.temperature,
			maxOutputTokens: config.maxTokens,
			maxRetries: 1,
			abortSignal: options.signal,
		});

		for await (const chunk of result.textStream) {
			text += chunk;
			options.onChunk?.(chunk);
		}

		usage = await Promise.resolve(result.usage)
			.then((value) => ({
				inputTokens: value.inputTokens ?? null,
				outputTokens: value.outputTokens ?? null,
			}))
			.catch(() => null);
		await Promise.resolve(result.finishReason).catch(() => null);
	} catch (error) {
		const serviceError = toServiceError(error);
		// Keep whatever the user already saw, marked incomplete, instead of losing it.
		if (text.trim() !== "") {
			const partial: StoredMessage = {
				id: newId("msg"),
				role: "assistant",
				content: text,
				createdAt: Date.now(),
				provider: config.provider,
				model: config.model,
			};
			conversation.messages = [...conversation.messages, partial];
			conversation.updatedAt = Date.now();
			await saveConversation(conversation);
		}
		throw serviceError;
	}

	if (text.trim() === "") {
		throw new AIServiceError(
			"unknown",
			"The model returned an empty response. Try another model.",
		);
	}

	const message: StoredMessage = {
		id: newId("msg"),
		role: "assistant",
		content: text,
		createdAt: Date.now(),
		provider: config.provider,
		model: config.model,
	};
	conversation.messages = [...conversation.messages, message];
	conversation.updatedAt = Date.now();
	await saveConversation(conversation);

	return { conversation, message, usage };
}

export interface ConnectionTestResult {
	latencyMs: number;
	model: string;
	provider: string;
	answer: string;
}

/** Smallest possible real request, so "test connection" proves auth + model + network. */
export async function testConnection(): Promise<ConnectionTestResult> {
	const { config, apiKey } = await requireCredentials();
	if (config.model.trim() === "") {
		throw new AIServiceError("no_model", "Choose a model before testing.");
	}
	const model = createLanguageModel(config, apiKey);
	const startedAt = Date.now();
	try {
		const result = await generateText({
			model,
			prompt: CONNECTION_TEST_PROMPT,
			maxOutputTokens: 16,
			temperature: 0,
			maxRetries: 0,
			abortSignal: AbortSignal.timeout(20_000),
		});
		return {
			latencyMs: Date.now() - startedAt,
			model: config.model,
			provider: config.provider,
			answer: result.text.trim().slice(0, 120),
		};
	} catch (error) {
		throw toServiceError(error);
	}
}

export interface QuickInsight {
	text: string;
	dataVersion: number;
	window: number | "all";
	provider: string;
	model: string;
	createdAt: number;
}

const INSIGHT_KEY = "mtai.insight";

export async function getCachedInsight(): Promise<QuickInsight | null> {
	const stored = await browser.storage.local.get(INSIGHT_KEY);
	const value = stored[INSIGHT_KEY] as QuickInsight | undefined;
	return value ?? null;
}

/** One short, non-streaming answer for the popup, cached per data version. */
export async function generateQuickInsight(prompt: string): Promise<QuickInsight> {
	const { config, apiKey } = await requireCredentials();
	const settings = await getSettings();
	const tests = await listTests();
	const data = buildCoachData(tests, settings.analysisWindow, {
		includeKeyData: settings.ai.includeKeyData,
		includeRecentTests: false,
	});
	if (data.context.counts.valid === 0) {
		throw new AIServiceError("invalid_request", "No captured tests yet.");
	}

	const model = createLanguageModel(config, apiKey);
	let text = "";
	try {
		const result = await generateText({
			model,
			system: buildSystemPrompt(data.context),
			prompt,
			temperature: Math.min(config.temperature, 0.5),
			maxOutputTokens: 220,
			maxRetries: 1,
			abortSignal: AbortSignal.timeout(45_000),
		});
		text = result.text.trim();
	} catch (error) {
		throw toServiceError(error);
	}
	if (text === "")
		throw new AIServiceError("unknown", "The model returned an empty response.");

	const insight: QuickInsight = {
		text,
		dataVersion: await getDataVersion(),
		window: settings.analysisWindow,
		provider: config.provider,
		model: config.model,
		createdAt: Date.now(),
	};
	await browser.storage.local.set({ [INSIGHT_KEY]: insight });
	return insight;
}

export function messagesForPrompt(
	conversation: StoredConversation | null,
): ChatMessage[] {
	if (conversation === null) return [];
	return conversation.messages.map((message) => ({
		role: message.role,
		content: message.content,
	}));
}
