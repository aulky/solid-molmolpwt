---
trigger: model_decision
description: "Apply when building or restyling frontend UI (pages, components, layouts, forms, tables, dashboards): visual hierarchy, spacing, loading/empty/error states, responsiveness, interaction feedback."
---
# UI quality - topic rule
Always apply `topic-accessibility.md` together with this rule. Principles guide: `.agents/guides/principles/accessibility.md`. Visual checks and E2E: `/e2e-test` (Playwright screenshots). Styling framework rules: the matching `fw-*.md` pack (for example `fw-tailwind.md`).

## Protocol
1. Reuse before inventing: find existing components, design tokens (colors, spacing, radius, fonts) and layout patterns - `node .agents/scripts/search.mjs 'Button|Card|Modal|Dialog' src/components --files` - and match them. New colors or sizes only through the project's tokens or theme (Tailwind theme, CSS variables).
2. Hierarchy: one primary action per view; a clear heading; importance shown by size, weight and color; related items grouped; content aligned to one grid.
3. Spacing: one spacing scale (for example 4 px steps or the Tailwind scale) used consistently; more space between groups than inside them.
4. States - every data-driven view implements ALL of them:
   - loading (skeleton or spinner that does not shift the layout)
   - empty (what this is + the next action)
   - error (what happened + retry)
   - partial or success feedback, disabled, long text (wrap or truncate with full text available), many items (pagination or virtualization)
5. Feedback: every action responds visibly at once (pressed, busy or optimistic state); prevent double submit; confirm destructive actions or offer undo.
6. Responsive: mobile first; check about 360, 768 and 1280 px widths; no horizontal scroll; touch targets >= 24x24 px (44 px is more comfortable on touch); images `max-width: 100%` with dimensions set.
7. Themes: if the app has dark mode, check both themes; contrast per `topic-accessibility.md`.
8. Look at it: the `e2e-tester` (TEST) takes screenshots per state and width via `/e2e-test` (Playwright starts and stops the server from its config). An implementer without screenshots writes "not visually verified" and lists the states and widths to check in its Worker Report. Never leave a dev server running (core protocol). Describe what you saw.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER ship only the happy path - loading, empty and error are the states real users see first. Instead: implement all states in step 4.
2. NEVER hard-code one-off colors, pixel sizes or fonts when tokens exist - the design drifts. Instead: use or extend the tokens.
3. NEVER claim "looks good" without viewing it. Instead: attach the screenshots you took, or write "not visually verified".
4. NEVER add a UI library for one component. Instead: build from existing primitives, or report `INPUT GAP:` (the orchestrator asks the user).

## Pitfalls Flash models get wrong
- Spinners that replace the whole page on every refetch (keep stale content, show a small busy state).
- Layout shift when data arrives (reserve space: fixed image ratios, skeleton rows of the same height).
- Buttons with no pressed or disabled styles; icons with no text or tooltip.
- Tables that overflow on mobile (wrap in a scroll container or switch to a card list).

## Example - bad -> good
```tsx
// Solid (React: same states with Suspense, an error boundary and conditional rendering)
// BAD: happy path only
<ul>{items().map((i) => <li>{i.name}</li>)}</ul>

// GOOD: loading, error, empty and list states
<Suspense fallback={<ListSkeleton rows={5} />}>
  <ErrorBoundary fallback={(err, reset) => <ErrorPanel message="Couldn't load projects." onRetry={reset} />}>
    <Show when={items()?.length} fallback={<EmptyState title="No projects yet" action={<Button onClick={create}>New project</Button>} />}>
      <ul class="divide-y">
        <For each={items()}>{(i) => <li class="py-3">{i.name}</li>}</For>
      </ul>
    </Show>
  </ErrorBoundary>
</Suspense>
```

## Before finishing
- [ ] All states from step 4 exist for every new data-driven view
- [ ] Checked at mobile and desktop widths (and dark mode if present) - screenshots or "not visually verified"
- [ ] Only existing tokens and components used, or new ones added to the shared set
