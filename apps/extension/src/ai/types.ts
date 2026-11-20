export const PROVIDER_IDS = [
	"openai",
	"anthropic",
	"google",
	"openrouter",
	"custom",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderMeta {
	id: ProviderId;
	label: string;
	/** Origin requested as an optional host permission. */
	origin: string;
	defaultBaseURL: string | null;
	keyHint: string;
	allowsCustomBaseURL: boolean;
}

export interface AIConfig {
	provider: ProviderId;
	model: string;
	baseURL: string | null;
	temperature: number;
	maxTokens: number;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export type AIErrorKind =
	| "no_key"
	| "no_model"
	| "permission"
	| "auth"
	| "rate_limit"
	| "invalid_model"
	| "invalid_request"
	| "network"
	| "aborted"
	| "unknown";

export class AIServiceError extends Error {
	readonly kind: AIErrorKind;
	readonly status: number | null;
	readonly retryAfterSeconds: number | null;

	constructor(
		kind: AIErrorKind,
		message: string,
		options: {
			status?: number | null;
			retryAfterSeconds?: number | null;
			cause?: unknown;
		} = {},
	) {
		super(message, { cause: options.cause });
		this.name = "AIServiceError";
		this.kind = kind;
		this.status = options.status ?? null;
		this.retryAfterSeconds = options.retryAfterSeconds ?? null;
	}
}

export interface GenerateResult {
	text: string;
	model: string;
	usage: { inputTokens: number | null; outputTokens: number | null } | null;
	finishReason: string | null;
}

export interface ModelOption {
	id: string;
	label: string;
}
