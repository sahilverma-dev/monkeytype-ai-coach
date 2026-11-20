import { browser } from "wxt/browser";
import { permissionOrigin } from "./providers";
import type { AIConfig } from "./types";

/**
 * AI hosts are optional permissions, requested only when the user configures a
 * provider, so the extension does not gain access to any provider domain up front.
 * Must be called from a user gesture (a click in settings or a chat send).
 */
export async function ensureProviderPermission(config: AIConfig): Promise<boolean> {
	const origin = permissionOrigin(config);
	if (origin === null) return false;
	try {
		const already = await browser.permissions.contains({ origins: [origin] });
		if (already) return true;
		return await browser.permissions.request({ origins: [origin] });
	} catch {
		return false;
	}
}

export async function hasProviderPermission(config: AIConfig): Promise<boolean> {
	const origin = permissionOrigin(config);
	if (origin === null) return false;
	try {
		return await browser.permissions.contains({ origins: [origin] });
	} catch {
		return false;
	}
}
