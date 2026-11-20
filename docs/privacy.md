# Privacy and data handling

## What is stored, and where

| Data                                                            | Location                                    | Notes                                     |
| --------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Captured test metrics and per-key error counts                  | IndexedDB (`mtai` database)                 | extension origin only                     |
| Per-key typing rhythm (bigrams), corrections, missed characters | inside each test record                     | derived locally from the page's event log |
| Conversations with the coach                                    | IndexedDB (`conversations`)                 | last 100 messages per thread, 100 threads |
| Settings                                                        | `chrome.storage.local`                      | includes the provider and model choice    |
| API keys                                                        | `chrome.storage.local` (`mtai.credentials`) | never sent to the Monkeytype page         |
| Last-seen heartbeat + sampled theme colours                     | `chrome.storage.local`                      | a timestamp and CSS colour values         |

Not stored: the words you typed, your Monkeytype account or result ids, browsing
history, or anything from other sites.

Chrome extension storage is **not encrypted at rest** beyond your operating
system's disk encryption. The settings screen says this explicitly instead of
implying otherwise.

## What leaves the browser

Nothing, until you configure a provider and send a message or request an insight.
When you do, only the serialized analysis is sent:

- window: number of tests, valid/excluded counts, date range
- averages: wpm, raw, accuracy, consistency, best, median
- characters: correct / incorrect / extra / missed, error rate, correction rate
- trend and recent-vs-earlier comparison, plus the previous window's averages
- per-mode breakdown
- key-level data (optional): problem keys, confusion pairs, slow pairs, coverage
- up to eight recent tests (optional): date, mode, wpm, accuracy, consistency, duration
- your conversation messages

The **preview context** dialog in the coach tab renders the exact system prompt and
conversation that will be sent, with a token estimate, and a copy button. The
"send per-key error analysis" and "send a recent-test summary" toggles remove those
sections entirely.

No telemetry, analytics, or crash reporting is sent anywhere. The extension makes
no network requests except to the provider you configured.

## Credentials

- Keys are read only in extension pages and the service worker.
- The content script never imports the credentials module; the in-page panel talks
  to the worker over a port and receives answer text only.
- Removing a key from settings deletes it from storage immediately.
- Clearing the extension's data in Chrome removes the database as well.

## Permissions

| Permission                 | Why                                          |
| -------------------------- | -------------------------------------------- |
| `storage`                  | settings, credentials, heartbeat             |
| `https://monkeytype.com/*` | the only site the extension runs on          |
| optional provider hosts    | requested per provider when you configure it |

The extension does not request `tabs`, `scripting`, `webRequest`, `<all_urls>`, or
any always-on host access.

## Monkeytype's own data

The extension only reads, never writes: `localStorage.config`, the rendered results
screen, and the page's in-memory `window.lastEventLog()`. Monkeytype's records are
never modified, and capture can be disabled entirely in settings.
