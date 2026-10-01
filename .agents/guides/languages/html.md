# HTML — engineering guide
> Scope: authoring HTML documents and SSR/templated markup (static pages, framework-rendered output). Quick card: `.agents/rules/lang-html.md`.
> Last verified: 2026-09 — WHATWG HTML Living Standard, MDN, WCAG 2.2 (W3C Recommendation since 2023-10). Accessible Authentication SC numbers re-verified via WebFetch to w3.org/TR/WCAG22. Fast-moving npm tool versions (`html-validate`) are written version-agnostic; check `npm view <pkg> version` before quoting one.

## 1. Mental model / philosophy
- HTML is structure and meaning; CSS is appearance; JS is behavior. A parser, a screen reader, and a search-engine crawler all read the tags for what they mean.
- Progressive enhancement: core content and forms should work before/without JS finishes loading. JS enhances an already-usable page; it isn't the only thing that makes a button work.
- The browser is a forgiving parser: bad markup rarely crashes, it degrades silently and inconsistently across engines. Validate; do not rely on the tolerance.
- Every element is a promise to assistive tech and tooling: pick the tag whose native semantics match the intent (`button` for an action, `a` for navigation, `table` for tabular data) instead of reimplementing that behavior on a generic `div`.

## 2. Project structure & tooling
- Markup lives either as hand-authored `.html` files, or as the output of a templating/SSR layer (JSX/TSX, Blade, ERB, etc.) — apply this guide to the *rendered* output, even while editing the component/template source.
- This kit's `verify.mjs` has no dedicated HTML stack (its stacks are `node`, `deno`, `python`, `go`, `rust`, `php`, `ruby`, `jvm`, `dotnet`, `dart`, `elixir`, `swift`, `cpp`, `agent-kit`). In a Node/Bun project, wire a validator into the `lint` script so `node .agents/scripts/verify.mjs --only node` runs it; otherwise run the validator directly and say so in your Worker Report.
- Validators:
  - `html-validate` (npm) — configurable, rule-based, ARIA/WCAG-aware. `.htmlvalidate.json`: `{"extends": ["html-validate:recommended", "html-validate:document"]}`. Run `npx html-validate "**/*.html"`.
  - Nu Html Checker (`vnu`) — the reference WHATWG/W3C conformance checker: `npx vnu-jar file.html`, or https://validator.w3.org/nu/ for a one-off page.
  - Templated/SSR markup: render to a string in a test and pipe that string to the validator — a `.tsx`/`.blade.php` source file is not HTML until it renders.
- Formatting: match the file's existing indentation. Biome's HTML formatter is still experimental/opt-in — check `biome.json` before assuming it runs on `.html` files.
- `<template>` plus `customElements.define` gives reusable fragments without a framework; most projects here already have a component model (SolidJS/React/Astro/Blade) — follow it instead of introducing a second one.

## 3. Core idioms
### Document skeleton
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Product name — page purpose</title>
  <meta name="description" content="One or two sentences a search result can show.">
</head>
<body>
  <header>…</header>
  <nav>…</nav>
  <main>…</main>
  <footer>…</footer>
</body>
</html>
```
- `<!DOCTYPE html>` is mandatory; its absence puts every engine into quirks mode (a different, bug-compatible box model).
- `charset` must sit within the first 1024 bytes, before `<title>` or any other text-holding tag — a late charset forces a re-parse of everything read so far.
- `<title>` is the tab/history/bookmark label and default search-result headline, unique per page. `<meta name="description">` is the snippet a search engine tends to show (not guaranteed, but your only lever).

### Landmarks and headings
```html
<body>
  <header><a href="/">Site</a></header>
  <nav aria-label="Primary">…</nav>
  <main>
    <h1>Page title</h1>
    <section aria-labelledby="pricing-h"><h2 id="pricing-h">Pricing</h2>…</section>
  </main>
  <aside aria-label="Related">…</aside>
  <footer>…</footer>
