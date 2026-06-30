---
name: segmently-cli-custom-screen-guide
description: Segmently CLI guide for reading, updating, applying, and validating V2 WebEmbed custom screens. Use when migrating hardcoded WebEmbed HTML to data sources, routing Button and SingleSelectionList child data-source actions through graph edges, reproducing screenshot references as WebEmbed custom screens, checking variables inside custom screens, updating callback fallback edges, verifying shadow-DOM render correctness, migrating images, converting legacy custom-screen APIs, or converting paywalls to ProductCatalog-driven custom screens through the Segmently CLI.
---

# Segmently CLI Custom Screen Guide

Use this skill for CLI-first work on Segmently V2 WebEmbed custom screens. The
skill is about artifact-safe updates, not visual redesign. It works with
existing funnels, Figma-generated WebEmbed artifacts, and screen-by-screen
custom HTML migrations.

## Scope

Use this skill when the task involves:

- fetching existing WebEmbed custom screens;
- moving hardcoded text, options, images, or products into data sources;
- routing CTA and single-choice interactions through `Button` and
  `SingleSelectionList` child data-source action edges;
- applying HTML and `LayoutSection[]` data sources with the CLI;
- reproducing one or more WebEmbed screens from screenshot references as
  editable HTML/data-source artifacts;
- publishing Figma-generated WebEmbed handoff catalogs into a real dev/test
  funnel end to end;
- enforcing the one-screen Figma pilot gate before a multi-screen handoff is
  applied or published;
- validating interactive header controls, footer behavior, and `data-testid`
  based interaction maps generated from Figma;
- capturing published screenshots and comparing them to Figma baseline evidence
  during visual parity debugging;
- checking variable reads/writes, child action edges, and callback fallback
  edges;
- migrating custom paywalls to `ProductCatalog`;
- verifying shadow-DOM (paywall, `--iframe false`) render correctness — fonts loaded
  from `document.head` and full-page scroll/sticky behavior, which healthcheck does not
  cover;
- running per-screen healthcheck, image scan, funnel audit, publish, and verify.

Do not use this skill for ordinary editor UI automation, generic React
development, Figma extraction, or ordinary V2 StepNode screen migrations such as
`ListMultiPick -> ListSinglePick` or background replacement on non-WebEmbed
screens. For those screen-level operations, use `segmently-cli-guide` and the
`funnels screens list|get|inspect|clone|patch|rewire|delete` workflow. For
Figma source work, use
`segmently-cli-figma-webembed-import` first, then return here for CLI apply and
healthcheck.

## Default Transformation Model

Treat every source material the same way first: existing HTML, screenshot,
Figma handoff, imported artifact, or legacy custom-screen code must become a
WebEmbed API artifact with HTML, editor-owned data sources, optional variables,
and graph edges. The source may differ; the target contract is the same.

The custom screen runtime API can:

- initialize only after `segmentlySDK.ready()`;
- read editor-owned child data sources with `getChildSection*()` helpers;
- read, write, define, and observe funnel variables with `getVariable()`,
  `setVariable()`, `getVariableDefinition()`, and variable listeners;
- start editor-managed transitions with `triggerButtonAction()` and
  `triggerOptionAction()`;
- use `navigateNext()` / `navigateBack()` for whole-screen fallback navigation;
- read products, prices, selection, and purchase helpers for custom paywalls.

Use `references/sdk-minimal.md` for snippets used in CLI artifacts. When the
task depends on a runtime API detail that is not covered there, treat the gap as
unsupported by this packaged skill and ask the user for relevant public Segmently API documentation or a concrete exported screen example.

## Core Workflow

1. Identify `projectId`, `funnelId`, and `versionId`.
2. Export the funnel version:
   ```bash
   segmently funnels export <funnelId> <versionId> <projectId> --output <run-dir>/flow.export.json
   ```
3. Build or update `custom-screen-catalog.json`. See
   `references/artifact-contract.md`.
4. For each WebEmbed screen, fetch the source state:
   ```bash
   segmently funnels custom-screen get <funnelId> <versionId> <screenId> <projectId>
   ```
5. Save original HTML and data sources before editing.
6. Draft only the minimum HTML/data-source changes needed for the requested
   migration.
