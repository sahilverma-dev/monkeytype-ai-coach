export function mean(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? null;
	const lower = sorted[middle - 1] ?? 0;
	const upper = sorted[middle] ?? 0;
	return (lower + upper) / 2;
}

export function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

export function standardDeviation(values: readonly number[]): number | null {
	if (values.length < 2) return null;
	const average = mean(values);
	if (average === null) return null;
	const variance =
		values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

export function coefficientOfVariation(values: readonly number[]): number | null {
	const average = mean(values);
	if (average === null || average === 0) return null;
	const sd = standardDeviation(values);
	if (sd === null) return null;
	return (sd / average) * 100;
}

/**
 * Least-squares slope of y over x. Used for the "is this improving?" question,
 * which single averages cannot answer.
 */
export function linearSlope(points: readonly { x: number; y: number }[]): number | null {
	if (points.length < 2) return null;
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const meanX = mean(xs);
	const meanY = mean(ys);
	if (meanX === null || meanY === null) return null;
	let numerator = 0;
	let denominator = 0;
	for (let index = 0; index < points.length; index++) {
		const dx = (xs[index] ?? 0) - meanX;
		numerator += dx * ((ys[index] ?? 0) - meanY);
		denominator += dx * dx;
	}
	if (denominator === 0) return null;
	return numerator / denominator;
}

export function pearsonCorrelation(
	a: readonly number[],
	b: readonly number[],
): number | null {
	if (a.length !== b.length || a.length < 3) return null;
	const meanA = mean(a);
	const meanB = mean(b);
	if (meanA === null || meanB === null) return null;
	let numerator = 0;
	let denominatorA = 0;
	let denominatorB = 0;
	for (let index = 0; index < a.length; index++) {
		const da = (a[index] ?? 0) - meanA;
		const db = (b[index] ?? 0) - meanB;
		numerator += da * db;
		denominatorA += da * da;
		denominatorB += db * db;
	}
	const denominator = Math.sqrt(denominatorA * denominatorB);
	if (denominator === 0) return null;
	return numerator / denominator;
}

export function percentChange(from: number | null, to: number | null): number | null {
	if (from === null || to === null || from === 0) return null;
	return ((to - from) / from) * 100;
}

export function round(value: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}
