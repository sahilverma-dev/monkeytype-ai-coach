import type { RuntimeMessage } from "@/shared/messages";
import type { CapturedTest } from "@/shared/types";
import type { SnapshotResponse } from "./bridge-protocol";
import { buildCapturedTest } from "./capture";
import { eventLogSchema } from "./event-log";
import { computeMetrics, readResultMetrics } from "./metrics";
import { readConfigFromStorage } from "./page-bridge";

export interface CaptureDeps {
	doc: Document;
	storage: Storage;
	requestSnapshot: () => Promise<SnapshotResponse | null>;
	send: (message: RuntimeMessage) => Promise<unknown>;
	now?: number;
}

export type CaptureOutcome =
	| { status: "stored"; test: CapturedTest }
	| { status: "duplicate"; test: CapturedTest }
	| { status: "skipped"; reason: string };

interface Ack {
	ok?: boolean;
	data?: { stored?: boolean; duplicate?: boolean };
}

/**
 * One capture attempt, from "the result screen is up" to "the worker has it".
 * Headline numbers come from the results screen the user is looking at; key-level
 * data comes from the page's in-memory event log. Either source alone is enough
 * to store something useful, and what was missing is recorded in `fidelity`.
 */
export async function captureCompletedTest(deps: CaptureDeps): Promise<CaptureOutcome> {
	const snapshot = await deps.requestSnapshot();
	const config = snapshot?.payload?.config ?? readConfigFromStorage(deps.storage);
	if (config === null) return { status: "skipped", reason: "no config available" };

	let log = null;
	const rawLog = snapshot?.payload?.eventLog ?? null;
	if (rawLog !== null) {
		const parsed = eventLogSchema.safeParse(rawLog);
		if (parsed.success) log = parsed.data;
	}

	const resultElement = deps.doc.querySelector("#result");
	const metrics =
		(resultElement === null
			? null
			: readResultMetrics(resultElement, config.typingSpeedUnit)) ??
		(log === null ? null : computeMetrics(log));

	const built = buildCapturedTest({ log, config, metrics, now: deps.now });
	if (!built.ok) return { status: "skipped", reason: built.reason };

	const response = (await deps.send({ type: "TEST_CAPTURED", test: built.test })) as Ack;
	if (response?.ok === false)
		return { status: "skipped", reason: "worker rejected the record" };
	if (response?.data?.duplicate === true)
		return { status: "duplicate", test: built.test };
	if (response?.data?.stored === false) {
		return { status: "skipped", reason: "capture disabled in settings" };
	}
	return { status: "stored", test: built.test };
}
