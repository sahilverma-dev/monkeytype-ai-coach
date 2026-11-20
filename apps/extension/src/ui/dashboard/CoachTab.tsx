import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { buildCoachData } from "@/ai/context";
import { buildPreview, buildSuggestions } from "@/ai/prompt";
import { streamCoachReply } from "@/ai/service";
import { renderMarkdown } from "@/shared/markdown";
import {
	getConversation,
	latestConversation,
	listConversations,
	type StoredConversation,
} from "@/storage/conversations";
import { hasApiKey } from "@/storage/credentials";
import { Panel } from "@/ui/components/Panel";
import { formatNumber, formatPercent, relativeTime } from "@/ui/format";
import type { CaptureData } from "@/ui/useCaptureData";

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function Markdown(props: { text: string }): ReactNode {
	const html = useMemo(() => renderMarkdown(props.text), [props.text]);
	// biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown sanitises with DOMPurify
	return <div className="mtai-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CoachTab(props: {
	data: CaptureData;
	onOpenSettings: () => void;
}): ReactNode {
	const { data } = props;
	const [conversations, setConversations] = useState<StoredConversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [active, setActive] = useState<StoredConversation | null>(null);
	const [draft, setDraft] = useState("");
	const [streaming, setStreaming] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [configured, setConfigured] = useState<boolean | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const activeIdRef = useRef<string | null>(activeId);
	activeIdRef.current = activeId;
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const messagesRef = useRef<HTMLDivElement | null>(null);

	const ai = data.settings.ai;

	useEffect(() => {
		let cancelled = false;
		void Promise.all([hasApiKey(ai.provider), listConversations()]).then(
			([key, stored]) => {
				if (cancelled) return;
				setConfigured(key);
				setConversations(stored);
				const latest = stored[0];
				if (latest !== undefined && activeIdRef.current === null) {
					setActiveId(latest.id);
					setActive(latest);
				}
			},
		);
		return () => {
			cancelled = true;
		};
	}, [ai.provider]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog === null) return;
		if (previewOpen && !dialog.open) dialog.showModal();
		if (!previewOpen && dialog.open) dialog.close();
	}, [previewOpen]);

	// The effect only touches the DOM node; message and stream changes are the triggers.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
	useEffect(() => {
		const node = messagesRef.current;
		if (node !== null) node.scrollTop = node.scrollHeight;
	}, [active, streaming]);

	const coachData = useMemo(
		() =>
			buildCoachData(data.tests, data.settings.analysisWindow, {
				includeKeyData: ai.includeKeyData,
				includeRecentTests: ai.includeRecentTests,
			}),
		[data.tests, data.settings.analysisWindow, ai.includeKeyData, ai.includeRecentTests],
	);

	const suggestions = useMemo(() => buildSuggestions(coachData), [coachData]);

	const preview = useMemo(
		() =>
			buildPreview(
				coachData.context,
				(active?.messages ?? []).map((message) => ({
					role: message.role,
					content: message.content,
				})),
			),
		[coachData.context, active],
	);

	const startNewChat = (): void => {
		abortRef.current?.abort();
		setActiveId(null);
		setActive(null);
		setDraft("");
		setStreaming("");
		setError(null);
		setNotice(null);
	};

	const loadConversation = async (id: string): Promise<void> => {
		abortRef.current?.abort();
		const stored = await getConversation(id);
		setActiveId(stored?.id ?? null);
		setActive(stored);
		setError(null);
		setNotice(null);
	};

	const send = async (textOverride?: string): Promise<void> => {
		const text = (textOverride ?? draft).trim();
		if (text === "" || busy) return;
		setError(null);
		setNotice(null);

		if (ai.model.trim() === "") {
			setError("Choose a model in settings before asking the coach.");
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setBusy(true);
		setDraft("");
		setStreaming("");

		const optimistic: StoredConversation = active ?? {
			id: "pending",
			title: text.slice(0, 60),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
		};
		setActive({
			...optimistic,
			messages: [
				...optimistic.messages,
				{
					id: `local-${Date.now()}`,
					role: "user",
					content: text,
					createdAt: Date.now(),
				},
			],
		});

		try {
			const reply = await streamCoachReply(
				{ conversationId: activeId, text },
				{
					signal: controller.signal,
					onChunk: (chunk) => setStreaming((value) => value + chunk),
				},
			);
			setActiveId(reply.conversation.id);
			setActive(reply.conversation);
			setConversations(await listConversations());
			setConfigured(true);
		} catch (sendError) {
			const message = errorText(sendError);
			if (/cancelled|aborted/i.test(message)) {
				setNotice("Stopped. The partial answer was kept.");
			} else {
				setError(message);
			}
			const latest = await latestConversation();
			if (latest !== null) {
				setActiveId(latest.id);
				setActive(latest);
			}
			setConversations(await listConversations());
		} finally {
			setBusy(false);
			setStreaming("");
			abortRef.current = null;
		}
	};

	const copyPreview = async (): Promise<void> => {
		const text = `${preview.system}\n\n${preview.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n")}`;
		await navigator.clipboard.writeText(text).catch(() => undefined);
	};

	if (configured === false || ai.model.trim() === "") {
		return (
			<Panel title="coach">
				<div className="mtai-stack">
					<p className="mtai-note">
						Connect a provider and pick a model to get coaching grounded in your captured
						tests. Analytics work without this.
					</p>
					<div className="mtai-row-tight">
						<button
							type="button"
							className="mtai-button--active"
							onClick={props.onOpenSettings}
						>
							open ai settings
						</button>
					</div>
					<p className="mtai-note">
						Only the analysis summary shown in "preview context" is sent — never raw test
						text, account data, or browsing history.
					</p>
				</div>
			</Panel>
		);
	}

	const messages = active?.messages ?? [];

	return (
		<Panel
			title="coach"
			aside={
				<div className="mtai-row-tight">
					<span className="mtai-badge">
						{ai.provider} · {ai.model}
					</span>
					<span className="mtai-badge">
						{data.settings.analysisWindow === "all"
							? "all tests"
							: `last ${data.settings.analysisWindow}`}
					</span>
				</div>
			}
		>
			<div className="mtai-stack">
				<div className="mtai-row">
					<div className="mtai-row-tight">
						<select
							value={activeId ?? ""}
							onChange={(event) => {
								const id = event.target.value;
								if (id === "") startNewChat();
								else void loadConversation(id);
							}}
							aria-label="Conversation"
						>
							<option value="">new conversation</option>
							{conversations.map((conversation) => (
								<option key={conversation.id} value={conversation.id}>
									{conversation.title} · {relativeTime(conversation.updatedAt)}
								</option>
							))}
						</select>
						<button type="button" className="mtai-button--ghost" onClick={startNewChat}>
							new chat
						</button>
					</div>
					<div className="mtai-row-tight">
						<button
							type="button"
							className="mtai-button--ghost"
							onClick={() => setPreviewOpen(true)}
						>
							preview context
						</button>
					</div>
				</div>

				<div
					className="mtai-chat"
					ref={messagesRef}
					style={{ maxHeight: "26rem", overflowY: "auto", paddingRight: "0.25rem" }}
				>
					{messages.length === 0 && !busy ? (
						<p className="mtai-note">
							Ask about your own numbers. The coach sees the statistics for the selected
							window, not your raw typing.
						</p>
					) : null}

					{messages.map((message) => (
						<div
							key={message.id}
							className={
								message.role === "user"
									? "mtai-msg mtai-msg--user"
									: "mtai-msg mtai-msg--assistant"
							}
						>
							{message.role === "user" ? (
								message.content
							) : (
								<Markdown text={message.content} />
							)}
							{message.role === "assistant" ? (
								<span className="mtai-msg__meta">
									{message.model ?? ai.model}
									{message.createdAt === 0 ? "" : ` · ${relativeTime(message.createdAt)}`}
								</span>
							) : null}
						</div>
					))}

					{busy ? (
						<div className="mtai-msg mtai-msg--assistant mtai-msg--pending">
							{streaming === "" ? "thinking…" : <Markdown text={streaming} />}
						</div>
					) : null}
				</div>

				{messages.length === 0 && !busy ? (
					<div className="mtai-chips">
						{suggestions.map((suggestion) => (
							<button
								key={suggestion}
								type="button"
								onClick={() => void send(suggestion)}
							>
								{suggestion}
							</button>
						))}
					</div>
				) : null}

				{error === null ? null : (
					<div className="mtai-error" role="alert">
						{error}
					</div>
				)}
				{notice === null ? null : <p className="mtai-note">{notice}</p>}

				<div className="mtai-composer">
					<textarea
						value={draft}
						placeholder="Ask about your typing…"
						aria-label="Message"
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void send();
							}
						}}
					/>
					{busy ? (
						<button type="button" onClick={() => abortRef.current?.abort()}>
							stop
						</button>
					) : (
						<button
							type="button"
							className="mtai-button--active"
							onClick={() => void send()}
							disabled={draft.trim() === ""}
						>
							send
						</button>
					)}
				</div>

				<p className="mtai-note">
					{formatNumber(coachData.stats.validTests)} tests in context · accuracy{" "}
					{formatPercent(coachData.stats.acc.average)} · key data on{" "}
					{coachData.chars.coverage.testsWithKeys} · context ≈ {preview.estimatedTokens}{" "}
					tokens
				</p>
			</div>

			<dialog
				className="mtai-dialog"
				ref={dialogRef}
				onClose={() => setPreviewOpen(false)}
			>
				<div className="mtai-dialog__head">
					<strong style={{ fontWeight: 400 }}>what will be sent</strong>
					<div className="mtai-row-tight">
						<button
							type="button"
							className="mtai-button--ghost"
							onClick={() => void copyPreview()}
						>
							copy
						</button>
						<button
							type="button"
							className="mtai-button--ghost"
							onClick={() => setPreviewOpen(false)}
						>
							close
						</button>
					</div>
				</div>
				<div className="mtai-dialog__body">
					<p className="mtai-note">
						{ai.provider} · {ai.model} · ≈{preview.estimatedTokens} tokens
						{preview.overBudget
							? " · over the preferred budget, consider a smaller window"
							: ""}
					</p>
					<p className="mtai-note">
						System prompt and data. No API key, no test text, no account or browsing data
						is included.
					</p>
					<pre>{preview.system}</pre>
					{preview.messages.length === 0 ? null : (
						<>
							<p className="mtai-note">Conversation so far</p>
							<pre>
								{preview.messages
									.map((message) => `${message.role.toUpperCase()}\n${message.content}`)
									.join("\n\n")}
							</pre>
						</>
					)}
				</div>
			</dialog>
		</Panel>
	);
}
