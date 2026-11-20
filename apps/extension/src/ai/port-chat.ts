import { browser } from "wxt/browser";
import { runtimeUrl } from "@/shared/extension-url";
import {
	CHAT_PORT_NAME,
	type ChatPortEvent,
	type ChatPortRequest,
} from "@/shared/port-protocol";
import { getConversation, latestConversation } from "@/storage/conversations";
import { getApiKey } from "@/storage/credentials";
import { getSettings } from "@/storage/settings";
import { buildPreview, buildSuggestions } from "./prompt";
import { loadCoachData, messagesForPrompt, streamCoachReply } from "./service";

/**
 * Chat for the in-page panel.
 *
 * The page never receives credentials or raw history: the panel sends text over a
 * port, the service worker builds the grounded context from IndexedDB, calls the
 * provider, and streams only the answer text back.
 */
export function registerChatPort(): void {
	browser.runtime.onConnect.addListener((port) => {
		if (port.name !== CHAT_PORT_NAME) return;

		let conversationId: string | null = null;
		let controller: AbortController | null = null;

		const post = (event: ChatPortEvent): void => {
			try {
				port.postMessage(event);
			} catch {
				// panel closed mid-stream
			}
		};

		const postState = async (): Promise<void> => {
			const settings = await getSettings();
			const apiKey = await getApiKey(settings.ai.provider);
			const conversation =
				conversationId === null
					? await latestConversation()
					: await getConversation(conversationId);
			conversationId = conversation?.id ?? null;
			const data = await loadCoachData();
			post({
				type: "state",
				configured: apiKey !== null && settings.ai.model.trim() !== "",
				provider: settings.ai.provider,
				model: settings.ai.model,
				conversationId,
				messages:
					conversation?.messages.map((message) => ({
						role: message.role,
						content: message.content,
					})) ?? [],
				suggestions: buildSuggestions(data),
			});
		};

		const handleSend = async (text: string): Promise<void> => {
			if (controller !== null) return;
			controller = new AbortController();
			try {
				const reply = await streamCoachReply(
					{ conversationId, text },
					{
						signal: controller.signal,
						onChunk: (chunk) => post({ type: "chunk", text: chunk }),
					},
				);
				conversationId = reply.conversation.id;
				post({ type: "done", conversationId });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (/cancelled|aborted/i.test(message)) post({ type: "aborted" });
				else post({ type: "error", message });
			} finally {
				controller = null;
			}
		};

		const handlePreview = async (): Promise<void> => {
			const settings = await getSettings();
			const conversation =
				conversationId === null ? null : await getConversation(conversationId);
			const data = await loadCoachData();
			const preview = buildPreview(data.context, messagesForPrompt(conversation));
			post({
				type: "preview",
				system: preview.system,
				tokens: preview.estimatedTokens,
				provider: settings.ai.provider,
				model: settings.ai.model,
			});
		};

		port.onMessage.addListener((message: ChatPortRequest) => {
			void (async () => {
				switch (message.type) {
					case "ready":
						await postState();
						return;
					case "send":
						if (message.text.trim() === "") return;
						controller?.abort();
						await handleSend(message.text.trim());
						return;
					case "abort":
						controller?.abort();
						return;
					case "preview":
						await handlePreview();
						return;
					case "new":
						conversationId = null;
						await postState();
						return;
					case "open-dashboard":
						await browser.tabs.create({ url: runtimeUrl("/dashboard.html#settings") });
						return;
					default:
						return;
				}
			})();
		});

		port.onDisconnect.addListener(() => {
			controller?.abort();
		});
	});
}
