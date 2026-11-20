import type { CharAnalysis } from "@/analytics/errors";
import type { WindowStats } from "@/analytics/overview";
import type { Weakness } from "@/analytics/weaknesses";
import { type CoachContext, estimateTokens, serializeContext } from "./context";
import type { ChatMessage } from "./types";

export const MAX_CONTEXT_TOKENS = 5_000;

const RULES = `You are the Monkeytype AI Companion, a typing coach for one user.

The data block below was computed locally from that user's own captured Monkeytype tests.

Rules you must follow:
1. Use only the numbers in the data block. Never invent a statistic, date, test result, or personal best.
2. If the data cannot answer the question, say which metric is missing and what would need to be captured. Do not guess.
3. Quote the actual numbers (one decimal place) behind every claim you make.
4. Key-level findings only exist when the data block says key-level data was captured. Never assume it.
5. Be concrete: name a drill, a word list, a duration, or a Monkeytype setting, and give a measurable target.
6. Keep answers under 200 words unless the user asks for a practice plan.
7. Never ask for API keys, credentials, or personal information.
8. Answer in the language the user writes in.`;

export function buildSystemPrompt(context: CoachContext): string {
	return `${RULES}\n\n${serializeContext(context)}`;
}

export interface PromptPreview {
	system: string;
	messages: ChatMessage[];
	estimatedTokens: number;
	overBudget: boolean;
}

export function buildPreview(
	context: CoachContext,
	messages: ChatMessage[],
): PromptPreview {
	const system = buildSystemPrompt(context);
	const estimatedTokens =
		estimateTokens(system) +
		messages.reduce((total, message) => total + estimateTokens(message.content), 0);
	return {
		system,
		messages,
		estimatedTokens,
		overBudget: estimateTokens(system) > MAX_CONTEXT_TOKENS,
	};
}

const MAX_SUGGESTIONS = 6;

export function buildSuggestions(data: {
	stats: WindowStats;
	chars: CharAnalysis;
	weaknesses: Weakness[];
	context: CoachContext;
}): string[] {
	const suggestions: string[] = [];
	const topKey = data.context.keyData?.problemKeys[0];

	if (topKey !== undefined) suggestions.push(`Why do I keep mistyping "${topKey.char}"?`);
	if (data.stats.acc.average !== null && data.stats.acc.average < 96) {
		suggestions.push("How do I get my accuracy above 97%?");
	}
	if (
		data.stats.trend?.direction === "flat" ||
		data.weaknesses.some((w) => w.kind === "plateau")
	) {
		suggestions.push("Why has my WPM stopped improving?");
	}
	if (data.context.previousWindow !== null) {
		suggestions.push("Compare this window with the tests before it.");
	}
	if (data.context.keyData === null || data.context.keyData.testsWithKeys === 0) {
		suggestions.push("What can you tell from headline results only?");
	}
	suggestions.push("What should I practice next?");
	suggestions.push("How consistent is my typing?");

	const unique: string[] = [];
	for (const suggestion of suggestions) {
		if (!unique.includes(suggestion)) unique.push(suggestion);
		if (unique.length >= MAX_SUGGESTIONS) break;
	}
	return unique.slice(0, MAX_SUGGESTIONS);
}

export const QUICK_INSIGHT_PROMPT =
	"In at most three sentences, name the single biggest limiter in this data and the next concrete thing I should practise. Use the numbers. If the data is too thin, say so briefly.";

export const CONNECTION_TEST_PROMPT = "Reply with exactly: ready";
