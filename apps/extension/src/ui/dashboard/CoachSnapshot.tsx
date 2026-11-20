import { type ReactNode, useMemo } from "react";
import type { CoachSnapshot as Snapshot } from "@/ai/snapshot";
import { sparklineSvg } from "@/shared/sparkline";
import { BarList } from "@/ui/components/BarList";
import { formatNumber, formatPercent } from "@/ui/format";

function Spark(props: {
	values: number[];
	label: string;
	format: (value: number) => string;
}): ReactNode {
	const svg = useMemo(
		() => sparklineSvg(props.values, props.label),
		[props.values, props.label],
	);
	const min = props.values.length > 0 ? Math.min(...props.values) : null;
	const max = props.values.length > 0 ? Math.max(...props.values) : null;

	return (
		<figure className="mtai-snap__chart">
			<figcaption className="mtai-snap__chart-head">
				<span className="mtai-note">{props.label}</span>
				<span className="mtai-note">
					{min === null || max === null
						? "—"
						: `${props.format(min)}–${props.format(max)}`}
				</span>
			</figcaption>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: local numeric series, escaped label */}
			<div dangerouslySetInnerHTML={{ __html: svg }} />
		</figure>
	);
}

/**
 * The live view of the window behind the answer. Deterministic, local, and shown
 * next to the conversation so the user can read the shape of the data instead of
 * only prose.
 */
export function CoachSnapshotCard(props: { snapshot: Snapshot }): ReactNode {
	const { snapshot } = props;
	const maxRate = Math.max(1, ...snapshot.topKeys.map((key) => key.errorRate));

	return (
		<section className="mtai-snap" aria-label="Current data snapshot">
			<div className="mtai-row">
				<span className="mtai-note">
					{snapshot.window === "all" ? "all tests" : `last ${snapshot.window} tests`} ·{" "}
					{snapshot.validTests} valid
					{snapshot.excludedTests > 0 ? ` · ${snapshot.excludedTests} excluded` : ""}
				</span>
				<span className="mtai-note">
					key-level data on {snapshot.keyTests} of {snapshot.validTests}
				</span>
			</div>

			<div className="mtai-snap__stats">
				<span className="mtai-snap__stat">
					<b>{formatNumber(snapshot.stats.wpm, 1)}</b> wpm
				</span>
				<span className="mtai-snap__stat">
					<b>{formatPercent(snapshot.stats.acc)}</b> accuracy
				</span>
				<span className="mtai-snap__stat">
					<b>{formatPercent(snapshot.stats.consistency)}</b> consistency
				</span>
				<span className="mtai-snap__stat">
					<b>{formatPercent(snapshot.stats.correctionRate)}</b> corrected
				</span>
			</div>

			<div className="mtai-snap__charts">
				<Spark
					values={snapshot.wpmSeries}
					label="wpm over the window"
					format={(value) => value.toFixed(0)}
				/>
				<Spark
					values={snapshot.accSeries}
					label="accuracy over the window"
					format={(value) => `${value.toFixed(1)}%`}
				/>
			</div>

			<div className="mtai-stack" style={{ gap: "0.3rem" }}>
				<div className="mtai-row">
					<span className="mtai-card-title" style={{ margin: 0 }}>
						top problem keys
					</span>
					<span className="mtai-note">by errors</span>
				</div>
				{snapshot.topKeys.length === 0 ? (
					<p className="mtai-note">
						No key-level problems in this window. Key data appears for tests captured with
						keystroke detail.
					</p>
				) : (
					<BarList
						items={snapshot.topKeys.map((key) => ({
							key: key.char,
							label: key.char,
							ratio: key.errorRate / maxRate,
							value: formatPercent(key.errorRate),
							hint: `${key.errors} errors in ${key.attempts} attempts`,
							tone: "error",
						}))}
					/>
				)}
			</div>
		</section>
	);
}
