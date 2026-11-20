import { type ReactNode, useEffect, useState } from "react";
import { analyzeChars } from "@/analytics/errors";
import { computeWindowStats, selectTestsForWindow } from "@/analytics/overview";
import { detectWeaknesses, displayChar } from "@/analytics/weaknesses";
import { ANALYSIS_WINDOWS } from "@/shared/constants";
import type { AnalysisWindow, CapturedTest } from "@/shared/types";
import { BarList } from "@/ui/components/BarList";
import { LineChart } from "@/ui/components/LineChart";
import { Panel } from "@/ui/components/Panel";
import { Stat, StatGrid } from "@/ui/components/Stat";
import { EmptyState } from "@/ui/components/States";
import { formatNumber, formatPercent, relativeTime } from "@/ui/format";
import { useCaptureData } from "@/ui/useCaptureData";
import { CoachTab } from "./CoachTab";
import { SettingsTab } from "./SettingsTab";

const TABS = [
	{ id: "overview", label: "overview" },
	{ id: "keys", label: "keys" },
	{ id: "coach", label: "coach" },
	{ id: "tests", label: "tests" },
	{ id: "settings", label: "settings" },
];

function windowLabel(window: AnalysisWindow): string {
	return window === "all" ? "all tests" : `last ${window} tests`;
}

function coverageNote(tests: CapturedTest[], validCount: number): string {
	const withKeys = tests.filter(
		(test) => test.fidelity === "full" && test.excludedReason === null,
	).length;
	const computed = tests.filter((test) => test.metricsSource === "computed").length;
	const parts: string[] = [];
	parts.push(`${validCount} valid ${validCount === 1 ? "test" : "tests"} in this window`);
	parts.push(`key-level data on ${withKeys}`);
	if (computed > 0) parts.push(`${computed} with computed rather than displayed numbers`);
	return parts.join(" · ");
}