</body>
```
- One `<main>` per page — the landmark screen-reader users jump to first. One `<h1>` naming the page. Headings step down by exactly one level (`h1`→`h2`→`h3`); never skip a level for smaller text — that is CSS's `font-size`, not markup.
- `<section>`/`<article>`/`<aside>`/`<nav>` are landmarks only when they have an accessible name (a heading inside, or `aria-label`/`aria-labelledby`); an unlabelled `<section>` announces as plain content, not a region.
- More than one `<nav>` on a page (header, footer, breadcrumbs): give each a distinct `aria-label` — otherwise a screen reader's landmark list shows several unlabeled "navigation" entries.

### Buttons vs links vs divs
```html
<button type="button" id="save-btn">Save</button>  <!-- action, no navigation -->
<a href="/cart">Cart</a>                             <!-- navigation -->
<a href="#section-2">Jump to section 2</a>           <!-- same-page navigation -->
```
- `<button>` for anything that changes state without changing the URL (submit, open a modal, toggle); `<a href>` for anything that changes the URL, including a same-page fragment. Both are keyboard-operable and carry a role for free; a styled `<div>`/`<span>` has neither and needs `role`, `tabindex="0"`, and hand-written key handlers.
- Inside a `<form>`, a bare `<button>` defaults to `type="submit"`; a "cancel" or "show password" button needs an explicit `type="button"` or it submits the form.
- Keep a not-yet-valid submit button enabled and let native `required`/`pattern` validation explain what's missing — a permanently `disabled` button gives a screen-reader user no reason why nothing happens.

### Forms
```html
<form method="post" action="/signup">
  <div>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email" required>
  </div>
  <div>
    <label for="pw">Password</label>
    <input id="pw" name="pw" type="password" autocomplete="new-password" minlength="12" required>
  </div>
  <div>
    <label for="zip">ZIP code</label>
    <input id="zip" name="zip" type="text" inputmode="numeric" pattern="[0-9]{5}" autocomplete="postal-code">
  </div>
  <button type="submit">Create account</button>
</form>
```
- Every control gets a real `<label for>` (or a wrapping `<label>`). `placeholder`/`aria-label` are not substitutes: a placeholder disappears once typing starts, and many screen readers skip it.
- Choose the input `type` for the data (`email`, `tel`, `url`, `search`, `date`, `number`) — it changes the mobile keyboard and adds baseline validation for free. For digit-shaped data that is not a quantity (ZIP, card number, OTP), use `inputmode="numeric"` + `pattern` on `type="text"`, not `type="number"` (adds a spinner, lets `e`/`+`/`-` through).
- `autocomplete` tokens (`name`, `email`, `tel`, `street-address`, `postal-code`, `cc-number`, `new-password`, `current-password`, `one-time-code`) let password managers and autofill work. WCAG 2.2's Accessible Authentication criteria (3.3.8 Minimum / 3.3.9 Enhanced) treat disabling autocomplete or blocking paste on an auth field as a failure, not hardening — it only stops password managers, not attackers, and pushes users toward weaker, reused passwords.
- Client-side `required`/`pattern`/`min`/`max` is UX only. Re-validate and re-authorize on the server; any client check is bypassed by calling the endpoint directly.
- Group related controls with `<fieldset>`/`<legend>` (a radio set, a billing-address block) — the legend is announced once per group, not per control.

### Images and media
```html
<img src="hero-1200.jpg"
     srcset="hero-480.jpg 480w, hero-800.jpg 800w, hero-1200.jpg 1200w"
     sizes="(min-width: 1024px) 1200px, 100vw"
     width="1200" height="630"
     alt="Team celebrating the product launch"
     fetchpriority="high">

<img src="chart.png" width="400" height="240" alt="" loading="lazy"> <!-- decorative / already described in surrounding text -->