7. Use data-source-driven branching by default:
   - CTA or continue controls: create a `Button` child data source and call
     `segmentlySDK.triggerButtonAction(labelOrId)`.
   - Single-choice routing: create a `SingleSelectionList` child data source
     and call `segmentlySDK.triggerOptionAction(labelOrId, optionIdOrIndex)`.
   - Graph edges should use `section.{childSectionId}.button` and
     `section.{childSectionId}.item.{index}`.
   - Use `embed.callback` / `navigateNext()` only for whole-screen
     fallback/continue behavior or legacy-compatible flows.
8. If variables are added or changed, run:
   ```bash
   segmently funnels variables apply <projectId> --funnel <funnelId> --version-id <versionId> --file <variables.json> --dry-run
   ```
9. Apply one screen at a time:
   ```bash
   segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
     --screen <screenId> \
     --html-file <screen-dir>/updated/index.html \
     --data-sources-file <screen-dir>/updated/data-sources.json \
     --position <x,y>
   ```
   `--position` is optional on update. Pass it when the catalog owns the canvas
   layout; omit it to preserve the current screen position.
10. Run healthcheck immediately after each applied screen:
   ```bash
   segmently funnels custom-screen healthcheck <funnelId> <versionId> <screenId> <projectId>
   ```
11. Fix missing SDK refs, missing variable refs, empty data sources, and missing
    `boundSectionId` selection backing before moving to the next screen.
12. Run final audit and publish/verify only after all screen checks pass.

## Minimal HTML Edit Rule

When updating an existing WebEmbed, preserve the user's screen exactly unless a
specific behavior must change.

Allowed by default:

- add small SDK content-binding helpers;
- replace specific text reads with data source reads;
- add stable `data-*` markers only when needed;
- add stable `data-testid` attributes to clickable elements when building or
  preserving an interaction map;
- update image URLs through `scan-images`;
- adapt fixed-frame geometry for the variable funnel viewport (e.g. a fixed-height
  box around a `width:100%` chart/image → `aspect-ratio`) — see
  `references/responsive-adaptation.md`;
- preserve CSS, DOM order, classes, animation, and event handlers.

Avoid by default:

- reformatting or reserializing the entire HTML document;
- changing layout wrappers, CSS selectors, or class names;
- replacing static layout with a generated component tree;
- changing navigation, selection, or purchase logic outside the requested
  migration;
- adding new callback routing when a `Button` or `SingleSelectionList` child
  data-source action edge can express the same branch;
- changing variable IDs or option values without checking callback conditions.

When a custom screen includes header back/skip/close controls, verify that they
are real interactive controls with SDK-backed behavior. Passive visual elements
such as `<span>` are not enough for generated screens.

## Responsive Adaptation & Hardcode Judgment

Imported designs come from a **fixed-width frame** (Figma board / Claude Design
canvas, ~322–402px); WebEmbed screens render in a **variable-width iframe**. Adapt
the geometry that would overflow, but change as little as possible so the screen
stays visually identical to the design.

- **The common trap:** a fixed-height container around a `width:100%` SVG/image
  overflows at a wider viewport and its internal/absolute labels overlap the next
  element. Fix the box with `aspect-ratio: W / H` (+ child `height:100%`), never a
  fixed pixel height or `max-height` cap.
- Keep the design's spacing, radii, typography, colors, and proportions **verbatim** —
  only swap the dimension units that break. Never hardcode the design frame width as a
  content width; use `%` / `max-width` / flex.
- **Hardcode is appropriate** for decoration/brand/structure and the visual system
  (paddings, radii, fonts, colors). It is **NOT** appropriate for user-facing
  copy/media/products (→ data sources, per `hardcoded-to-data-sources.md`) or for fixed
  geometry that should scale (→ responsive units).
- **Verify visual parity at the funnel's REAL viewport width** (wider than the design
  frame), not only at the design frame width.

Full rules and the worked example: `references/responsive-adaptation.md`.

## References & workflow routing

Two layers: read the **baseline** for any task, then load **one** case-specific reference
only when its trigger applies. The base-rule sections above — Core Workflow, Minimal HTML
Edit Rule, Responsive Adaptation & Hardcode Judgment, Safety Rules, Verification — also
apply to every task.

### Always read (baseline — any task)

