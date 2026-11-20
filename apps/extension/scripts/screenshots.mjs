/**
 * Regenerates the README screenshots from the built extension, using a seeded
 * demo profile. No network, no API keys: the coach transcript is seeded so the
 * screenshots are deterministic.
 *
 *   bun run screenshots
 *
 * Output: docs/screenshots/*.png
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, "../.output/chrome-mv3");
const outDir = resolve(here, "../../../docs/screenshots");
const profile = await mkdtemp(join(tmpdir(), "mtai-shots-"));

if (!existsSync(join(extensionPath, "manifest.json"))) {
	console.error(`Build first: ${extensionPath} has no manifest.json`);
	process.exit(1);
}
await mkdir(outDir, { recursive: true });

const log = (...args) => console.log("[shots]", ...args);
const day = 86_400_000;
const now = Date.now();

// Demo history: a believable three-week improvement curve with a recurring "r"
// problem, a secondary "n" problem, one non-key confusion and slow pairs.
const wpmSeries = [
	78, 76, 79, 74, 75, 72, 73, 70, 71, 69, 68, 70, 66, 67, 64, 65, 62, 63, 60, 61, 58, 57,
	55, 54,
];
const accSeries = [
	97.8, 97.1, 97.4, 96.9, 97.2, 96.6, 96.8, 96.3, 96.7, 96.1, 95.9, 96.4, 95.7, 96.0,
	95.4, 95.8, 95.1, 95.6, 94.9, 95.3, 94.6, 95.0, 94.2, 94.7,
];
const consSeries = [
	86, 84, 85, 83, 82, 81, 83, 80, 79, 81, 78, 80, 77, 78, 76, 77, 74, 76, 73, 75, 71, 72,
	69, 70,
];

const tests = wpmSeries.map((wpm, index) => {
	const mode = index % 5 === 2 ? "words" : "time";
	const mode2 = mode === "time" ? "30" : index % 10 === 2 ? "25" : "50";
	const hasKeys = index % 6 !== 5;
	const errors = 14 + (index % 4);
	return {
		id: `demo-${index}`,
		fingerprint: `demo-${index}`,
		capturedAt: now - index * day,
		startedAt: now - index * day,
		timestamp: now - index * day,
		mode,
		mode2,
		difficulty: "normal",
		language: "english",
		punctuation: false,
		numbers: false,
		funbox: [],
		wpm,
		rawWpm: Math.round((wpm + 5 + (index % 3)) * 10) / 10,
		acc: accSeries[index],
		consistency: consSeries[index],
		charStats: [380 + (index % 20), errors, 0, 2 + (index % 3)],
		testDuration: 30,
		bailedOut: false,
		fidelity: hasKeys ? "full" : "summary",
		metricsSource: "monkeytype",
		keyStats: hasKeys
			? {
					chars: [
						{
							char: "r",
							attempts: 20,
							errors: index % 2 === 0 ? 3 : 2,
							corrected: 2,
							missed: 0,
							confusion: [{ typed: "t", count: index % 2 === 0 ? 3 : 2 }],
						},
						{
							char: "n",
							attempts: 22,
							errors: 2,
							corrected: 2,
							missed: 0,
							confusion: [{ typed: "m", count: 1 }],
						},
						{
							char: "b",
							attempts: 14,
							errors: 1,
							corrected: 1,
							missed: 0,
							confusion: [{ typed: "v", count: 1 }],
						},
						{
							char: "e",
							attempts: 80,
							errors: 1,
							corrected: 1,
							missed: 0,
							confusion: [],
						},
						{
							char: "t",
							attempts: 60,
							errors: 0,
							corrected: 0,
							missed: 0,
							confusion: [],
						},
					],
					bigrams: [
						{ pair: "rt", samples: 6, meanMs: 322 + (index % 9) },
						{ pair: "pl", samples: 5, meanMs: 288 + (index % 7) },
						{ pair: "th", samples: 9, meanMs: 205 },
					],
					keystrokes: 410,
					corrections: 12,
					missedChars: 2,
					extraChars: 0,
				}
			: null,
		excludedReason: null,
	};
});

const conversation = {
	id: "demo-conversation",
	title: "What should I practise next?",
	createdAt: now - 60_000,
	updatedAt: now - 30_000,
	messages: [
		{
			id: "m1",
			role: "user",
			content: "What should I practise next?",
			createdAt: now - 60_000,
		},
		{
			id: "m2",
			role: "assistant",
			content:
				'Your last 20 tests average 69.2 wpm at 96.3% accuracy, with a clear upward trend of +17.7 wpm across the window. The limiter is consistency: 79.4% on average, dipping to 73% on your slower days.\n\nTwo things stand out:\n\n1. "r" — 44 errors in 340 attempts (12.9%), usually typed as "t". It is your biggest source of corrected errors.\n2. "rt" takes 325ms on average, well above your other pairs, which suggests the r→t confusion costs you rhythm too.\n\nPractise this next: 10 minutes of custom text built from r/t pairs ("tart", "treat", "return", "better"), typed at 90% of your current speed. Then run three 30-second tests and aim for 97% accuracy with consistency above 85%. Keep the word list at english 1k until that holds.',
			createdAt: now - 45_000,
			provider: "openai",
			model: "gpt-4.1-mini",
		},
	],
};

const context = await chromium.launchPersistentContext(profile, {
	channel: "chromium",
	headless: true,
	viewport: { width: 1280, height: 900 },
	args: [
		`--disable-extensions-except=${extensionPath}`,
		`--load-extension=${extensionPath}`,
		"--no-first-run",
		"--no-default-browser-check",
	],
});

let exitCode = 0;

try {
	let worker = context
		.serviceWorkers()
		.find((entry) => entry.url().startsWith("chrome-extension://"));
	for (let attempt = 0; attempt < 40 && worker === undefined; attempt++) {
		worker = await context
			.waitForEvent("serviceworker", { timeout: 500 })
			.catch(() => undefined);
	}
	if (worker === undefined) throw new Error("extension service worker did not start");
	const extensionId = new URL(worker.url()).host;
	log("extension", extensionId);

	const dashboard = await context.newPage();
	await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`, {
		waitUntil: "domcontentloaded",
	});
	await dashboard.waitForSelector(".mtai-shell");

	await dashboard.evaluate(
		async ({ seededTests, seededConversation }) => {
			await new Promise((resolveDb, rejectDb) => {
				const request = indexedDB.open("mtai", 1);
				request.onupgradeneeded = () => {
					const db = request.result;
					if (!db.objectStoreNames.contains("tests")) {
						const store = db.createObjectStore("tests", { keyPath: "id" });
						store.createIndex("timestamp", "timestamp");
					}
					if (!db.objectStoreNames.contains("meta"))
						db.createObjectStore("meta", { keyPath: "key" });
					if (!db.objectStoreNames.contains("conversations")) {
						const conversations = db.createObjectStore("conversations", {
							keyPath: "id",
						});
						conversations.createIndex("updatedAt", "updatedAt");
					}
				};
				request.onerror = () => rejectDb(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction(["tests", "conversations"], "readwrite");
					for (const test of seededTests) tx.objectStore("tests").put(test);
					tx.objectStore("conversations").put(seededConversation);
					tx.oncomplete = () => resolveDb();
				};
			});
			const dataVersion = await new Promise((resolveVersion) => {
				const read = indexedDB.open("mtai", 1);
				read.onsuccess = () => {
					const db = read.result;
					if (!db.objectStoreNames.contains("meta")) {
						resolveVersion(0);
						return;
					}
					const record = db
						.transaction("meta", "readonly")
						.objectStore("meta")
						.get("dataVersion");
					record.onsuccess = () => resolveVersion(record.result?.value ?? 0);
					record.onerror = () => resolveVersion(0);
				};
				read.onerror = () => resolveVersion(0);
			});

			await chrome.storage.local.set({
				"mtai.settings": {
					analysisWindow: 20,
					captureEnabled: true,
					followMonkeytypeTheme: false,
					theme: null,
					ai: {
						provider: "openai",
						model: "gpt-4.1-mini",
						baseURL: null,
						temperature: 0.4,
						maxTokens: 700,
						includeKeyData: true,
						includeRecentTests: true,
					},
				},
				"mtai.credentials": { openai: "demo-key-not-real" },
				"mtai.insight": {
					text: "Accuracy is the limiter: 96.3% across the window, with 310 incorrect characters. The trend is the good news, +17.7 wpm over 20 tests. Spend the next session on r/t pairs at 97% accuracy before pushing speed again.",
					dataVersion,
					window: 20,
					provider: "openai",
					model: "gpt-4.1-mini",
					createdAt: Date.now(),
				},
			});
		},
		{ seededTests: tests, seededConversation: conversation },
	);

	await dashboard.reload({ waitUntil: "domcontentloaded" });
	await dashboard.waitForSelector(".mtai-shell");
	await dashboard.waitForTimeout(600);

	for (const tab of ["overview", "trends", "keys", "coach"]) {
		await dashboard.click(`#mtai-tab-${tab}`);
		await dashboard.waitForTimeout(350);
		await dashboard.screenshot({
			path: join(outDir, `dashboard-${tab}.png`),
			fullPage: true,
		});
		if (tab === "overview") {
			await dashboard.screenshot({
				path: join(outDir, "dashboard-hero.png"),
				clip: { x: 0, y: 0, width: 1280, height: 714 },
			});
		}
		log("dashboard", tab);
	}

	const page = await context.newPage();
	await page.goto("https://monkeytype.com/", {
		waitUntil: "domcontentloaded",
		timeout: 45_000,
	});
	await page.waitForSelector("#words", { timeout: 30_000 });
	await page.evaluate(() => {
		localStorage.setItem(
			"acceptedCookies",
			JSON.stringify({ security: true, analytics: false, sentry: false }),
		);
	});
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector("#words", { timeout: 30_000 });
	await page.evaluate(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	await page.waitForSelector(".mtai-launcher:not([hidden])", { timeout: 10_000 });
	const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
	await page.screenshot({
		path: join(outDir, "inpage-launcher.png"),
		clip: {
			x: Math.max(0, viewport.width - 300),
			y: Math.max(0, viewport.height - 220),
			width: 280,
			height: 200,
		},
	});
	await page.click(".mtai-launcher");
	await page.waitForSelector(".mtai-panel:not([hidden]) .mtai-panel__msg");
	await page.waitForSelector(".mtai-panel__snap .mtai-spark");
	// Show the start of the thread rather than the scroll-to-bottom position.
	await page.evaluate(() => {
		const body = document.querySelector(".mtai-panel__body");
		if (body !== null) body.scrollTop = 0;
	});
	await page.waitForTimeout(300);
	await page.screenshot({ path: join(outDir, "inpage-panel.png") });
	await page.click(".mtai-panel__menu");
	await page.waitForSelector(
		".mtai-panel__history:not([hidden]) .mtai-panel__history-item",
	);
	await page.screenshot({ path: join(outDir, "inpage-history.png") });
	log("in-page panel and history");

	await page.waitForTimeout(2_000);
	const popup = await context.newPage();
	await popup.setViewportSize({ width: 380, height: 560 });
	await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
		waitUntil: "domcontentloaded",
	});
	await popup.waitForSelector(".mtai-shell");
	await popup.waitForTimeout(600);
	await popup.screenshot({ path: join(outDir, "popup.png") });
	log("popup");
} catch (error) {
	exitCode = 1;
	console.error("[shots] FAILED:", error instanceof Error ? error.message : error);
} finally {
	await context.close();
	await rm(profile, { recursive: true, force: true });
}

process.exit(exitCode);
