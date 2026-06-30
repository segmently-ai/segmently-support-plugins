# Workflow 5 — Capture your design system ↔ fill it from a reference screenshot (round-trip)

**Direction:** Segmently → `claude.ai/design` → Segmently. Goal: brief Claude Design with **our**
design system so it designs in-brand, let the user generate from a **reference-app screenshot**, then
extract the result back into the Theme V2 **extraction shape**. This is the round-trip that makes
"fill your theme from another app" possible.

> **Why this works.** A Segmently theme is a small set of **knobs** (Colors / Fonts / Options List /
> Background / Header / Action Bar) that propagate to all 13 screen templates. Claude Design only has
> to fill those knobs. We teach it our system (push + briefing prompt), it maps a screenshot onto our
> screen types with its own vision, and we read the knobs back. The design-system structure is
> 3 tiers: **tokens → primitive components (label, button, item, …) → screen compositions**.

Use the globally installed `segmently` binary; production is the default (omit `--env`). For auth and
account setup, see `segmently-cli-guide`.

## Step A — Brief Claude Design with our system (push)

Push our design system into the Claude Design project so generation starts in-brand. Three card
groups (`@dsCard`), each carrying **real token values**:
- **Tokens** — `group="Colors"` (the 3 colors), `group="Type"` (title/subtitle/item fonts),
  `group="Spacing"` (spacing/radius scales).
- **Primitives** — `group="Components"`: one card per primitive (label, button primary/secondary,
  option item + checkbox, featured media, input field, wheel picker, progress stepper, paywall
  product card, header buttons), rendered with our tokens + its main properties.
- **Screens** — `group="Screens"`: one card per StepKind showing what primitives compose it.

Delegate the actual upload to the native `/design-sync` skill + `DesignSync` tool — see
[push-design-system.md](push-design-system.md). Push **incrementally**, never a wholesale replace.

## Step B — Drive from a reference screenshot (brief + generate)

In `claude.ai/design`, the user uploads the **reference-app screenshot(s)** as visual references (see
[drive-claude-design.md](drive-claude-design.md) intake) and pastes the **briefing prompt** below. The
prompt makes Claude Design map the screenshot onto our screen types and reproduce it with our
primitives/tokens — the visual mapping is done by Claude Design's own vision.

```
You are designing inside the Segmently Theme V2 design system (loaded as this project's design
system). It has three tiers:
  • TOKENS: 3 colors (button background, titles & subtitles, button title), one font family, and
    spacing/radius scales.
  • PRIMITIVES: label, button (primary/secondary), option item (+checkbox), featured media,
    input field, wheel picker, progress stepper, paywall product card, header buttons — each with
    the properties shown in the Components cards.
  • SCREENS (13 types): HeroContent, Carousel, ProgressSteps, ListSinglePick, GridSinglePick,
    WheelPicker, ListMultiPick, GridMultiPick, HeroList, TextInput, Paywall, WebEmbed,
    FlexibleLayout — each composed of the primitives above (see the Screens cards).

TASK — given the attached reference screenshot(s):
  1. Identify which of our 13 screen archetypes each reference maps to.
  2. Reproduce it using OUR tokens and OUR primitives — do not invent new components.
  3. Report the resulting design-system tokens in the extraction shape in Step C.
Report only values you can see or strongly infer; OMIT (do not guess) anything uncertain, and flag
any token you had to MEASURE rather than read from a declared value.
```

## Step C — Extract back into the Theme V2 extraction shape

Pull the Claude Design output (exported tokens / standalone HTML / styleguide screenshot — see
"Getting design out of Claude Design" in [SKILL.md](../SKILL.md)) and write
`<run-dir>/claude-design-theme-extraction.json` in this shape (this is the **same shape** Workflow 4
consumes — see [import-native-theme.md](import-native-theme.md), extended with optional `perScreen`):

