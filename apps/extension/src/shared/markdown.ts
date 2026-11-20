import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

// Model output is untrusted input. Links open in a new tab and nothing that can
// make a network request (images, media, iframes) survives sanitisation.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
	if (node.tagName !== "A") return;
	const href = node.getAttribute("href") ?? "";
	if (/^(https?:|mailto:)/i.test(href)) {
		node.setAttribute("target", "_blank");
		node.setAttribute("rel", "noopener noreferrer");
	} else {
		node.removeAttribute("href");
	}
});

const FORBID_TAGS = [
	"img",
	"picture",
	"source",
	"iframe",
	"video",
	"audio",
	"form",
	"input",
	"button",
	"style",
	"link",
	"meta",
	"object",
	"embed",
	"svg",
];

/** Markdown -> sanitised HTML, safe to inject into either UI surface. */
export function renderMarkdown(text: string): string {
	const html = marked.parse(text, { async: false }) as string;
	return DOMPurify.sanitize(html, {
		FORBID_TAGS,
		FORBID_ATTR: ["style"],
	});
}
