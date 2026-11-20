import { type ReactNode, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { QUICK_INSIGHT_PROMPT } from "@/ai/prompt";
import { generateQuickInsight, getCachedInsight, type QuickInsight } from "@/ai/service";
import { computeWindowStats } from "@/analytics/overview";
import { runtimeUrl } from "@/shared/extension-url";
import { getApiKey } from "@/storage/credentials";
import { Stat, StatGrid } from "@/ui/components/Stat";
import { formatMode, formatNumber, formatPercent, relativeTime } from "@/ui/format";
import { useCaptureData } from "@/ui/useCaptureData";

const WEEK_MS = 7 * 86_400_000;

export function Popup(): ReactNode {
	const data = useCaptureData({ poll: true });
	const connected =
		data.session !== null && Date.now() - data.session.lastSeenAt < 90_000;
	const latest = data.tests[0];
	const weekAgo = Date.now() - WEEK_MS;
	const weekTests = data.tests.filter((test) => test.timestamp >= weekAgo);
	const weekStats = computeWindowStats(weekTests, "all");
	const [insight, setInsight] = useState<QuickInsight | null>(null);
	const [insightBusy, setInsightBusy] = useState(false);
	const [insightError, setInsightError] = useState<string | null>(null);
	const [hasProvider, setHasProvider] = useState<boolean | null>(null);

	useEffect(() => {
		void getCachedInsight().then(setInsight);
		void getApiKey(data.settings.ai.provider).then((key) => setHasProvider(key !== null));
	}, [data.settings.ai.provider]);

	const generate = async (): Promise<void> => {
		setInsightBusy(true);
		setInsightError(null);
		try {
			setInsight(await generateQuickInsight(QUICK_INSIGHT_PROMPT));
		} catch (error) {
			setInsightError(error instanceof Error ? error.message : String(error));
		} finally {
			setInsightBusy(false);
		}
	};

	const providerReady = hasProvider === true && data.settings.ai.model.trim() !== "";

	const openDashboard = (hash = ""): void => {
		void browser.tabs.create({ url: runtimeUrl(`/dashboard.html${hash}`) });
	};

	return (
		<div className="mtai-shell">
			<header className="mtai-topbar">
				<h1 className="mtai-brand">
					monkeytype <span>ai</span>
				</h1>
				<span className="mtai-row-tight">
					<span className={`mtai-dot${connected ? " mtai-dot--on" : ""}`} />
					<span className="mtai-note">
						{connected
							? "connected"
							: data.session === null
								? "not seen"
								: relativeTime(data.session.lastSeenAt)}
					</span>
				</span>
			</header>

			{data.loading ? (
				<p className="mtai-loading">loading…</p>
			) : latest === undefined ? (
				<div className="mtai-empty">
					<h2>No tests yet</h2>
					<p className="mtai-note" style={{ margin: "0.25rem 0 0.75rem" }}>
						Complete a test on monkeytype.com and it will appear here.
					</p>
					<button
						type="button"
						onClick={() => void browser.tabs.create({ url: "https://monkeytype.com/" })}
					>
						open monkeytype
					</button>
				</div>
			) : (
				<>
					<section className="mtai-card mtai-stack" style={{ gap: "0.35rem" }}>
						<div className="mtai-row">
							<span className="mtai-note">latest · {formatMode(latest)}</span>
							<span className="mtai-note">{relativeTime(latest.timestamp)}</span>
						</div>
						<div
							className="mtai-row-tight"
							style={{ alignItems: "baseline", gap: "0.9rem" }}
						>
							<span className="mtai-stat__value" style={{ fontSize: "2.2rem" }}>
								{formatNumber(latest.wpm, 0)}
							</span>
							<span className="mtai-note">wpm</span>
							<span className="mtai-stat__value" style={{ fontSize: "1.2rem" }}>
								{formatPercent(latest.acc, 0)}
							</span>
							<span className="mtai-note">acc</span>
							{latest.fidelity === "full" ? null : (
								<span className="mtai-badge" title="Only headline numbers were available">
									summary
								</span>
							)}
						</div>
						<span className="mtai-note">
							{formatNumber(latest.rawWpm, 0)} raw
							{latest.consistency === null
								? ""
								: ` · ${formatPercent(latest.consistency, 0)} consistency`}
							{latest.excludedReason === null ? "" : ` · ${latest.excludedReason}`}
						</span>
					</section>

					<section className="mtai-card mtai-stack" style={{ gap: "0.35rem" }}>
						<div className="mtai-row">
							<span className="mtai-note">quick insight</span>
							{insight === null ? null : (
								<span className="mtai-note">{relativeTime(insight.createdAt)}</span>
							)}
						</div>
						{providerReady ? (
							insight !== null && insight.dataVersion === data.dataVersion ? (
								<p className="mtai-note">{insight.text}</p>
							) : (
								<div className="mtai-row-tight" style={{ alignItems: "center" }}>
									<button
										type="button"
										onClick={() => void generate()}
										disabled={insightBusy}
									>
										{insightBusy
											? "thinking…"
											: insight === null
												? "get insight"
												: "refresh insight"}
									</button>
									<span className="mtai-note">
										{insight === null
											? "one short answer from your model"
											: "based on the current data"}
									</span>
									{insight === null ? null : (
										<span className="mtai-note">new tests since this insight</span>
									)}
								</div>
							)
						) : (
							<div className="mtai-row-tight">
								<span className="mtai-note">connect a provider for coaching.</span>
								<button type="button" onClick={() => openDashboard("#settings")}>
									settings
								</button>
							</div>
						)}
						{insightError === null ? null : (
							<p className="mtai-note text-error" role="alert">
								{insightError}
							</p>
						)}
					</section>

					<section className="mtai-stack" style={{ gap: "0.35rem" }}>
						<span className="mtai-note">
							last 7 days · {weekTests.length} {weekTests.length === 1 ? "test" : "tests"}
						</span>
						<StatGrid>
							<Stat
								plain
								label="avg wpm"
								value={formatNumber(weekStats.wpm.average, 1)}
								hint={`${formatNumber(weekStats.wpm.best, 0)} best`}
							/>
							<Stat
								plain
								label="avg acc"
								value={formatPercent(weekStats.acc.average, 1)}
								hint={`${weekStats.charTotals.incorrect} incorrect`}
							/>
						</StatGrid>
					</section>
				</>
			)}

			<div className="mtai-row-tight" style={{ marginTop: "auto" }}>
				<button
					type="button"
					className="mtai-button--active"
					onClick={() => openDashboard()}
				>
					open dashboard
				</button>
				<button type="button" onClick={() => openDashboard("#settings")}>
					settings
				</button>
			</div>

			{data.error === null ? null : (
				<p className="mtai-note text-error" role="alert">
					{data.error}
				</p>
			)}
		</div>
	);
}
