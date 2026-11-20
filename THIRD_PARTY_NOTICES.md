# Third-party notices

## Roboto Mono

The extension bundles `apps/extension/public/fonts/RobotoMono-Regular.woff2`, the same
file Monkeytype serves from its site.

Copyright 2015 The Roboto Mono Project Authors (https://github.com/googlefonts/RobotoMono)

Licensed under the Apache License, Version 2.0:
https://www.apache.org/licenses/LICENSE-2.0

## Monkeytype

Monkeytype (https://monkeytype.com, https://github.com/monkeytypegame/monkeytype) is
licensed under GPL-3.0. This project is an independent, unofficial companion:

- it contains **no Monkeytype source code or stylesheet text**;
- it mirrors Monkeytype's design tokens (CSS variable names and colour values) and
  component behaviour, and uses Monkeytype's own loaded CSS at runtime inside the page;
- it reads Monkeytype's public local configuration and the page's in-memory test log,
  and never modifies Monkeytype's data.

If you copy Monkeytype source or CSS into this project, the copied parts — and
therefore this project — must be distributed under GPL-3.0.

## Dependencies

Runtime and development dependencies keep their own licenses; see `bun.lock` and each
package's `LICENSE`. Notable ones:

| Package                           | License    |
| --------------------------------- | ---------- |
| React, React DOM                  | MIT        |
| WXT                               | MIT        |
| Zod                               | MIT        |
| Vercel AI SDK (`ai`, `@ai-sdk/*`) | Apache-2.0 |
| Biome                             | MIT        |
| Vitest                            | MIT        |
| Playwright (verification only)    | Apache-2.0 |
