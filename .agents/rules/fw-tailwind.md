---
trigger: model_decision
globs: "**/*.css,**/tailwind.config.*"
description: "Apply when working in a Tailwind CSS codebase (package.json dependency tailwindcss): CSS-first config, dynamic classes, dark mode, class sorting, @apply vs components."
---
# Tailwind CSS — quick card
Applies only if package.json dependency tailwindcss. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/tailwind.md` — read before non-trivial Tailwind work (theme tokens, dark mode, extracting a component, a v3→v4 upgrade).

## Project shape
- v4 (verify the installed major in the lockfile/`node_modules/tailwindcss/package.json` — this pack assumes v4) is **CSS-first**: no `tailwind.config.*` by default. Config lives in the CSS entry file (often `src/app.css`) via `@import "tailwindcss";` plus `@theme`/`@source`/`@utility`/`@variant`/`@custom-variant`/`@plugin` at-rules.
- Build integration is a bundler plugin, not a hand-configured PostCSS pipeline: `@tailwindcss/vite` (Vite), `@tailwindcss/postcss` (others), or the standalone CLI. A `postcss.config.*` listing `tailwindcss` as a plugin is the **v3** shape.
- A `tailwind.config.*` (JS/TS) still works in v4 for incremental migration, loaded explicitly with `@config "./tailwind.config.js";` — a new v4 project should not add one.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER build a utility class name by string concatenation/interpolation (`` `text-${color}-500` ``, `` `p-${size}` ``) — Tailwind's scanner only sees literal strings in source files, so a computed class ships no CSS. Instead map every variant to a full literal class: `{ red: "text-red-500", blue: "text-blue-500" }[color]`.
2. MUST confirm the installed `tailwindcss` major before writing config — v3 (`tailwind.config.js`, `content: []`, `theme.extend`) and v4 (CSS-first, `@theme`, auto content detection) configure the same things incompatibly.
3. NEVER hand-write a new `--color-*`/`--spacing-*`/`--font-*` custom property outside `@theme` when a themed utility should exist — `@theme` both defines the CSS variable and generates the matching utilities/variants; a bare `:root` property does not.
4. MUST re-check exact utility names on a v3 codebase or old snippet — v4 shifted `shadow`/`blur`/`backdrop-blur`/`rounded`/`drop-shadow` down a step and added an `xs` size (`shadow`→`shadow-sm`, old `shadow-sm`→`shadow-xs`); `ring` default width is 1px not 3px (`ring-3` for the old default); `outline-none` now means `outline-style: none` (old meaning is `outline-hidden`). Run `npx @tailwindcss/upgrade` for a real migration, don't hand-edit every class.
5. MUST put custom dark-mode logic (a class/data-attribute toggle instead of `prefers-color-scheme`) in one `@custom-variant dark (...)` in the CSS entry file — never reimplement `dark:` with a hand-written media query or a second ad hoc class per component.
6. NEVER add scanned paths by editing a `content: []` array (that's v3) — v4 auto-detects source files from the project root, respecting `.gitignore`; use `@source "../other-app";` / `@source not "../legacy";` only for what auto-detection misses.
7. MUST extract a component, not `@apply`, once the same utility string repeats 3+ times — `@apply` in global CSS reintroduces the specificity/maintenance cost utilities exist to avoid and hides the markup-to-style mapping.

## Patterns
- Tokens: define once in `@theme { --color-brand: oklch(65% .2 250); --spacing-gutter: 1rem; }`; components use the generated utility (`bg-brand`, `p-gutter`) or `var(--color-brand)` — never a duplicated hex/px literal.
- Class sorting: Biome ≥ 2's `nursery.useSortedClasses` (needs `attributes`/`functions` options) or `prettier-plugin-tailwindcss` auto-sorts class order. Check `biome.json`/`.prettierrc*` for which is actually enabled before assuming either runs.
- One-off combo: keep it inline in `class`. Repeated across files: extract a component. Reserve `@apply` for markup you can't componentize (CMS body, vendor widget).

## Pitfalls
- A variant prefixed onto a *computed* base class (`` `${state}:text-red-500` ``) fails to scan for the same reason as invariant 1 — the whole prefixed class must appear literally in source.
- Reordering or dropping the CSS entry's `@import "tailwindcss";` removes Tailwind's own reset/utility layers.
- Arbitrary values (`w-[137px]`, `grid-cols-[1fr_2fr]`) are an escape hatch — prefer a theme token; use them only when nothing in the scale covers the value.

## Example — bad → good
```tsx
// bad: computed class name — Tailwind's scanner can't see "text-green-600"
const cls = `text-${status === "ok" ? "green" : "red"}-600`;
<span class={cls}>{status}</span>
```
```tsx
// good: full literal classes in a map — both strings are scannable
const statusClass = { ok: "text-green-600", error: "text-red-600" } as const;
<span class={statusClass[status]}>{status}</span>
```

## Before finishing
- [ ] no class name built by string concatenation/interpolation — every variant is a full literal string
- [ ] new design values go through `@theme` (or reference an existing token), not a hardcoded color/spacing literal
- [ ] dark mode uses the project's single `dark:`/`@custom-variant dark` convention, not a new ad hoc toggle
- [ ] a 3×-repeated utility string was extracted into a component, not copy-pasted or wrapped in `@apply`
- [ ] confirmed the installed `tailwindcss` major before relying on v3-only or v4-only config syntax