```jsonc
{
  "colors":   { "buttonsBackground": "#5B5BD6", "titlesSubtitles": "#FFFFFF", "buttonsTitle": "#0B0B0F" },
  "background": "#1A1A1A",                 // SOLID only → omit gradient/photo (warn)
  "typography": {
    "mainFontFamily": "Inter",            // normalized to SF Pro / SF ProRounded / SF Mono / New York (warn)
    "title":    { "fontSize": 28, "fontWeight": 700, "align": "center" },
    "subtitle": { "fontSize": 17, "fontWeight": 500 }
  },
  "geometry": {
    "basis": "exact-variable",            // declared tokens → no "verify" warning; else "screenshot-measured" (~0.8)
    "spacingScale": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
    "radiusScale":  { "sm": 8, "md": 12, "lg": 20 },
    "actionBar":    { "insets": { "start": 16, "end": 16, "bottom": 32 }, "primaryButton": { "radius": 12, "height": 56 } },
    "optionsList":  { "itemRadius": 12, "itemInsets": { "top": 12, "bottom": 12, "start": 16, "end": 16 }, "itemsSpacing": 8 },
    "media":        { "featuredHeightPercentage": 40, "cornerRadius": 16 },
    "paywall":      { "productRadius": 12, "productSpacing": 8 }
  },
  "perScreen": { "Carousel": { "indicatorInsets": { "bottom": 16 } } },  // OPTIONAL per-screen deepening
  "source": { "fileName": "Claude Design — <project>", "sourceUrl": "https://claude.ai/design/<id>" },
  "variableRefs": []
}
```

Rules (mirror the projection warnings): **never invent** — extract or omit; bad hex / out-of-range
number / malformed insets are rejected with a warning, not written; normalize the font family to the
4 supported and warn; a non-solid background is omitted with an `unsupported-token` warning.
`future`-status fields (e.g. `form.fieldHeight`, `actionBar.buttonGap`, `webEmbed.contentInsets`) are
**observation-only** — capture them under `perScreen`/geometry if visible, but they are not applied in
this phase.

**Determinism rules (eval-hardened — keep these in the briefing prompt so extractions are repeatable):**
- **Typography is settable** — emit the OBSERVED title/subtitle `fontSize`/`fontWeight`/`align`
  (defaults 21/700/center · 17/500 apply only when nothing is observed). Only the font *family* is the
  single cascaded `mainFontFamily`.
- **Selection by pick type** — single-pick: selected option FILLED (`buttonsBackground` bg + `buttonsTitle`
  text). Multi-pick: selected option = `buttonsBackground` BORDER + filled checkbox (no fill, no text
  recolor). There is no separate "selected color" token.
- **Paywall** — reproduce the close "X" (it maps to `paywall.closeButton`); record the purchase-CTA
  radius/height/insets under `geometry.actionBar.primaryButton` (the mapper routes it to the purchase
  button). Paywall still renders no standalone action bar.
- **One slot per observable** — list/grid cell corner → `optionsList.itemRadius`; media corner →
  `media.cornerRadius`; grid ~1:1 aspect → `optionsList.cellHeightFromCellWidth` (e.g. `1.0`). Report
  raw measured spacing/insets — do not snap to the 4/8/16/24/32 scale.
- **Featured media is contained**, never a full-bleed background; a full-bleed photo → omit `background` + warn.
- **OMIT unobservable keys** — never emit `null`. Emit the OBSERVED color even if near a default.
- **Single-token couplings** (`buttonsTitle`, `buttonsBackground`, subtitle opacity) cannot express two
  simultaneous states — emit the dominant value and WARN; do not invent extra tokens.

## Step D — What this phase does NOT do (deferred)

Phase 1 ends at a **validated extraction shape**. Turning it into an *applied* Theme V2 — the
projection **bridge** (build a theme artifact → `themes create-from-figma`) — is **Phase 2**. When that
lands, the apply step is [import-native-theme.md](import-native-theme.md) Step 2–3. State this boundary
to the user so they aren't surprised the theme wasn't applied automatically yet.

## Verification

- The pushed cards appear under `Colors` / `Type` / `Spacing` / `Components` / `Screens` in the Design
  System pane (`DesignSync list_projects` returns a writable project first).
- The generated extraction JSON validates (hex/number/insets) and contains no invented tokens.
- A reviewer can trace each extracted token to a knob in the design-system spec.

Keep the pushed card set and briefing prompt aligned with the public Segmently design-system
description. If a customer has a newer design-system export, use that export as the source for the
cards instead of editing values by hand.
