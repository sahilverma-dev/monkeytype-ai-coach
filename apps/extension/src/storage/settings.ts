import { browser } from "wxt/browser";
import { z } from "zod";
import { PROVIDER_IDS } from "@/ai/types";
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

const aiSchema = z.object({
	provider: z.enum(PROVIDER_IDS).default("openai"),
	model: z.string().max(200).default(""),
	baseURL: z.string().max(400).nullable().default(null),
	temperature: z.number().min(0).max(2).default(0.4),
	maxTokens: z.number().int().min(64).max(8000).default(700),
	includeKeyData: z.boolean().default(true),
	includeRecentTests: z.boolean().default(true),
});

export type AISettings = z.infer<typeof aiSchema>;

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
	ai: aiSchema.default(aiSchema.parse({})),
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

const SESSION_STATE_KEY = "mtai.sessionState";

export async function setSessionState(state: SessionState): Promise<void> {
	await browser.storage.local.set({ [SESSION_STATE_KEY]: state });
}

export async function getSessionState(): Promise<SessionState | null> {
	const stored = await browser.storage.local.get(SESSION_STATE_KEY);
	const value = stored[SESSION_STATE_KEY] as SessionState | undefined;
	if (value === undefined) return null;
	return {
		lastSeenAt: typeof value.lastSeenAt === "number" ? value.lastSeenAt : 0,
		href: typeof value.href === "string" ? value.href : "",
		testPage: value.testPage === true,
	};
}
