import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturedTest } from "@/shared/types";
import {
	DEFAULT_SETTINGS,
	getSessionState,
	getSettings,
	type SessionState,
	type Settings,
	updateSettings,
} from "@/storage/settings";
import { getDataVersion, listTests } from "@/storage/tests-repo";
import { applyTheme } from "@/ui/theme";

export interface CaptureData {
	loading: boolean;
	error: string | null;
	tests: CapturedTest[];
	settings: Settings;
	session: SessionState | null;
	dataVersion: number;
	reload: () => Promise<void>;
	saveSettings: (patch: Partial<Settings>) => Promise<void>;
	refreshSession: () => Promise<void>;
}

const POLL_INTERVAL_MS = 8_000;

export function useCaptureData(options: { poll?: boolean } = {}): CaptureData {
	const poll = options.poll ?? true;
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [tests, setTests] = useState<CapturedTest[]>([]);
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [session, setSession] = useState<SessionState | null>(null);
	const [dataVersion, setDataVersion] = useState(0);
	const versionRef = useRef(0);

	const loadAll = useCallback(async () => {
		try {
			const [nextTests, nextSettings, nextSession, version] = await Promise.all([
				listTests(),
				getSettings(),
				getSessionState(),
				getDataVersion(),
			]);
			setTests(nextTests);
			setSettings(nextSettings);
			setSession(nextSession);
			setDataVersion(version);
			versionRef.current = version;
			setError(null);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : String(loadError));
		} finally {
			setLoading(false);
		}
	}, []);

	const checkForNewTests = useCallback(async () => {
		try {
			const version = await getDataVersion();
			if (version !== versionRef.current) {
				versionRef.current = version;
				setDataVersion(version);
				setTests(await listTests());
			}
			setSession(await getSessionState());
		} catch {
			// transient: the next tick retries
		}
	}, []);

	useEffect(() => {
		void loadAll();
	}, [loadAll]);

	useEffect(() => {
		applyTheme(settings.theme, settings.followMonkeytypeTheme);
	}, [settings.theme, settings.followMonkeytypeTheme]);

	useEffect(() => {
		if (!poll) return;
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") void checkForNewTests();
		}, POLL_INTERVAL_MS);
		const onFocus = (): void => {
			void checkForNewTests();
		};
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onFocus);
		return () => {
			window.clearInterval(interval);
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onFocus);
		};
	}, [poll, checkForNewTests]);

	const saveSettings = useCallback(async (patch: Partial<Settings>) => {
		const next = await updateSettings(patch);
		setSettings(next);
	}, []);

	const refreshSession = useCallback(async () => {
		setSession(await getSessionState());
	}, []);

	return {
		loading,
		error,
		tests,
		settings,
		session,
		dataVersion,
		reload: loadAll,
		saveSettings,
		refreshSession,
	};
}
