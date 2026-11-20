import type { CapturedTest } from "@/shared/types";

export function formatNumber(value: number | null | undefined, digits = 0): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	return value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	return `${value.toFixed(digits)}%`;
}

export function relativeTime(timestamp: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
	if (seconds < 20) return "just now";
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

export function formatDateTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
	}
	const whole = Math.round(seconds);
	const minutes = Math.floor(whole / 60);
	const rest = whole % 60;
	return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatMode(test: Pick<CapturedTest, "mode" | "mode2">): string {
	if (test.mode === "zen" || test.mode === "custom") return test.mode;
	return `${test.mode} ${test.mode2}`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
	return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}
