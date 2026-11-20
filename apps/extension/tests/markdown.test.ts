// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/shared/markdown";

describe("renderMarkdown", () => {
	it("renders lists and paragraphs", () => {
		const html = renderMarkdown("Two things:\n\n1. first\n2. second");
		expect(html).toContain("<ol>");
		expect(html).toContain("<li>first</li>");
		expect(html).toContain("<p>Two things:</p>");
	});

	it("keeps links but opens them safely", () => {
		const html = renderMarkdown("[docs](https://example.com/page)");
		expect(html).toContain('href="https://example.com/page"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	it("strips scripts and event handlers", () => {
		const html = renderMarkdown('<script>alert(1)</script><b onclick="x()">bold</b>');
		expect(html).not.toContain("<script");
		expect(html).not.toContain("onclick");
		expect(html).toContain("bold");
	});

	it("drops javascript: links", () => {
		const html = renderMarkdown("[x](javascript:alert(1))");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("href=");
	});

	it("never emits images or media, so no remote request is made", () => {
		const html = renderMarkdown(
			"![pixel](https://tracker.example/p.png)\n\n<iframe src='x'></iframe>",
		);
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<iframe");
	});

	it("strips inline styles", () => {
		const html = renderMarkdown('<span style="position:fixed">x</span>');
		expect(html).not.toContain("style=");
		expect(html).toContain("x");
	});
});
