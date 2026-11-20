# Known limitations

These are properties of Monkeytype's exposed data and of browser extensions, not
unfinished features. Where a limit applies, the UI says so instead of filling the
gap with invented numbers.

## History

- **Monkeytype keeps results on its servers**, not in `localStorage`/IndexedDB, so
  the extension can only record tests completed while it is installed.
- Older results can be imported with an **ApeKey** (`GET /results`). That endpoint
  returns **headline metrics only**: no chart data and no keystroke detail, so
  imported tests are stored as `summary` fidelity and are excluded from per-key
  analysis and slow-pair detection.
- Monkeytype's API caps history reads at **1000 results per request** and 30
  requests per day per account. The importer is incremental and stops when a page
  is short.
- Results captured live and the same result fetched from the API cannot share an
  id (the API row is created after the test), so deduplication matches on
  timestamp (±2s), mode, mode2 and WPM.
- CSV/JSON imports are user-supplied data. They are stored as `summary` fidelity,
  labelled `file` in the tests table, and cannot support key-level analysis. Rows
  without `wpm`, `acc` and `duration` are skipped rather than guessed.

## Key-level analysis

- Per-keystroke data comes from `window.lastEventLog()`, an **undocumented
  debugging global** that Monkeytype may change. It is feature-detected, schema
  validated against a real captured log, and optional: without it a test is stored
  as `summary` and the UI reports missing coverage.
- The log contains no `ms` field in production; the reader uses `testMs` and
  tolerates both shapes.
- IME composition (Korean and similar) is not disassembled, so key statistics are
  skipped for those logs rather than mis-attributed.
- Missed characters are counted when a word is committed. A timed test ending
  mid-word does not invent misses for letters the user never had to finish.
- Typing rhythm is derived from consecutive keystrokes and capped at 3s per gap;
  pairs with fewer than 3 samples are not surfaced.
- Multi-character inserts (composition/autofill) are ignored for error attribution.

## Metrics

- Headline WPM, raw WPM, accuracy, consistency and character counts are read from
  the **results screen the user saw**, formatted values are normalised, and units
  (wpm/cpm/wps/cps/wph/cph) converted.
- If the screen cannot be parsed, numbers are reconstructed from the event log and
  labelled `computed` in storage and in the tests table. Consistency is not
  reconstructed and stays empty in that case.
- Tests shorter than 5 seconds and bailed-out tests are stored but excluded from
  averages until the user looks at them individually.

## AI

- A provider key and a model id are required. Model lists depend on each
  provider's own listing endpoint; if it fails, type the id.
- Anthropic requests include `anthropic-dangerous-direct-browser-access: true`,
  which its API requires for browser clients.
- Custom endpoints must implement OpenAI's `POST /chat/completions` (and ideally
  `GET /models`).
- Host access to a provider domain is optional. Declining it still attempts the
  request, because most providers allow browser CORS; if the provider blocks it,
  the error tells the user to grant access in settings.
- The in-page panel cannot request host permissions itself (Chrome requires a
  gesture in an extension page), so grant access once from settings if a provider
  blocks the panel.
- Streaming runs in the dashboard or the service worker. Closing the dashboard
  mid-answer keeps the partial text; the popup's single insight is cached only
  after it completes.
- Context is capped at roughly 5000 tokens; the preview shows the estimate.

## Chat rendering

- Answers render as markdown through `marked` and are sanitised with DOMPurify.
  Images, media, iframes, forms and inline styles are removed, and links are forced
  to open in a new tab, so model output cannot make a request or run script.
- Tables and long code blocks scroll horizontally inside the message.

## Storage and platform

- `chrome.storage.local` and IndexedDB are **not encrypted** at rest beyond OS disk
  encryption. The settings screen states this.
- Chrome may clear extension storage when the extension is uninstalled; use the
  JSON export for a durable copy.
- Only Chrome/Chromium 111+ is targeted (the main-world content script uses the
  `world` manifest key). Firefox and Safari are untested.
- Theme colours and `--roundness` follow the active Monkeytype theme. Fonts other
  than the bundled Roboto Mono are not shipped, so the extension keeps Roboto Mono
  rather than falling back to an unrelated monospace.

## Not implemented

- Account sync of captured data, mobile, or a hosted backend.
- Sound cues, screenshots, replay, or any Monkeytype feature interception.
- Automatic insight generation after every test (on-demand by design, to avoid
  surprise provider costs).
