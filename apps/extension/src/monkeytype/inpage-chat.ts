import { browser } from "wxt/browser";
import type { CoachSnapshot } from "@/ai/snapshot";
import { runtimeUrl } from "@/shared/extension-url";
import { renderMarkdown } from "@/shared/markdown";
import {
	CHAT_PORT_NAME,
	type ChatPortEvent,
	type ChatPortRequest,
} from "@/shared/port-protocol";
import { sparklineSvg } from "@/shared/sparkline";

/**
 * The in-page coach.
 *
 * Rendered in the page's own document so it inherits Monkeytype's CSS variables
 * and native button/input styling: no duplicated palette, and it follows the
 * user's theme automatically. Only layout rules are added, all namespaced, with
 * no bare element selectors, so nothing else on the page can be affected.
 */

const STYLE_ID = "mtai-inpage-style";

const CSS = `
.mtai-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:52px;height:52px;border-radius:calc(var(--roundness) * 1.4);display:grid;place-items:center;padding:2px;border:1px solid color-mix(in srgb,var(--sub-color) 40%,transparent);background:var(--bg-color);cursor:pointer;transition:background .125s,border-color .125s,transform .125s}
.mtai-launcher:hover{background:var(--sub-alt-color);border-color:var(--text-color);transform:translateY(-1px)}
.mtai-launcher:focus-visible{outline:none;box-shadow:0 0 0 .1rem var(--bg-color),0 0 0 .2rem var(--text-color)}
.mtai-launcher__icon{width:100%;height:100%;object-fit:contain;display:block}
.mtai-launcher[hidden]{display:none}
.mtai-panel{position:fixed;left:0;top:0;z-index:2147483001;width:380px;height:560px;min-width:320px;min-height:320px;max-width:calc(100vw - 24px);max-height:calc(100vh - 90px);display:flex;flex-direction:column;background:var(--bg-color);color:var(--text-color);font-family:var(--font);border:1px solid color-mix(in srgb,var(--sub-color) 40%,transparent);border-radius:var(--roundness);overflow:hidden;resize:both}
.mtai-panel::after{content:"";position:absolute;right:5px;bottom:5px;width:9px;height:9px;border-right:2px solid var(--sub-color);border-bottom:2px solid var(--sub-color);opacity:.55;pointer-events:none}
.mtai-panel[hidden]{display:none}
.mtai-panel__head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.55rem .7rem;border-bottom:1px solid color-mix(in srgb,var(--sub-color) 25%,transparent)}
.mtai-panel__title{font-size:.8rem;color:var(--main-color);white-space:nowrap}
.mtai-panel__model{font-size:.65rem;color:var(--sub-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.mtai-panel__icon{width:1.6rem;height:1.6rem;padding:0;font-size:.9rem;line-height:1;background:none;color:var(--sub-color);display:grid;place-items:center;flex:none}
.mtai-panel__icon:hover{background:none;color:var(--text-color)}
.mtai-panel__body{padding:.7rem;overflow-y:auto;display:flex;flex-direction:column;gap:.55rem;flex:1 1 auto;min-height:0}
.mtai-panel__msg{font-size:.8rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;padding:.5rem .6rem;border-radius:var(--roundness);max-width:92%}
.mtai-panel__msg--user{align-self:flex-end;background:var(--sub-alt-color)}
.mtai-panel__msg--assistant{align-self:flex-start;background:none;border-left:2px solid var(--main-color);border-radius:0;padding-left:.6rem;white-space:normal}
.mtai-panel__msg p{margin:0 0 .55em}
.mtai-panel__msg p:last-child{margin-bottom:0}
.mtai-panel__msg ul{margin:.2em 0 .55em;padding-left:1.2em;list-style:disc}
.mtai-panel__msg ol{margin:.2em 0 .55em;padding-left:1.4em;list-style:decimal}
.mtai-panel__msg li{margin:.1em 0}
.mtai-panel__msg strong{font-weight:700}
.mtai-panel__msg a{color:var(--main-color);text-decoration:underline;text-underline-offset:2px}
.mtai-panel__msg code{padding:.05em .25em;border-radius:calc(var(--roundness) / 2);background:var(--sub-alt-color);font-family:var(--font);font-size:.92em}
.mtai-panel__msg pre{margin:.35em 0 .6em;padding:.5em .6em;border-radius:var(--roundness);background:var(--sub-alt-color);overflow-x:auto}
.mtai-panel__msg pre code{padding:0;background:none}
.mtai-panel__msg blockquote{margin:.3em 0;padding-left:.6em;border-left:2px solid var(--sub-color);color:var(--sub-color)}
.mtai-panel__msg--pending{color:var(--sub-color)}
.mtai-panel__msg--error{color:var(--error-color);border-left-color:var(--error-color)}
.mtai-panel__msg table{display:block;max-width:100%;overflow-x:auto;margin:.4em 0 .6em;border-collapse:collapse;font-size:.72rem}
.mtai-panel__msg th,.mtai-panel__msg td{padding:.2em .4em;border:1px solid color-mix(in srgb,var(--sub-color) 30%,transparent);text-align:left;white-space:nowrap}
.mtai-panel__msg th{color:var(--sub-color);font-weight:400}
.mtai-panel__snap{display:flex;flex-direction:column;gap:.4rem;padding:.55rem .7rem;border-bottom:1px solid color-mix(in srgb,var(--sub-color) 25%,transparent);background:color-mix(in srgb,var(--sub-color) 18%,transparent)}
.mtai-panel__snap-stats{display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem 1rem;font-size:.65rem;color:var(--sub-color);font-variant-numeric:tabular-nums}
.mtai-panel__snap-stats b{font-weight:400;font-size:.95rem;color:var(--main-color);margin-right:.35em}
.mtai-panel__snap-window{margin-left:auto}
.mtai-panel__snap-charts{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.mtai-panel__snap-chart{display:flex;flex-direction:column;gap:.1rem;min-width:0}
.mtai-panel__snap-chart>span{font-size:.6rem;color:var(--sub-color)}
.mtai-panel__snap .mtai-spark{height:34px}
.mtai-spark{display:block;width:100%;overflow:visible}
.mtai-spark__line{fill:none;stroke:var(--main-color);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.mtai-spark__area{fill:var(--main-color);opacity:.12}
.mtai-panel__snap-keys{display:flex;flex-wrap:wrap;gap:.35rem .6rem;font-size:.65rem;color:var(--sub-color)}
.mtai-panel__snap-key b{font-weight:400;color:var(--text-color)}
.mtai-panel__chips{display:flex;flex-wrap:wrap;gap:.35rem;padding:0 .7rem .4rem}
.mtai-panel__chip{padding:.25em .55em;font-size:.7rem;background:none;border:1px solid color-mix(in srgb,var(--sub-color) 40%,transparent);color:var(--sub-color);border-radius:calc(var(--roundness) / 2)}
.mtai-panel__chip:hover{background:none;color:var(--text-color);border-color:var(--text-color)}
.mtai-panel__form{display:flex;gap:.4rem;align-items:flex-end;padding:.55rem .7rem;border-top:1px solid color-mix(in srgb,var(--sub-color) 25%,transparent)}
.mtai-panel__input{flex:1;min-height:2.4rem;max-height:8rem;resize:vertical;font-size:.8rem;padding:.45rem .55rem}
.mtai-panel__actions{display:flex;gap:.4rem;padding:0 .7rem .55rem;align-items:center;justify-content:space-between}
.mtai-panel__link{background:none;color:var(--sub-color);font-size:.68rem;padding:.2em .35em}
.mtai-panel__link:hover{background:none;color:var(--text-color)}
.mtai-panel__note{font-size:.65rem;color:var(--sub-color);line-height:1.45}
.mtai-panel__pre{margin:0;padding:.55rem;background:var(--sub-alt-color);border-radius:var(--roundness);font-family:var(--font);font-size:.62rem;line-height:1.5;color:var(--sub-color);white-space:pre-wrap;word-break:break-word;max-height:14rem;overflow:auto}
.mtai-panel__status{font-size:.7rem;color:var(--sub-color);padding:0 .7rem .5rem}
.mtai-panel__history{position:absolute;left:0;top:2.7rem;bottom:0;width:min(240px,82%);display:flex;flex-direction:column;background:var(--sub-alt-color);border-right:1px solid color-mix(in srgb,var(--sub-color) 30%,transparent);z-index:3}
.mtai-panel__history[hidden]{display:none}
.mtai-panel__history-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.5rem .6rem;border-bottom:1px solid color-mix(in srgb,var(--sub-color) 25%,transparent);font-size:.7rem;color:var(--sub-color)}
.mtai-panel__history-new{background:none;color:var(--main-color);font-size:.68rem;padding:.15em .3em}
.mtai-panel__history-new:hover{background:none;color:var(--text-color)}
.mtai-panel__history-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:.1rem;padding:.3rem}
.mtai-panel__history-item{display:flex;flex-direction:column;align-items:flex-start;gap:.05rem;width:100%;padding:.4rem .5rem;border:none;border-radius:calc(var(--roundness) / 2);background:none;color:var(--text-color);font-size:.72rem;text-align:left;cursor:pointer}
.mtai-panel__history-item:hover{background:var(--bg-color)}
.mtai-panel__history-item.is-active{background:var(--bg-color);color:var(--main-color)}
.mtai-panel__history-item span{font-size:.6rem;color:var(--sub-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.mtai-panel__history-empty{padding:.6rem;font-size:.68rem;color:var(--sub-color)}
.mtai-panel__hint{padding:0 .7rem .1rem;font-size:.62rem;color:var(--sub-color)}
.mtai-panel__status[hidden]{display:none}
@media (prefers-reduced-motion:reduce){.mtai-launcher{transition:none}}
`;

