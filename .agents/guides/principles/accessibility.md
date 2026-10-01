# Accessibility — engineering guide for AI agents
> Scope: building UI that works with keyboards, screen readers, zoom, voice control and reduced motion; target WCAG 2.2 AA. Examples in TypeScript (Solid JSX; React differs only in `className`/`htmlFor`), PHP (Blade), Python (Playwright), HTML/CSS. Quick card: `.agents/rules/topic-accessibility.md`; E2E runbook: `/e2e-test`.
> Last verified: 2026-09 — WCAG 2.2 text (w3.org/TR/WCAG22, current edition 2024-12-12; new criteria, 4.1.1 removed, 2.2 conformance implies 2.1/2.0); WCAG 3 still a Working Draft (new draft 2026-09-10); WAI-ARIA APG "Read me first" (ARIA 1.2); axe-core tag list (`wcag22aa`, no `wcag22a`); Playwright 1.63 `toMatchAriaSnapshot`/`ariaSnapshot` in a reference SolidStart 2 project's `node_modules`; Biome 2.5.14 `a11y` rule group and `--only`; MDN `<dialog>`.

## 0. How to use this guide
Each section: definition, why, a **check** you run on your own diff, bad → good code, and the misapplication trap. Automated scanners find only part of the problems; a change is "accessible" only after the automated scan **and** the keyboard walkthrough in §9 pass. If you could not do the manual part, say "keyboard/screen-reader pass not done" in the report — never claim conformance you did not test.

## 1. The target: WCAG 2.2 level AA
**Definition:** WCAG 2.2 is the current W3C Recommendation; AA is the level laws and procurement usually require. W3C states content that conforms to 2.2 also conforms to 2.1 and 2.0, so 2.2 AA covers a "2.1 AA" requirement (2.2 removed 4.1.1 Parsing; a policy that still names 2.1 may need it tested separately). WCAG 3 is a Working Draft: do not target it.
**The criteria agents miss most**, all level A or AA:

| SC | Requirement in one line |
|---|---|
| 1.1.1 Non-text content | informative images have `alt` text; decorative ones `alt=""` |
| 1.3.1 Info and relationships | structure is in markup: headings, lists, tables, labels, fieldsets |
| 1.3.5 Identify input purpose | personal-data inputs carry `autocomplete` tokens |
| 1.4.1 Use of color | color is never the only signal |
| 1.4.3 / 1.4.11 Contrast | text 4.5:1 (large text 3:1); UI component boundaries and focus indicators 3:1 |
| 1.4.10 Reflow | usable at 320 CSS px wide (400% zoom) without 2-D scrolling |
| 2.1.1 / 2.1.2 Keyboard | everything operable by keyboard; no keyboard trap |
| 2.4.3 / 2.4.7 Focus order, visible | logical order; focus always visible |
| 2.4.11 Focus not obscured (min) **new** | focused element not fully hidden by sticky headers/banners |
| 2.5.7 Dragging movements **new** | every drag has a single-pointer alternative |
| 2.5.8 Target size (min) **new** | targets ≥ 24×24 CSS px, or spaced so 24 px circles do not overlap |
| 3.3.1 / 3.3.3 Errors | errors identified in text, with a suggestion |
| 3.3.7 Redundant entry **new** (A) | do not make users re-type what they entered earlier in the flow |
| 3.3.8 Accessible authentication (min) **new** | no memory/puzzle test without an alternative; allow paste and password managers |
| 4.1.2 Name, role, value | every control exposes a name, role and state |
| 4.1.3 Status messages | results/errors announced without moving focus (live regions) |

**Why:** roughly one in six people has a disability (WHO), everyone has temporary or situational ones (broken arm, bright sun, loud room), and inaccessible UI is a legal risk in many markets. Keyboard and semantics fixes also make E2E tests more stable (§9).

