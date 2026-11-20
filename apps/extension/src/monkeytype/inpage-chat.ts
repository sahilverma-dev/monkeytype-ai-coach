import { browser } from "wxt/browser";
import { renderMarkdown } from "@/shared/markdown";
import {
	CHAT_PORT_NAME,
	type ChatPortEvent,
	type ChatPortRequest,
} from "@/shared/port-protocol";

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
.mtai-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:44px;height:44px;border-radius:100%;display:grid;place-items:center;padding:0;border:none;background:var(--main-color);color:var(--bg-color);cursor:pointer;box-shadow:0 0 0 1px color-mix(in srgb,var(--bg-color) 60%,transparent);transition:background .125s,color .125s,transform .125s}
.mtai-launcher:hover{background:var(--text-color);color:var(--bg-color)}
.mtai-launcher:focus-visible{outline:none;box-shadow:0 0 0 .1rem var(--bg-color),0 0 0 .2rem var(--text-color)}
.mtai-launcher svg{width:22px;height:22px;display:block}
.mtai-launcher[hidden]{display:none}
.mtai-panel{position:fixed;right:18px;bottom:74px;z-index:2147483001;width:min(380px,calc(100vw - 36px));max-height:min(600px,72vh);display:flex;flex-direction:column;background:var(--bg-color);color:var(--text-color);font-family:var(--font);border:1px solid color-mix(in srgb,var(--sub-color) 40%,transparent);border-radius:var(--roundness);overflow:hidden}
.mtai-panel[hidden]{display:none}
.mtai-panel__head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.55rem .7rem;border-bottom:1px solid color-mix(in srgb,var(--sub-color) 25%,transparent)}
.mtai-panel__title{font-size:.8rem;color:var(--main-color);white-space:nowrap}
.mtai-panel__model{font-size:.65rem;color:var(--sub-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.mtai-panel__icon{width:1.6rem;height:1.6rem;padding:0;font-size:.9rem;line-height:1;background:none;color:var(--sub-color);display:grid;place-items:center;flex:none}
.mtai-panel__icon:hover{background:none;color:var(--text-color)}
.mtai-panel__body{padding:.7rem;overflow-y:auto;display:flex;flex-direction:column;gap:.55rem;flex:1 1 auto;min-height:7rem}
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

const BUBBLE_ICON =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.6a8.2 8.2 0 0 1-.9-3.7 8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 8.5 8.2z"/></svg>';

export function mountInpageChat(): void {
	if (document.querySelector(".mtai-launcher") !== null) return;
	ensureStyles();

	const launcher = element("button", "mtai-launcher");
	launcher.type = "button";
	launcher.setAttribute("aria-label", "Ask the AI typing coach");
	launcher.setAttribute("aria-expanded", "false");
	launcher.title = "Ask your typing coach";
	launcher.innerHTML = BUBBLE_ICON;

	let panel: HTMLElement | null = null;
	let body: HTMLElement | null = null;
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
				if (streamingEl === null)
					streamingEl = appendMessage("assistant", "", "mtai-panel__msg--pending");
				if (streamingEl !== null) {
					streamingEl.classList.remove("mtai-panel__msg--pending");
					streamingEl.textContent += event.text;
					scrollToEnd();
				}
				return;
			}
			case "done": {
				if (streamingEl !== null) streamingEl.innerHTML = renderMarkdown(streamBuffer);
				streamingEl = null;
				streamBuffer = "";
				setBusy(false);
				scrollToEnd();
				return;
			}
			case "aborted": {
				streamingEl = null;
				setBusy(false);
				setStatus("stopped.");
				return;
			}
			case "error": {
				streamingEl = null;
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

	const buildPanel = (): HTMLElement => {
		const root = element("div", "mtai-panel");
		root.setAttribute("role", "dialog");
		root.setAttribute("aria-label", "AI typing coach");
		root.hidden = true;

		const head = element("div", "mtai-panel__head");
		const title = element("span", "mtai-panel__title", "ai coach");
		modelLabel = element("span", "mtai-panel__model", "");
		const close = element("button", "mtai-panel__icon", "×");
		close.type = "button";
		close.setAttribute("aria-label", "Close coach");
		close.addEventListener("click", () => closePanel());
		head.append(title, modelLabel, close);

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
		const newChat = element("button", "mtai-panel__link", "new chat");
		newChat.type = "button";
		newChat.addEventListener("click", () => {
			previewEl = previewEl ?? null;
			if (previewEl !== null) previewEl.hidden = true;
			port?.postMessage({ type: "new" } satisfies ChatPortRequest);
		});
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

		actions.append(newChat, preview, dashboard);
		root.append(head, body, chips, statusEl, previewEl, form, actions);

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
		}
		panel.hidden = false;
		launcher.hidden = true;
		launcher.setAttribute("aria-expanded", "true");
		isOpen = true;
		focusBeforeOpen =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		connect();
		textarea?.focus();
	};

	const closePanel = (): void => {
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
