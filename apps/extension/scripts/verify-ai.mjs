/**
 * AI layer verification without any API key.
 *
 * Starts a local OpenAI-compatible mock, loads the built extension in headless
 * Chromium, seeds captured tests, then exercises both chat surfaces:
 *   - the dashboard coach tab (streaming through the page)
 *   - the in-page panel on monkeytype.com (streaming through the service worker)
 *
 * It also asserts what the provider received: grounded context, the user's
 * question, and none of the API key or internal record ids.
 *
 *   bun run verify:ai
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, "../.output/chrome-mv3");
const artifacts = join(tmpdir(), "mtai-verify-ai");

if (!existsSync(join(extensionPath, "manifest.json"))) {
	console.error(`Build first: ${extensionPath} has no manifest.json`);
	process.exit(1);
}

await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "mtai-profile-"));
const requests = [];
const answers = [];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function sse(res, payload) {
	res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const server = createServer(async (req, res) => {
	const origin = req.headers.origin ?? "*";
	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader("Access-Control-Allow-Headers", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	res.setHeader("Access-Control-Allow-Credentials", "false");

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	const url = new URL(req.url ?? "/", "http://127.0.0.1");

	if (url.pathname.endsWith("/models")) {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({ object: "list", data: [{ id: "mock-model", object: "model" }] }),
		);
		return;
	}

	if (url.pathname.endsWith("/chat/completions")) {
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		requests.push(body);

		const systemMessage = (body.messages ?? []).find(
			(message) => message.role === "system",
		);
		const system =
			typeof systemMessage?.content === "string" ? systemMessage.content : "";
		const average = /averages: ([\d.]+) wpm/.exec(system)?.[1] ?? "unknown";
		const answer = `Grounded answer. Your window average is ${average} wpm.`;
		answers.push(answer);

		if (body.stream !== true) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					id: "chatcmpl-mock",
					object: "chat.completion",
					created: Math.floor(Date.now() / 1000),
					model: body.model,
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: answer },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
				}),
			);
			return;
		}

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		res.flushHeaders?.();

		const created = Math.floor(Date.now() / 1000);
		const words = answer.split(" ");
		for (const [index, word] of words.entries()) {
			sse(res, {
				id: "chatcmpl-mock",
				object: "chat.completion.chunk",
				created,
				model: body.model,
				choices: [
					{
						index: 0,
						delta: { content: `${index === 0 ? "" : " "}${word}` },
						finish_reason: null,
					},
				],
			});
			await sleep(15);
		}
		sse(res, {
			id: "chatcmpl-mock",
			object: "chat.completion.chunk",
			created,
			model: body.model,
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
		});
		res.write("data: [DONE]\n\n");
		res.end();
		return;
	}

	res.writeHead(404);
	res.end();
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const baseURL = `http://127.0.0.1:${port}/v1`;
console.log("[verify-ai] mock provider on", baseURL);

const openRouterRequests = [];
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "*",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
	await context.route("https://openrouter.ai/**", async (route) => {
		const request = route.request();
		if (request.method() === "OPTIONS") {
			await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
			return;
		}
		const url = request.url();
		if (url.endsWith("/models")) {
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ data: [{ id: "mock-or-model" }] }),
			});
			return;
		}
		openRouterRequests.push({
			url,
			authorization: request.headers().authorization ?? "",
			body: request.postDataJSON(),
		});
		const payload = ["OpenRouter ", "routed ", "answer."]
			.map(
				(word) =>
					`data: ${JSON.stringify({
						id: "chatcmpl-or",
						object: "chat.completion.chunk",
						created: 0,
						model: "mock-or-model",
						choices: [{ index: 0, delta: { content: word }, finish_reason: null }],
					})}\n\n`,
			)
			.join("");
		const finish = `data: ${JSON.stringify({
			id: "chatcmpl-or",
			object: "chat.completion.chunk",
			created: 0,
			model: "mock-or-model",
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
		})}\n\n`;
		await route.fulfill({
			status: 200,
			headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
			body: `${payload}${finish}data: [DONE]\n\n`,
		});
	});
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
	console.log("[verify-ai] extension id", extensionId);

	// --- seed captured tests + provider settings ---
	const dashboard = await context.newPage();
	dashboard.on("pageerror", (error) => console.log("[dashboard error]", error.message));
	dashboard.on("console", (message) => {
		if (message.type() === "error") console.log("[dashboard console]", message.text());
	});
	await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`, {
		waitUntil: "domcontentloaded",
	});
	await dashboard.waitForSelector(".mtai-shell");

	const now = Date.now();
	const tests = Array.from({ length: 12 }, (_, index) => ({
		id: `seed-${index}`,
		fingerprint: `seed-fingerprint-${index}`,
		capturedAt: now - index * 3_600_000,
		startedAt: now - index * 3_600_000,
		timestamp: now - index * 3_600_000,
		mode: "time",
		mode2: "30",
		difficulty: "normal",
		language: "english",
		punctuation: false,
		numbers: false,
		funbox: [],
		wpm: 60 + index,
		rawWpm: 64 + index,
		acc: 95 + (index % 3),
		consistency: 80,
		charStats: [400, 12, 1, 2],
		testDuration: 30,
		bailedOut: false,
		fidelity: index % 2 === 0 ? "full" : "summary",
		metricsSource: "monkeytype",
		keyStats:
			index % 2 === 0
				? {
						chars: [
							{
								char: "r",
								attempts: 20,
								errors: 6,
								corrected: 5,
								missed: 0,
								confusion: [{ typed: "t", count: 5 }],
							},
							{
								char: "e",
								attempts: 60,
								errors: 1,
								corrected: 1,
								missed: 0,
								confusion: [],
							},
						],
						bigrams: [{ pair: "rt", samples: 5, meanMs: 380 }],
						keystrokes: 400,
						corrections: 10,
						missedChars: 2,
						extraChars: 0,
					}
				: null,
		excludedReason: null,
	}));

	await dashboard.evaluate(
		async ({ seededTests, settingsBaseURL }) => {
			await new Promise((resolveDb) => {
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
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction("tests", "readwrite");
					for (const test of seededTests) tx.objectStore("tests").put(test);
					tx.oncomplete = () => resolveDb();
				};
			});
			await chrome.storage.local.set({
				"mtai.settings": {
					analysisWindow: 20,
					captureEnabled: true,
					followMonkeytypeTheme: true,
					theme: null,
					ai: {
						provider: "custom",
						model: "mock-model",
						baseURL: settingsBaseURL,
						temperature: 0.2,
						maxTokens: 256,
						includeKeyData: true,
						includeRecentTests: true,
					},
				},
				"mtai.credentials": { custom: "test-key" },
			});
		},
		{ seededTests: tests, settingsBaseURL: baseURL },
	);

	await dashboard.reload({ waitUntil: "domcontentloaded" });
	await dashboard.waitForSelector("#mtai-tab-coach");
	await dashboard.click("#mtai-tab-coach");
	await dashboard.waitForSelector(".mtai-composer textarea");
	await dashboard.fill(".mtai-composer textarea", "What should I practise next?");
	await dashboard.click(".mtai-composer button.mtai-button--active");
	await dashboard.waitForFunction(
		() => {
			const nodes = document.querySelectorAll(".mtai-msg--assistant");
			return [...nodes].some((node) => node.textContent?.includes("Grounded answer"));
		},
		{ timeout: 30_000 },
	);
	await dashboard.screenshot({
		path: join(artifacts, "dashboard-coach.png"),
		fullPage: true,
	});
	console.log("[verify-ai] dashboard chat streamed an answer");

	for (const tab of ["overview", "trends", "keys", "tests", "settings"]) {
		await dashboard.click(`#mtai-tab-${tab}`);
		await dashboard.waitForTimeout(300);
		await dashboard.screenshot({
			path: join(artifacts, `dashboard-${tab}.png`),
			fullPage: true,
		});
	}

	const popup = await context.newPage();
	await popup.setViewportSize({ width: 380, height: 520 });
	await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
		waitUntil: "domcontentloaded",
	});
	await popup.waitForSelector(".mtai-shell");
	await popup.waitForTimeout(600);
	await popup.screenshot({ path: join(artifacts, "popup.png") });

	// --- in-page panel on the real site ---
	const page = await context.newPage();
	page.on("console", (message) => {
		if (message.text().includes("[mtai]")) console.log("[page]", message.text());
	});
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
	const launcher = await page.evaluate(() => {
		const image = document.querySelector(".mtai-launcher img");
		return image instanceof HTMLImageElement
			? { src: image.src, loaded: image.complete && image.naturalWidth > 0 }
			: null;
	});
	if (launcher === null || !launcher.src.includes("icon/128.png") || !launcher.loaded) {
		throw new Error(`launcher mascot missing or not loaded: ${JSON.stringify(launcher)}`);
	}
	console.log("[verify-ai] mascot launcher loaded");

	await page.click(".mtai-launcher");
	await page.waitForSelector(".mtai-panel:not([hidden]) textarea");
	await page.waitForSelector(".mtai-panel__snap .mtai-spark", { timeout: 10_000 });
	const resizeStyle = await page.$eval(
		".mtai-panel",
		(element) => getComputedStyle(element).resize,
	);
	if (resizeStyle !== "both") throw new Error(`panel is not resizable: ${resizeStyle}`);
	await page.evaluate(() => {
		const panel = document.querySelector(".mtai-panel");
		if (!(panel instanceof HTMLElement)) return;
		panel.style.left = "80px";
		panel.style.top = "60px";
		panel.style.width = "460px";
		panel.style.height = "600px";
	});
	await page.waitForTimeout(500);
	await page.click(".mtai-panel__head button");
	await page.waitForSelector(".mtai-launcher:not([hidden])");
	await page.click(".mtai-launcher");
	await page.waitForSelector(".mtai-panel:not([hidden])");
	const restored = await page.$eval(".mtai-panel", (element) => {
		const rect = element.getBoundingClientRect();
		return {
			width: Math.round(rect.width),
			height: Math.round(rect.height),
			left: Math.round(rect.left),
			top: Math.round(rect.top),
		};
	});
	if (restored.width !== 460 || restored.height !== 600 || restored.left !== 80) {
		throw new Error(`panel geometry was not restored: ${JSON.stringify(restored)}`);
	}
	console.log("[verify-ai] panel resized and geometry restored");

	await page.fill(".mtai-panel textarea", "How consistent is my typing?");
	await page.click(".mtai-panel form button[type=submit]");
	await page.waitForFunction(
		() => document.querySelector(".mtai-panel")?.textContent?.includes("Grounded answer"),
		{ timeout: 30_000 },
	);
	await page.screenshot({ path: join(artifacts, "inpage-coach.png") });
	console.log("[verify-ai] in-page panel streamed an answer");

	const pageText = await page.evaluate(() => document.body.textContent ?? "");
	if (pageText.includes("test-key")) throw new Error("API key leaked into the page DOM");
	console.log("[verify-ai] API key is not present in the page");

	const sessionDump = await dashboard.evaluate(() =>
		chrome.storage.local.get("mtai.sessionState"),
	);
	if (sessionDump["mtai.sessionState"] === undefined) {
		throw new Error("no heartbeat reached the worker");
	}
	console.log("[verify-ai] heartbeat present");

	// Theme bridge: switch the page theme, let the content script sample it, and
	// check the dashboard picked up the same values.
	const pageMainBefore = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--main-color").trim(),
	);
	await page.evaluate(() => {
		const raw = localStorage.getItem("config");
		if (raw === null) return;
		const config = JSON.parse(raw);
		config.theme = "dracula";
		localStorage.setItem("config", JSON.stringify(config));
	});
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector("#words", { timeout: 30_000 });
	await page.waitForTimeout(800);
	const pageMainAfter = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--main-color").trim(),
	);
	let sampled = false;
	for (let attempt = 0; attempt < 40; attempt++) {
		const dump = await dashboard.evaluate(() =>
			chrome.storage.local.get("mtai.settings"),
		);
		const main = dump["mtai.settings"]?.theme?.main;
		if (typeof main === "string" && main.toLowerCase() === pageMainAfter.toLowerCase()) {
			sampled = true;
			break;
		}
		await sleep(250);
	}
	if (!sampled) throw new Error("the sampled theme never reached settings");
	await dashboard.reload({ waitUntil: "domcontentloaded" });
	await dashboard.waitForSelector(".mtai-shell");
	await dashboard.waitForTimeout(500);
	const dashboardMain = await dashboard.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--main-color").trim(),
	);
	const settingsDump = await dashboard.evaluate(() =>
		chrome.storage.local.get("mtai.settings"),
	);
	console.log("[verify-ai] theme main colour", {
		pageMainBefore,
		pageMainAfter,
		dashboardMain,
		follow: settingsDump["mtai.settings"]?.followMonkeytypeTheme,
		sampledMain: settingsDump["mtai.settings"]?.theme?.main,
	});
	if (pageMainAfter === pageMainBefore) throw new Error("page theme did not change");
	if (dashboardMain.toLowerCase() !== pageMainAfter.toLowerCase()) {
		throw new Error("dashboard did not adopt the sampled Monkeytype theme");
	}

	// --- history import against a stubbed Monkeytype API ---
	await context.route("https://api.monkeytype.com/**", async (route) => {
		const request = route.request();
		const headers = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "*",
			"Access-Control-Allow-Methods": "GET,OPTIONS",
		};
		if (request.method() === "OPTIONS") {
			await route.fulfill({ status: 204, headers, body: "" });
			return;
		}
		await route.fulfill({
			status: 200,
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify({
				message: "ok",
				data: [
					{
						_id: "imported1",
						timestamp: now - 90 * 86_400_000,
						wpm: 44.5,
						rawWpm: 48.2,
						acc: 93.1,
						consistency: 71,
						charStats: [300, 20, 3, 4],
						mode: "time",
						mode2: "30",
						testDuration: 30,
						language: "english",
						difficulty: "normal",
						bailedOut: false,
					},
					{
						_id: "imported2",
						timestamp: now - 91 * 86_400_000,
						wpm: 41.2,
						rawWpm: 45,
						acc: 91.4,
						consistency: 66,
						charStats: [280, 26, 1, 6],
						mode: "words",
						mode2: "50",
						testDuration: 32,
						language: "english",
						difficulty: "normal",
						bailedOut: false,
					},
				],
			}),
		});
	});

	console.log("[verify-ai] starting history import check");
	await dashboard.evaluate(() =>
		chrome.storage.local.set({ "mtai.apeKey": "test-ape-key" }),
	);
	await dashboard.reload({ waitUntil: "domcontentloaded" });
	console.log("[verify-ai] dashboard reloaded for import");
	await dashboard.waitForSelector("#mtai-tab-settings");
	await dashboard.click("#mtai-tab-settings");
	console.log("[verify-ai] settings tab opened");
	await dashboard.waitForSelector("text=history import");
	await dashboard.waitForFunction(
		() => {
			const buttons = [...document.querySelectorAll("button")];
			const importButton = buttons.find((button) =>
				button.textContent?.includes("import past results"),
			);
			return importButton !== undefined && !importButton.disabled;
		},
		{ timeout: 10_000 },
	);
	await dashboard.getByRole("button", { name: "import past results" }).click();
	await dashboard.waitForFunction(() => document.body.textContent?.includes("imported"), {
		timeout: 20_000,
	});
	console.log("[verify-ai] import status visible");
	const imported = await dashboard.evaluate(async () => {
		const request = indexedDB.open("mtai", 1);
		const db = await new Promise((resolveDb) => {
			request.onsuccess = () => resolveDb(request.result);
		});
		const tx = db.transaction("tests", "readonly");
		const all = tx.objectStore("tests").getAll();
		const tests = await new Promise((resolveTests) => {
			all.onsuccess = () => resolveTests(all.result);
		});
		return tests.filter((test) => test.id.startsWith("api-"));
	});
	if (imported.length !== 2)
		throw new Error(`expected 2 imported tests, saw ${imported.length}`);
	if (imported.some((test) => test.fidelity !== "summary")) {
		throw new Error("imported tests must be summary fidelity");
	}
	console.log("[verify-ai] history import stored 2 summary-fidelity tests");

	// --- OpenRouter regression: default endpoint, no custom base URL ---
	await dashboard.evaluate(async () => {
		const stored = await chrome.storage.local.get("mtai.settings");
		const settings = stored["mtai.settings"];
		settings.ai = {
			...settings.ai,
			provider: "openrouter",
			model: "mock-or-model",
			baseURL: null,
		};
		await chrome.storage.local.set({
			"mtai.settings": settings,
			"mtai.credentials": { openrouter: "test-or-key" },
		});
	});
	await dashboard.reload({ waitUntil: "domcontentloaded" });
	await dashboard.waitForSelector("#mtai-tab-coach");
	await dashboard.click("#mtai-tab-coach");
	await dashboard.waitForSelector(".mtai-composer textarea");
	await dashboard.getByRole("button", { name: "new chat" }).click();
	await dashboard.fill(".mtai-composer textarea", "test the openrouter route");
	await dashboard.click(".mtai-composer button.mtai-button--active");
	await dashboard.waitForFunction(
		() =>
			[...document.querySelectorAll(".mtai-msg--assistant")].some((node) =>
				node.textContent?.includes("OpenRouter routed answer"),
			),
		{ timeout: 30_000 },
	);
	if (openRouterRequests.length === 0) throw new Error("OpenRouter received no request");
	const openRouterRequest = openRouterRequests.at(-1);
	if (openRouterRequest.url !== "https://openrouter.ai/api/v1/chat/completions") {
		throw new Error(`unexpected OpenRouter URL: ${openRouterRequest.url}`);
	}
	if (openRouterRequest.authorization !== "Bearer test-or-key") {
		throw new Error("OpenRouter request did not carry the API key");
	}
	console.log("[verify-ai] OpenRouter default endpoint works");

	// --- what the provider actually received ---
	if (requests.length < 2)
		throw new Error(`expected 2 provider requests, saw ${requests.length}`);
	for (const body of requests) {
		const system =
			(body.messages ?? []).find((message) => message.role === "system")?.content ?? "";
		if (!system.includes("MONKEYTYPE DATA"))
			throw new Error("system prompt missing grounded context");
		if (!/averages: 65\.5 wpm/.test(system))
			throw new Error("system prompt missing the real average");
		if (!system.includes('"r"')) throw new Error("key-level analysis was not included");
		if (system.includes("fingerprint") || system.includes("seed-")) {
			throw new Error("internal record identifiers leaked into the prompt");
		}
		if (system.includes("test-key")) throw new Error("API key leaked into the prompt");
	}
	const lastUser = (requests.at(-1)?.messages ?? []).find(
		(message) => message.role === "user",
	);
	console.log(
		"[verify-ai] provider received grounded context, last question:",
		lastUser?.content,
	);

	await writeFile(
		join(artifacts, "requests.json"),
		JSON.stringify(
			{ extensionId, port, requestCount: requests.length, answers, requests },
			null,
			2,
		),
	);
	console.log("[verify-ai] artifacts written to", artifacts);
} catch (error) {
	exitCode = 1;
	console.error("[verify-ai] FAILED:", error instanceof Error ? error.message : error);
} finally {
	await context.close();
	server.close();
	await rm(profile, { recursive: true, force: true });
}

process.exit(exitCode);
