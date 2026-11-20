import { browser } from "wxt/browser";
import type { ProviderId } from "@/ai/types";
import { PROVIDER_IDS } from "@/ai/types";

/**
 * Credentials live in chrome.storage.local and are read only from extension pages
 * and the service worker. They are never injected into a content script script
 * and never posted to the page.
 *
 * Chrome extension storage is not encrypted at rest beyond the OS disk
 * encryption; the UI states that plainly instead of implying otherwise.
 */
const CREDENTIALS_KEY = "mtai.credentials";

type CredentialMap = Partial<Record<ProviderId, string>>;

async function readAll(): Promise<CredentialMap> {
	const stored = await browser.storage.local.get(CREDENTIALS_KEY);
	const value = stored[CREDENTIALS_KEY];
	if (typeof value !== "object" || value === null) return {};
	const map: CredentialMap = {};
	for (const provider of PROVIDER_IDS) {
		const key = (value as Record<string, unknown>)[provider];
		if (typeof key === "string" && key.trim() !== "") map[provider] = key;
	}
	return map;
}

export async function getApiKey(provider: ProviderId): Promise<string | null> {
	const map = await readAll();
	return map[provider] ?? null;
}

export async function hasApiKey(provider: ProviderId): Promise<boolean> {
	return (await getApiKey(provider)) !== null;
}

export async function setApiKey(provider: ProviderId, key: string): Promise<void> {
	const map = await readAll();
	const trimmed = key.trim();
	if (trimmed === "") {
		delete map[provider];
	} else {
		map[provider] = trimmed;
	}
	await browser.storage.local.set({ [CREDENTIALS_KEY]: map });
}

export async function removeApiKey(provider: ProviderId): Promise<void> {
	const map = await readAll();
	delete map[provider];
	await browser.storage.local.set({ [CREDENTIALS_KEY]: map });
}

/** Only for the settings screen: which providers have a key, never the values. */
export async function configuredProviders(): Promise<ProviderId[]> {
	const map = await readAll();
	return PROVIDER_IDS.filter((provider) => map[provider] !== undefined);
}
