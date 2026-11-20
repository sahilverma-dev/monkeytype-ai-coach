# Security policy

This extension handles two things worth protecting: locally captured typing data and
AI provider API keys.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** (Security → Report a
vulnerability) instead of opening a public issue. Include the version, Chrome version,
reproduction steps and the impact you expect.

Please do not test against other people's accounts, Monkeytype's production services
beyond normal use, or any provider endpoint you do not own.

## Design notes relevant to reports

- API keys live in `chrome.storage.local` and are read only by extension pages and the
  service worker. Content scripts never import the credentials module; the in-page
  panel receives answer text only, over a port.
- Only `monkeytype.com` is in `host_permissions`. Provider domains are optional,
  per-provider permissions requested on demand.
- The main-world content script exposes nothing secret: it reads the page's public
  config and `window.lastEventLog()`, both already available to any page script.
- No telemetry, remote code, or third-party scripts are loaded. All code ships in the
  extension bundle.
- Chrome extension storage is **not** encrypted at rest beyond OS disk encryption.
  This is documented in the UI rather than papered over.

## Supported versions

Only the latest release is supported. This is a small project; fixes land on `main` and
in the next release.
