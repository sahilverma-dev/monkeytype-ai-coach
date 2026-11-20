# Privacy Policy — Monkeytype AI Companion

**Effective 20 November 2026 · Version 0.1.0**

This policy explains how the **Monkeytype AI Companion** Chrome extension handles data. It
covers the extension only, not the Monkeytype website. Monkeytype has its own privacy policy.

> **The short version.** Your typing tests are analysed inside your browser. Settings, your
> API key and your captured results are stored locally. No data reaches the developer,
> because the developer runs no servers. The only time anything leaves your browser is when
> you explicitly ask for AI coaching (sent directly to the provider you configured, with
> your own key) or when you explicitly import history from Monkeytype's API with your own
> ApeKey.

## Who is responsible

The extension is published by Sahil Verma. Contact:
[domainsahil007@gmail.com](mailto:domainsahil007@gmail.com). Source code:
<https://github.com/sahilverma-dev/monkeytype-ai-coach>.

## What is stored on your device

The extension keeps the following in `chrome.storage.local` and IndexedDB, inside your
browser profile:

- **Captured test metrics:** WPM, raw WPM, accuracy, consistency, character counts, test
  mode and duration, timestamps, and derived per-key error counts and typing rhythm.
- **Conversations** with the AI coach, including your messages and the model's answers.
- **Settings:** the provider and model you chose, analysis window, theme colours sampled
  from Monkeytype, and data-sharing switches.
- **Credentials:** your AI provider API key and, if you use history import, your Monkeytype
  ApeKey.

The words you type are **not** stored. The extension reads the results screen and the
page's in-memory test log to derive the statistics above, and keeps only those statistics.

## What leaves your browser

### Your AI provider

Only when you send a coaching message or ask for an insight. The request goes directly from
your browser to the provider you configured (OpenAI, Anthropic, Google, OpenRouter, or a
custom endpoint), authenticated with your own key. It contains a local analysis summary and
your conversation. Depending on your settings it may include per-key error rates, confusion
pairs, slow key pairs, and a short summary of recent tests. It never includes the tests'
text, your Monkeytype account, or browsing data. The exact prompt is shown in the
extension's "preview context" dialog before sending, and key-level data can be switched off
in settings.

The provider's handling of that request is governed by its own privacy policy. The
developer of this extension never receives a copy and operates no proxy or server.

### Monkeytype's API

Only when you start a history import. The extension calls Monkeytype's documented results
endpoint with the ApeKey you created, to read your own past results. The request goes to
`api.monkeytype.com`; the developer is not involved.

### Nothing else

No telemetry, analytics, crash reporting, advertising, tracking pixels or remote code. The
extension makes no network request to the developer and no request to any site other than
the provider or API above.

## Permissions and why they exist

| Permission | Purpose |
| --- | --- |
| `storage` | Remember settings, credentials, captured results and conversations. |
| `https://monkeytype.com/*` | The only site the extension runs on: detect completed tests, read the results screen and in-memory test log, show the optional chat launcher, sample theme colours. |
| Optional provider origins | Requested only when you configure a provider, to send your coaching request to that domain. |
| `https://api.monkeytype.com/*` | Requested only when you start a history import with your ApeKey. |

The extension does not request `tabs`, `scripting`, `webRequest`, `cookies`, `history`, or
access to any other website.

## What is never collected

- Personally identifiable information such as your name or address.
- Health, financial or payment information.
- Personal communications, email or messages outside the extension's own chat.
- Precise or approximate location.
- Browsing history, tabs, or content from websites other than Monkeytype.

## Retention and deletion

Data stays on your device until you remove it. In the extension's settings you can
**export** captured tests as JSON or **clear** them; removing a provider key or your ApeKey
deletes it immediately. Uninstalling the extension deletes its storage and IndexedDB
database along with it.

## Security

API keys are read only by extension pages and the background service worker; they are never
injected into the Monkeytype page. Requests to providers go directly from your browser over
HTTPS. Chrome extension storage is not additionally encrypted beyond your operating system's
disk encryption, and the settings screen says so rather than implying otherwise. Treat an
API key stored in a browser profile the way you would treat one stored in any local
application.

## Children

The extension is not directed at children and does not knowingly collect data from them.

## Changes

Material changes to this policy will be published at this URL with a new effective date and
noted in the extension's release notes.

## Not affiliated with Monkeytype

Monkeytype AI Companion is an unofficial companion. It is not affiliated with, endorsed by,
or operated by Monkeytype. Monkeytype is a separate service with its own terms and privacy
policy.

---

Questions about this policy: [domainsahil007@gmail.com](mailto:domainsahil007@gmail.com)
