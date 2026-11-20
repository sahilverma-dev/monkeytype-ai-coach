import { type ReactNode, useEffect, useState } from "react";
import { listModels } from "@/ai/models";
import { ensureProviderPermission } from "@/ai/permissions";
import { PROVIDER_META } from "@/ai/providers";
import { testConnection } from "@/ai/service";
import { type ModelOption, PROVIDER_IDS, type ProviderId } from "@/ai/types";
import { getApiKey, removeApiKey, setApiKey } from "@/storage/credentials";
import { Panel } from "@/ui/components/Panel";
import type { CaptureData } from "@/ui/useCaptureData";

type Busy = "models" | "test" | "key" | null;

export function ProviderSettings(props: { data: CaptureData }): ReactNode {
	const ai = props.data.settings.ai;
	const [keyInput, setKeyInput] = useState("");
	const [hasKey, setHasKey] = useState<boolean | null>(null);
	const [models, setModels] = useState<ModelOption[]>([]);
	const [busy, setBusy] = useState<Busy>(null);
	const [status, setStatus] = useState<{
		tone: "ok" | "error" | "info";
		text: string;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		void getApiKey(ai.provider).then((key) => {
			if (!cancelled) setHasKey(key !== null);
		});
		return () => {
			cancelled = true;
		};
	}, [ai.provider]);

	const saveAi = async (patch: Partial<CaptureData["settings"]["ai"]>): Promise<void> => {
		await props.data.saveSettings({ ai: { ...ai, ...patch } });
	};

	const onProviderChange = async (provider: ProviderId): Promise<void> => {
		await props.data.saveSettings({
			ai: {
				...ai,
				provider,
				model: "",
				baseURL: provider === "custom" ? ai.baseURL : null,
			},
		});
		setModels([]);
		setStatus(null);
	};

	const onSaveKey = async (): Promise<void> => {
		if (keyInput.trim() === "") return;
		setBusy("key");
		try {
			await setApiKey(ai.provider, keyInput);
			setKeyInput("");
			setHasKey(true);
			setStatus({ tone: "ok", text: "Key saved locally." });
		} catch (error) {
			setStatus({
				tone: "error",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};

	const onRemoveKey = async (): Promise<void> => {
		await removeApiKey(ai.provider);
		setKeyInput("");
		setHasKey(false);
		setStatus({ tone: "info", text: "Key removed." });
	};

	const onLoadModels = async (): Promise<void> => {
		setBusy("models");
		setStatus(null);
		try {
			const granted = await ensureProviderPermission(ai);
			if (!granted) {
				setStatus({ tone: "info", text: "Host access not granted; trying anyway…" });
			}
			const key = (await getApiKey(ai.provider)) ?? keyInput;
			const list = await listModels(ai, key);
			setModels(list);
			setStatus({
				tone: list.length > 0 ? "ok" : "info",
				text:
					list.length > 0
						? `${list.length} models available. Pick one below.`
						: "The endpoint returned no models. Type the model id manually.",
			});
		} catch (error) {
			setStatus({
				tone: "error",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};

	const onTest = async (): Promise<void> => {
		setBusy("test");
		setStatus({ tone: "info", text: "Sending a one-word test request…" });
		try {
			const granted = await ensureProviderPermission(ai);
			if (!granted) {
				setStatus({
					tone: "info",
					text: "Host access not granted; attempting the request anyway…",
				});
			}
			const result = await testConnection();
			setStatus({
				tone: "ok",
				text: `Connected to ${result.provider} · ${result.model} · ${result.latencyMs}ms · reply "${result.answer}"`,
			});
		} catch (error) {
			setStatus({
				tone: "error",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(null);
		}
	};

	const meta = PROVIDER_META[ai.provider];

	return (
		<Panel title="ai provider">
			<div className="mtai-stack">
				<div className="mtai-row" style={{ alignItems: "flex-end" }}>
					<label className="mtai-field" style={{ minWidth: "14rem" }}>
						<span className="mtai-field__label">provider</span>
						<select
							value={ai.provider}
							onChange={(event) =>
								void onProviderChange(event.target.value as ProviderId)
							}
						>
							{PROVIDER_IDS.map((id) => (
								<option key={id} value={id}>
									{PROVIDER_META[id].label}
								</option>
							))}
						</select>
					</label>
					<span className="mtai-note" style={{ maxWidth: "24rem" }}>
						{hasKey === true
							? "A key is saved for this provider."
							: hasKey === false
								? "No key saved yet."
								: "Checking saved key…"}
					</span>
				</div>

				<div className="mtai-field">
					<span className="mtai-field__label">api key</span>
					<div className="mtai-key-row">
						<input
							type="password"
							autoComplete="off"
							spellCheck={false}
							placeholder={hasKey === true ? "•••••••• (saved)" : meta.keyHint}
							value={keyInput}
							onChange={(event) => setKeyInput(event.target.value)}
						/>
						<button
							type="button"
							onClick={() => void onSaveKey()}
							disabled={busy !== null || keyInput.trim() === ""}
						>
							save key
						</button>
						<button
							type="button"
							className="mtai-button--ghost"
							onClick={() => void onRemoveKey()}
							disabled={hasKey !== true}
						>
							remove
						</button>
					</div>
					<span className="mtai-note">
						Stored in chrome.storage.local for extension pages and the background worker
						only. It is never injected into the Monkeytype page. Chrome storage is not
						encrypted at rest beyond your OS disk encryption.
					</span>
				</div>

				{ai.provider === "custom" ? (
					<label className="mtai-field">
						<span className="mtai-field__label">
							endpoint base url (OpenAI-compatible, e.g. https://host/v1)
						</span>
						<input
							type="url"
							value={ai.baseURL ?? ""}
							placeholder="https://example.com/v1"
							onChange={(event) =>
								void saveAi({
									baseURL:
										event.target.value.trim() === "" ? null : event.target.value.trim(),
								})
							}
						/>
					</label>
				) : null}

				<div className="mtai-field">
					<span className="mtai-field__label">model</span>
					<div className="mtai-key-row">
						<input
							list="mtai-model-options"
							value={ai.model}
							placeholder="load the list or type a model id"
							onChange={(event) => void saveAi({ model: event.target.value })}
						/>
						<button
							type="button"
							onClick={() => void onLoadModels()}
							disabled={busy !== null}
						>
							{busy === "models" ? "loading…" : "load models"}
						</button>
					</div>
					<datalist id="mtai-model-options">
						{models.map((model) => (
							<option key={model.id} value={model.id}>
								{model.label}
							</option>
						))}
					</datalist>
					<span className="mtai-note">
						Model ids come from the provider, never hardcoded. Loading the list asks
						Chrome for access to {meta.label} only.
					</span>
				</div>

				<div className="mtai-row-tight">
					<label className="mtai-field" style={{ width: "9rem" }}>
						<span className="mtai-field__label">temperature</span>
						<input
							type="number"
							min={0}
							max={2}
							step={0.1}
							value={ai.temperature}
							onChange={(event) => {
								const value = Number(event.target.value);
								if (Number.isFinite(value))
									void saveAi({ temperature: Math.min(2, Math.max(0, value)) });
							}}
						/>
					</label>
					<label className="mtai-field" style={{ width: "9rem" }}>
						<span className="mtai-field__label">max tokens</span>
						<input
							type="number"
							min={64}
							max={8000}
							step={64}
							value={ai.maxTokens}
							onChange={(event) => {
								const value = Number(event.target.value);
								if (Number.isFinite(value)) {
									void saveAi({
										maxTokens: Math.min(8000, Math.max(64, Math.round(value))),
									});
								}
							}}
						/>
					</label>
				</div>

				<label className="mtai-check">
					<input
						type="checkbox"
						checked={ai.includeKeyData}
						onChange={(event) => void saveAi({ includeKeyData: event.target.checked })}
					/>
					<span className="mtai-check__text">
						Send per-key error analysis
						<span className="mtai-check__hint">
							Character-level error rates, confusion pairs and slow pairs. Turn off to
							send only headline metrics.
						</span>
					</span>
				</label>

				<label className="mtai-check">
					<input
						type="checkbox"
						checked={ai.includeRecentTests}
						onChange={(event) =>
							void saveAi({ includeRecentTests: event.target.checked })
						}
					/>
					<span className="mtai-check__text">
						Send a short recent-test summary
						<span className="mtai-check__hint">
							Up to eight recent tests with date, mode, wpm, accuracy and duration. Never
							the test text.
						</span>
					</span>
				</label>

				<div className="mtai-row-tight">
					<button
						type="button"
						className="mtai-button--ghost"
						onClick={() => {
							void ensureProviderPermission(ai).then((granted) => {
								setStatus({
									tone: granted ? "ok" : "info",
									text: granted
										? `Host access granted for ${meta.label}.`
										: "Host access not granted. Requests are still attempted through CORS.",
								});
							});
						}}
						disabled={busy !== null}
					>
						grant host access
					</button>
					<button type="button" onClick={() => void onTest()} disabled={busy !== null}>
						{busy === "test" ? "testing…" : "test connection"}
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
			</div>
		</Panel>
	);
}