- `references/commands.md` — exact CLI commands, flags, and expected files.
- `references/artifact-contract.md` — catalog schema, run-dir layout, status, render-mode
  fields (`isIframe` / `renderMode`), and the interaction-map contract.
- `references/sdk-minimal.md` — minimal `segmentlySDK` snippets (`getChildSection*`,
  variables, child action routing, fallback navigation, products).
- `references/hardcoded-to-data-sources.md` — the core migration: Text / BulletList /
  Button / SingleSelectionList / Media / ProductCatalog mapping + the minimal binding
  pattern.
- `references/variables-routing.md` — variables, selection backing (`boundSectionId`),
  enum/option IDs, child action edges, callback fallback edges, and `variables apply`.
- `references/responsive-adaptation.md` — worked example for the Responsive Adaptation &
  Hardcode Judgment rule above (fixed-frame → variable funnel viewport).
- `references/visual-parity.md` — post-publish screenshot comparison + `data-testid` smoke
  navigation; run after publish to prove the screen matches its source.

### Load for the case (workflow coordinator)

Load the one row that matches the task; skip the rest.

| When the task involves… | Read | It covers |
|---|---|---|
| converting a paywall to real checkout | `references/paywall.md` **+** `references/shadow-dom-rendering.md` | `ProductCatalog` / `getProducts` / `purchaseProduct`, apply with `--iframe false`; plus the shadow-DOM render rules |
| a shadow-DOM (`--iframe false`) screen whose fonts don't load or that won't scroll | `references/shadow-dom-rendering.md` | load fonts from `document.head`; drop `min-height:100vh` / `overflow:hidden` viewport-pinning; post-publish render check |
| local or temporary image paths that need CDN upload + rewrite | `references/image-migration.md` | `scan-images` dry-run → upload → safe rewrite |
| screenshot references that must become WebEmbed screens | `references/screenshot-webembed-workflow.md` | screenshot source analysis, editable HTML/data-source recreation, interaction map, CLI apply/publish, and browser smoke |
| migrating an old/legacy custom-screen API | `references/legacy-migration.md` | old → new SDK call map; keep legacy transformations out of the default workflow |
| the source is a Figma handoff catalog (`custom-screen-catalog.json`) | `references/figma-handoff-full-flow.md` | gates → create → apply per screen (`--create` / `--position`) → `funnels audit` → `publish web` → `publish verify` → parity; full procedure + `scripts/apply-handoff-full-flow.mjs` |

### Figma source only — sibling skill `segmently-cli-figma-webembed-import`

Load only when applying or publishing a Figma handoff:

- `../segmently-cli-figma-webembed-import/references/pilot-gate.md` — required one-screen
  pilot report before a multi-screen batch.
- `../segmently-cli-figma-webembed-import/scripts/stabilize-media-assets.mjs` — Figma Media
  → CDN stabilization before apply.
- `../segmently-cli-figma-webembed-import/scripts/enforce-project-profile.mjs` —
  device-chrome / footer-CTA project-profile enforcement.

## Safety Rules

- Never print tokens, API keys, refresh tokens, or customer credentials.
- Do not write directly to Firestore or private backend collections.
- Do not rely on browser/editor automation for apply or validation.
- Browser automation is allowed only after CLI publish for visual parity and
  `data-testid` smoke checks against the published URL.
- Do not apply or publish a multi-screen Figma handoff when the one-screen pilot
  report is missing or failed.
- Do not apply multiple risky screens before checking each one.
- Do not invent data-source labels that differ from HTML SDK references.
- Treat Text data sources as title-only unless the exported data proves a
  richer shape is supported.

## Verification

Minimum local skill checks:

```bash
node <skill-root>/scripts/run-evals.mjs
```

Operational funnel checks:

```bash
segmently funnels custom-screen healthcheck <funnelId> <versionId> <screenId> <projectId>
segmently funnels audit <funnelId> <versionId> <projectId>
segmently publish web <projectId> --funnel <funnelId> --version-id <versionId>
segmently publish verify <projectId> --url <path-or-url>
```

`healthcheck` and `publish verify` prove runtime validity, not visual fidelity. After
publish, run the visual-parity pass (`references/visual-parity.md`); for any `--iframe
false` paywall, also run the shadow-DOM render check (`references/shadow-dom-rendering.md`).
