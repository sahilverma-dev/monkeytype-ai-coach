import { browser } from "wxt/browser";
import { captureCompletedTest } from "@/monkeytype/capture-service";
import { mountInpageChat } from "@/monkeytype/inpage-chat";
import { requestSnapshot, sampleTheme } from "@/monkeytype/page-bridge";
import type { RuntimeMessage } from "@/shared/messages";

const CAPTURE_DELAY_MS = 350;
const HEARTBEAT_MS = 15_000;
const WATCHDOG_MS = 2_000;

/**
 * A service worker started by the message itself may not have registered its
 * listener yet, which rejects the first send. Retry briefly instead of losing
 * the heartbeat or the capture.
 */
async function send(message: RuntimeMessage): Promise<unknown> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await browser.runtime.sendMessage(message);
			if (response === undefined) throw new Error("no receiver answered");
			return response;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
		}
	}
	throw lastError;
}

function isTestPage(): boolean {
	return (
		document.querySelector("#typingTest") !== null ||
		document.querySelector("#result") !== null
	);
}

function heartbeat(): void {
	void send({ type: "HEARTBEAT", href: location.href, testPage: isTestPage() }).catch(
		(error) => {
			console.warn("[mtai] heartbeat failed", error);
		},
	);
}

let lastThemeSignature = "";

function reportTheme(): void {
	const theme = sampleTheme();
	if (theme === null) return;
	const signature = `${theme.bg}|${theme.main}|${theme.text}|${theme.font}`;
	if (signature === lastThemeSignature) return;
	lastThemeSignature = signature;
	void send({ type: "THEME_SAMPLED", theme }).catch(() => undefined);
}

/**
 * Monkeytype paints the default palette first, then swaps in the user's theme
 * (a stylesheet in <head>), so sampling once at document_idle can catch the
 * wrong colours. Watch the head and sample again as the app settles.
 */
function watchTheme(): void {
	let timer: number | null = null;
	const schedule = (): void => {
		if (timer !== null) return;
		timer = window.setTimeout(() => {
			timer = null;
			reportTheme();
		}, 250);
	};
	const observer = new MutationObserver(schedule);
	observer.observe(document.head, {
		childList: true,
		subtree: true,
		characterData: true,
	});
	for (const delay of [600, 1_800, 4_500]) window.setTimeout(reportTheme, delay);
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
		mountInpageChat();
		heartbeat();
		// The worker may still be starting when the first message is sent.
		window.setTimeout(heartbeat, 1_200);
		window.setTimeout(heartbeat, 4_000);
		reportTheme();
		watchTheme();
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