function ensureStyles(): void {
	if (document.getElementById(STYLE_ID) !== null) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	document.head.append(style);
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className !== undefined) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

export function mountInpageChat(): void {
	if (document.querySelector(".mtai-launcher") !== null) return;
	ensureStyles();

	const launcher = element("button", "mtai-launcher");
	launcher.type = "button";
	launcher.setAttribute("aria-label", "Ask the AI typing coach");
	launcher.setAttribute("aria-expanded", "false");
	launcher.title = "Ask your typing coach";
	const launcherIcon = element("img", "mtai-launcher__icon");
	launcherIcon.src = runtimeUrl("icon/128.png");
	launcherIcon.alt = "";
	launcher.append(launcherIcon);

	let panel: HTMLElement | null = null;
	let body: HTMLElement | null = null;
	let snapEl: HTMLElement | null = null;
	let historyEl: HTMLElement | null = null;
	let historyListEl: HTMLElement | null = null;
	let historyOpen = false;
	let chips: HTMLElement | null = null;
	let modelLabel: HTMLElement | null = null;
	let statusEl: HTMLElement | null = null;
	let textarea: HTMLTextAreaElement | null = null;
	let sendButton: HTMLButtonElement | null = null;
	let stopButton: HTMLButtonElement | null = null;
	let previewEl: HTMLElement | null = null;
	let streamingEl: HTMLElement | null = null;
	let streamBuffer = "";
	let isOpen = false;
	let isBusy = false;
	let focusBeforeOpen: HTMLElement | null = null;

	let port: ReturnType<typeof browser.runtime.connect> | null = null;

	const GEOMETRY_KEY = "mtai.chatGeometry";
	const DEFAULT_SIZE = { width: 380, height: 620 };
	const MIN_WIDTH = 320;
	const MIN_HEIGHT = 320;
	const MARGIN = 12;

	interface PanelGeometry {
		left: number;
		top: number;
		width: number;
		height: number;
	}

	const escapeHtml = (value: string): string =>
		value
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;");

	const renderSnapshot = (snapshot: CoachSnapshot): void => {
		if (snapEl === null) return;
		const wpm = snapshot.stats.wpm === null ? "—" : snapshot.stats.wpm.toFixed(1);
		const acc = snapshot.stats.acc === null ? "—" : `${snapshot.stats.acc.toFixed(1)}%`;
		const cons =
			snapshot.stats.consistency === null
				? "—"
				: `${snapshot.stats.consistency.toFixed(1)}%`;
		const keys = snapshot.topKeys
			.map(
				(key) =>
					`<span class="mtai-panel__snap-key"><b>${escapeHtml(key.char)}</b> ${key.errorRate.toFixed(1)}%</span>`,
			)
			.join("");
		snapEl.innerHTML = `
			<div class="mtai-panel__snap-stats">
				<span><b>${wpm}</b>wpm</span>
				<span><b>${acc}</b>acc</span>
				<span><b>${cons}</b>cons</span>
				<span class="mtai-panel__snap-window">${snapshot.validTests} tests</span>
			</div>
			<div class="mtai-panel__snap-charts">
				<div class="mtai-panel__snap-chart"><span>wpm</span>${sparklineSvg(snapshot.wpmSeries, "wpm")}</div>
				<div class="mtai-panel__snap-chart"><span>accuracy</span>${sparklineSvg(snapshot.accSeries, "accuracy")}</div>
			</div>
			<div class="mtai-panel__snap-keys"><span>top keys</span>${keys === "" ? "<span>no key data</span>" : keys}</div>
		`;
	};

	const scrollToEnd = (): void => {
		if (body !== null) body.scrollTop = body.scrollHeight;
	};

	const setStatus = (text: string | null): void => {
		if (statusEl === null) return;
		statusEl.hidden = text === null;
		statusEl.textContent = text ?? "";
	};

	const setBusy = (value: boolean): void => {
		isBusy = value;
		if (sendButton !== null) sendButton.hidden = value;
		if (stopButton !== null) stopButton.hidden = !value;
	};

	const clearMessages = (): void => {
		if (body !== null) body.textContent = "";
		streamingEl = null;
		streamBuffer = "";
	};

	const appendMessage = (
		role: "user" | "assistant",
		text: string,
		extraClass?: string,
		markdown = false,
	): HTMLElement | null => {
		if (body === null) return null;
		const node = element(
			"div",
			`mtai-panel__msg mtai-panel__msg--${role}${extraClass === undefined ? "" : ` ${extraClass}`}`,
		);
		if (markdown) node.innerHTML = renderMarkdown(text);
		else node.textContent = text;
		body.append(node);
		scrollToEnd();
		return node;
	};

	const renderSuggestions = (suggestions: string[]): void => {
		const container = chips;
		if (container === null) return;
		container.textContent = "";
		for (const suggestion of suggestions.slice(0, 4)) {
			const chip = element("button", "mtai-panel__chip", suggestion);
			chip.type = "button";
			chip.addEventListener("click", () => {
				container.textContent = "";
				void send(suggestion);
			});
			container.append(chip);
		}
	};

	const handleEvent = (event: ChatPortEvent): void => {
		switch (event.type) {
			case "state": {
				renderSnapshot(event.snapshot);
				renderHistory(event.conversations, event.conversationId);
				if (modelLabel !== null) {
					modelLabel.textContent = event.configured
						? `${event.provider} · ${event.model}`
						: "not configured";
				}
				clearMessages();
				if (event.messages.length === 0) {
					renderSuggestions(event.suggestions);
					if (!event.configured) {
						appendMessage(
							"assistant",
							"Connect a provider in the extension settings to get coaching. Analytics work without one.",
						);
						setStatus("open the dashboard to add an API key and model.");
					} else {
						appendMessage(
							"assistant",
							"Ask about your own numbers — accuracy, weak keys, plateaus, or what to practise next.",
						);
						setStatus(null);
					}
				} else {
					for (const message of event.messages) {
						appendMessage(
							message.role,
							message.content,
							undefined,
							message.role === "assistant",
						);
					}
					setStatus(null);
				}
				setBusy(false);
				scrollToEnd();
				return;
			}
			case "chunk": {
				if (streamingEl === null) {
					streamingEl = appendMessage("assistant", "", "mtai-panel__msg--pending");
					streamBuffer = "";
				}
				if (streamingEl !== null) {
					streamingEl.classList.remove("mtai-panel__msg--pending");
					streamBuffer += event.text;
					streamingEl.innerHTML = renderMarkdown(streamBuffer);
					scrollToEnd();
				}
				return;
			}
			case "done": {
				if (streamingEl !== null) streamingEl.innerHTML = renderMarkdown(streamBuffer);
				streamingEl = null;
				streamBuffer = "";
				renderHistory(event.conversations, event.conversationId);
				setBusy(false);
				scrollToEnd();
				return;
			}
			case "aborted": {
				streamingEl = null;
				streamBuffer = "";
				setBusy(false);
				setStatus("stopped.");
				return;
			}
			case "error": {
				streamingEl = null;
				streamBuffer = "";
				setBusy(false);
				appendMessage("assistant", event.message, "mtai-panel__msg--error");
				const fix = element("button", "mtai-panel__link", "open settings");
				fix.type = "button";
				fix.addEventListener("click", () =>
					port?.postMessage({ type: "open-dashboard" }),
				);
				body?.append(fix);
				setStatus(null);
				return;
			}
			case "preview": {
				if (previewEl !== null) {
					previewEl.hidden = false;
					previewEl.textContent = `≈${event.tokens} tokens · ${event.provider} · ${event.model}\n\n${event.system}`;
				}
				return;
			}
			default:
				return;
		}
	};

	const connect = (): ReturnType<typeof browser.runtime.connect> | null => {
		if (port !== null) return port;
		try {
			port = browser.runtime.connect({ name: CHAT_PORT_NAME });
			port.onMessage.addListener(handleEvent);
			port.onDisconnect.addListener(() => {
				port = null;
			});
			port.postMessage({ type: "ready" } satisfies ChatPortRequest);
			return port;
		} catch {
			setStatus("The extension was reloaded. Refresh this page to reconnect.");
			return null;
		}
	};

	const send = async (textOverride?: string): Promise<void> => {
		const text = (textOverride ?? textarea?.value ?? "").trim();
		if (text === "" || isBusy) return;
		const connection = connect();
		if (connection === null) return;

		if (chips !== null) chips.textContent = "";
		appendMessage("user", text);
		if (textarea !== null) textarea.value = "";
		setStatus(null);
		setBusy(true);
		streamingEl = null;
		streamBuffer = "";
		connection.postMessage({ type: "send", text } satisfies ChatPortRequest);
	};

	const readSavedGeometry = (): Partial<PanelGeometry> => {
		try {
			const raw = localStorage.getItem(GEOMETRY_KEY);
			if (raw === null) return {};
			const parsed = JSON.parse(raw) as Partial<Record<keyof PanelGeometry, unknown>>;
			const geometry: Partial<PanelGeometry> = {};
			for (const key of ["left", "top", "width", "height"] as const) {
				const value = parsed[key];
				if (typeof value === "number" && Number.isFinite(value)) geometry[key] = value;
			}
			return geometry;
		} catch {
			return {};
		}
	};

	const saveGeometry = (): void => {
		if (panel === null) return;
		const rect = panel.getBoundingClientRect();
		try {
			localStorage.setItem(
				GEOMETRY_KEY,
				JSON.stringify({
					left: Math.round(rect.left),
					top: Math.round(rect.top),
					width: Math.round(rect.width),
					height: Math.round(rect.height),
				}),
			);
		} catch {
			// storage full or disabled; the geometry still applies for this session
		}
	};

	const clampGeometry = (geometry: PanelGeometry): PanelGeometry => {
		const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - MARGIN * 2);
		const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - MARGIN * 2);
		const width = Math.min(Math.max(geometry.width, MIN_WIDTH), maxWidth);
		const height = Math.min(Math.max(geometry.height, MIN_HEIGHT), maxHeight);
		const left = Math.min(
			Math.max(geometry.left, MARGIN),
			Math.max(MARGIN, window.innerWidth - width - MARGIN),
		);
		const top = Math.min(
			Math.max(geometry.top, MARGIN),
			Math.max(MARGIN, window.innerHeight - height - MARGIN),
		);
		return { left, top, width, height };
	};

	/** Keep the window fully inside the viewport after resizes. */
	const applyGeometry = (): void => {
		if (panel === null) return;
		const rect = panel.getBoundingClientRect();
		const next = clampGeometry({
			left: rect.left,
			top: rect.top,
			width: rect.width || DEFAULT_SIZE.width,
			height: rect.height || DEFAULT_SIZE.height,
		});
		if (Math.round(next.width) !== Math.round(rect.width)) {
			panel.style.width = `${next.width}px`;
		}
		if (Math.round(next.height) !== Math.round(rect.height)) {
			panel.style.height = `${next.height}px`;
		}
		panel.style.left = `${next.left}px`;
		panel.style.top = `${next.top}px`;
	};

	const relativeTime = (timestamp: number): string => {
		const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
		if (seconds < 60) return "just now";
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.round(hours / 24)}d ago`;
	};

	const setHistoryOpen = (open: boolean): void => {
		historyOpen = open;
		if (historyEl === null) return;
		historyEl.hidden = !open;
		const menu = panel?.querySelector(".mtai-panel__menu");
		if (menu instanceof HTMLElement) menu.setAttribute("aria-expanded", String(open));
	};

	const renderHistory = (
		conversations: { id: string; title: string; updatedAt: number }[],
		activeId: string | null,
	): void => {
		if (historyListEl === null) return;
		historyListEl.textContent = "";
		if (conversations.length === 0) {
			historyListEl.append(
				element("div", "mtai-panel__history-empty", "No saved conversations yet."),
			);
			return;
		}
		for (const conversation of conversations) {
			const item = element("button", "mtai-panel__history-item");
			item.type = "button";
			if (conversation.id === activeId) item.classList.add("is-active");
			item.append(
				element("span", "", conversation.title),
				element("span", "", relativeTime(conversation.updatedAt)),
			);
			item.addEventListener("click", () => {
				port?.postMessage({ type: "open", conversationId: conversation.id });
				setHistoryOpen(false);
			});
			historyListEl.append(item);
		}
	};

	const buildPanel = (): HTMLElement => {
		const root = element("div", "mtai-panel");
		root.setAttribute("role", "dialog");
		root.setAttribute("aria-label", "AI typing coach");
		root.hidden = true;

		const head = element("div", "mtai-panel__head");
		const menu = element("button", "mtai-panel__icon mtai-panel__menu");
		menu.type = "button";
		menu.setAttribute("aria-label", "Chat history");
		menu.setAttribute("aria-expanded", "false");
		menu.title = "Chat history";
		menu.innerHTML =
			'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
		menu.addEventListener("click", () => setHistoryOpen(!historyOpen));
		const title = element("span", "mtai-panel__title", "ai coach");
		modelLabel = element("span", "mtai-panel__model", "");
		const close = element("button", "mtai-panel__icon mtai-panel__close", "×");
		close.type = "button";
		close.setAttribute("aria-label", "Close coach");
		close.addEventListener("click", () => closePanel());
		head.append(menu, title, modelLabel, close);

		historyEl = element("div", "mtai-panel__history");
		historyEl.hidden = true;
		const historyHead = element("div", "mtai-panel__history-head");
		const historyTitle = element("span", "", "history");
		const historyNew = element("button", "mtai-panel__history-new", "new chat");
		historyNew.type = "button";
		historyNew.addEventListener("click", () => {
			port?.postMessage({ type: "new" } satisfies ChatPortRequest);
			setHistoryOpen(false);
		});
		historyHead.append(historyTitle, historyNew);
		historyListEl = element("div", "mtai-panel__history-list");
		historyEl.append(historyHead, historyListEl);
		head.style.userSelect = "none";
		head.style.cursor = "grab";
		head.addEventListener("pointerdown", (event) => {
			if (panel === null) return;
			if (event.button !== 0) return;
			if (
				event.target instanceof Element &&
				event.target.closest("button, a, input, textarea, select") !== null
			) {
				return;
			}
			const startX = event.clientX;
			const startY = event.clientY;
			const startRect = panel.getBoundingClientRect();
			const startLeft = startRect.left;
			const startTop = startRect.top;
			head.setPointerCapture(event.pointerId);
			head.style.cursor = "grabbing";

			const onMove = (move: PointerEvent): void => {
				if (panel === null) return;
				const next = clampGeometry({
					left: startLeft + (move.clientX - startX),
					top: startTop + (move.clientY - startY),
					width: startRect.width,
					height: startRect.height,
				});
				panel.style.left = `${next.left}px`;
				panel.style.top = `${next.top}px`;
			};
			const onUp = (): void => {
				head.releasePointerCapture(event.pointerId);
				head.removeEventListener("pointermove", onMove);
				head.removeEventListener("pointerup", onUp);
				head.style.cursor = "grab";
				saveGeometry();
			};
			head.addEventListener("pointermove", onMove);
			head.addEventListener("pointerup", onUp);
			event.preventDefault();
		});

		snapEl = element("div", "mtai-panel__snap");
		body = element("div", "mtai-panel__body");
		chips = element("div", "mtai-panel__chips");
		statusEl = element("div", "mtai-panel__status");
		statusEl.hidden = true;
		previewEl = element("pre", "mtai-panel__pre");
		previewEl.hidden = true;

		const form = element("form", "mtai-panel__form");
		textarea = element("textarea", "mtai-panel__input");
		textarea.rows = 2;
		textarea.placeholder = "Ask about your typing…";
		textarea.setAttribute("aria-label", "Message");
		textarea.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				void send();
			}
		});

		sendButton = element("button", "", "send");
		sendButton.type = "submit";
		stopButton = element("button", "", "stop");
		stopButton.type = "button";
		stopButton.hidden = true;
		stopButton.addEventListener("click", () => port?.postMessage({ type: "abort" }));

		form.append(textarea, sendButton, stopButton);
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			void send();
		});

		const actions = element("div", "mtai-panel__actions");
		const preview = element("button", "mtai-panel__link", "preview context");
		preview.type = "button";
		preview.addEventListener("click", () => {
			if (previewEl === null) return;
			if (!previewEl.hidden) {
				previewEl.hidden = true;
				return;
			}
			port?.postMessage({ type: "preview" } satisfies ChatPortRequest);
		});
		const dashboard = element("button", "mtai-panel__link", "dashboard");
		dashboard.type = "button";
		dashboard.addEventListener("click", () =>
			port?.postMessage({ type: "open-dashboard" }),
		);

		actions.append(preview, dashboard);
		const hint = element(
			"div",
			"mtai-panel__hint",
			"enter to send · shift + enter for a new line",
		);
		root.append(
			head,
			historyEl,
			snapEl,
			body,
			chips,
			statusEl,
			previewEl,
			form,
			hint,
			actions,
		);

		// Clicking outside the drawer closes it.
		root.addEventListener("click", (event) => {
			if (!historyOpen || historyEl === null) return;
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (historyEl.contains(target) || menu.contains(target)) return;
			setHistoryOpen(false);
		});

		// Monkeytype listens for keys at document level; keep its shortcuts out of
		// the panel while still letting the textarea receive normal input.
		const stop = (event: Event): void => {
			event.stopPropagation();
		};
		for (const type of ["keydown", "keyup", "keypress"] as const) {
			root.addEventListener(type, stop, true);
		}
		root.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closePanel();
			}
		});

		return root;
	};

	const openPanel = (): void => {
		if (panel === null) {
			panel = buildPanel();
			document.body.append(panel);

			let saveTimer: number | null = null;
			new ResizeObserver(() => {
				// Hiding the panel reports a 0x0 size; do not treat that as a resize.
				if (panel === null || panel.hidden) return;
				applyGeometry();
				if (saveTimer !== null) window.clearTimeout(saveTimer);
				saveTimer = window.setTimeout(() => {
					saveTimer = null;
					if (panel !== null && !panel.hidden) saveGeometry();
				}, 250);
			}).observe(panel);

			const saved = readSavedGeometry();
			const width = saved.width ?? DEFAULT_SIZE.width;
			const height = saved.height ?? DEFAULT_SIZE.height;
			const initial = clampGeometry({
				width,
				height,
				left: saved.left ?? window.innerWidth - width - 18,
				top: saved.top ?? window.innerHeight - height - 74,
			});
			panel.style.width = `${initial.width}px`;
			panel.style.height = `${initial.height}px`;
			panel.style.left = `${initial.left}px`;
			panel.style.top = `${initial.top}px`;
		}
		panel.hidden = false;
		applyGeometry();
		launcher.hidden = true;
		launcher.setAttribute("aria-expanded", "true");
		isOpen = true;
		focusBeforeOpen =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		connect();
		textarea?.focus();
	};

	const closePanel = (): void => {
		if (panel !== null && !panel.hidden) saveGeometry();
		if (panel !== null) panel.hidden = true;
		launcher.hidden = false;
		launcher.setAttribute("aria-expanded", "false");
		isOpen = false;
		const wasTyping = focusBeforeOpen?.id === "wordsInput";
		focusBeforeOpen = null;
		if (wasTyping) {
			const input = document.getElementById("wordsInput");
			if (input instanceof HTMLElement) input.focus({ preventScroll: true });
		}
	};

	launcher.addEventListener("click", () => {
		if (isOpen) closePanel();
		else openPanel();
	});

	window.addEventListener("resize", () => {
		if (isOpen) applyGeometry();
	});

	// Keep the launcher out of the way while a test is running.
	const syncLauncherVisibility = (): void => {
		const typingInput = document.getElementById("wordsInput");
		const typing = typingInput !== null && document.activeElement === typingInput;
		launcher.hidden = typing || isOpen;
	};
	document.addEventListener("focusin", syncLauncherVisibility);
	document.addEventListener("focusout", () => {
		window.setTimeout(syncLauncherVisibility, 0);
	});
	window.setInterval(syncLauncherVisibility, 1500);

	document.body.append(launcher);
	syncLauncherVisibility();
}