## 2. Semantic HTML first
**Definition:** use the element whose built-in role and behaviour match the job: `<button>` acts, `<a href>` navigates, `<label>` names inputs, `<h1>`–`<h6>` outline the page, `<nav>`/`<main>`/`<header>`/`<footer>` are landmarks, `<table>` holds tabular data, `<ul>`/`<ol>` hold lists, `<dialog>` is a dialog.
**Why:** native elements give focus, Enter/Space activation, role, state and name for free in every browser and assistive technology; `<div>` re-implementations are usually incomplete.
**Check:**
- `npx biome lint --only=a11y src` (swap `npx` for `bunx`/`pnpm exec` per the lockfile; Biome's `a11y` group flags `useButtonType`, `useKeyWithClickEvents`, `noStaticElementInteractions`, `useAltText`, `noPositiveTabindex`, `useValidAriaProps`, `useSemanticElements`...). ESLint projects: `eslint-plugin-jsx-a11y` (React) or the framework's equivalent.
- `node .agents/scripts/search.mjs "<(div|span)[^>]*on[Cc]lick" src` — every hit must become a `<button>` or `<a>`.
- One `<h1>` per page, no skipped levels (h2 → h4) chosen for font size; one `<main>`.

```tsx
// TypeScript (Solid) — bad: no role, not focusable, no Enter/Space, no name
<div class="card" onClick={() => navigate(`/orders/${o.id}`)}>{o.title}<span class="icon-x" onClick={remove} /></div>

// good: navigation is a link, action is a button with a name
<article class="card">
  <h3><a href={`/orders/${o.id}`}>{o.title}</a></h3>
  <button type="button" onClick={remove} aria-label={`Remove ${o.title}`}>
    <svg aria-hidden="true" focusable="false">...</svg>
  </button>
</article>
```
**Trap:** "semantic" overload: wrapping everything in `<section>`/`<article>`, adding `role="list"` to every `<ul>`, or a heading per card when cards are not document sections. Semantics describe real structure; they are not decoration.

## 3. ARIA: no ARIA is better than bad ARIA
**Definition (W3C "Using ARIA" rules, condensed):** (1) if a native element exists, use it; (2) do not change native semantics (`<h2 role="tab">` breaks the heading); (3) every interactive ARIA role must be keyboard operable by you; (4) never put `aria-hidden="true"` or `role="presentation"` on a focusable element; (5) every interactive element needs an accessible name. APG: "a role is a promise" — `role="button"` promises Enter/Space, focus and state; ARIA changes only what is announced, never behaviour.
**Why:** wrong ARIA lies to screen-reader users (announces a menu that ignores arrow keys, hides a focusable button); missing ARIA on a native element usually costs nothing.
**Check (every `role=` / `aria-` in the diff):**
- Is there a native element that does this? Then delete the ARIA and use it.
- Does each ARIA state track the real state (`aria-expanded`, `aria-selected`, `aria-pressed`, `aria-current="page"`, `aria-invalid`) and update when it changes?
- Does every `aria-labelledby`/`aria-describedby`/`aria-controls` id exist in the DOM?
- `aria-label` only on elements with a role that supports naming (buttons, links, landmarks, inputs); on a plain `<div>`/`<span>` it is ignored or prohibited.
- The accessible name contains the visible label text (2.5.3 Label in name) so voice users can say what they see.

```html
<!-- bad: invented semantics, name hidden from AT, focusable content hidden -->
<span role="button" aria-label="close">X</span>
<div aria-hidden="true"><a href="/help">Help</a></div>
<!-- good -->
<button type="button" aria-label="Close dialog">×</button>
<div inert><a href="/help">Help</a></div> <!-- inert: hidden from AT AND not focusable -->
```
**Trap:** sprinkling `aria-label` on elements that already have visible text (it replaces the text for AT and drifts out of sync), `aria-live="assertive"` on everything, or `role="application"`. Add ARIA only to fill a specific gap you can name.

## 4. Keyboard and focus management
**Definition:** every action works with Tab/Shift+Tab, Enter, Space, Esc and the arrow keys a widget pattern expects; focus is always visible, follows reading order, and is moved deliberately when content changes.
**Why:** keyboard access is the base layer for screen readers, switch devices and voice control.
**Check:**
- No `tabindex` > 0 (search `tabindex="[1-9]`); `tabindex="0"` only on custom widgets; `tabindex="-1"` only for programmatic focus targets.
- No `outline: none`/`outline-0` without a `:focus-visible` replacement of ≥ 3:1 contrast.
- Sticky header/footer? Add `scroll-padding-top`/`scroll-margin` so a focused element is never fully covered (2.4.11).
- Content that opens (dialog, menu, popover) moves focus in and returns it to the trigger on close. Content that is removed while focused moves focus to a sensible neighbour, never to `<body>`.
- Client-side route change: focus the new page's `<h1>` (with `tabindex="-1"`) or announce the new title; check what your router does rather than assume.

```css
/* bad */ button:focus { outline: none; }
/* good: visible for keyboard users, not on mouse click */
:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
html { scroll-padding-top: 5rem; } /* height of the sticky header */
```
**Trap:** page-wide focus traps or custom Tab handling (trap only inside modal dialogs), or removing elements from tab order "to speed up tabbing" (use skip links and landmarks).

## 5. Color and contrast
**Definition:** text 4.5:1 against its background (3:1 at ≥ 24 px regular or ≥ 18.66 px bold); icons, input borders, focus rings and chart elements needed to understand the UI 3:1 (1.4.11); state never shown by color alone.
**Why:** low vision and color-vision deficiency are common, and phones are used in sunlight.
**Check:** axe's `color-contrast` rule in E2E (§9) or DevTools' contrast picker for each new color pair; light grays on white (e.g. Tailwind `text-gray-400`) typically fail 4.5:1. Errors, required fields, links in body text and chart series need a non-color cue: icon, text, underline, pattern. Check dark mode and hover/disabled states too (disabled controls are exempt from contrast, but must look disabled).
**Trap:** chasing AAA 7:1 everywhere, or darkening decorative borders that carry no meaning. Fix the pairs that carry information.

## 6. Forms and errors
**Definition:** every input has a visible, programmatically associated label; groups have `<fieldset>`/`<legend>`; errors are text, tied to their field, announced, and say how to fix them.
**Why:** a placeholder disappears on input and is not a reliable name; a red border alone is invisible to screen readers and color-blind users.
**Check:**
- Each `<input>`/`<select>`/`<textarea>` has `<label for=id>` (or wraps it); required state via `required` (and a visible marker explained once).
- Invalid field: `aria-invalid="true"` + `aria-describedby` pointing at the error text. On submit with errors: move focus to an error summary or the first invalid field.
- Personal fields have `autocomplete` (`email`, `name`, `tel`, `street-address`, `current-password`, `one-time-code`...). Login allows paste and password managers (3.3.8).
- Do not disable the submit button until valid; let users submit and show what is wrong.

```php
{{-- PHP (Laravel Blade) — bad: placeholder as label, color-only error --}}
<input name="email" placeholder="Email" class="{{ $errors->has('email') ? 'border-red-500' : '' }}">

{{-- good --}}
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email" required
       value="{{ old('email') }}"
       @error('email') aria-invalid="true" aria-describedby="email-error" @enderror>
@error('email')
  <p id="email-error" class="text-red-700">Error: {{ $message }}</p>
@enderror
```
**Trap:** live-validating on every keystroke with announcements (the screen reader talks over the typing). Validate on blur or submit; announce once.

## 7. Motion, time and media
**Definition:** respect `prefers-reduced-motion`; anything that moves, blinks or auto-updates for more than 5 s can be paused (2.2.2); nothing flashes more than 3 times per second (2.3.1); time limits can be turned off or extended (2.2.1); video has captions, audio-only content a transcript.
**Check:** new animations/transitions are wrapped by a reduced-motion query; carousels and auto-play have a visible pause; session timeouts warn and offer "extend".
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```
In Tailwind v4 use the `motion-safe:`/`motion-reduce:` variants on the element instead of a global override when only a few elements animate.
**Trap:** removing all transitions including opacity fades that help orientation. Reduced motion means no large movement, parallax, zoom or auto-play, not zero feedback.

## 8. Component patterns (follow the WAI-ARIA APG)
Before building any custom widget, open its APG pattern page and implement its keyboard table exactly. Prefer native first:

| Need | Use | Not |
|---|---|---|
| modal dialog | `<dialog>` + `showModal()` (inert background, Esc to close, `aria-modal` built in) | `<div role="dialog">` + hand-made focus trap |
| show/hide section | `<details>/<summary>` or button + `aria-expanded` + `aria-controls` (disclosure) | `role="menu"` |
| site navigation dropdown | disclosure button + list of links | `role="menu"`/`menubar` (forces arrow-key model, Tab leaves it) |
| action menu ("More ▾" with commands) | APG menu button pattern: `role="menu"`/`menuitem`, arrows, Esc returns focus | list of buttons with no roles |
| tabs | `tablist`/`tab`/`tabpanel`, `aria-selected`, roving `tabindex`, arrow keys | buttons that only swap content |

**Dialog (Solid):** set initial focus with `autofocus`, give it a name, and return focus in `onClose`: browsers restore focus on close, but setting it explicitly still works when the opener was re-rendered or the dialog was opened programmatically.
```tsx
let dialog!: HTMLDialogElement;
let opener!: HTMLButtonElement;
<button ref={opener} type="button" onClick={() => dialog.showModal()}>Delete project</button>
<dialog ref={dialog} aria-labelledby="del-title" onClose={() => opener.focus()}>
  <h2 id="del-title">Delete project?</h2>
  <form method="dialog">
    {/* submit inside method="dialog" closes it and sets dialog.returnValue */}
    <button type="submit" value="cancel" autofocus>Cancel</button>
    <button type="submit" value="confirm">Delete</button>
  </form>
</dialog>
```
**Tabs (Solid):** one tab stop for the whole tablist; arrows move between tabs.
```tsx
const [sel, setSel] = createSignal(0);
const onKey = (e: KeyboardEvent) => {
  const n = tabs.length;
  const next = { ArrowRight: (sel() + 1) % n, ArrowLeft: (sel() - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault(); setSel(next); document.getElementById(`tab-${next}`)?.focus();
};
<div role="tablist" aria-label="Account" onKeyDown={onKey}>
  <For each={tabs}>{(t, i) => (
    <button role="tab" id={`tab-${i()}`} aria-controls={`panel-${i()}`} type="button"
      aria-selected={sel() === i() ? "true" : "false"} tabindex={sel() === i() ? 0 : -1}
      onClick={() => setSel(i())}>{t.label}</button>)}</For>
</div>
<For each={tabs}>{(t, i) => (
  <div role="tabpanel" id={`panel-${i()}`} aria-labelledby={`tab-${i()}`} hidden={sel() !== i()} tabindex="0">{t.body}</div>)}</For>
```
**Trap:** building tabs for two items that fit on screen (just show both), or a mega "accessible component library" in-app when the project already depends on one (Kobalte, Radix, React Aria, Headless UI, Bits UI). Search `package.json` first and use its primitives.

## 9. Testing: automated, snapshot, manual
Layer them; each catches what the others miss.
1. **Lint** (seconds, every edit): `npx biome lint --only=a11y src` (Biome projects) or the project's jsx-a11y config.
2. **Unit/component:** query by role and name (`getByRole("button", { name: "Save" })` in Testing Library). If the query cannot find it, neither can a screen reader.
3. **E2E scan** with `@axe-core/playwright` (add it only if the user agrees to the dependency):
```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("checkout has no detectable WCAG A/AA violations", async ({ page }) => {
  await page.goto("/checkout");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
});
```
Scan each state too (dialog open, errors shown), not only the initial page.
4. **Accessibility-tree snapshots** (Playwright `toMatchAriaSnapshot` / `to_match_aria_snapshot`) pin names, roles and states; matching is partial, so list only what matters. Print the real tree first with `await locator.ariaSnapshot()`:
```python
# Python (pytest-playwright); relative goto needs --base-url or base_url in pytest.ini
from playwright.sync_api import expect

def test_login_form_semantics(page):
    page.goto("/login")
    page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_role("main")).to_match_aria_snapshot("""
      - heading "Sign in" [level=1]
      - textbox "Email" [invalid]
      - paragraph: "Error: Enter your email address"
      - button "Sign in"
    """)
```
5. **Manual keyboard walkthrough** (required for UI changes): unplug the mouse mentally; Tab through the changed flow; confirm visible focus, logical order, Esc closes, nothing trapped, focus returns; zoom to 200% and a 320 px-wide viewport.
6. **Screen reader spot check** for new widgets: NVDA (Windows, free) or Narrator (`Ctrl+Win+Enter`); VoiceOver on macOS/iOS (`Cmd+F5` on macOS); TalkBack on Android. Listen for name, role and state of each control.

**Trap:** treating a clean axe run as "accessible" (axe cannot judge alt-text quality, focus order, or whether a flow is operable), or disabling a failing axe rule instead of fixing it. Excluding a rule needs a comment with the reason and the manual check that replaces it.

## 10. Anti-patterns → fixes
| Anti-pattern | Fix |
|---|---|
| `div`/`span` with `onClick` | `<button type="button">` or `<a href>` |
| icon-only button with no name | `aria-label` on the button, `aria-hidden="true"` on the icon |
| `alt="image"`, `alt` = file name | describe what it conveys, or `alt=""` if decorative |
| placeholder as the only label | visible `<label for>` |
| `outline: none` | `:focus-visible` style ≥ 3:1 |
| `tabindex="3"` | DOM order; `0`/`-1` only |
| red border as the only error | text error + `aria-invalid` + `aria-describedby` |
| `role="menu"` for site nav | disclosure button + links |
| hand-made modal `div` | `<dialog>` + `showModal()` |
| `aria-hidden` on focusable content | `inert`, or remove from DOM |
| auto-playing carousel | pause control + reduced-motion respect |
| drag-only reordering | add move up/down buttons (2.5.7) |

## Checklist (copy into your review)
- [ ] Native elements used for every control; no `div`/`span` click handlers; Biome/jsx-a11y a11y rules clean
- [ ] Every control has an accessible name containing its visible label, the correct role, and a live-updated state
- [ ] Images: meaningful `alt` or `alt=""`; SVG icons `aria-hidden="true"` inside named buttons
- [ ] Keyboard: all actions reachable; no `tabindex` > 0; visible `:focus-visible`; focus not hidden by sticky UI
- [ ] Dialogs/menus/popovers move focus in, close on Esc, return focus to the trigger
- [ ] Contrast 4.5:1 text / 3:1 large text and UI; no color-only meaning; targets ≥ 24×24 px or spaced
- [ ] Forms: `<label for>`, `autocomplete`, text errors linked by `aria-describedby` + `aria-invalid`, focus to errors on submit, paste allowed
- [ ] Motion respects `prefers-reduced-motion`; auto-moving content can be paused
- [ ] axe scan (with `wcag22aa`) clean for each new UI state, or findings listed
- [ ] Manual keyboard walkthrough done and described — or explicitly reported as not done

## References
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ · What's new: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ · Understanding docs: https://www.w3.org/WAI/WCAG22/Understanding/
- WAI-ARIA APG (patterns + "Read me first"): https://www.w3.org/WAI/ARIA/apg/ · Using ARIA rules: https://www.w3.org/TR/using-aria/
- MDN `<dialog>`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog · `inert`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert
- Playwright accessibility testing: https://playwright.dev/docs/accessibility-testing · ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- axe-core rule tags: https://github.com/dequelabs/axe-core/blob/develop/doc/API.md · Biome a11y rules: https://biomejs.dev/linter/javascript/rules/
- WCAG 3 status (Working Draft): https://www.w3.org/TR/wcag-3.0/
