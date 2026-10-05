---
version: alpha
name: Mol-Mol Purwokerto Website Design System
description: "Warm, rounded design system for Mol-Mol Purwokerto bakery & snack pre-orders. Buttermilk cream, Mol-Mol signature red, oven-ink typography and circular product photos."
colors:
  primary: "#CE2738"
  primary-hover: "#B51F2F"
  on-primary: "#FFFFFF"
  secondary: "#2C221E"
  on-secondary: "#FFFFFF"
  tertiary: "#F2A054"
  tertiary-hover: "#E88D3A"
  on-tertiary: "#2A1405"
  neutral: "#8D7E73"
  soft: "#F3ECE2"
  on-soft: "#2C221E"
  background: "#FAF7F2"
  on-background: "#1C1917"
  surface: "#FFFDF9"
  surface-alt: "#F5EEE4"
  on-surface: "#1C1917"
  on-surface-muted: "#6C5F57"
  outline: "#E8DFD5"
  footer: "#2C221E"
  on-footer: "#F5EBE1"
  success: "#1B872A"
  on-success: "#FFFFFF"
  error: "#CE2738"
  on-error: "#FFFFFF"
typography:
  display:
    fontFamily: Urbanist
    fontSize: 56px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Urbanist
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Urbanist
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Urbanist
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.25
  body-lg:
    fontFamily: Urbanist
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.7
  body-md:
    fontFamily: Urbanist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Urbanist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-lg:
    fontFamily: Urbanist
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.2
  label-md:
    fontFamily: Urbanist
    fontSize: 13px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Urbanist
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.04em
  stat:
    fontFamily: Urbanist
    fontSize: 32px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: -0.01em
rounded:
  none: 0px
  sm: 20px
  md: 999px
  lg: 40px
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
  3xl: 96px
  gutter: 24px
  max-width: 1200px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 14px 24px
    height: 48px
  button-accent:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 14px 24px
    height: 48px
  button-accent-hover:
    backgroundColor: "{colors.tertiary-hover}"
    textColor: "{colors.on-tertiary}"
  button-soft:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.on-soft}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 14px 24px
  button-link:
    backgroundColor: "{colors.background}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 16px
    height: 48px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-alt:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-featured:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.headline-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  eyebrow:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
  chip:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.on-soft}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  chip-accent:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  stat:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.stat}"
  caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-sm}"
  nav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
    typography: "{typography.label-lg}"
    height: 72px
  footer:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    padding: 64px 24px
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 16px
  divider:
    backgroundColor: "{colors.outline}"
    height: 1px
  icon-muted:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    size: 24px
---

# Family Bakery Website Design System

## Overview

This system is for family bakeries, patisseries and small bread shops: the daily bread list, custom cake orders, pickup slots and the addresses of a few shops around town. It should feel like a warm bakery counter early in the morning, calm and generous, with soft shapes that echo round loaves, rolls and cakes.

Fonts were chosen with full Latin Extended coverage, so Polish, Czech and other Central European diacritics (ą, ę, ł, ż, ř, ů) render correctly in every weight.

## Colors

A warm, balanced bakery palette matching the Mol-Mol Purwokerto logo without visual clashing:

- **Mol-Mol Red (#CE2738):** primary brand & action color. Main buttons, active tabs, brand accents, and badges. Matches the iconic Mol-Mol Purwokerto logo. Hover: `#B51F2F`.
- **Bakery Cream (#FAF7F2):** soft, pleasant warm off-white background with low yellow intensity so cards and content stand out cleanly.
- **Warm Ivory Card (#FFFDF9):** soft warm cream surface for cards and modals. Eliminates harsh stark white contrast.
- **Flour Cream (#F3ECE2):** soft neutral surface for secondary buttons, filters, chips, and inactive tabs.
- **Warm Crust Border (#E8DFD5):** subtle, elegant dividers and card outlines.
- **Dark Mocha Charcoal (#2C221E):** warm footer background that harmonizes with the bakery palette instead of stark pitch black.
- **Oven Ink (#1C1917):** high-contrast readable headings and body text.
- **Muted Earth (#6C5F57):** readable secondary descriptions.
- **Success Green (#1B872A):** reserved strictly for WhatsApp, confirmed badges, and positive states.

## Typography

One geometric family, **Urbanist**: Medium (500) for headlines with slightly tight tracking, Regular for body text and Bold for labels and buttons. Headlines never go bold; the round letterforms carry the warmth.

## Layout

Home page: a big rounded hero with a photo of the counter, the bread of the day as circular photos connected by thin burnt-orange arcs, a cake-order section, shop locations with opening hours and a footer. Product lists use three circular photos per row on desktop and two on phones. Spacing is built on 8px with airy 96px section gaps.

## Elevation & Depth

Very soft: cards `0 4px 16px rgba(28, 25, 23, 0.06)`. Circular photos have a small white satellite button docked on their edge (an arrow in a 40px circle) instead of a shadow.

## Shapes

Oversized rounding is the signature: 40px for the hero and large cards, full pills for buttons and inputs, perfect circles for product photos. Nothing on the page has sharp corners.

## Components

- **Order button:** oven-ink pill with cream text: `Order a cake`; the secondary action is a flour pill.
- **Bread circle:** 200px circular photo, name and price below, a white 40px satellite arrow button on the edge.
- **Daily special:** apricot-glaze pill badge `fresh at 7:00` next to the product name.
- **Pickup slot picker:** pill chips with times; the selected slot is oven ink.
- **Shop card:** 40px-radius card with address, hours for today and an `Open now` status.

## Do's and Don'ts

- Do crop product photos into circles and connect them with thin arcs.
- Do show which bread is available today and until when.
- Don't use square corners anywhere.
- Don't use bold headlines; Medium weight is enough.
