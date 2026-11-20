import { z } from "zod";

const charConfusionSchema = z.object({
	typed: z.string().min(1).max(8),
	count: z.number().int().positive(),
});

const charErrorStatSchema = z.object({
	char: z.string().min(1).max(8),
	attempts: z.number().int().nonnegative(),
	errors: z.number().int().nonnegative(),
	corrected: z.number().int().nonnegative(),
	missed: z.number().int().nonnegative(),
	confusion: z.array(charConfusionSchema).max(20),
});

const keyDerivedStatsSchema = z.object({
	chars: z.array(charErrorStatSchema).max(400),
	bigrams: z
		.array(
			z.object({
				pair: z.string().min(2).max(8),
				samples: z.number().int().positive(),
				meanMs: z.number().nonnegative(),
			}),
		)
		.max(50),
	keystrokes: z.number().int().nonnegative(),
	corrections: z.number().int().nonnegative(),
	missedChars: z.number().int().nonnegative(),
	extraChars: z.number().int().nonnegative(),
});

/**
 * Validated at the extension boundary (content script -> service worker) so a
 * broken page, an extension bug, or a future Monkeytype change cannot write
 * malformed records into storage.
 */
export const capturedTestSchema = z.object({
	id: z.string().min(1).max(120),
	fingerprint: z.string().min(1).max(4000),
	capturedAt: z.number().int().positive(),
	startedAt: z.number().int().positive().nullable(),
	timestamp: z.number().int().positive(),
	mode: z.enum(["time", "words", "quote", "zen", "custom"]),
	mode2: z.string().max(200),
	difficulty: z.string().max(40),
	language: z.string().max(60),
	punctuation: z.boolean(),
	numbers: z.boolean(),
	funbox: z.array(z.string().max(60)).max(10),
	wpm: z.number().nonnegative().max(1000),
	rawWpm: z.number().nonnegative().max(1200),
	acc: z.number().min(0).max(100),
	consistency: z.number().min(0).max(100).nullable(),
	charStats: z.tuple([
		z.number().int().nonnegative(),
		z.number().int().nonnegative(),
		z.number().int().nonnegative(),
		z.number().int().nonnegative(),
	]),
	testDuration: z.number().positive(),
	bailedOut: z.boolean(),
	fidelity: z.enum(["full", "summary"]),
	metricsSource: z.enum(["monkeytype", "computed"]),
	keyStats: keyDerivedStatsSchema.nullable(),
	excludedReason: z.string().max(60).nullable(),
});
