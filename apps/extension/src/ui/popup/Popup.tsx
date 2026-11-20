import type { ReactNode } from "react";
import { browser } from "wxt/browser";
import { computeWindowStats } from "@/analytics/overview";
import { runtimeUrl } from "@/shared/extension-url";
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
