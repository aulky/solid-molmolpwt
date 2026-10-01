---
trigger: glob
globs: "**/*.html,**/*.htm"
description: "HTML quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .html/.htm files."
---
# HTML — quick card
Deep guide: `.agents/guides/languages/html.md` — read before non-trivial HTML work (new page, a form, an image-heavy/perf-sensitive page, anything CSP-related). Principles: `.agents/guides/principles/accessibility.md`, `.agents/guides/principles/security.md`, `.agents/guides/principles/performance.md`. ARIA/keyboard depth: `topic-accessibility.md`. SEO/meta: `topic-seo-web.md` (don't duplicate its checklist here).

## Toolchain (use the project's own config first)
- Validate: the project's `lint`/`validate` script if it checks HTML, else `npx html-validate "**/*.html"` (`.htmlvalidate.json`: `{"extends":["html-validate:recommended","html-validate:document"]}`) or `vnu` for full spec conformance.
- Format: keep the file's indentation unless `biome.json` explicitly enables its (still experimental/opt-in) HTML formatter — check first.
- All: `node .agents/scripts/verify.mjs --only node` (Node/Bun — wire the validator into `lint`). No HTML stack exists in `verify.mjs`; a non-Node project has no kit-wide gate — run the validator directly and note it in your Worker Report.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST start with `<!DOCTYPE html>` and set `<html lang="...">` — no doctype triggers quirks mode; no `lang` makes screen readers guess pronunciation. Instead: doctype on line 1, a real BCP47 tag.
2. MUST make `<meta charset="utf-8">` the first child of `<head>` — a late charset can force a re-parse of the document. Instead: charset before `<title>` or any other tag.
3. NEVER make a `<div>`/`<span>` clickable to act as a button or link — not focusable, no keyboard support, no role. Instead: `<button type="button">` for an action, `<a href>` to navigate.
4. MUST give every `<button>` inside a `<form>` an explicit `type` — a bare one defaults to `type="submit"` and silently submits on click. Instead: `type="button"` unless it is the submit action.
5. MUST label every form control with `<label for>` — `placeholder` is not a label (vanishes on input, many screen readers skip it). Instead: `<label for="email">Email</label><input id="email">`.
6. NEVER write inline handler attributes (`onclick=`, `onload=`) or `javascript:` URLs — breaks under a `script-src` CSP with no `unsafe-inline`. Instead: an external `defer`red script using `addEventListener`.
7. MUST set `width`/`height` (or CSS `aspect-ratio`) on every `<img>`/`<video>`/`<iframe>` — otherwise layout jumps as it loads. Instead: real intrinsic dimensions.
8. NEVER lazy-load the LCP/hero image — `loading="lazy"` delays the largest paint. Instead: `fetchpriority="high"` on it, `loading="lazy"` only below the fold.
9. NEVER disable `autocomplete`/block paste on a login field "for security" — WCAG 2.2 treats it as a failure; it stops password managers, not attackers. Instead: real tokens (`email`, `new-password`, `current-password`).

## Idioms & pitfalls Flash models get wrong
- One `<header>`, one `<main>`, `<nav>`/`<aside>`/`<footer>` as needed; a single heading outline (`h1`→`h2`→`h3`, never skipped for size — that's CSS).
- `<a href="#">` / `href="javascript:void(0)"` as a fake button breaks new-tab, middle-click, and no-JS use.
- `alt` describes what the image conveys (`alt="Q3 revenue up 12%"`), never the filename; decorative images get `alt=""`.
- `srcset`/`sizes` let the browser pick the right file for the viewport; `<picture>` is for format fallback (avif/webp→jpg), plain `<img>` as the required last source.
- Input `type` (`email`/`tel`/`search`) changes the mobile keyboard and adds validation; for ZIP/card numbers, use `inputmode="numeric"` + `pattern` on `type="text"`, not `type="number"` (adds a spinner).
- `required`/`pattern`/`min`/`max` are UX only — re-validate and re-authorize on the server.
- `rel="noopener"` on `target="_blank"` is implied by every current engine (shipped 2020–21) — add `rel="noreferrer"` only to also withhold `Referer`. Follow the project's lint config if it wants it explicit.
- Resource hints are scarce: preload only the one or two resources this page provably needs.
- Viewport meta never gets `maximum-scale=1`/`user-scalable=no` — blocks pinch-zoom (a WCAG failure).
- Void elements (`<img>`, `<input>`, `<br>`, `<meta>`) never get a closing tag; every `id` is unique.

## Example — bad → good
```html
<!-- BAD -->
<div class="btn" onclick="save()"><img src="save.png"></div>
<img src="hero.jpg">
<input placeholder="Email">
```
```html
<!-- GOOD: save.js attaches the listener via addEventListener; no inline handler -->
<button type="button" id="save-btn"><img src="save.png" alt="Save" width="16" height="16"></button>
<img src="hero.jpg" alt="Team celebrating the launch" width="1200" height="630" fetchpriority="high">
<label for="email">Email</label>
<input id="email" type="email" autocomplete="email">
```

## Before finishing
- [ ] validator (`html-validate`/`vnu`, or project script) shows no errors
- [ ] every image has `alt` + `width`/`height`; every input has a real `<label>`
- [ ] no inline `on*=`/`javascript:` URLs; scripts are `defer`/`async` or end of `<body>`
- [ ] landmarks present, heading order sane, interactive markup keyboard-usable (or noted unverified)
- [ ] `node .agents/scripts/verify.mjs --only node` passes, or the project's own HTML check does