export function Dashboard(): ReactNode {
	const data = useCaptureData();
	const [tab, setTab] = useState<string>(
		() => window.location.hash.replace("#", "") || "overview",
	);

	useEffect(() => {
		const onHashChange = (): void => {
			const next = window.location.hash.replace("#", "") || "overview";
			setTab(TABS.some((entry) => entry.id === next) ? next : "overview");
		};
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	const selectTab = (id: string): void => {
		setTab(id);
		window.history.replaceState(null, "", `#${id}`);
	};

	const analysisWindow = data.settings.analysisWindow;
	const windowed = selectTestsForWindow(data.tests, analysisWindow);
	const stats = computeWindowStats(data.tests, analysisWindow);
	const chars = analyzeChars(windowed);
	const weaknesses = detectWeaknesses(stats, chars);
	const connected =
		data.session !== null && Date.now() - data.session.lastSeenAt < 90_000;

	return (
		<div className="mtai-shell">
			<header className="mtai-topbar">
				<div className="mtai-stack" style={{ gap: "0.2rem" }}>
					<h1 className="mtai-brand">
						monkeytype <span>ai companion</span>
					</h1>
					<div className="mtai-row-tight">
						<span className={`mtai-dot${connected ? " mtai-dot--on" : ""}`} />
						<span className="mtai-note">
							{connected
								? `connected to monkeytype · seen ${relativeTime(data.session?.lastSeenAt ?? 0)}`
								: "not connected · open monkeytype to capture tests"}
						</span>
					</div>
				</div>
				<nav>
					<div className="mtai-tabs" role="tablist" aria-label="Sections">
						{TABS.map((entry) => (
							<button
								key={entry.id}
								type="button"
								role="tab"
								id={`mtai-tab-${entry.id}`}
								aria-selected={tab === entry.id}
								aria-controls={`mtai-panel-${entry.id}`}
								onClick={() => selectTab(entry.id)}
							>
								{entry.label}
							</button>
						))}
					</div>
				</nav>
			</header>

			<hr className="mtai-rule" />

			{data.error !== null ? (
				<div className="mtai-error" role="alert">
					{data.error}
				</div>
			) : null}

			{data.loading ? (
				<p className="mtai-loading">loading captured tests…</p>
			) : (
				<>
					<section
						id="mtai-panel-overview"
						role="tabpanel"
						aria-labelledby="mtai-tab-overview"
						hidden={tab !== "overview"}
						className="mtai-stack"
					>
						{data.tests.length === 0 ? (
							<EmptyState
								title="No tests captured yet"
								steps={[
									"Open monkeytype.com and complete a typing test.",
									"Return here — the result appears automatically.",
									"Key-level analysis needs the page's in-memory test log, so keep the extension enabled while typing.",
								]}
							>
								<p className="mtai-note">
									Nothing is uploaded. Everything on this page is stored in this browser.
								</p>
							</EmptyState>
						) : (
							<>
								<div className="mtai-row">
									<span className="mtai-note">
										analysing {windowLabel(analysisWindow)} ·{" "}
										{coverageNote(windowed, stats.validTests)}
									</span>
									<label className="mtai-field" style={{ maxWidth: "9rem" }}>
										<span className="mtai-field__label">window</span>
										<select
											value={String(analysisWindow)}
											onChange={(event) => {
												const raw = event.target.value;
												const next: AnalysisWindow =
													raw === "all" ? "all" : (Number(raw) as 10 | 20 | 50 | 100);
												void data.saveSettings({ analysisWindow: next });
											}}
										>
											{ANALYSIS_WINDOWS.map((window) => (
												<option key={String(window)} value={String(window)}>
													{window === "all" ? "all" : `last ${window}`}
												</option>
											))}
										</select>
									</label>
								</div>

								<StatGrid>
									<Stat
										label="avg wpm"
										value={formatNumber(stats.wpm.average, 1)}
										hint={
											stats.recentVsEarlier.changePct === null
												? `${stats.wpm.best ?? 0} best`
												: `${stats.recentVsEarlier.changePct >= 0 ? "+" : ""}${stats.recentVsEarlier.changePct.toFixed(1)}% recent vs earlier`
										}
									/>
									<Stat
										label="avg accuracy"
										value={formatPercent(stats.acc.average)}
										hint={`${stats.charTotals.incorrect} incorrect chars`}
									/>
									<Stat
										label="avg raw"
										value={formatNumber(stats.rawWpm.average, 1)}
										hint={`best ${formatNumber(stats.rawWpm.best, 1)}`}
									/>
									<Stat
										label="consistency"
										value={
											stats.consistency.average === null
												? "—"
												: formatPercent(stats.consistency.average)
										}
										hint="reported by monkeytype"
									/>
									<Stat
										label="corrections"
										value={
											stats.correctionRate === null
												? "—"
												: formatPercent(stats.correctionRate)
										}
										hint="of keystrokes, fixed later"
									/>
									<Stat
										label="tests"
										value={String(stats.validTests)}
										hint={
											stats.excludedTests > 0
												? `${stats.excludedTests} excluded (bailed out or short)`
												: coverageNote(windowed, stats.validTests)
										}
									/>
								</StatGrid>

								<Panel title="wpm trend">
									<LineChart
										values={[...windowed]
											.reverse()
											.filter((test) => test.excludedReason === null)
											.map((test) => test.wpm)}
										label="WPM per test in this window"
										formatValue={(value) => value.toFixed(0)}
									/>
									<div className="mtai-chart__meta">
										<span>oldest</span>
										<span>
											{stats.trend === null
												? "needs 3+ tests for a trend"
												: `trend ${stats.trend.direction} · ${stats.trend.changeOverWindow >= 0 ? "+" : ""}${stats.trend.changeOverWindow.toFixed(1)} wpm across window`}
										</span>
										<span>newest</span>
									</div>
								</Panel>

								<Panel title="what to work on">
									{weaknesses.length === 0 ? (
										<p className="mtai-note">
											No recurring problems detected in this window. Keep the sample size
											growing — the analysis needs at least a few tests before it will
											claim anything.
										</p>
									) : (
										<div className="mtai-stack">
											{weaknesses.slice(0, 4).map((weakness) => (
												<div
													key={weakness.id}
													className="mtai-stack"
													style={{ gap: "0.15rem" }}
												>
													<div className="mtai-row-tight">
														<span
															className={
																weakness.severity === "high"
																	? "mtai-badge mtai-badge--error"
																	: "mtai-badge"
															}
														>
															{weakness.severity}
														</span>
														<strong style={{ fontWeight: 400 }}>{weakness.title}</strong>
													</div>
													<span className="mtai-note">{weakness.evidence}</span>
													<span className="mtai-note text-main">
														{weakness.recommendation}
													</span>
												</div>
											))}
										</div>
									)}
								</Panel>

								<Panel title="personal bests in this window">
									{stats.pbs.length === 0 ? (
										<p className="mtai-note">No valid tests yet.</p>
									) : (
										<div className="mtai-table-wrap">
											<table className="mtai-table">
												<thead>
													<tr>
														<th>mode</th>
														<th className="mtai-table__num">wpm</th>
														<th className="mtai-table__num">acc</th>
														<th>when</th>
													</tr>
												</thead>
												<tbody>
													{stats.pbs.map((pb) => (
														<tr key={pb.key}>
															<td>{pb.key}</td>
															<td className="mtai-table__num">
																{formatNumber(pb.wpm, 1)}
															</td>
															<td className="mtai-table__num">{formatPercent(pb.acc)}</td>
															<td className="text-sub">{relativeTime(pb.timestamp)}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</Panel>
							</>
						)}
					</section>

					<section
						id="mtai-panel-keys"
						role="tabpanel"
						aria-labelledby="mtai-tab-keys"
						hidden={tab !== "keys"}
						className="mtai-stack"
					>
						{chars.coverage.testsWithKeys === 0 ? (
							<EmptyState
								title="No key-level data in this window"
								steps={[
									"Key analysis uses the per-keystroke log Monkeytype keeps in memory for the last test.",
									"Complete a new test with the extension enabled, then return here.",
									"Older or imported results only carry headline numbers.",
								]}
							/>
						) : (
							<>
								<div className="mtai-row">
									<span className="mtai-note">
										{chars.coverage.testsWithKeys} of {chars.coverage.testsTotal} tests in
										this window carry keystroke detail · {chars.totals.attempts}{" "}
										characters analysed
									</span>
									<span className="mtai-note">
										overall error rate {formatPercent(chars.overallErrorRate)}
									</span>
								</div>

								<Panel title="most attempts">
									<BarList
										items={chars.chars.slice(0, 12).map((entry) => ({
											key: entry.char,
											label: displayChar(entry.char),
											ratio:
												entry.attempts === 0
													? 0
													: entry.attempts /
														Math.max(...chars.chars.map((item) => item.attempts)),
											value: `${entry.attempts}×`,
											hint: `${entry.errors} errors, ${entry.missed} missed`,
										}))}
									/>
								</Panel>

								<Panel
									title="recurring misses"
									aside={<span className="mtai-note">sorted by errors</span>}
								>
									<div className="mtai-table-wrap">
										<table className="mtai-table">
											<thead>
												<tr>
													<th>key</th>
													<th className="mtai-table__num">attempts</th>
													<th className="mtai-table__num">errors</th>
													<th className="mtai-table__num">error rate</th>
													<th className="mtai-table__num">fixed</th>
													<th className="mtai-table__num">missed</th>
													<th>often typed as</th>
												</tr>
											</thead>
											<tbody>
												{chars.chars
													.filter((entry) => entry.errors > 0 || entry.missed > 0)
													.slice(0, 20)
													.map((entry) => (
														<tr key={entry.char}>
															<td>{displayChar(entry.char)}</td>
															<td className="mtai-table__num">{entry.attempts}</td>
															<td className="mtai-table__num">{entry.errors}</td>
															<td className="mtai-table__num">
																<span
																	className={
																		entry.errorRate >= 15 ? "text-error" : undefined
																	}
																>
																	{formatPercent(entry.errorRate)}
																</span>
															</td>
															<td className="mtai-table__num">{entry.corrected}</td>
															<td className="mtai-table__num">{entry.missed}</td>
															<td className="text-sub">
																{entry.confusion
																	.slice(0, 3)
																	.map(
																		(confusion) =>
																			`${displayChar(confusion.typed)} (${confusion.count})`,
																	)
																	.join(", ") || "—"}
															</td>
														</tr>
													))}
											</tbody>
										</table>
									</div>
								</Panel>

								<Panel title="slowest pairs">
									{chars.slowBigrams.length === 0 ? (
										<p className="mtai-note">
											Not enough repeated pairs yet. Timing needs the same pair typed a
											few times.
										</p>
									) : (
										<BarList
											items={chars.slowBigrams.slice(0, 10).map((bigram) => ({
												key: bigram.pair,
												label: bigram.pair,
												ratio:
													bigram.meanMs / (chars.slowBigrams[0]?.meanMs ?? bigram.meanMs),
												value: `${bigram.meanMs}ms`,
												hint: `${bigram.samples} samples`,
											}))}
										/>
									)}
								</Panel>
							</>
						)}
					</section>

					<section
						id="mtai-panel-coach"
						role="tabpanel"
						aria-labelledby="mtai-tab-coach"
						hidden={tab !== "coach"}
						className="mtai-stack"
					>
						<CoachTab data={data} onOpenSettings={() => selectTab("settings")} />
					</section>

					<section
						id="mtai-panel-tests"
						role="tabpanel"
						aria-labelledby="mtai-tab-tests"
						hidden={tab !== "tests"}
						className="mtai-stack"
					>
						<Panel
							title="captured tests"
							aside={
								<span className="mtai-note">
									{data.tests.length} total · newest first
								</span>
							}
						>
							{data.tests.length === 0 ? (
								<p className="mtai-note">Nothing captured yet.</p>
							) : (
								<div className="mtai-table-wrap">
									<table className="mtai-table">
										<thead>
											<tr>
												<th>when</th>
												<th>mode</th>
												<th className="mtai-table__num">wpm</th>
												<th className="mtai-table__num">raw</th>
												<th className="mtai-table__num">acc</th>
												<th className="mtai-table__num">cons</th>
												<th>data</th>
											</tr>
										</thead>
										<tbody>
											{data.tests.slice(0, 300).map((test) => (
												<tr key={test.id}>
													<td className="text-sub">{relativeTime(test.timestamp)}</td>
													<td>
														{test.mode}{" "}
														{test.mode === "zen" || test.mode === "custom"
															? ""
															: test.mode2}
													</td>
													<td className="mtai-table__num">{formatNumber(test.wpm, 1)}</td>
													<td className="mtai-table__num">
														{formatNumber(test.rawWpm, 1)}
													</td>
													<td className="mtai-table__num">{formatPercent(test.acc)}</td>
													<td className="mtai-table__num">
														{test.consistency === null
															? "—"
															: formatPercent(test.consistency, 0)}
													</td>
													<td className="text-sub">
														{test.fidelity === "full" ? "keys" : "summary"}
														{test.excludedReason === null
															? ""
															: ` · ${test.excludedReason}`}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</Panel>
					</section>

					<section
						id="mtai-panel-settings"
						role="tabpanel"
						aria-labelledby="mtai-tab-settings"
						hidden={tab !== "settings"}
					>
						<SettingsTab data={data} />
					</section>
				</>
			)}

			<footer className="mtai-footer">
				<p className="mtai-note">
					headline numbers come from the result screen you saw; key analysis is derived
					locally from the page's test log. no data leaves this browser.
				</p>
			</footer>
		</div>
	);
}
