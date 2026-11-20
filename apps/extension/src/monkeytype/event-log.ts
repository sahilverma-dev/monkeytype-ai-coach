import { z } from "zod";

/**
 * A tolerant reader for Monkeytype's in-memory event log (`window.lastEventLog()`).
 *
 * The log is a debugging global, not a documented API, so every field is validated
 * and anything unexpected is dropped rather than trusted. Only the fields this
 * extension actually reads are declared.
 */

const eventBase = {
	ms: z.number().finite(),
	testMs: z.number().finite().optional(),
};

const keyData = z.object({
	code: z.string(),
	ctrl: z.boolean().optional(),
	shift: z.boolean().optional(),
	alt: z.boolean().optional(),
	meta: z.boolean().optional(),
	estimated: z.boolean().optional(),
});

const inputData = z.object({
	inputType: z.string(),
	charIndex: z.number().int().optional(),
	wordIndex: z.number().int().optional(),
	inputValue: z.string().optional(),
	data: z.string().optional(),
	correct: z.boolean().optional(),
	commitsWord: z.boolean().optional(),
	lastWord: z.boolean().optional(),
	inputStopped: z.boolean().optional(),
	automatic: z.boolean().optional(),
});

export const testEventSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("keydown"), ...eventBase, data: keyData }),
	z.object({ type: z.literal("keyup"), ...eventBase, data: keyData }),
	z.object({ type: z.literal("input"), ...eventBase, data: inputData }),
	z.object({
		type: z.literal("timer"),
		...eventBase,
		data: z.object({
			event: z.string(),
			timer: z.number().optional(),
			date: z.number().optional(),
		}),
	}),
	z.object({
		type: z.literal("composition"),
		...eventBase,
		data: z.object({
			event: z.string(),
			data: z.string().optional(),
			wordIndex: z.number().int().optional(),
		}),
	}),
]);

export const eventLogSchema = z.object({
	version: z.number().int(),
	events: z.array(testEventSchema),
	context: z.object({
		targetWords: z.array(z.string()),
		mode: z.string(),
		mode2: z.union([z.string(), z.number()]).optional(),
		bailedOut: z.boolean().optional(),
		hasKorean: z.boolean().optional(),
	}),
});

export type EventLog = z.infer<typeof eventLogSchema>;
export type TestEvent = z.infer<typeof testEventSchema>;
export type InputTestEvent = Extract<TestEvent, { type: "input" }>;

/** The target words without the trailing commit character Monkeytype appends. */
export function targetText(log: EventLog): string[] {
	return log.context.targetWords.map((word) =>
		word.endsWith(" ") || word.endsWith("\n") ? word.slice(0, -1) : word,
	);
}

export function testStartDate(log: EventLog): number | null {
	for (const event of log.events) {
		if (event.type === "timer" && event.data.event === "start" && event.data.date) {
			return event.data.date;
		}
	}
	return null;
}

export function inputEvents(log: EventLog): InputTestEvent[] {
	return log.events.filter((event): event is InputTestEvent => event.type === "input");
}
