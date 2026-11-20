# Installation

## Requirements

- Chrome/Chromium 111 or newer (the main-world content script uses the `world`
  manifest key)
- [Bun](https://bun.sh) 1.4+
- Node 20+ (only for tooling)

## Development build

```bash
bun install
cd apps/extension
bun run build
```

The unpacked extension is written to `apps/extension/.output/chrome-mv3`.

Load it:

1. Visit `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `apps/extension/.output/chrome-mv3`

Open `https://monkeytype.com/`, complete a test, and the dashboard tab (opened on
install) will show the captured result within a few seconds.

For iterative work, run `bun run dev` instead of `build`; WXT rebuilds on save.
Reload the extension card in `chrome://extensions` after a rebuild, then reload the
Monkeytype tab.

## Verifying capture

- The dashboard **tests** tab lists each captured test with its data fidelity
  (`keys` = event log available, `summary` = headline numbers only).
- `window.lastEventLog()` must exist on the page. If it does not (Monkeytype
  refactor), capture still works with `summary` fidelity; key analysis is skipped
  and the UI says so instead of inventing data.

## Packaging

```bash
cd apps/extension
bun run zip
```

The zip is written next to `.output/`. It contains no source maps and no API keys.

## Permissions

| Permission                 | Why                                               |
| -------------------------- | ------------------------------------------------- |
| `storage`                  | settings and session state                        |
| `https://monkeytype.com/*` | host access for the content scripts; nothing else |

IndexedDB is used for captured tests and does not require a permission. AI host
permissions will be requested at runtime, per provider, when the coaching layer is
configured.

## Uninstall / clean up

Removing the extension removes its IndexedDB database and storage with it. You can
also erase captured tests from the dashboard's settings tab before uninstalling.
Monkeytype's own data is never modified.
