import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { importFromFile } from "@/monkeytype/file-import";
import { importHistory } from "@/monkeytype/import-service";
import { getApeKey, removeApeKey, setApeKey } from "@/storage/ape-key";
import { addTests, listTests } from "@/storage/tests-repo";
import { Panel } from "@/ui/components/Panel";
import type { CaptureData } from "@/ui/useCaptureData";

const API_ORIGIN = "https://api.monkeytype.com/*";

export function HistoryImport(props: { data: CaptureData }): ReactNode {
	const [keyInput, setKeyInput] = useState("");
	const [hasKey, setHasKey] = useState<boolean | null>(null);
	const [busy, setBusy] = useState(false);
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [status, setStatus] = useState<{
		tone: "ok" | "error" | "info";
		text: string;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		void getApeKey().then((key) => {
			if (!cancelled) setHasKey(key !== null);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const save = async (): Promise<void> => {
		if (keyInput.trim() === "") return;
		await setApeKey(keyInput);
		setKeyInput("");
		setHasKey(true);
		setStatus({ tone: "ok", text: "ApeKey saved locally." });
	};

	const forget = async (): Promise<void> => {
		await removeApeKey();
		setHasKey(false);
		setStatus({ tone: "info", text: "ApeKey removed." });
	};

	const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file === undefined) return;
		setBusy(true);
		setStatus({ tone: "info", text: `Reading ${file.name}…` });
		try {
			const text = await file.text();
			const existing = await listTests();
			const { tests, summary } = importFromFile(text, file.name, existing);
			if (tests.length > 0) await addTests(tests);
			await props.data.reload();
			setStatus({
				tone: tests.length > 0 ? "ok" : "info",
				text: `${summary.format.toUpperCase()} · ${summary.total} rows read · ${summary.imported} imported · ${summary.duplicates} already present · ${summary.invalid} skipped.`,
			});
		} catch (error) {
			setStatus({
				tone: "error",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	const runImport = async (): Promise<void> => {
		setBusy(true);
		setStatus({ tone: "info", text: "Asking Monkeytype for your results…" });
		try {
			const summary = await importHistory();
			await props.data.reload();
			setStatus({
				tone: summary.imported > 0 ? "ok" : "info",
				text: `${summary.fetched} results fetched · ${summary.imported} imported · ${summary.duplicates} already present${summary.invalid > 0 ? ` · ${summary.invalid} skipped` : ""}. Imported results carry headline metrics only (no per-key data).`,
			});
		} catch (error) {
			setStatus({
				tone: "error",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title="history import">
			<div className="mtai-stack">
				<p className="mtai-note">
					Monkeytype keeps results on its servers, not in the page, so older tests can
					only come from its documented API using an ApeKey from your account. Create one
					in account settings → ape keys. The key is used only for this request and is
					stored apart from AI keys.
				</p>
				<div className="mtai-row-tight">
					<a
						className="mtai-button mtai-button--active"
						href="https://monkeytype.com/account-settings?tab=apeKeys"
						target="_blank"
						rel="noopener noreferrer"
					>
						generate new key
					</a>
					<a
						className="mtai-button mtai-button--ghost"
						href="https://api.monkeytype.com/docs"
						target="_blank"
						rel="noopener noreferrer"
					>
						api docs
					</a>
				</div>
				<div className="mtai-field">
					<span className="mtai-field__label">monkeytype apekey</span>
					<div className="mtai-key-row">
						<input
							type="password"
							autoComplete="off"
							spellCheck={false}
							placeholder={hasKey === true ? "•••••••• (saved)" : "ApeKey …"}
							value={keyInput}
							onChange={(event) => setKeyInput(event.target.value)}
						/>
						<button
							type="button"
							onClick={() => void save()}
							disabled={keyInput.trim() === ""}
						>
							save apekey
						</button>
						<button
							type="button"
							className="mtai-button--ghost"
							onClick={() => void forget()}
							disabled={hasKey !== true}
						>
							remove
						</button>
					</div>
				</div>
				<div className="mtai-row-tight">
					<button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
						import from file
					</button>
					<input
						ref={fileRef}
						type="file"
						accept=".json,.csv,application/json,text/csv"
						hidden
						onChange={(event) => void onFile(event)}
					/>
					<button
						type="button"
						className="mtai-button--ghost"
						onClick={() => {
							void browser.permissions
								.request({ origins: [API_ORIGIN] })
								.then((granted) =>
									setStatus({
										tone: granted ? "ok" : "info",
										text: granted ? "Host access granted." : "Host access not granted.",
									}),
								)
								.catch(() =>
									setStatus({
										tone: "error",
										text: "Chrome refused the permission request.",
									}),
								);
						}}
					>
						grant api access
					</button>
					<button
						type="button"
						onClick={() => void runImport()}
						disabled={busy || hasKey !== true}
					>
						{busy ? "importing…" : "import past results"}
					</button>
					{status === null ? null : (
						<span
							className={
								status.tone === "ok"
									? "mtai-status mtai-status--ok"
									: status.tone === "error"
										? "mtai-status mtai-status--error"
										: "mtai-status text-sub"
							}
							role={status.tone === "error" ? "alert" : "status"}
						>
							{status.text}
						</span>
					)}
				</div>
				<p className="mtai-note">
					Limits: up to 1000 results per request and 30 requests per day (Monkeytype's own
					limits). Imports are incremental from the newest result already requested.
					Imported tests never include keystroke detail, so key analysis and the AI
					context will report them as summary data.
				</p>
			</div>
		</Panel>
	);
}
