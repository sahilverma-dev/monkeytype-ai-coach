export const MT_HOSTS = ["monkeytype.com", "www.monkeytype.com"] as const;

export const MT_MATCHES = ["https://monkeytype.com/*", "https://www.monkeytype.com/*"];

export const STORAGE_PREFIX = "mtai.";
export const SETTINGS_KEY = "mtai.settings";
export const SESSION_KEY = "mtai.session";

export const DB_NAME = "mtai";
export const DB_VERSION = 1;

export const ANALYSIS_WINDOWS = [10, 20, 50, 100, "all"] as const;
export const DEFAULT_ANALYSIS_WINDOW = 20;

export const MAX_STORED_TESTS = 2000;

/** Tests shorter than this are not representative and are flagged, mirroring Monkeytype's own validity floor. */
export const MIN_VALID_TEST_SECONDS = 5;

/** Ignore latencies above this when summarising typing rhythm (AFK, distraction). */
export const MAX_PLAUSIBLE_LATENCY_MS = 3000;

/** Event log version this extension knows how to read. */
export const SUPPORTED_EVENT_LOG_VERSION = 1;
