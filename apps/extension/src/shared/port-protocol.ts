export type ChatPortRequest =
	| { type: "ready" }
	| { type: "send"; text: string }
	| { type: "abort" }
	| { type: "preview" }
	| { type: "new" }
	| { type: "open"; conversationId: string }
	| { type: "open-dashboard" };

export interface PortMessage {
	role: "user" | "assistant";
	content: string;
}

export interface ConversationSummary {
	id: string;
	title: string;
	updatedAt: number;
}

import type { CoachSnapshot } from "@/ai/snapshot";

export type ChatPortEvent =
	| {
			type: "state";
			configured: boolean;
			provider: string;
			model: string;
			conversationId: string | null;
			messages: PortMessage[];
			suggestions: string[];
			snapshot: CoachSnapshot;
			conversations: ConversationSummary[];
	  }
	| { type: "chunk"; text: string }
	| { type: "done"; conversationId: string; conversations: ConversationSummary[] }
	| { type: "error"; message: string }
	| { type: "aborted" }
	| { type: "preview"; system: string; tokens: number; provider: string; model: string };

export const CHAT_PORT_NAME = "mtai-chat";
