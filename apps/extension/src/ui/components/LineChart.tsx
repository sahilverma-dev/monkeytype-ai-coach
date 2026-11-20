import type { ReactNode } from "react";

const WIDTH = 600;
const PAD_X = 10;

export function LineChart(props: {
	values: number[];
	height?: number;
	label: string;
	formatValue?: (value: number) => string;
}): ReactNode {
	const values = props.values;
	if (values.length === 0) return null;

	const height = props.height ?? 150;
	const padTop = 14;
	const padBottom = 14;
	const format = props.formatValue ?? ((value: number) => value.toFixed(0));
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const stepX = values.length > 1 ? (WIDTH - PAD_X * 2) / (values.length - 1) : 0;

	const x = (index: number): number =>
		values.length > 1 ? PAD_X + index * stepX : WIDTH / 2;
	const flat = max === min;
	const y = (value: number): number =>
		flat
			? height / 2
			: height - padBottom - ((value - min) / span) * (height - padTop - padBottom);

	const points = values.map((value, index) => [x(index), y(value)] as const);
	const path = points
		.map(
			([px, py], index) => `${index === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`,
		)
		.join(" ");
	const area =
		values.length > 1
			? `${path} L${x(values.length - 1).toFixed(1)},${height - padBottom} L${PAD_X.toFixed(1)},${height - padBottom} Z`
			: "";
	const showDots = values.length <= 30;

	return (
		<figure className="mtai-chart" style={{ margin: 0 }}>
			<svg
				viewBox={`0 0 ${WIDTH} ${height}`}
				role="img"
				aria-label={`${props.label}: ${values.length} values, from ${format(min)} to ${format(max)}`}
			>
				<title>{`${props.label}: ${values.length} values, from ${format(min)} to ${format(max)}`}</title>
				<line
					className="mtai-chart__grid"
					x1={0}
					x2={WIDTH}
					y1={height - padBottom}
					y2={height - padBottom}
				/>
				<line className="mtai-chart__grid" x1={0} x2={WIDTH} y1={padTop} y2={padTop} />
				{area !== "" ? <path className="mtai-chart__area" d={area} /> : null}
				<path className="mtai-chart__line" d={path} />
				{showDots
					? points.map(([px, py]) => (
							<circle
								key={`${px.toFixed(2)}-${py.toFixed(2)}`}
								className="mtai-chart__dot"
								cx={px}
								cy={py}
								r={2.5}
							/>
						))
					: null}
				<text className="mtai-chart__label" x={PAD_X} y={padTop - 4}>
					{format(max)}
				</text>
				<text className="mtai-chart__label" x={PAD_X} y={height - padBottom - 4}>
					{format(min)}
				</text>
			</svg>
		</figure>
	);
}
