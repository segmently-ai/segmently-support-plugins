# Workflow 5 — Theme V2 ↔ Claude Design round-trip (snapshot · edit · apply)

**Direction:** Segmently → `claude.ai/design` → Segmently. Goal: take a real Segmently theme into
Claude Design as editable screen cards, let the user (or Claude Design) change the design, then read
the changes back **deterministically** and write them into the theme. Verified end-to-end:
a real Claude Design edit of 2 tokens came back and repainted the live theme.

> **Why this works.** A Segmently theme is a small set of **knobs** (Colors / Fonts / Options List /
> Background / Header / Action Bar) that propagate to all 13 screen templates. `segmently design
> snapshot` renders each template with the **real runtime** (same SSR as publish) and bakes every
> knob into the card as a named CSS custom property (`--tv-*`). Editing the value in Claude Design
> and running `design extract` → `design apply` closes the loop with **no re-measurement** — names
> are the update targets, values are read not guessed.

There are **two modes**:
- **Mode A — round-trip an existing theme** (primary, deterministic): the `--tv-*` token contract
  below. Use this whenever the bundle came from `segmently design snapshot`.
- **Mode B — fill from a reference screenshot** (VLM, lossy): brief Claude Design to reproduce
  another app's screenshot with our primitives, then read tokens back into the free-form extraction
  shape. Use this only when there is no source theme to snapshot. See "Mode B" near the end.

Use the globally installed `segmently` binary; production is the default. For auth and account setup,
see `segmently-cli-guide`. The target account must have the `segmently design snapshot`,
`segmently design extract`, and `segmently design apply` commands available. If a command returns
404 or an unsupported-command error, stop and ask Segmently support to confirm the round-trip feature
is enabled for that workspace before continuing.

---

## Mode A — the full round-trip (5 steps)

### Step 1 — Snapshot the theme into a bundle

Pick the source and render a self-describing bundle. All forms take an optional `[projectId]`
(falls back to the configured default project) and `--out <dir>`:

```bash
# a) the theme of one onboarding (its themeSettingsV2/settings)
segmently design snapshot <projectId> --funnel <funnelId> --out .design/push/<name>

# b) a project theme — active by default, or an explicit id
segmently design snapshot <projectId> --out .design/push/<name>
segmently design snapshot <projectId> --project-theme-id <themeId> --out .design/push/<name>

# c) a global theme
segmently design snapshot <projectId> --global-theme-id <themeId> --out .design/push/<name>

# d) LIVE screens of a funnel version (any screen or all)
segmently design snapshot <projectId> --funnel <fid> --version-id <vid> --all-screens --out .design/push/<name>
segmently design snapshot <projectId> --funnel <fid> --version-id <vid> --screens s1,s2 --out .design/push/<name>
```

