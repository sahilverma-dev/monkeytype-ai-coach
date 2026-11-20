# Design system

The extension is visually a Monkeytype companion, not a separate product. This
document records exactly what is reused and where, so future changes stay honest.

## Sources inspected

- `monkeytype.com` — served `:root` inline style and `css/monkeytype.*.css`
- `frontend/src/styles/core.scss`, `buttons.scss`, `inputs.scss`, `test.scss`
- `frontend/static/themes/*.css` (52 themes)
- Rendered result markup (`TestResult.tsx`, `ResultMainStats.tsx`, `ResultSecondaryStats.tsx`)

## Tokens

Monkeytype exposes theme colours as CSS variables on `:root`. The extension uses
the **same variable names**, so a theme swap on the site is a theme swap here.

| Variable              | Default (serika dark)      | Use                                    |
| --------------------- | -------------------------- | -------------------------------------- |
| `--bg-color`          | `#323437`                  | page background                        |
| `--main-color`        | `#e2b714`                  | primary accent, WPM values, active tab |
| `--caret-color`       | `#e2b714`                  | caret (not used yet)                   |
| `--sub-color`         | `#646669`                  | labels, secondary text                 |
| `--sub-alt-color`     | `#2c2e31`                  | panels, buttons, inputs                |
| `--text-color`        | `#d1d0c5`                  | body text                              |
| `--error-color`       | `#ca4754`                  | errors, danger actions                 |
| `--error-extra-color` | `#7e2a33`                  | extra characters                       |
| `--roundness`         | `0.5rem`                   | every radius                           |
| `--font`              | `"Roboto Mono", monospace` | all type                               |

Monkeytype's Tailwind theme maps its utility colours onto these
(`--color-bg: var(--bg-color)`, `--radius: var(--roundness)`, `--text-xs: .75rem`,
`--spacing: .25rem`). The extension mirrors that mapping so class names behave the
same: `.text-sub`, `.text-main`, `.text-error`, `.text-text`, `.bg-sub-alt`,
`.rounded`, `.text-sm`, `.text-xs`.

The only bundled asset is `RobotoMono-Regular.woff2` (Apache-2.0, the same file
Monkeytype serves at `/webfonts/`). Bold is synthesised by the browser, exactly as
on the site.

## Components

Buttons follow Monkeytype's current `Button.tsx`, including its themable
variables, so a theme can restyle our buttons without touching the extension:

| Element            | Rule                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| button             | `padding: .5em`, `gap: .5em`, `border-radius: var(--roundness)`, `background: var(--themable-button-bg)`, `color: var(--themable-button-text)`, `transition: color/background/opacity .125s ease-in-out` |
| hover              | `background: var(--themable-button-hover-bg); color: var(--themable-button-hover-text)`                                                                                                                  |
| active             | `background: var(--sub-color); color: var(--bg-color)`                                                                                                                                                   |
| active/tab variant | `--themable-button-bg: var(--main-color)`, text on `--bg-color`                                                                                                                                          |
| text variant       | transparent background, `--sub-color` text, text-colour hover                                                                                                                                            |
| danger             | `--themable-button-bg: var(--error-color)`, text on `--bg-color`                                                                                                                                         |
| disabled           | `opacity: .33`, no pointer events                                                                                                                                                                        |
| focus              | `box-shadow: 0 0 0 .1rem var(--bg-color), 0 0 0 .2rem var(--text-color)`                                                                                                                                 |
| input/select       | `background: var(--sub-alt-color)`, `.5em` padding, same focus ring                                                                                                                                      |
| placeholder        | `color: var(--sub-color)`                                                                                                                                                                                |
| selection          | `background: var(--main-color); color: var(--sub-alt-color)`                                                                                                                                             |

Chat answers are markdown. `marked` parses and DOMPurify sanitises before either
surface renders it; images, media, iframes and inline styles are stripped so model
output cannot make a network request. Links open in a new tab with
`rel="noopener noreferrer"`. Headings, lists, code blocks, quotes and tables use
the same tokens as the rest of the interface.

## Where each stylesheet is used

- **Extension pages** (popup, dashboard, options) load `src/styles/base.css`.
  It defines the tokens, the Tailwind-adjacent utility subset, and the scoped
  component rules above. Theme values are overwritten at runtime from the last
  theme sampled on a Monkeytype tab (`ThemeSnapshot`), so the popup matches the
  user's actual theme.
- **In-page UI** (chat launcher and panel, when added) will not load this file at
  all. It renders inside monkeytype.com and therefore inherits the live CSS
  variables and the site's own `button` / `input` / `.text-sub` rules directly.
  Any layout CSS added there must be namespaced and must never use bare element
  selectors.

## Licensing note

Monkeytype is GPL-3.0. This repository does **not** copy its stylesheet; it
mirrors variable names, numeric design values, and component behaviour, which are
facts rather than code. The in-page widget uses the site's own loaded CSS at
runtime. If verbatim CSS or source is ever copied from Monkeytype, this project
must adopt GPL-3.0 as well.
