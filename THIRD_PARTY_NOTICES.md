# Third-party notices

## Roboto Mono

The extension bundles `apps/extension/public/fonts/RobotoMono-Regular.woff2`, the same
file Monkeytype serves from its site.

Copyright 2015 The Roboto Mono Project Authors (https://github.com/googlefonts/RobotoMono)

Licensed under the Apache License, Version 2.0:
https://www.apache.org/licenses/LICENSE-2.0

## Monkeytype

Monkeytype (https://monkeytype.com, https://github.com/monkeytypegame/monkeytype), created
by Miodec (Jack), is licensed under GPL-3.0. This project is an independent, unofficial companion:

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

## Monkeytype mascot (extension icon)

`brand/icon.png`, the generated images in `apps/extension/public/icon/`, and
`docs/assets/icon-*.png` are derived from Monkeytype's mascot.

- Monkeytype is GPL-3.0 and the mascot is part of that project, so treat these image
  assets as GPL-3.0. The rest of this repository remains MIT; a distributed build that
  includes the mascot combines both, which is why this is called out explicitly.
- Monkeytype's name and mascot are its trademarks. This project is unofficial and not
  endorsed by Monkeytype.
- If you fork this project and need an MIT-only distribution, replace
  `brand/icon.png` and run `bun run icons --trim` to regenerate the sizes.
