import { type ReactNode, useState } from "react";
import { ANALYSIS_WINDOWS } from "@/shared/constants";
import type { AnalysisWindow } from "@/shared/types";
import { clearTests } from "@/storage/tests-repo";
import { Panel } from "@/ui/components/Panel";
import { formatNumber, plural } from "@/ui/format";
import type { CaptureData } from "@/ui/useCaptureData";
import { HistoryImport } from "./HistoryImport";
import { ProviderSettings } from "./ProviderSettings";

function downloadJson(tests: unknown[]): void {
	const payload = {
		exportedAt: new Date().toISOString(),
		source: "monkeytype-ai-companion",
		tests,
	};
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `monkeytype-ai-tests-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

export function SettingsTab(props: { data: CaptureData }): ReactNode {
	const { data } = props;
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);

	const onClear = async (): Promise<void> => {
		if (!confirming) {
			setConfirming(true);
			return;
		}
		setBusy(true);
		try {
			await clearTests();
			await data.reload();
			setConfirming(false);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mtai-stack">
			<ProviderSettings data={props.data} />

			<HistoryImport data={props.data} />

			<Panel title="analysis">
				<div className="mtai-stack">
					<label className="mtai-field" style={{ maxWidth: "14rem" }}>
						<span className="mtai-field__label">default window</span>
						<select
							value={String(data.settings.analysisWindow)}
							onChange={(event) => {
								const raw = event.target.value;
								const next: AnalysisWindow =
									raw === "all" ? "all" : (Number(raw) as 10 | 20 | 50 | 100);
								void data.saveSettings({ analysisWindow: next });
							}}
						>
							{ANALYSIS_WINDOWS.map((window) => (
								<option key={String(window)} value={String(window)}>
									{window === "all" ? "all available tests" : `last ${window} tests`}
								</option>
							))}
						</select>
						<span className="mtai-note">
							Averages, trends and weakness detection all use this many most recent tests.
						</span>
					</label>
				</div>
			</Panel>

			<Panel title="capture">
				<div className="mtai-stack">
					<label className="mtai-check">
						<input
							type="checkbox"
							checked={data.settings.captureEnabled}
							onChange={(event) =>
								void data.saveSettings({ captureEnabled: event.target.checked })
							}
						/>
						<span className="mtai-check__text">
							Capture completed tests
							<span className="mtai-check__hint">
								One record per finished test, written locally when the result screen
								appears. Nothing is read while you are typing.
							</span>
						</span>
					</label>
					<label className="mtai-check">
						<input
							type="checkbox"
							checked={data.settings.followMonkeytypeTheme}
							onChange={(event) =>
								void data.saveSettings({ followMonkeytypeTheme: event.target.checked })
							}
						/>
						<span className="mtai-check__text">
							Follow my Monkeytype theme
							<span className="mtai-check__hint">
								Colours and font are sampled from your Monkeytype tab and applied here.
								Turn off to use the default serika dark palette.
							</span>
						</span>
					</label>
				</div>
			</Panel>

			<Panel title="data">
				<div className="mtai-stack">
					<p className="mtai-note">
						{data.tests.length} {plural(data.tests.length, "test")} stored in this browser
						{data.tests.length > 0
							? ` · newest ${formatNumber(data.tests[0]?.wpm ?? 0, 1)} wpm`
							: ""}
						.
					</p>
					<div className="mtai-row-tight">
						<button
							type="button"
							onClick={() => downloadJson(data.tests)}
							disabled={data.tests.length === 0}
						>
							export json
						</button>
						<button
							type="button"
							className={confirming ? "mtai-button--danger" : undefined}
							onClick={() => void onClear()}
							disabled={data.tests.length === 0 || busy}
							onBlur={() => setConfirming(false)}
						>
							{confirming
								? "click again to erase everything"
								: "clear all captured tests"}
						</button>
					</div>
					<p className="mtai-note">
						Export contains the metrics and per-key error counts listed on the tests tab.
						It never contains your Monkeytype account, API keys, or the words you typed.
					</p>
				</div>
			</Panel>

			<Panel title="privacy">
				<ul
					className="mtai-note"
					style={{ paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}
				>
					<li>The extension only runs on monkeytype.com.</li>
					<li>
						Stored locally: test metrics, per-key error counts, typing rhythm, and the
						last theme colours sampled from the page.
					</li>
					<li>
						Not stored: the test text, your account, browsing history, or anything from
						other sites.
					</li>
					<li>
						No AI provider is connected, so nothing is transmitted anywhere. When coaching
						is configured, only the analysis summary you can preview before sending is
						used.
					</li>
					<li>
						Data lives in this browser profile. Chrome extension storage is not encrypted
						at rest beyond your operating system's disk encryption.
					</li>
				</ul>
			</Panel>
		</div>
	);
}