> ⚠️ `--version-id`, not `--version` (the latter collides with the CLI's global `--version` flag).

The bundle (flat dir) contains, per screen, `screen-<kind>[__<subtype>].html` — a full standalone
script-free document (real SSR markup + inlined runtime CSS, renders pixel-faithfully in the design
pane) whose `<head>` carries the round-trip contract:
- `<style data-segmently-tv>:root{ --tv-*: value; }</style>` — every themeable knob as a named var;
- `<meta name="segmently-screen" content="kind=…;screenId=…;themeId=…;projectId=…">` — identity.

Plus the shared cards `colors.html` / `type.html` / `spacing.html` / `screens.html`,
`how-to-edit.html` (the editing contract for Claude Design), and JSON provenance `settings.json`
(theme tokens + per-screen + a `tokenIndex` mapping every var → scope/path/value) and `manifest.json`
(source coordinates).

**Var naming = update scope:**
- `--tv-theme-<group>-<field>` — a **shared primitive** (button, title, option item…): the same var
  appears on every card, and one edit updates the **whole theme**. E.g.
  `--tv-theme-colors-buttonsBackground`, `--tv-theme-fonts-title-fontSize`.
- `--tv-screen-<kind>-<path>` — that **one StepKind's** template screen only. E.g.
  `--tv-screen-herocontent-canvas-backgroundColor`.

### Step 2 — Push the bundle to Claude Design

Delegate the upload to the native `/design-sync` skill + `DesignSync` tool. Ordering is
list/read → `finalize_plan` → `write_files`. Push **all** HTML cards **including `how-to-edit.html`**
(it is the editing contract the design side reads) and the JSON provenance. Reuse an existing
writable design-system project (`get_project` confirms `type: PROJECT_TYPE_DESIGN_SYSTEM`), else
`create_project`. Push incrementally, never a wholesale replace. See
[push-design-system.md](push-design-system.md).

### Step 3 — Edit in Claude Design

In `claude.ai/design`, the user changes the design. Steer them (or drive Claude Design in the
project chat) to follow the pushed **how-to-edit** card: *change a value → update the matching
`--tv-*` variable in the `:root` block; `--tv-theme-*` = whole theme, `--tv-screen-*` = this screen
only; don't invent variable names; colors as hex, sizes as unitless numbers.* Example instruction:

> Open screen-herocontent.html. Change the primary button background to #5B5BD6 and the title font
> size to 26. Follow the "How to edit these tokens" card — update `--tv-theme-colors-buttonsBackground`
> and `--tv-theme-fonts-title-fontSize` in the `:root` block. Don't invent new variable names.

The edit must be saved **into the project file** (not only the chat preview). Proven behaviour:
Claude Design updated exactly the two named vars, zero invented names.

### Step 4 — Pull + extract the diff

Pull the modified HTML back (`DesignSync get_file`, or the user's standalone-HTML export) into a
local dir, then diff against the **original bundle** — extraction is a mechanical parse, never a
re-measurement:

```bash
segmently design extract --input <modified-dir-or-file> \
  --baseline <original-bundle-dir> --out extraction.json
```

`extraction.json` is `{ theme:{var→value}, perScreen:{kindSlug:{var→value}}, conflicts[],
unknownVars[], warnings[], files[] }`, `mode:"diff"` (only CHANGED vars vs baseline).
Guarantees to trust and surface to the user:
- **Unknown/invented var names → `unknownVars`, never applied.**
- **The same theme var edited to different values in different files → `conflicts` (reported, never
  merged).** `apply` refuses a conflicted extraction.
- Values are normalized (hex lowercased, `px` stripped to numbers).

Without `--baseline` the command runs in `mode:"full"` and dumps every `--tv` value (useful to
inspect a single returned file).

### Step 5 — Dry-run, then apply

`design apply` resolves every var through the **same server-side allowlist** (a name outside the
token contract is skipped with a reason, never written) and updates the **same theme document** in
place through the Segmently theme API, plus cascades theme-scope changes into the template screens so
the render plane actually changes. Always dry-run first and show the before/after list:

```bash
# dry-run: per-var before/after, no write
segmently design apply <projectId> --extraction extraction.json \
  --project-theme-id <themeId> --dry-run
# apply (same target flag as the snapshot source):
#   --funnel <id> | --project-theme-id <id> | --global-theme-id <id>
segmently design apply <projectId> --extraction extraction.json --project-theme-id <themeId>
```

`apply` returns `{ appliedCount, skippedCount, changes[], warnings[] }`. Each `change` has
`varName`, `status` (`applied`/`skipped`), `fieldPath`, `target` (`theme` or a template screen key),
`before`, `after`. A theme-scope edit fans out to N template screens — expect `appliedCount` > number
of edited vars (e.g. 2 vars → 23 writes across 14 templates). `apply` re-cascades even when the
token field already matches, so a prior token-only run converges the render plane on re-run.

**Confirm the round-trip closed:** re-snapshot and check the value came back, or screenshot a card:

```bash
segmently design snapshot <projectId> --project-theme-id <themeId> --out .design/verify/<name>
grep -o 'tv-theme-colors-buttonsBackground: [^;]*' .design/verify/<name>/screen-herocontent.html
```

### Safety rules for Mode A

- **Never apply to a live/active theme as the first write.** Dry-run first; prefer a non-active or
  cloned theme until the user confirms the diff.
- `--funnel` target updates onboarding settings → needs `funnels:write` scope on top of
  `themes:write` (backend enforces).
- Resolve conflicts (`conflicts[]`) with the user before applying — never pick a value yourself.
- Bundles under `.design/` are regenerable; keep them gitignored.

### Coverage (what Mode A writes today) — at parity with the Theme V2 mapper

Theme scope: 3 colors, `fonts.main/title/subtitle` (family/size/weight), `optionsListSettings`,
solid background. On apply each theme edit **cascades into the template screens** exactly like the
in-app mapper (paths mirrored from `mappingTablesV2`, `hasActionBar`/`hasCopy`/pick-type exclusions
honored, removed/null regions preserved). This includes **array-based content** — option items,
carousel slides, stepper segments, paywall product rows are fanned out per element:

- buttons (actionBar primary/secondary, paywall purchase CTA), copy title/subtitle;
- option items: title/subtitle/checkbox color + font (single-pick → `buttonsTitle`, multi-pick /
  HeroList → `titlesSubtitles`), single-pick cell fill + borders + selected checkbox;
- carousel slide title/subtitle/detail; stepper label + segment title + progress fill;
- paywall close button, purchase button, product topStart/bottomStart labels, auto-renew label;
- solid canvas background (theme-wide `--tv-theme-background-color`, cascades to every solid screen).

**Genuinely not themeable** (the mapper does not map these — template-authored content, correctly
left alone): paywall price labels (`*EndLabel`), the paywall badge accent, stepper segment
subtitle/description, `progressIndicator.activeColor`, actionBar geometry. To extend this contract,
add a var only when Segmently has verified the corresponding Theme V2 mapping path.

> **Implementation note (don't regress):** array-nested updates (`items.N.…`) must be handled by the
> Segmently theme API as full nested structures, not as flattened dot-path writes. This keeps option
> items, carousel slides, stepper segments, and paywall product rows renderable after apply.

---

## Mode B — fill from a reference screenshot (VLM, lossy)

Use only when there is **no source theme to snapshot** (you want to seed a theme from another app's
look). Push a briefing kit, let Claude Design reproduce a reference screenshot with our primitives,
then read tokens back into the free-form extraction shape.

### B1 — Brief Claude Design (push)

Push our design system as card groups so generation starts in-brand: `Colors` / `Type` / `Spacing`
(tokens), `Components` (one card per primitive), `Screens` (one per StepKind). Prefer generating the
cards with `segmently design snapshot` off a starter theme; see [push-design-system.md](push-design-system.md).

### B2 — Drive from the screenshot (brief + generate)

The user uploads the reference-app screenshot(s) as visual references and pastes:

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
  3. Report the resulting design-system tokens in the extraction shape in B3.
Report only values you can see or strongly infer; OMIT (do not guess) anything uncertain, and flag
any token you had to MEASURE rather than read from a declared value.
```

### B3 — Extract into the free-form shape

Pull the output and write `<run-dir>/claude-design-theme-extraction.json` (the **same shape**
Workflow 4 consumes — see [import-native-theme.md](import-native-theme.md), extended with optional
`perScreen`):

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
**observation-only**.

**Determinism rules (eval-hardened — keep these in the briefing prompt so extractions are repeatable):**
- **Typography is settable** — emit the OBSERVED title/subtitle `fontSize`/`fontWeight`/`align`
  (defaults 21/700/center · 17/500 apply only when nothing is observed). Only the font *family* is the
  single cascaded `mainFontFamily`.
- **Selection by pick type** — single-pick: selected option FILLED (`buttonsBackground` bg + `buttonsTitle`
  text). Multi-pick: selected option = `buttonsBackground` BORDER + filled checkbox (no fill, no text
  recolor). There is no separate "selected color" token.
- **Paywall** — reproduce the close "X" (it maps to `paywall.closeButton`); record the purchase-CTA
  radius/height/insets under `geometry.actionBar.primaryButton`. Paywall still renders no standalone action bar.
- **One slot per observable** — list/grid cell corner → `optionsList.itemRadius`; media corner →
  `media.cornerRadius`; grid ~1:1 aspect → `optionsList.cellHeightFromCellWidth` (e.g. `1.0`). Report
  raw measured spacing/insets — do not snap to the 4/8/16/24/32 scale.
- **Featured media is contained**, never a full-bleed background; a full-bleed photo → omit `background` + warn.
- **OMIT unobservable keys** — never emit `null`. Emit the OBSERVED color even if near a default.
- **Single-token couplings** (`buttonsTitle`, `buttonsBackground`, subtitle opacity) cannot express two
  simultaneous states — emit the dominant value and WARN; do not invent extra tokens.

### B4 — Apply (free-form shape)

The free-form shape does **not** go through `design apply` (that consumes `--tv-*` vars). Apply it
via the projection bridge: build a theme artifact → `themes create-from-figma`
([import-native-theme.md](import-native-theme.md) Step 2–3). State this boundary so the user isn't
surprised the theme wasn't updated in place.

---

## Verification

- **Mode A:** clean bundle → `design extract --baseline` returns 0 diffs; after an edit, exactly the
  edited vars appear with correct scope; `unknownVars`/`conflicts` behave; `apply --dry-run` shows
  only intended fields; re-snapshot after apply re-exports the new value (round-trip byte-stable for
  scalar tokens).
- **Mode B:** pushed cards appear under `Colors`/`Type`/`Spacing`/`Components`/`Screens`; extraction
  JSON validates (hex/number/insets) and contains no invented tokens; each token traces to a knob in
  the design-system spec.

Keep the pushed card set and the how-to-edit contract aligned with the design-system spec. If a
customer has a newer design-system export, snapshot from that theme instead of editing values by hand.
