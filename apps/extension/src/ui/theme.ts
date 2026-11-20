import type { ThemeSnapshot } from "@/shared/types";

const VARIABLES: { key: keyof ThemeSnapshot; css: string }[] = [
	{ key: "bg", css: "--bg-color" },
	{ key: "main", css: "--main-color" },
	{ key: "sub", css: "--sub-color" },
	{ key: "subAlt", css: "--sub-alt-color" },
	{ key: "text", css: "--text-color" },
	{ key: "error", css: "--error-color" },
	{ key: "errorExtra", css: "--error-extra-color" },
	{ key: "roundness", css: "--roundness" },
	{ key: "font", css: "--font" },
];

function luminance(color: string): number | null {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	if (hex !== null) {
		const value = hex[1] ?? "";
		const full =
			value.length === 3
				? value
						.split("")
						.map((char) => char + char)
						.join("")
				: value;
		const r = Number.parseInt(full.slice(0, 2), 16) / 255;
		const g = Number.parseInt(full.slice(2, 4), 16) / 255;
		const b = Number.parseInt(full.slice(4, 6), 16) / 255;
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}
	const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color.trim());
	if (rgb !== null) {
		const r = Number(rgb[1]) / 255;
		const g = Number(rgb[2]) / 255;
		const b = Number(rgb[3]) / 255;
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}
	return null;
}

/**
 * Applies the theme sampled from the user's Monkeytype tab to the extension
 * pages, so the dashboard matches whatever theme they actually use.
 */
export function applyTheme(snapshot: ThemeSnapshot | null, follow: boolean): void {
	const root = document.documentElement;
	const useTheme = follow && snapshot !== null;
	for (const variable of VARIABLES) {
		const value = useTheme ? snapshot[variable.key] : "";
		if (value === "") {
			root.style.removeProperty(variable.css);
		} else {
			root.style.setProperty(variable.css, String(value));
		}
	}
	const background = useTheme ? snapshot.bg : null;
	const brightness = background === null ? null : luminance(background);
	root.style.colorScheme = brightness !== null && brightness > 0.5 ? "light" : "dark";
}
