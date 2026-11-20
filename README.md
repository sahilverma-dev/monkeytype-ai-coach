# Monkeytype AI Companion

A Chrome extension (Manifest V3) that turns Monkeytype into a personalised typing
coach: it captures your real test results, analyses them locally, and — once a
provider is connected — asks your own AI model for coaching grounded in those
numbers.

Your typing data. Your AI provider. Your personal typing coach.

## Status

Milestones 1 and 2 are complete and installable:

- capture of completed tests on `monkeytype.com`, including per-keystroke error
  data from the page's in-memory test log
- deterministic local analytics (averages, trends, personal bests, per-key error
  rates, confusion pairs, typing rhythm) with an evidence-based weakness engine
- Monkeytype-native dashboard (overview, trends, keys, coach, tests, settings) and popup
- optional history import through a Monkeytype ApeKey, clearly marked as
  headline-only data
- bring-your-own-model coaching through the Vercel AI SDK: OpenAI, Anthropic,
  Gemini, OpenRouter and custom OpenAI-compatible endpoints, streaming, model
  discovery, connection testing and normalised errors
- a chat panel on the Monkeytype page itself, plus a dashboard coach tab, both
  grounded in the same local analysis
- an exact "preview context" view and toggles for what is shared
- theme sync: the extension uses the colours of your active Monkeytype theme

History import with a Monkeytype ApeKey and the packaging/polish pass are next.
See `docs/` for design decisions and known limits.

## Quick start

```bash
bun install
bun run dev        # WXT dev build for the extension
```

Then load the unpacked extension:

1. open `chrome://extensions`
2. enable **Developer mode**
3. **Load unpacked** and select `apps/extension/.output/chrome-mv3`

Full instructions, including the production build, are in
[`docs/install.md`](docs/install.md).

## How it works

```
monkeytype.com page
  ├── main-world script  → reads window.lastEventLog() / config (page memory only)
  ├── isolated script    → validates, derives key stats, posts one message per test
  └── service worker     → validates again, stores in IndexedDB
                              ↑
              dashboard / popup read the same store
```

Headline numbers (WPM, accuracy, raw, consistency, character counts) are read from
the results screen you actually saw, so they match Monkeytype exactly. Per-key
analysis is derived locally from the event log: which characters you mistyped,
what you typed instead, which ones you skipped, and how long hard pairs take.

Nothing is uploaded. There is no AI provider connected in this build, and no
network requests are made from the extension.

## Project layout

```
apps/extension/
  src/entrypoints/       background, content, main-world bridge, popup, dashboard, options
  src/monkeytype/        page bridge, event-log schema, key derivation, result parsing
  src/analytics/         statistics, char analysis, weakness rules
  src/storage/           IndexedDB + settings
  src/ui/                React dashboard and popup (plain CSS, Monkeytype tokens)
  src/styles/base.css    token-parity stylesheet
  tests/                 unit and DOM tests
docs/
  design-system.md       tokens, component behaviour, licensing notes
  install.md             build and load instructions
  providers.md           provider setup, model discovery, error handling
  privacy.md             what is stored, what is sent, permissions
  limitations.md         every known limit and why it exists
```

## Commands

| Command               | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `bun run dev`         | WXT dev server (Chrome)                                 |
| `bun run build`       | production build to `apps/extension/.output/chrome-mv3` |
| `bun run zip`         | store-ready zip                                         |
| `bun run test`        | Vitest suite                                            |
| `bun run check-types` | `wxt prepare` + `tsc --noEmit`                          |
| `bun run lint`        | Biome (read-only)                                       |
| `bun run check`       | Biome with fixes                                        |

## Limitations (by design, not by accident)

- Monkeytype does not keep results in local storage any more; history exists only
  for tests completed while the extension is installed (history import via an
  ApeKey is a later milestone).
- Per-key analysis needs `window.lastEventLog()`, an undocumented debugging global.
  It is feature-detected and schema-validated; without it tests are stored with
  `summary` fidelity and the UI says so.
- The extension only runs on `monkeytype.com` and only requests `storage` plus that
  one host permission.
