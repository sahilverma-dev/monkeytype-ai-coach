import { browser } from "wxt/browser";
import { runtimeUrl } from "@/shared/extension-url";
import type { RuntimeMessage, RuntimeResponse } from "@/shared/messages";
import { capturedTestSchema } from "@/shared/schema";
import { getSettings, saveThemeSnapshot, setSessionState } from "@/storage/settings";
import { addTest, bumpDataVersion, getDataVersion } from "@/storage/tests-repo";

async function handleTestCaptured(
	message: Extract<RuntimeMessage, { type: "TEST_CAPTURED" }>,
) {
	const settings = await getSettings();
	if (!settings.captureEnabled) {
		return { stored: false, duplicate: false, dataVersion: await getDataVersion() };
	}
	const parsed = capturedTestSchema.safeParse(message.test);
	if (!parsed.success) {
		throw new Error(
			`Invalid captured test: ${parsed.error.issues[0]?.message ?? "unknown"}`,
		);
	}
	const result = await addTest(parsed.data);
	return {
		stored: result === "added",
		duplicate: result === "duplicate",
		dataVersion: await getDataVersion(),
	};
}

async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
	switch (message.type) {
		case "TEST_CAPTURED": {
			const data = await handleTestCaptured(message);
			return { ok: true, data };
		}
		case "HEARTBEAT": {
			await setSessionState({
				lastSeenAt: Date.now(),
				href: message.href,
				testPage: message.testPage,
			});
			return { ok: true };
		}
		case "THEME_SAMPLED": {
			await saveThemeSnapshot(message.theme);
			return { ok: true };
		}
		case "PING":
			return { ok: true, data: { dataVersion: await getDataVersion() } };
		default:
			return { ok: false, error: "Unknown message" };
	}
}

export default defineBackground(() => {
	browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		handleMessage(message as RuntimeMessage)
			.then((response) => sendResponse(response))
			.catch((error: unknown) => {
				console.error("[mtai] message failed", error);
				const response: RuntimeResponse = {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				};
				sendResponse(response);
			});
		return true;
	});

	browser.runtime.onInstalled.addListener((details) => {
		void bumpDataVersion();
		if (details.reason === "install") {
			void browser.tabs.create({ url: runtimeUrl("/dashboard.html") });
		}
	});
});
