import type { ProviderId } from "@/ai/types";
import { clear, count, get, getAll, put, remove } from "./idb";

const STORE = "conversations";
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 100;

export interface StoredMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
	provider?: ProviderId;
	model?: string;
}

export interface StoredConversation {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: StoredMessage[];
}

export function newId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listConversations(): Promise<StoredConversation[]> {
	const rows = await getAll<StoredConversation>(STORE);
	return rows
		.map((row) => ({ ...row, messages: Array.isArray(row.messages) ? row.messages : [] }))
		.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<StoredConversation | null> {
	const row = await get<StoredConversation>(STORE, id);
	if (row === undefined) return null;
	return { ...row, messages: Array.isArray(row.messages) ? row.messages : [] };
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
	const trimmed: StoredConversation = {
		...conversation,
		messages: conversation.messages.slice(-MAX_MESSAGES),
	};
	await put(STORE, trimmed);
	await prune();
}

export async function deleteConversation(id: string): Promise<void> {
	await remove(STORE, id);
}

export async function clearConversations(): Promise<void> {
	await clear(STORE);
}

export async function countConversations(): Promise<number> {
	return count(STORE);
}

async function prune(): Promise<void> {
	const total = await count(STORE);
	if (total <= MAX_CONVERSATIONS) return;
	const rows = await listConversations();
	for (const row of rows.slice(MAX_CONVERSATIONS)) {
		await remove(STORE, row.id);
	}
}

/** Latest thread, used by the in-page panel so it continues the dashboard chat. */
export async function latestConversation(): Promise<StoredConversation | null> {
	const rows = await listConversations();
	return rows[0] ?? null;
}
