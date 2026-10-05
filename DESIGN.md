---
version: alpha
name: Mol-Mol Purwokerto Website Design System
description: "Warm, rounded design system for Mol-Mol Purwokerto bakery & snack pre-orders. Buttermilk cream, Mol-Mol signature red, oven-ink typography and circular product photos."
colors:
  primary: "#D92D3A"
  primary-hover: "#B92230"
  on-primary: "#FFFDF8"
  secondary: "#5B4638"
  on-secondary: "#FFFDF8"
  tertiary: "#E9B45B"
  tertiary-hover: "#D6A045"
  on-tertiary: "#3A2814"
  neutral: "#806B5C"
  soft: "#F9EEDB"
  on-soft: "#5B4638"
  background: "#FFF4DE"
  on-background: "#5B4638"
  surface: "#FFFDF8"
  surface-alt: "#F9EEDB"
  on-surface: "#5B4638"
  on-surface-muted: "#806B5C"
  outline: "#E7D8C3"
  footer: "#241D19"
  on-footer: "#FFF4DE"
  on-footer-muted: "#CDBCA9"
  success: "#7FA37A"
  on-success: "#FFFFFF"
  error: "#D92D3A"
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

A warm, friendly, homemade bakery palette matching Mol-Mol Purwokerto (Warm Cream + Ivory + Cocoa Brown + Mol-Mol Red + Caramel + Muted Sage):

- **Main Background (#FFF4DE):** warm cream as the overall page backdrop, cozy and appetising.
- **Secondary Background (#F9EEDB):** soft warm beige for sub-containers and image areas.
- **Card / Surface (#FFFDF8):** warm ivory for card containers, modals, and product showcases.
- **Primary Red (#D92D3A):** Mol-Mol signature red for primary CTAs (+ Pesan), active navigation, price highlights, and focus rings. Hover: `#B92230`.
- **Main Text / Cocoa (#5B4638):** dark cocoa brown for high-contrast, warm, readable headings and text.
- **Secondary Text (#806B5C):** muted cocoa brown for descriptions and secondary text.
- **Caramel Accent (#E9B45B):** warm golden caramel for limited slots, notices, and warnings.
- **Muted Sage Green (#7FA37A):** reserved strictly for positive information (Pre-Order aktif, status tersedia, success states).
- **Soft Border (#E7D8C3):** subtle warm outline for cards, dividers, and inputs.
- **Footer / Dark Cocoa (#241D19):** deep dark cocoa background (primary text `#FFF4DE`, secondary text `#CDBCA9`).

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
