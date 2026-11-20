import type { ReactNode } from "react";
import type { WindowStats } from "@/analytics/overview";
import type { CapturedTest } from "@/shared/types";
import { LineChart } from "@/ui/components/LineChart";
import { Panel } from "@/ui/components/Panel";
import { formatMode, formatNumber, formatPercent, relativeTime } from "@/ui/format";

function series(
	tests: CapturedTest[],
	pick: (test: CapturedTest) => number | null,
): number[] {
	return [...tests]
		.reverse()
		.filter((test) => test.excludedReason === null)
		.map(pick)
		.filter((value): value is number => value !== null);
}

function Trend(props: {
	title: string;
	values: number[];
	format: (value: number) => string;
	unit: string;
	hint: string;
}): ReactNode {
	return (
		<Panel title={props.title} aside={<span className="mtai-note">{props.hint}</span>}>
			{props.values.length < 2 ? (
				<p className="mtai-note">Needs at least two valid tests in this window.</p>
			) : (
				<>
					<LineChart
						values={props.values}
						label={props.title}
						formatValue={props.format}
						height={130}
					/>
					<div className="mtai-chart__meta">
						<span>oldest</span>
						<span>
							{props.format(Math.min(...props.values))}–
							{props.format(Math.max(...props.values))} {props.unit}
						</span>
						<span>newest</span>
					</div>
				</>
			)}
		</Panel>
	);
}

export function TrendsTab(props: {
	stats: WindowStats;
	windowed: CapturedTest[];
}): ReactNode {
	const { stats } = props;
	const wpm = series(props.windowed, (test) => test.wpm);
	const acc = series(props.windowed, (test) => test.acc);
	const consistency = series(props.windowed, (test) => test.consistency);
	const raw = series(props.windowed, (test) => test.rawWpm);

	const improvement = stats.recentVsEarlier.changePct;

	return (
		<div className="mtai-stack">
			<Panel title="improvement indicators">
				<div className="mtai-row">
					<div className="mtai-stack" style={{ gap: "0.15rem" }}>
						<span className="mtai-note">recent third vs earlier third</span>
						<span
							className={
								improvement === null
									? "mtai-stat__value"
									: improvement >= 0
										? "mtai-stat__value mtai-delta--up"
										: "mtai-stat__value mtai-delta--down"
							}
						>
							{improvement === null
								? "—"
								: `${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}%`}
						</span>
						<span className="mtai-note">
							{stats.recentVsEarlier.recentWpm === null
								? "not enough tests to compare"
								: `${formatNumber(stats.recentVsEarlier.recentWpm, 1)} wpm now vs ${formatNumber(stats.recentVsEarlier.earlierWpm, 1)} earlier`}
						</span>
					</div>
					<div className="mtai-stack" style={{ gap: "0.15rem" }}>
						<span className="mtai-note">trend across the window</span>
						<span className="mtai-stat__value">
							{stats.trend === null
								? "—"
								: `${stats.trend.changeOverWindow >= 0 ? "+" : ""}${stats.trend.changeOverWindow.toFixed(1)}`}
						</span>
						<span className="mtai-note">
							{stats.trend === null
								? "needs three valid tests"
								: `wpm, ${stats.trend.direction}`}
						</span>
					</div>
					<div className="mtai-stack" style={{ gap: "0.15rem" }}>
						<span className="mtai-note">spread</span>
						<span className="mtai-stat__value">{formatNumber(stats.wpm.sd, 1)}</span>
						<span className="mtai-note">
							wpm standard deviation · {formatNumber(stats.wpm.best, 1)} best ·{" "}
							{formatNumber(stats.wpm.worst, 1)} worst
						</span>
					</div>
				</div>
			</Panel>

			<Trend
				title="wpm over the window"
				values={wpm}
				format={(value) => value.toFixed(0)}
				unit="wpm"
				hint={`${wpm.length} valid tests`}
			/>

			<Trend
				title="accuracy over the window"
				values={acc}
				format={(value) => `${value.toFixed(1)}%`}
				unit="accuracy"
				hint={`${formatPercent(stats.acc.average)} average`}
			/>

			<Trend
				title="consistency over the window"
				values={consistency}
				format={(value) => `${value.toFixed(0)}%`}
				unit="consistency"
				hint={
					consistency.length === 0
						? "not reported by Monkeytype for these tests"
						: `${formatPercent(stats.consistency.average, 1)} average`
				}
			/>

			<Trend
				title="raw speed over the window"
				values={raw}
				format={(value) => value.toFixed(0)}
				unit="raw"
				hint={`${formatNumber(stats.rawWpm.average, 1)} average`}
			/>

			<Panel title="by mode">
				{stats.byMode.length === 0 ? (
					<p className="mtai-note">No valid tests in this window.</p>
				) : (
					<div className="mtai-table-wrap">
						<table className="mtai-table">
							<thead>
								<tr>
									<th>mode</th>
									<th className="mtai-table__num">tests</th>
									<th className="mtai-table__num">avg wpm</th>
									<th className="mtai-table__num">avg acc</th>
									<th className="mtai-table__num">best</th>
								</tr>
							</thead>
							<tbody>
								{stats.byMode.map((mode) => (
									<tr key={mode.key}>
										<td>{mode.key}</td>
										<td className="mtai-table__num">{mode.tests}</td>
										<td className="mtai-table__num">
											{formatNumber(mode.averageWpm, 1)}
										</td>
										<td className="mtai-table__num">{formatPercent(mode.averageAcc)}</td>
										<td className="mtai-table__num">{formatNumber(mode.bestWpm, 1)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Panel>

			<Panel title="latest results">
				<div className="mtai-table-wrap">
					<table className="mtai-table">
						<thead>
							<tr>
								<th>when</th>
								<th>mode</th>
								<th className="mtai-table__num">wpm</th>
								<th className="mtai-table__num">acc</th>
								<th className="mtai-table__num">data</th>
							</tr>
						</thead>
						<tbody>
							{props.windowed.slice(0, 8).map((test) => (
								<tr key={test.id}>
									<td className="text-sub">{relativeTime(test.timestamp)}</td>
									<td>{formatMode(test)}</td>
									<td className="mtai-table__num">{formatNumber(test.wpm, 1)}</td>
									<td className="mtai-table__num">{formatPercent(test.acc)}</td>
									<td className="text-sub">{test.fidelity}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Panel>
		</div>
	);
}
