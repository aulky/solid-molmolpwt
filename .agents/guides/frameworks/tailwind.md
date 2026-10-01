# Tailwind CSS — engineering guide
> Scope: Tailwind CSS's CSS-first configuration, utility-first idioms, dark mode, class-name safety, testing, and
> deployment. Quick card: `.agents/rules/fw-tailwind.md`.
> Last verified: 2026-09 — installed `tailwindcss@4.2.1` and `@tailwindcss/vite@4.2.1` in a SolidStart 2 +
> Tailwind 4 project (matching its `package.json`'s `^4.0.7`), that project's `src/app.css`/`vite.config.ts`/`biome.json`, and
> official docs via context7 (`tailwindcss.com`: functions-and-directives, detecting-classes-in-source-files,
> dark-mode, upgrade-guide, theme). Re-check `node_modules/tailwindcss/package.json`'s `version` before trusting any
> version-specific claim below — v3 (JS config) is still common in existing codebases and configures differently.

## 1. Mental model / philosophy
- **Utility-first**: compose small, single-purpose classes (`flex`, `px-4`, `text-sm`) in markup instead of writing
  custom CSS per component. Avoids inventing class names and cascade/specificity fights.
- **Constraint-based design system**: every utility maps to a token in a shared scale (spacing, color, type) —
  consistency comes from the shared scale, not from developer discipline.
- **Zero-runtime**: classes are extracted from your literal source at build time; nothing resolves class names in
  the browser. This is exactly why a class name must exist as a literal string somewhere in source (§3).
- **Composability over abstraction**: default to combining utilities directly at the call site; reach for a
  component or `@apply` only once repetition or complexity earns it (§3) — premature abstraction hides the
  markup-to-style mapping that utilities exist to keep visible.

## 2. Project structure & tooling
### Release status (verified 2026-09 against the installed package and docs.tailwindcss.com)
- Current major is **v4**: CSS-first configuration (no `tailwind.config.*` by default), an `@theme` directive for
  design tokens, automatic content (class-source) detection, and the **Oxide** engine — a Rust core, distributed as
  platform-specific native binaries (`@tailwindcss/oxide-*`) alongside the JS package, replacing v3's pure-JS engine.
- v3 (`tailwind.config.js`, `content: []`, `theme.extend`, PostCSS-plugin integration) remains widely deployed in
  existing projects. The two majors configure the same concerns in incompatible places — never mix v3 syntax into a
  v4 project's CSS or vice versa without translating it.
- Reference project's packages: `tailwindcss@^4.0.7` (resolved `4.2.1`), `@tailwindcss/vite@^4.0.7` (resolved `4.2.1`).
  Other official v4 integration packages: `@tailwindcss/postcss` (PostCSS-based bundlers), `@tailwindcss/cli`
  (standalone builds with no bundler). Official plugins (`@tailwindcss/typography`, `@tailwindcss/forms`) load via
  `@plugin` in v4 CSS or `plugins: []` in a v3 config.

### Commands (the project's own scripts and runner: root `AGENTS.md`)
| Task | Command |
|---|---|
| Dev (Vite projects) | the project's dev script — Vite dev server; `@tailwindcss/vite` recompiles CSS on every change |
| Build | the project's build script (SolidStart/Nitro: → `.output/`) |
| Format (does not sort classes unless configured — §3) | the project's formatter (Biome, Prettier, …) |
| Lint | the project's linter (Biome, ESLint, …) |
| Standalone build, no bundler | `npx @tailwindcss/cli -i src/app.css -o dist/out.css` |
| v3 → v4 migration | `npx @tailwindcss/upgrade` (run on a new branch; needs Node 20+) |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only node` |

### Project shape
- One CSS entry point per app (e.g. `src/app.css` in a SolidStart project), starting with `@import "tailwindcss";`. Every
  configuration concern — design tokens, custom utilities, custom variants, extra scanned paths, legacy
  plugins/config — lives in this file (or files it imports) as CSS at-rules, not a separate JS config object.
- `@theme { ... }` simultaneously defines a design token as a CSS custom property and registers the matching
  utilities/variants. Multiple `@theme` blocks across imported files merge into one token set.
- No `tailwind.config.*` exists in a fresh v4 project — verified in a fresh SolidStart 2 + Tailwind 4 setup. One may still exist for
  **incremental** migration, explicitly loaded with `@config "./tailwind.config.js";`; don't add one to a clean v4
  project.
- The bundler plugin (e.g. `@tailwindcss/vite`, wired in `vite.config.ts`) both scans source for class names and
  compiles the final CSS — there is no separate "purge"/"content" configuration step to maintain.

### Directives reference (verified: `tailwindcss.com/docs/functions-and-directives`)
| Directive | Purpose |
|---|---|
| `@import "tailwindcss";` | pulls in the reset, theme defaults, and utility layers |
| `@theme { --color-x: ...; }` | define/override design tokens; auto-generates utilities and variants |
| `@source "path";` / `@source not "path";` | add or exclude a path from class scanning beyond auto-detection |
| `@utility name { ... }` | define a custom utility that composes with every existing variant |
| `@variant name { @slot }` | apply an existing variant's condition inside hand-written CSS |
| `@custom-variant name (...)` | define a new variant (e.g. a custom `dark` selector) |
| `@plugin "pkg-or-path";` | load a legacy v3 JS plugin (compatibility) |
| `@config "path";` | load a legacy `tailwind.config.js` (compatibility/incremental migration) |
| `@apply class1 class2;` | inline existing utilities into a custom CSS rule |

## 3. Core idioms
### Design tokens as CSS variables
```css
@import "tailwindcss";

@theme {
  --color-brand: oklch(65% 0.2 250);
  --color-brand-muted: oklch(65% 0.08 250);
  --spacing-gutter: 1rem;
  --font-display: "Cal Sans", sans-serif;
}
```
Every token generates matching utilities (`bg-brand`, `text-brand-muted`, `p-gutter`, `font-display`) and stays
usable as a raw variable (`var(--color-brand)`) in hand-written CSS or an inline style. Never duplicate a hex/px
value elsewhere in the codebase — change the token once and every consumer follows.

### Never build class names dynamically — use full class maps
```tsx
// WRONG — Tailwind's static scanner never sees the computed string
function Badge(props: { tone: "ok" | "warn" | "error" }) {
  return <span class={`bg-${props.tone}-100 text-${props.tone}-700`}>{props.tone}</span>;
}
```
```tsx
// RIGHT — every branch is a full literal string, so the scanner finds all of them
const toneClasses: Record<"ok" | "warn" | "error", string> = {
  ok: "bg-green-100 text-green-700",
  warn: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};
function Badge(props: { tone: "ok" | "warn" | "error" }) {
  return <span class={toneClasses[props.tone]}>{props.tone}</span>;
}
```
The same rule covers template literals, string concatenation, a `clsx`/`cva`-style helper fed a computed suffix, and
CSS-in-JS interpolation. `clsx("p-4", isActive() && "bg-brand")` is fine — both arguments are complete literal
strings; `` clsx(`p-${n}`) `` is not, no matter how it's wrapped.

### Dark mode via a custom variant
```css
@import "tailwindcss";
/* class-based toggle instead of the framework default (prefers-color-scheme) */
@custom-variant dark (&:where(.dark, .dark *));
```
```html
<html class="dark">
  <body class="bg-white text-black dark:bg-neutral-900 dark:text-white">
```
Without an overriding `@custom-variant dark`, `dark:` follows `prefers-color-scheme`. Redefining it this way is the
supported path to a manual class/data-attribute toggle — a hand-written `.dark &` rule living outside
`@custom-variant` creates a second, uncoordinated dark-mode mechanism instead of changing what `dark:` means.

### `@utility` and `@variant` for real custom CSS
```css
@utility scrollbar-hidden {
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
```
`@utility` registers a new utility that composes with every existing variant for free (`hover:scrollbar-hidden`,
`lg:scrollbar-hidden`) — a plain hand-written class does not. Use `@variant` inside hand-written CSS to reuse an
existing variant's condition without re-deriving the selector:
```css
.custom-card {
  background: white;
  @variant dark {
    background: var(--color-neutral-900);
  }
}
```

### When to extract a component vs. `@apply`
- Default: keep utilities inline in markup — this is the framework's intended unit of reuse, and it keeps styling
  visible at the call site instead of one hop away in a stylesheet.
- Extract a **component** (`Button.tsx`/`Card.tsx`, not a CSS class) once the same utility string is copy-pasted 3+
  times, or once variant/conditional logic (size, tone, state) makes the inline class list hard to read. The
  component's props become the variant surface; the class-map pattern above supplies the concrete classes.
- Reserve `@apply` for CSS you don't control as markup: a CMS-rendered rich-text body, a third-party widget's fixed
  DOM, or a handful of base-element resets. Stylesheets that lean on `@apply` for everything reintroduce the
  cascade/specificity drift utilities exist to avoid, because the class-to-element mapping is no longer visible
  where the element renders.

### State as variants, not conditional class strings
Prefer Tailwind's state/attribute variants over hand-rolled conditional class logic for anything CSS can already
express:
```html
<input class="border border-gray-300 aria-invalid:border-red-500 aria-invalid:text-red-600"
       aria-invalid={hasError()} />
<ul class="group">
  <li class="peer/item hidden peer-hover/item:flex">...</li>
</ul>
```
`aria-*`/`data-*` variants (`aria-invalid:`, `data-[state=open]:`), `group`/`group-*` (style a child from a parent's
state) and `peer`/`peer-*` (style a sibling from another sibling's state) cover most "if this element is X, style
that other element differently" needs without dedicating a signal or prop purely to picking a CSS class.

## 4. Error handling
- A class that silently produces no styles is almost always a scanning miss, not a Tailwind defect: look for a
  dynamically-built class name (§3), a file outside auto-detection needing `@source`, or a typo in the utility/token
  name. There is no runtime error for an unmatched class name — the browser just renders an unstyled element.
- `@theme`/`@utility`/`@custom-variant` syntax errors surface as a **build-time** failure from the bundler plugin
  (Vite/PostCSS), naming the offending file and line — fix the CSS; don't work around a build failure by deleting
  the directive.
- A legacy `@plugin`/`@config` pointing at a missing package or file fails the build immediately — expected mid
  v3→v4 migration; remove the directive once that plugin's configuration has been ported into CSS.
- `@tailwindcss/upgrade`'s automated rewrite is not guaranteed complete. After running it, still build and visually
  check pages that use less common utilities (arbitrary values, third-party plugins) before calling the migration
  done.

## 5. Testing
- **Unit** (the project's test framework, e.g. Vitest + `@solidjs/testing-library`): assert on which class a component *chose* for a given
  state, not on Tailwind's generated CSS. Query by role/text, then check `class`/`classList` membership for the
  behavior under test — don't snapshot the full class string (churns on every unrelated utility tweak) and don't
  assert on computed style values (jsdom does not apply real CSS).
  ```tsx
  test("shows the error tone when invalid", () => {
    render(() => <Badge tone="error" />);
    expect(screen.getByText(/error/i).className).toContain("bg-red-100");
  });
  ```
- **E2E / visual** (Playwright): this is where Tailwind's actual rendered output gets verified — a screenshot
  comparison (`expect(page).toHaveScreenshot()`) or a targeted `toHaveCSS()` assertion for a computed style that must
  hold in production. Run it against a production build, not the dev server, since plugin output can differ.
- Class-sorting/lint checks (Biome's `nursery.useSortedClasses`, or `prettier-plugin-tailwindcss`, if the project
  enables either) catch inconsistent class order in review — a formatting check, not a substitute for a rendered
  assertion.

## 6. Performance
- Final CSS size tracks which utilities are actually *used* in scanned source, not which are theoretically possible
  — so correctness of scanning (auto-detection plus any `@source`) is primarily a correctness lever for missing
  styles, not a knob to hand-tune for size.
- Avoid an explosion of one-off arbitrary values (`w-[137px]`, `text-[13.5px]`) scattered ad hoc — each is a unique
  generated rule. A shared token (`w-34`, a new `@theme` spacing step) reuses the same class everywhere it's needed
  and keeps the stylesheet small and cache-friendly across pages.
- `@apply`-heavy custom CSS duplicates declarations Tailwind would otherwise emit once as a shared utility class —
  prefer composing utilities directly (§3) for anything that isn't genuinely one-off, hand-authored CSS.
- v4's Oxide (Rust) engine scans and compiles substantially faster than v3's JS engine; a slow rebuild in an
  otherwise-fast Vite setup usually points at an oversized/misconfigured `@source` (e.g. accidentally scanning
  `node_modules`), not at the engine itself.
- Ship one compiled stylesheet per app entry; don't hand-split Tailwind output per route. Route-level JS
  code-splitting is the bundler/router's job — one global, cacheable CSS file is normal and expected.

## 7. Security
- Tailwind only emits CSS; it never sanitizes HTML. `@tailwindcss/typography`'s `prose` classes style arbitrary
  rich-text HTML — they never make it safe to render unsanitized user/CMS content through `innerHTML`,
  `dangerouslySetInnerHTML`, or Solid's `innerHTML` prop. Sanitize (or trust only your own CMS's escaped output)
  independent of which classes are applied to the container.
- Never build a `class` (or `style`) attribute directly from unescaped, unbounded user input. Tailwind classes
  aren't executable code, but concatenating attacker-controlled text into a DOM attribute is still an injection
  surface for whatever consumes it downstream — keep user input restricted to actual content, and let class
  *choice* come only from a fixed, known set of options (the class-map pattern in §3).
- Treat `@theme` tokens and `@custom-variant` conditions as build-time, developer-authored configuration only —
  never derive a token name or a variant's selector from runtime/user input.

## 8. Deployment notes
- The production build must actually invoke the Tailwind bundler plugin — verify `vite build` (or the project's
  build script) has `@tailwindcss/vite`/`@tailwindcss/postcss` in its plugin list. A build missing it ships an
  unstyled app with no build-time error to flag it.
- Because Tailwind only includes scanned classes, a route/component reachable solely through a dynamic import, a
  separately-deployed package, or a CMS-authored template can be invisible to auto-detection. Add it with `@source`
  and confirm against a **production** build+visual check — the dev server's watch set can be broader.
- The default palette's `oklch()`/`color-mix()` values need a reasonably modern browser. If the deployed app must
  support older browsers, add an explicit fallback (a `@supports` block, or a documented PostCSS fallback step)
  rather than letting colors silently degrade.
- The compiled CSS is a normal static asset: it gets the bundler's usual hashed filename and long-lived cache
  headers, with no Tailwind-specific cache-busting step required beyond what the bundler already does for CSS/JS.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `` `bg-${color}-500` `` computed class name | invisible to the static scanner — ships no CSS | full literal class map (§3) |
| New `tailwind.config.js` added to a fresh v4 project | fights CSS-first config; two sources of truth | configure in the CSS entry via `@theme`/`@source`/etc. |
| Copying v3 class names (`shadow-sm`, `ring`, `outline-none`) into v4 unchecked | the scale shifted; the class exists but now means something else | check `@tailwindcss/upgrade`'s rename list before porting old snippets |
| Hand-written `:root { --brand: ...; }` outside `@theme` for a themed value | no utility/variant is generated from it | put design tokens inside `@theme` |
| A global stylesheet that `@apply`s a class for every component | reintroduces cascade/specificity drift; markup-to-style mapping hidden | extract a component; reserve `@apply` for markup you don't control |
| Editing `content: []` in a v4 project | that key is v3-only and ignored — paths silently go unscanned | `@source "path";` / `@source not "path";` |
| A hand-rolled `.dark &` rule alongside a `@custom-variant dark` | two uncoordinated dark-mode mechanisms | exactly one `@custom-variant dark (...)`, nothing else |
| Unsanitized HTML wrapped only in `prose` classes | `prose` styles the markup, it does not sanitize it | sanitize before rendering, independent of styling |
| Snapshotting a component's full class string in a unit test | churns on every unrelated utility tweak | assert on the specific class(es) the behavior under test controls |

## 10. Review checklist
- [ ] no class name assembled by string concatenation/interpolation anywhere in the diff — check every
      template-literal or computed value feeding a `class`/`className` prop
- [ ] new design values (colors, spacing, fonts) were added to `@theme`, not hardcoded as hex/px literals inline
- [ ] the installed `tailwindcss` major was checked before relying on version-specific syntax (`@theme` vs
      `tailwind.config.js`, renamed utilities)
- [ ] dark mode goes through the project's one `dark:`/`@custom-variant dark` mechanism — no parallel hand-written
      toggle
- [ ] a component was extracted (not `@apply`) once a utility string repeats 3+ times
- [ ] any HTML rendered through an `innerHTML`-equivalent (including inside `prose`) is sanitized, independent of
      its classes
- [ ] the project's build actually runs the Tailwind plugin and the result was visually checked, not just verified
      against the dev server
- [ ] unit tests assert on chosen classes/behavior, not a full snapshotted class string or a computed style value

## 11. References
- Docs home https://tailwindcss.com/docs · functions & directives https://tailwindcss.com/docs/functions-and-directives
- Detecting classes in source files (`@source`, auto-detection) https://tailwindcss.com/docs/detecting-classes-in-source-files
- Dark mode https://tailwindcss.com/docs/dark-mode · theme variables (`@theme`) https://tailwindcss.com/docs/theme
- Upgrade guide (v3→v4, renamed utilities, `@tailwindcss/upgrade`) https://tailwindcss.com/docs/upgrade-guide
- Vite plugin install https://tailwindcss.com/docs/installation/using-vite
- Typography plugin https://github.com/tailwindlabs/tailwindcss-typography · source & releases
  https://github.com/tailwindlabs/tailwindcss
- Biome `useSortedClasses` https://biomejs.dev/linter/rules/use-sorted-classes (verified with Biome 2.5.14 — the
  rule is `nursery`, not part of the `recommended` preset; it must be enabled
  explicitly, with `attributes`/`functions` options, to actually run) · `prettier-plugin-tailwindcss`
  https://github.com/tailwindlabs/prettier-plugin-tailwindcss
- Principles: `.agents/guides/principles/` — `simplicity.md`, `security.md`, `performance.md`, `testing-strategy.md`
- Framework composition: the project's UI framework guide (e.g. `.agents/guides/frameworks/solid-start.md`,
  `solidjs.md`) covers component/route structure — Tailwind here owns styling only, nothing else in this list.
