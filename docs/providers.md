# AI providers

The extension uses the [Vercel AI SDK](https://ai-sdk.dev) (`ai`, `@ai-sdk/openai`,
`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`). Model ids are
never hardcoded: they are read from the provider's model list or typed by the user.

## Supported providers

| Provider         | Base URL used                                      | Key                              | Model list                  |
| ---------------- | -------------------------------------------------- | -------------------------------- | --------------------------- |
| OpenAI           | `https://api.openai.com/v1`                        | platform.openai.com → API keys   | `GET /models`               |
| Anthropic Claude | `https://api.anthropic.com/v1`                     | console.anthropic.com → API keys | `GET /models`               |
| Google Gemini    | `https://generativelanguage.googleapis.com/v1beta` | aistudio.google.com → API key    | `GET /models?key=…`         |
| OpenRouter       | `https://openrouter.ai/api/v1`                     | openrouter.ai → keys             | `GET /models` (public)      |
| Custom           | user supplied, e.g. `https://host/v1`              | optional bearer token            | `GET /models` (best effort) |

All of them are exercised through the same `LanguageModel` interface, so switching
provider does not change prompts, analytics or UI.

## Setup

1. Open the dashboard → **settings** → **ai provider**.
2. Pick a provider.
3. Paste the API key and press **save key**. The key never leaves
   `chrome.storage.local` for extension pages and the service worker.
4. Press **load models** (or type a model id such as `gpt-4.1-mini`).
5. Press **test connection**. A successful test shows the provider, model, latency
   and the model's one-word reply.

Host access is optional and per-domain. Use **grant host access** in provider
settings to request it; chat requests do not trigger a browser prompt. Most
providers allow browser CORS, so chat often works without it. If a request fails
with a network error, grant access and retry.

OpenRouter uses its documented default endpoint (`https://openrouter.ai/api/v1`);
no base URL is needed, and requests carry `X-Title` and `HTTP-Referer` headers.

## Request shape

- Streaming chat with a system prompt containing the analysis context.
- `temperature` and `max tokens` come from settings (0–2, 64–8000).
- `maxRetries: 1`, so a failing request never hangs the UI.
- Aborts are wired to the Stop button and to panel close.

Anthropic is called with `anthropic-dangerous-direct-browser-access: true`, which
is required for browser requests to its API.

## Failure handling

| Situation         | What the user sees                                    |
| ----------------- | ----------------------------------------------------- |
| no key / no model | a settings call-to-action, not a broken chat          |
| 401 / 403         | "The provider rejected the API key"                   |
| 404               | "That model or endpoint was not found"                |
| 429               | rate-limit message, with `retry_after` when provided  |
| 400 / 422         | the provider's own message, truncated                 |
| 5xx               | "The provider had a server error. Try again shortly." |
| fetch failure     | network / CORS guidance                               |
| aborted           | "Stopped. The partial answer was kept."               |

## Custom OpenAI-compatible endpoints

Any endpoint that implements `POST /chat/completions` and (optionally)
`GET /models` works: local llama.cpp/Ollama proxies, LiteLLM, vLLM, gateways.
Set the base URL including `/v1` where the endpoint expects it. HTTP is allowed
for localhost during development; HTTPS is expected elsewhere.

## Cost control

- Each message rebuilds the analysis context from captured tests (roughly 300–1200
  tokens) plus the last 12 conversation messages.
- The **preview context** dialog shows the exact payload and an estimated token
  count before you send.
- The popup insight is a single short request, cached against the data version, so
  reopening the popup does not call the provider again.
