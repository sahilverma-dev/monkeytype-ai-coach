import { browser } from "wxt/browser";

/**
 * Absolute URL for an extension page, usable from the service worker and from
 * extension pages. WXT's `browser` typing omits `getURL`, so it is narrowed here
 * once instead of casting at every call site.
 */
export function runtimeUrl(path: string): string {
	const runtime = browser.runtime as unknown as { getURL?: (path: string) => string };
	if (typeof runtime.getURL === "function") return runtime.getURL(path);
	return new URL(path, globalThis.location.href).toString();
}
