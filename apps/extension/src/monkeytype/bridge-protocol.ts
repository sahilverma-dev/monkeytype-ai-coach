import type { MonkeytypeConfigSnapshot } from "./capture";

export const ISOLATED_SOURCE = "mtai-isolated";
export const MAIN_SOURCE = "mtai-main";

export interface SnapshotRequest {
	source: typeof ISOLATED_SOURCE;
	type: "REQUEST_TEST_SNAPSHOT";
	requestId: string;
}

export interface SnapshotPayload {
	eventLog: unknown;
	config: MonkeytypeConfigSnapshot | null;
	resultVisible: boolean;
	href: string;
	capturedAt: number;
}

export interface SnapshotResponse {
	source: typeof MAIN_SOURCE;
	type: "TEST_SNAPSHOT";
	requestId: string;
	payload: SnapshotPayload | null;
	error?: string;
}

export function isSnapshotRequest(value: unknown): value is SnapshotRequest {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<SnapshotRequest>;
	return (
		candidate.source === ISOLATED_SOURCE && candidate.type === "REQUEST_TEST_SNAPSHOT"
	);
}

export function isSnapshotResponse(value: unknown): value is SnapshotResponse {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<SnapshotResponse>;
	return candidate.source === MAIN_SOURCE && candidate.type === "TEST_SNAPSHOT";
}

export function requestId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
