import { browser } from "wxt/browser";

/**
 * The ApeKey is a Monkeytype credential, not an AI credential: it is only used
 * for `GET /results` to import history. Stored apart from provider keys so the
 * two can be managed independently.
 */
const APE_KEY = "mtai.apeKey";

export async function getApeKey(): Promise<string | null> {
	const stored = await browser.storage.local.get(APE_KEY);
	const value = stored[APE_KEY];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function setApeKey(key: string): Promise<void> {
	const trimmed = key.trim();
	if (trimmed === "") {
		await browser.storage.local.remove(APE_KEY);
		return;
	}
	await browser.storage.local.set({ [APE_KEY]: trimmed });
}

export async function removeApeKey(): Promise<void> {
	await browser.storage.local.remove(APE_KEY);
}
