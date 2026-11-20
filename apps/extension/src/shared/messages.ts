import type { ThemeSnapshot } from "./types";

export type RuntimeMessage =
	| { type: "TEST_CAPTURED"; test: unknown }
	| { type: "HEARTBEAT"; href: string; testPage: boolean }
	| { type: "THEME_SAMPLED"; theme: ThemeSnapshot }
	| { type: "PING" };

export type RuntimeResponse = { ok: true; data?: unknown } | { ok: false; error: string };

export interface CaptureAck {
	ok: true;
	data: { stored: boolean; duplicate: boolean; dataVersion: number };
}
