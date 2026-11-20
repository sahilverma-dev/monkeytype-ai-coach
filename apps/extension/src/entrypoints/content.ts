import { browser } from "wxt/browser";
import { captureCompletedTest } from "@/monkeytype/capture-service";
import { requestSnapshot, sampleTheme } from "@/monkeytype/page-bridge";
import type { RuntimeMessage } from "@/shared/messages";

const CAPTURE_DELAY_MS = 350;
const HEARTBEAT_MS = 30_000;
const WATCHDOG_MS = 2_000;

function send(message: RuntimeMessage): Promise<unknown> {
	return browser.runtime.sendMessage(message).catch(() => undefined);
}

function isTestPage(): boolean {
	return (
		document.querySelector("#typingTest") !== null ||
		document.querySelector("#result") !== null
	);
}

function heartbeat(): void {
	void send({ type: "HEARTBEAT", href: location.href, testPage: isTestPage() });
}

let lastThemeSignature = "";

function reportTheme(): void {
	const theme = sampleTheme();
	if (theme === null) return;
	const signature = `${theme.bg}|${theme.main}|${theme.text}|${theme.font}`;
	if (signature === lastThemeSignature) return;
	lastThemeSignature = signature;
	void send({ type: "THEME_SAMPLED", theme });
}

let observedParent: Element | null = null;
let resultObserver: MutationObserver | null = null;
let captureInFlight = false;

function resultElement(): HTMLElement | null {
	const element = document.querySelector("#result");
	return element instanceof HTMLElement ? element : null;
}

function scheduleCapture(): void {
	const element = resultElement();
	if (element === null) return;
	if (element.dataset.mtaiCaptured === "1") return;
	element.dataset.mtaiCaptured = "1";
	window.setTimeout(() => {
		void runCapture();
	}, CAPTURE_DELAY_MS);
}

async function runCapture(): Promise<void> {
	if (captureInFlight) return;
	captureInFlight = true;
	try {
		const outcome = await captureCompletedTest({
			doc: document,
			storage: window.localStorage,
			requestSnapshot,
			send,
		});
		if (outcome.status === "skipped") {
			console.info("[mtai] capture skipped:", outcome.reason);
		} else if (outcome.status === "stored") {
			console.info("[mtai] captured test", outcome.test.id);
		}
		reportTheme();
	} catch (error) {
		console.warn("[mtai] capture failed", error);
	} finally {
		captureInFlight = false;
	}
}

function attachObserver(): boolean {
	const typingTest = document.querySelector("#typingTest");
	const parent = typingTest?.parentElement ?? null;
	if (parent === null) return false;
	if (observedParent === parent && resultObserver !== null) {
		if (resultElement() !== null) scheduleCapture();
		return true;
	}
	resultObserver?.disconnect();
	observedParent = parent;
	resultObserver = new MutationObserver(() => {
		if (resultElement() !== null) scheduleCapture();
	});
	resultObserver.observe(parent, { childList: true });
	if (resultElement() !== null) scheduleCapture();
	return true;
}

export default defineContentScript({
	matches: ["https://monkeytype.com/*", "https://www.monkeytype.com/*"],
	runAt: "document_idle",
	main() {
		heartbeat();
		reportTheme();
		attachObserver();

		// Cheap safety net: catches the initial mount, SPA remounts, and any
		// missed mutation. Two querySelectors, no keystroke work.
		window.setInterval(() => {
			if (document.visibilityState === "hidden") return;
			if (observedParent !== null && !observedParent.isConnected) {
				observedParent = null;
				attachObserver();
			}
			if (document.querySelector("#typingTest") !== null) {
				attachObserver();
				if (resultElement() !== null) scheduleCapture();
			}
		}, WATCHDOG_MS);

		window.setInterval(heartbeat, HEARTBEAT_MS);
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") heartbeat();
		});
	},
});
