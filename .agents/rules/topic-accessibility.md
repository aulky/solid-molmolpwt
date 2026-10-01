---
trigger: model_decision
description: "Apply when creating or changing UI markup or components: forms, buttons, links, dialogs, menus, tabs, images, icons, color/contrast, focus, keyboard handling, or ARIA attributes."
---
# Accessibility - topic rule
Target: WCAG 2.2 level AA (W3C Recommendation; WCAG 3 is still a Working Draft as of 2026-09 - do not target it). Principles guide: `.agents/guides/principles/accessibility.md` - read it before building a custom widget (combobox, menu, tabs, drag and drop). Automated checks in E2E: `/e2e-test`. Visual/UX states: `topic-ui-quality.md`.

## Protocol
1. Native element first: `<button>` for actions, `<a href>` for navigation, `<label>` for every input, `<fieldset>` + `<legend>` for groups, `<dialog>`, headings in order, landmarks (`header`, `nav`, `main`, `footer`). Use ARIA only when no native element fits - wrong ARIA is worse than none.
2. Keyboard: everything works with Tab / Shift+Tab / Enter / Space / Esc, plus arrow keys where the widget pattern expects them. Focus order follows DOM order; no `tabindex` > 0. Opening a dialog moves focus into it; closing returns focus to the trigger. Focused elements are not hidden under sticky headers (2.4.11).
3. Names: every interactive element has an accessible name (visible text, `aria-label`, or `aria-labelledby`); icon-only buttons need one. Images: informative -> `alt` describing what it conveys; decorative -> `alt=""`.
4. Perceivable: text contrast >= 4.5:1, large text (>= 18pt, or >= 14pt bold) >= 3:1, UI component and focus-indicator boundaries >= 3:1 (1.4.11). Never convey information by color alone. Content reflows at 320 CSS px width and 200% zoom. Respect `prefers-reduced-motion`.
5. Forms: visible labels (a placeholder is not a label); errors as text, linked with `aria-describedby`, set `aria-invalid`, announced (live region or focus moved to an error summary). `autocomplete` tokens on personal fields. Allow paste and password managers in login fields (3.3.8 Accessible Authentication).
6. Pointer: targets at least 24x24 CSS px or spaced so a 24 px circle does not overlap a neighbour (2.5.8); every drag action has a single-pointer alternative (2.5.7).
7. Verify: the `e2e-tester` (TEST) runs the keyboard-only walkthrough and an automated scan (`@axe-core/playwright` if the project has it, or Lighthouse accessibility); an implementer lists the flows to check in its Worker Report. Automated tools catch only part of the issues - report the manual pass separately.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER make `div`/`span` + `onClick` act as a button or link - not focusable, no role, no Enter/Space. Instead: `<button type="button">` or `<a href>`.
2. NEVER remove focus outlines (`outline: none`) without a visible replacement. Instead: a `:focus-visible` style with >= 3:1 contrast.
3. NEVER add `role`/`aria-*` that contradicts native semantics (`<button role="link">`, `aria-hidden="true"` on focusable content).
4. NEVER show state only visually. Instead: `aria-expanded`, `aria-pressed`, `aria-selected`, `aria-current`, `aria-invalid`, real `disabled`.
5. NEVER auto-play motion or sound, or time out a form, without a way to pause, stop or extend it.

## Pitfalls Flash models get wrong
- `aria-label` on a `div` with no role (ignored by most screen readers).
- `alt="image of logo"` / `alt="icon"` (say what it conveys, or `alt=""`).
- Custom select/modal without focus trap, Esc handling or focus return.
- Removing a visible label to "clean up" the design, leaving only a placeholder.
- Disabling the submit button instead of showing which field is wrong.

## Example - bad -> good
```tsx
// Solid JSX (React: className / htmlFor)
// BAD
<div class="btn" onClick={save}><img src="/save.svg" /></div>
<input placeholder="Email" />

// GOOD
<button type="button" onClick={save} aria-label="Save draft">
  <img src="/save.svg" alt="" />
</button>
<label for="email">Email</label>
<input id="email" type="email" autocomplete="email"
  aria-invalid={Boolean(emailError())} aria-describedby="email-error" />
<p id="email-error" aria-live="polite">{emailError()}</p>
```

## Before finishing
- [ ] Keyboard-only walkthrough done by the `e2e-tester` (say what was checked), or flows listed for it, or "not verified: <reason>"
- [ ] Every control has a name, a role and its state; images have correct `alt`
- [ ] Contrast and target sizes meet the numbers above; automated scan clean or findings listed
