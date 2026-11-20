const WIDTH = 320;
const HEIGHT = 64;
const PAD = 5;

function escapeAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/**
 * Minimal line sparkline for the chat snapshot. Markup and classes only; colours
 * come from CSS so both surfaces follow the active theme. The values are numbers
 * generated locally, and the label is escaped.
 */
export function sparklineSvg(values: number[], label: string): string {
	const accessibleLabel = escapeAttribute(label);
	if (values.length === 0) {
		return `<svg class="mtai-spark" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${accessibleLabel}: no data"></svg>`;
	}

	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const step = values.length > 1 ? (WIDTH - PAD * 2) / (values.length - 1) : 0;
	const x = (index: number): number =>
		values.length > 1 ? PAD + index * step : WIDTH / 2;
	const y = (value: number): number =>
		HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);

	const points = values.map((value, index) => [x(index), y(value)] as const);
	const line = points
		.map(
			([px, py], index) => `${index === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`,
		)
		.join(" ");
	const area = `${line} L${x(values.length - 1).toFixed(1)},${HEIGHT - PAD} L${PAD},${HEIGHT - PAD} Z`;

	return `<svg class="mtai-spark" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" aria-label="${accessibleLabel}: ${values.length} points from ${min.toFixed(1)} to ${max.toFixed(1)}"><path class="mtai-spark__area" d="${area}"/><path class="mtai-spark__line" d="${line}" vector-effect="non-scaling-stroke"/></svg>`;
}
