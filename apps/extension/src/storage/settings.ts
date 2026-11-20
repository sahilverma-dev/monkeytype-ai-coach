import { browser } from "wxt/browser";
import { z } from "zod";
import { DEFAULT_ANALYSIS_WINDOW, SETTINGS_KEY } from "@/shared/constants";
import type { ThemeSnapshot } from "@/shared/types";

const themeSnapshotSchema = z.object({
	bg: z.string(),
	main: z.string(),
	sub: z.string(),
	subAlt: z.string(),
	text: z.string(),
	error: z.string(),
	errorExtra: z.string(),
	roundness: z.string(),
	font: z.string(),
	sampledAt: z.number(),
});

export const settingsSchema = z.object({
	analysisWindow: z
		.union([
			z.literal(10),
			z.literal(20),
			z.literal(50),
			z.literal(100),
			z.literal("all"),
		])
		.default(DEFAULT_ANALYSIS_WINDOW),
	captureEnabled: z.boolean().default(true),
	followMonkeytypeTheme: z.boolean().default(true),
	theme: themeSnapshotSchema.nullable().default(null),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export async function getSettings(): Promise<Settings> {
	const stored = await browser.storage.local.get(SETTINGS_KEY);
	const parsed = settingsSchema.safeParse(stored[SETTINGS_KEY]);
	if (!parsed.success) return DEFAULT_SETTINGS;
	return parsed.data;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
	const current = await getSettings();
	const next = settingsSchema.parse({ ...current, ...patch });
	await browser.storage.local.set({ [SETTINGS_KEY]: next });
	return next;
}

export async function saveThemeSnapshot(theme: ThemeSnapshot): Promise<void> {
	await updateSettings({ theme });
}

export interface SessionState {
	lastSeenAt: number;
	href: string;
	testPage: boolean;
}

export async function setSessionState(state: SessionState): Promise<void> {
	try {
		await browser.storage.session.set({ "mtai.session": state });
	} catch {
		// session storage is unavailable in some contexts; the popup just shows unknown.
	}
}

export async function getSessionState(): Promise<SessionState | null> {
	try {
		const stored = await browser.storage.session.get("mtai.session");
		const value = stored["mtai.session"] as SessionState | undefined;
		return value ?? null;
	} catch {
		return null;
	}
}
