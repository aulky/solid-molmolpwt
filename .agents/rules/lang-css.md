---
trigger: glob
globs: "**/*.css,**/*.scss,**/*.sass,**/*.less,**/*.pcss"
description: "CSS quick card: toolchain, invariants, idioms, pitfalls. Loaded for .css/.scss/.sass/.less/.pcss files."
---
# CSS — quick card
Deep guide: `.agents/guides/languages/css.md` — read before non-trivial CSS work (styling, responsive/fluid layout, theming, animation, a specificity fight, or a recent feature).
Principles: `.agents/guides/principles/simplicity.md`, `.agents/guides/principles/performance.md`, `.agents/guides/principles/accessibility.md`.

## Toolchain (use the project's own config first)
- Lint: the project's `lint` script if it covers CSS, else `npx stylelint "**/*.css"` (`stylelint.config.mjs` + `stylelint-config-standard`; `-scss`/`-less` variants for those extensions).
- Format: the project's formatter (Biome/Prettier) only if its config explicitly enables CSS — otherwise match existing style by hand.
- All: `node .agents/scripts/verify.mjs --only node` (Node/Bun — runs `lint`/`test`/`build`; wire stylelint into `lint`) — no dedicated CSS stack in `verify.mjs`, so otherwise run `stylelint` directly and note it in your Worker Report.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER reach for `!important` or an ID/chained selector to win a cascade fight — it only escalates the next override. Instead: lower the rule's specificity, or reorder with `@layer` (declared order beats specificity).
2. NEVER animate `width`/`height`/`top`/`left`/`margin` for movement or resizing — forces layout every frame. Animate `transform`/`opacity` only.
3. MUST reserve final space (`width`+`height`, `aspect-ratio`) for anything loading late (image, ad slot, web font) — otherwise content shift (CLS) on arrival.
4. MUST gate transitions/animations behind `@media (prefers-reduced-motion: no-preference)` (or disable under `reduce`) — some users need motion off and get it anyway without this.
5. MUST use `rem`/`em`/`%`/logical properties (`margin-inline`, `inset`) for type scale and direction-aware spacing, not raw `px` (fine for hairline borders/shadow offsets) — `px` ignores font-size zoom and breaks RTL.
6. MUST scope component custom properties and class names (prefix, or a component-root selector) — an unscoped `--gap`/`.title` redefined deep in the tree silently changes other components.
7. NEVER assume a recent feature (nesting, `:has()`, container queries, `light-dark()`, `content-visibility`) is safe everywhere without checking Baseline status (guide §1). Add a `@supports` fallback if not widely available.
8. If Tailwind applies (`.agents/rules/fw-tailwind.md`), NEVER hand-write a rule duplicating a utility or `@theme` token already defined — check the theme tokens first.

## Idioms & pitfalls Flash models get wrong
- `@layer reset, base, components, utilities;` then fill each in any file order — declared layer order decides precedence, not source order, so later-loaded third-party CSS still loses to an earlier layer.
- `:where(...)` zeroes specificity (overridable defaults); `:is(...)` keeps the highest specificity among its arguments.
- Nesting compiles to real selectors: a nested rule that isn't a plain descendant needs `&` (`&:hover`, `&.is-active`) — omitting it changes the selector's meaning.
- Container queries (`container-type: inline-size` on the parent, `@container (min-width: 30rem) {}`) make a component respond to its own container, not the viewport.
- `clamp(min, preferred, max)` gives fluid type/spacing in one declaration — no breakpoint ladder for a value that should just scale.
- `color-mix(in oklch, var(--brand) 80%, black)` derives a shade from one source token instead of a second hand-picked hex that drifts out of sync.
- Grid for two-dimensional layout (rows *and* columns), flex for one. `gap` works on both — stop spacing siblings with margin.
- `:focus-visible` for a custom focus ring, not `:focus` — the latter fires for mouse clicks too, adding a noisy ring.
- A `z-index` fight is usually a missed stacking context: an ancestor with `transform`/`filter`/`opacity < 1` creates one, trapping children below siblings.
- `light-dark(light, dark)` (needs `color-scheme: light dark`) replaces a duplicate `prefers-color-scheme` rule — Baseline "newly available" (2024) only, confirm project browser support first.

## Example — bad → good
```css
/* BAD: ID + !important to win a fight; animates layout props every frame */
#app .card .cta-button {
  background: blue !important;
}
.cta-button:hover { top: -4px; left: 4px; transition: top .3s, left .3s; }
```
```css
/* GOOD: one class, @layer for precedence, transform-only motion, reduced-motion aware */
@layer components {
  .cta-button { background: var(--color-brand); transition: transform .3s; }
  .cta-button:hover { transform: translateY(-4px); }
}
@media (prefers-reduced-motion: reduce) {
  .cta-button { transition: none; }
}
```

## Before finishing
- [ ] no new `!important`/ID selector to win a cascade fight · [ ] transitions/animations touch only `transform`/`opacity`, gated behind `prefers-reduced-motion`
- [ ] anything loading late has a reserved size — no avoidable layout shift · [ ] spacing/type use `rem`/logical properties, not hardcoded `px` throughout
- [ ] a recent feature used here was checked against Baseline/caniuse for this project's browsers
- [ ] `stylelint` clean · `node .agents/scripts/verify.mjs --only node` passes (Node/Bun) or the project's own CSS check does
