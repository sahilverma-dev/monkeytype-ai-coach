/**
 * Live integration check: loads the built extension into Chrome, completes a real
 * Monkeytype test, and reads the captured record back out of the extension's own
 * IndexedDB.
 *
 * Requires network access and a Chrome install. Run after `bun run build`:
 *   bun run verify:live
 *
 * Runs headless by default using the full Chromium build (channel "chromium"),
 * because the headless shell cannot load extensions. Pass `--headed` to watch it.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, "../.output/chrome-mv3");
const artifacts = join(tmpdir(), "mtai-verify");
const headless = !process.argv.includes("--headed");

if (!existsSync(join(extensionPath, "manifest.json"))) {
	console.error(`Build first: ${extensionPath} has no manifest.json`);
	process.exit(1);
}

await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "mtai-profile-"));

const context = await chromium.launchPersistentContext(profile, {
	channel: "chromium",
	headless,
	viewport: { width: 1280, height: 860 },
	args: [
		`--disable-extensions-except=${extensionPath}`,
		`--load-extension=${extensionPath}`,
		"--no-first-run",
		"--no-default-browser-check",
	],
});

const log = (...args) => console.log("[verify]", ...args);
let exitCode = 0;

try {
	// 1. extension id from its service worker
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
	log("extension id", extensionId);

	// 2. monkeytype, configured to a short deterministic test
	const page = await context.newPage();
	await page.goto("https://monkeytype.com/", {
		waitUntil: "domcontentloaded",
		timeout: 45_000,
	});
	await page.waitForFunction(
		() => window.__mtaiProbe !== undefined || document.querySelector("#words") !== null,
		{
			timeout: 30_000,
		},
	);

	await page.evaluate(() => {
		localStorage.setItem(
			"acceptedCookies",
			JSON.stringify({ security: true, analytics: false, sentry: false }),
		);
		const raw = localStorage.getItem("config");
		if (raw === null) return;
		const config = JSON.parse(raw);
		config.mode = "words";
		config.words = 10;
		config.punctuation = false;
		config.numbers = false;
		config.funbox = [];
		config.quickRestart = "off";
		config.showLiveSpeed = false;
		localStorage.setItem("config", JSON.stringify(config));
	});
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector("#words .word", { timeout: 30_000 });

	const words = await page.$$eval("#words .word", (nodes) =>
		nodes.map((node) => node.textContent ?? "").filter((text) => text.length > 0),
	);
	if (words.length < 5) throw new Error(`unexpected word count: ${words.length}`);
	log("target words", words.slice(0, 10).join(" "));

	const mode = await page.evaluate(() => {
		const raw = localStorage.getItem("config");
		const config = raw === null ? null : JSON.parse(raw);
		return { mode: config?.mode, words: config?.words, time: config?.time };
	});
	log("config", mode);

	await page.locator("#wordsInput").click({ force: true });
	await page.waitForTimeout(200);

	if (process.argv.includes("--messy")) {
		const first = words[0] ?? "the";
		const second = words[1] ?? "and";
		const wrong = first.startsWith("x") ? "z" : "x";
		// one corrected mistake in the first word
		await page.keyboard.type(wrong, { delay: 60 });
		await page.keyboard.press("Backspace");
		await page.keyboard.type(first, { delay: 60 });
		await page.keyboard.type(" ", { delay: 60 });
		// one deliberately short word, committed without its last characters
		await page.keyboard.type(second.slice(0, Math.max(1, second.length - 2)), {
			delay: 60,
		});
		await page.keyboard.type(" ", { delay: 60 });
		await page.keyboard.type(
			`${words.slice(2).join(" ")}${words.length > 2 ? " " : ""}`,
			{ delay: 60 },
		);
		log("messy sequence typed");
	} else {
		await page.keyboard.type(`${words.join(" ")} `, { delay: 60 });
	}

	await page.waitForTimeout(3_000);
	if ((await page.locator("#result").count()) === 0) {
		const diagnostics = await page.evaluate(() => {
			const input = document.querySelector("#wordsInput");
			return {
				active: document.activeElement?.id || document.activeElement?.tagName,
				inputValue: input instanceof HTMLTextAreaElement ? input.value : null,
				words: document.querySelectorAll("#words .word").length,
				activeWord: document.querySelector("#words .word.active")?.textContent ?? null,
				lastLog:
					typeof window.lastEventLog === "function"
						? Boolean(window.lastEventLog())
						: null,
			};
		});
		log("diagnostics after typing", diagnostics);
		await page.screenshot({ path: join(artifacts, "stuck.png") });
	}
	await page.waitForSelector("#result", { timeout: 30_000 });
	await page.waitForTimeout(2_500);

	if (process.argv.includes("--probe")) {
		const probe = await page.evaluate(() => {
			const get = /** @type {any} */ (window).lastEventLog;
			const raw = typeof get === "function" ? get() : undefined;
			const types = raw?.events ? [...new Set(raw.events.map((e) => e.type))] : [];
			return {
				bridge: typeof get === "function",
				version: raw?.version,
				eventCount: raw?.events?.length,
				types,
				context: raw?.context ? Object.keys(raw.context) : null,
				targetWords: raw?.context?.targetWords?.slice(0, 2),
				sampleKeydown: raw?.events?.find((e) => e.type === "keydown"),
				sampleInput: raw?.events?.find((e) => e.type === "input"),
				sampleTimer: raw?.events?.find((e) => e.type === "timer"),
			};
		});
		console.log("[verify] probe", JSON.stringify(probe, null, 2));
		const rawLog = await page.evaluate(() =>
			typeof (/** @type {any} */ (window).lastEventLog) === "function"
				? /** @type {any} */ (window).lastEventLog()
				: null,
		);
		await writeFile(join(artifacts, "eventlog.json"), JSON.stringify(rawLog, null, 2));
		const perWord = {};
		for (const event of rawLog?.events ?? []) {
			if (event.type !== "input") continue;
			const index = event.data.wordIndex ?? -1;
			perWord[index] ??= { inserts: 0, commits: 0, chars: [], values: [] };
			const bucket = perWord[index];
			if (event.data.commitsWord) bucket.commits += 1;
			else bucket.inserts += 1;
			bucket.chars.push(event.data.data ?? "");
			if (bucket.values.length < 4) bucket.values.push(event.data.inputValue ?? "");
		}
		console.log("[verify] per-word", JSON.stringify(perWord));

		const bridge = await page.evaluate(
			() =>
				new Promise((resolve) => {
					const id = `probe-${Date.now()}`;
					const onMessage = (event) => {
						if (event.source !== window || event.data?.requestId !== id) return;
						window.removeEventListener("message", onMessage);
						resolve({
							responded: true,
							hasPayload: Boolean(event.data.payload),
							error: event.data.error ?? null,
						});
					};
					window.addEventListener("message", onMessage);
					window.postMessage(
						{ source: "mtai-isolated", type: "REQUEST_TEST_SNAPSHOT", requestId: id },
						"*",
					);
					setTimeout(() => resolve({ responded: false }), 2000);
				}),
		);
		console.log("[verify] bridge probe", JSON.stringify(bridge));
	}
	await page.screenshot({ path: join(artifacts, "result.png") });

	// 3. read the extension's own store
	const dashboard = await context.newPage();
	await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`, {
		waitUntil: "domcontentloaded",
		timeout: 20_000,
	});
	await dashboard.waitForSelector(".mtai-shell", { timeout: 20_000 });
	await dashboard.waitForTimeout(1_500);
	await dashboard.screenshot({ path: join(artifacts, "dashboard.png"), fullPage: true });

	const stored = await dashboard.evaluate(async () => {
		const request = indexedDB.open("mtai", 1);
		const db = await new Promise((resolveRequest, reject) => {
			request.onsuccess = () => resolveRequest(request.result);
			request.onerror = () => reject(request.error);
		});
		if (!db.objectStoreNames.contains("tests")) return { count: 0, tests: [] };
		const tx = db.transaction("tests", "readonly");
		const all = tx.objectStore("tests").getAll();
		const tests = await new Promise((resolveTests, reject) => {
			all.onsuccess = () => resolveTests(all.result);
			all.onerror = () => reject(all.error);
		});
		return { count: tests.length, tests: tests.slice(0, 3) };
	});

	log("stored tests", stored.count);
	if (stored.count === 0) {
		throw new Error("no test was captured — check the service worker console");
	}
	const latest = stored.tests[0];
	log("latest record", {
		wpm: latest.wpm,
		acc: latest.acc,
		mode: latest.mode,
		mode2: latest.mode2,
		fidelity: latest.fidelity,
		metricsSource: latest.metricsSource,
		keystrokes: latest.keyStats?.keystrokes ?? null,
		charsAnalysed: latest.keyStats?.chars.length ?? 0,
		duration: latest.testDuration,
	});
	if (latest.fidelity !== "full") {
		throw new Error("event log bridge did not deliver key-level data");
	}
	if (latest.metricsSource !== "monkeytype") {
		throw new Error("result screen parsing failed, metrics were only computed");
	}
	if (process.argv.includes("--messy")) {
		const keyStats = latest.keyStats;
		log("messy expectations", {
			corrections: keyStats?.corrections,
			errors: keyStats?.chars.reduce((sum, entry) => sum + entry.errors, 0),
			missed: keyStats?.missedChars,
			confusions: keyStats?.chars.filter((entry) => entry.confusion.length > 0).length,
		});
		if ((keyStats?.corrections ?? 0) < 1)
			throw new Error("corrected mistake was not detected");
		if ((keyStats?.missedChars ?? 0) < 1)
			throw new Error("missed characters were not detected");
		if (!keyStats?.chars.some((entry) => entry.confusion.length > 0)) {
			throw new Error("confusion pair was not recorded");
		}
	}

	await writeFile(
		join(artifacts, "captured.json"),
		JSON.stringify({ extensionId, stored: stored.tests }, null, 2),
	);
	log("artifacts written to", artifacts);
} catch (error) {
	exitCode = 1;
	console.error("[verify] FAILED:", error instanceof Error ? error.message : error);
} finally {
	await context.close();
	await rm(profile, { recursive: true, force: true });
}

process.exit(exitCode);