<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="Team celebrating the product launch" width="1200" height="630">
</picture>
```
- `alt` describes what the image conveys (`"Q3 revenue up 12%"`, never the filename or "image of…"). A purely decorative image gets `alt=""` — never an omitted attribute (that makes screen readers read the filename).
- `width`/`height` (or a CSS `aspect-ratio`) let the browser reserve layout space before the image downloads; without them the page reflows as each image arrives — a Cumulative Layout Shift hit.
- `loading="lazy"` on everything below the fold; never on the Largest Contentful Paint candidate (typically the hero image) — lazy-loading it delays the very paint it's supposed to speed up. Pair the LCP image with `fetchpriority="high"` instead.
- `srcset` (width descriptors) + `sizes` let the browser choose the right file for the viewport before it commits to layout. `<picture>` is for format fallback (avif/webp → jpg) or art direction; its final `<img>` is the mandatory fallback.
- `<video>`/`<audio>` with speech: ship a `<track kind="captions">`. Controls need visible focus and full keyboard operation — native `controls` already provides this; a custom player must reimplement it.

### Meta and performance hints
```html
<link rel="preconnect" href="https://fonts.example.com" crossorigin>
<link rel="preload" as="font" href="/fonts/inter-var.woff2" type="font/woff2" crossorigin>
<script src="/vendor/analytics.js" defer></script>
<script src="/app.js" defer></script>
```
- `defer`: downloads in parallel with parsing, runs in document order after parsing finishes — the default for app scripts that touch the DOM and depend on load order.
- `async`: downloads in parallel, runs the instant it arrives, no order guarantee — for independent scripts (most analytics/ad tags).
- Neither attribute, in `<head>`: blocks parsing until the script downloads and runs. Reserve this for a tiny, order-critical inline bootstrap, or move the tag to the end of `<body>`.
- `preload`/`preconnect`/`dns-prefetch` share a scarce bandwidth budget: preload only the one or two resources this page's LCP provably needs; preloading broadly delays the very resource you meant to prioritize.
- `fetchpriority="high"` on the LCP image or a critical render-blocking script; `fetchpriority="low"` on something below the fold competing with the LCP resource for bandwidth.

## 4. Error handling
- HTML has no exceptions. "Errors" are (a) invalid markup the parser silently recovers from, and (b) form input the user or server rejects.
- Treat validator output as a compiler error: an unclosed tag, a duplicate `id`, an `<img>` with no `alt` are the markup equivalent of a type error — fix before review, not after a bug report.
- Associate a form error message with its field (`aria-describedby="email-error"` pointing at the element holding the text, or `aria-invalid="true"` on the input) so assistive tech announces it. A message conveyed only visually (color, an icon) fails WCAG 1.4.1 and is invisible to a screen-reader user.
- Never suppress native validation with `novalidate` unless the JS layer implements an equivalent or better message pointed at the same field. Silently swallowing invalid input is a dead end for the user.

## 5. Testing
- Static validation is the fast, deterministic layer: `html-validate` (rule-based, can fail CI) or `vnu` (full WHATWG conformance) on every changed `.html` file, and on the rendered output of every template/component that emits markup.
- Automated accessibility checks (`axe-core`, `@axe-core/playwright` when Playwright is already in the project) catch a real but partial subset of WCAG failures — automation covers roughly a third of them. It confirms an `alt` attribute exists; only a person can judge whether its text is *meaningful*.
- Manual pass for what automation cannot judge: tab through the page (every control reachable, focus visible), operate one critical flow with a screen reader (VoiceOver/NVDA), zoom to 200% and reflow to a narrow viewport.
- Component tests should query by role and accessible name — `getByRole("button", { name: "Save" })`, `getByLabelText("Email")` — not CSS class or test id. A test that can only find a control by test id is flagging the same name/role gap a real assistive-tech user would hit.

## 6. Performance
- Core Web Vitals map onto concrete markup choices: LCP → `fetchpriority="high"`, no `loading="lazy"` on the hero, plus a `preload`; CLS → `width`/`height` (or `aspect-ratio`) on every image, video, iframe; INP → keep synchronous `<script>` blocks small and `defer` the rest.
- `srcset`/`sizes` cut transferred bytes by letting a phone fetch a 480w image instead of the 1200w desktop one. Serving one desktop-resolution `<img>` to every device is the most common image-performance mistake.
- Third-party `<script>` tags (analytics, chat, ad tags) are usually the largest controllable cost: `async`/`defer` them, load on interaction or visibility where possible, and budget how many the page carries — each is unaudited code with its own cost.
- Resource hints are additive, not free: `preconnect` for perhaps three or four hosts, not every third-party domain the page talks to — more competes for the same limited pool of parallel connections.

## 7. Security
- Never write inline event-handler attributes (`onclick=`, `onload=`, `onerror=`) or `javascript:` URLs — they are exactly what a strict Content-Security-Policy (`script-src 'self'`, no `unsafe-inline`) blocks, and a codebase that relies on them cannot adopt CSP without a rewrite. Attach behavior with `addEventListener` from an external, `defer`red script instead.
- `target="_blank"` to another origin: every current engine (all major browsers, since 2020/2021) implicitly applies `rel="noopener"`, closing the "reverse tabnabbing" hole where the opened page could navigate `window.opener` to a phishing look-alike. Add `rel="noreferrer"` to also withhold the `Referer` header (it implies `noopener` too); follow the project's lint config if it still wants the attribute explicit.
- Anything rendered from user input into markup is an XSS vector. A templating/SSR layer's default output-escaping is the safety net — never opt out of it (`dangerouslySetInnerHTML`, raw `innerHTML =`, `{@html}`, `v-html`, a `|raw` filter) for user-derived data, unless it already passed a dedicated sanitizer (DOMPurify) for a documented reason.
- `<input type="file">`'s `accept` is a UX hint only, not a content-type check — validate the actual bytes server-side. `enctype="multipart/form-data"` is required for a file input to upload its contents at all.
- `<iframe>` embedding third-party content: scope `sandbox` to only the tokens the embed needs (`allow-scripts` with `allow-same-origin` together defeats the sandbox) and set `referrerpolicy="no-referrer"` when the destination doesn't need your page's URL.

## 8. Loading order and async behavior
- Parsing runs synchronously top to bottom; script execution interleaves with it per attribute (`defer` waits for parsing to finish and preserves order; `async` runs the instant it is fetched, out of order; neither blocks parsing exactly where the tag sits).
- `DOMContentLoaded` fires once parsing is done and every `defer` script has run; `load` fires once every subresource (images, stylesheets, iframes) has finished. Gate "the DOM I need exists" logic on the former — waiting for `load` is slower than necessary.
- A `<script>` placed before the elements it queries, with no `defer`, runs before those elements exist and gets `null` back. Either `defer` it, move it to the end of `<body>`, or wrap the logic in a `DOMContentLoaded` listener.
- Multiple `defer` scripts run in source order regardless of download order — safe for a dependency chain (`vendor.js` before `app.js`). Multiple `async` scripts give no such guarantee: use `defer`, or one bundled entry point, whenever order matters.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| clickable `<div onclick>`/`<span>` for an action | not focusable, no keyboard support, no role | `<button type="button">` |
| `<a href="#">` / `href="javascript:void(0)"` as a fake button | breaks new-tab, middle-click, and no-JS use | `<button>` for actions; a real `href` for navigation |
| `placeholder` instead of `<label>` | vanishes on input, many AT skip it | `<label for>` bound to the input's `id` |
| missing `alt`, or `alt="image.jpg"` | announces the filename, not the content | describe what it conveys; `alt=""` if decorative |
| `<img>` with no `width`/`height` | layout shift as it loads (CLS) | set intrinsic dimensions or `aspect-ratio` |
| `loading="lazy"` on the hero/LCP image | delays the largest paint | `fetchpriority="high"`, no lazy-load |
| render-blocking third-party `<script>` in `<head>` | stalls parsing on a network round trip | `defer`/`async`, or move to the end of `<body>` |
| inline `onclick=`/`javascript:` URLs | breaks a strict CSP, mixes concerns into markup | external script + `addEventListener` |
| `autocomplete="off"` / blocked paste on password fields | blocks password managers, net weaker security | leave autocomplete on; use `new-password`/`current-password` |
| heading levels chosen for font size (`<h4>` for a small `<h1>`) | breaks the document outline for AT | pick the level for structure; size with CSS |
| unlabelled `<section>`/`<nav>` used as a landmark | announces as generic content, not a region | add a heading, or `aria-label`/`aria-labelledby` |
| skipping the validator because "it renders fine" | tolerant parsing hides real bugs, SEO/AT regressions | run `html-validate`/`vnu` in CI |
| unescaped user input into `innerHTML`/`dangerouslySetInnerHTML` | stored/reflected XSS | framework's default escaping, or a sanitizer for a documented exception |

## 10. Review checklist
- [ ] `<!DOCTYPE html>`, `<html lang>`, `<meta charset>` first, one `<title>`, one `<meta name="description">`
- [ ] one `<main>`, sane landmark/heading structure; every landmark-role `<section>`/`<nav>` has an accessible name
- [ ] every actionable element is a real `<button>`/`<a href>`, never a clickable `<div>`/`<span>`
- [ ] every form control has a bound `<label for>`; input `type`/`autocomplete` match the data; server re-validates
- [ ] every `<img>` has `alt` (or `alt=""` if decorative) and `width`/`height`; the LCP image is `fetchpriority="high"`, not lazy
- [ ] no inline `on*=` handlers or `javascript:` URLs; third-party scripts are `defer`/`async`
- [ ] `target="_blank"` to another origin adds `rel="noreferrer"` only if withholding `Referer` is actually intended
- [ ] user input rendered into markup goes through the framework's default escaping, never an unescaped/raw sink
- [ ] validator (`html-validate`/`vnu`, or the project's script) and, where present, an automated accessibility check pass
- [ ] `node .agents/scripts/verify.mjs --only node` (or the project's own HTML check, noted in the report) passes

## 11. References
- WHATWG HTML Living Standard — https://html.spec.whatwg.org/multipage/
- MDN HTML reference — https://developer.mozilla.org/en-US/docs/Web/HTML
- MDN forms guide — https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms
- WCAG 2.2 (W3C Recommendation) — https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices Guide — https://www.w3.org/WAI/ARIA/apg/
- `html-validate` — https://html-validate.org/
- Nu Html Checker — https://validator.github.io/validator/
- web.dev, Core Web Vitals — https://web.dev/articles/vitals
- MDN attribute reference (`fetchpriority`, `loading`, `rel`) — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes
- Principles: `.agents/guides/principles/` — `accessibility.md`, `security.md`, `performance.md`
