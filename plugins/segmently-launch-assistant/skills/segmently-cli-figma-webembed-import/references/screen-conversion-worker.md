# Screen Conversion Worker

Use this instruction for converting one already-extracted Figma frame into one
WebEmbed screen artifact set.

This file is the source of truth for layout conversion. The worker owns the
screen's HTML structure and visual fidelity. It must understand the custom
screen runtime rules before writing HTML, but it does not apply anything to a
funnel.

## Required Skill Composition

Before converting a screen, load and follow these custom-screen skill references:

- `../segmently-cli-custom-screen-guide/references/sdk-minimal.md` for SDK
  access patterns;
- `../segmently-cli-custom-screen-guide/references/hardcoded-to-data-sources.md`
  for moving copy/media/options into data sources;
- `../segmently-cli-custom-screen-guide/references/paywall.md` when
  `screenKind` is `webembed-paywall`;
- `../segmently-cli-custom-screen-guide/references/variables-routing.md` when
  the screen reads or writes variables;
- `../segmently-cli-custom-screen-guide/references/image-migration.md` when
  local or Figma asset files must become CDN-backed media data sources.

The Figma skill decides how to interpret the source layout. The custom-screen
skill decides what WebEmbed HTML, SDK bindings, data sources, paywall behavior,
variables, and healthcheck rules are valid.

The worker operates on exactly one screen directory and must not write shared
files such as `figma-catalog.json`, `custom-screen-catalog.json`, or
`project-profile.json`. The main agent merges statuses after workers finish.

## Inputs

Required files:

- `work-items/<screenId>.json`;
- `screens/<screenId>/figma-screenshot.png`;
- `screens/<screenId>/assets/manifest.json`;
- one complete layout source:
  - `screens/<screenId>/figma-design-context.json`, or
  - `screens/<screenId>/figma-node.json` containing a full measured node tree,
    or
  - `screens/<screenId>/original/index.html` for existing-HTML minimal edits.

Optional files:

- `screens/<screenId>/figma-node-summary.json` for text/media inventory;
- `project-profile.json` for already-approved status bar, footer, and header
  action decisions.

The work item must provide or resolve:

```json
{
  "screenId": "S001",
  "screenKind": "webembed-screen",
  "renderMode": "iframe",
  "isIframe": true,
  "figmaNodeId": "1:2033",
  "layoutSource": {
    "kind": "figma-design-context",
    "status": "complete",
    "file": "screens/S001/figma-design-context.json"
  },
  "conversionDecisions": {
    "statusBar": { "detected": true, "decision": "include" },
    "footerCta": { "detected": true, "decision": "sticky-footer" },
    "headerActions": {
      "detected": true,
      "decision": {
        "back": { "action": "navigateBack" },
        "skip": { "action": "navigateNext" }
      }
    }
  }
}
```

If `screenKind`, `renderMode`, or `isIframe` is absent, classify the screen
before conversion. A Web Embedded Paywall must become:

```json
{
  "screenKind": "webembed-paywall",
  "renderMode": "shadow-dom",
  "isIframe": false
}
```

## Non-Negotiable Gate

If the worker does not have a complete layout source, it must stop and write:

```json
{
  "status": "needs-layout-source",
  "error": "Missing complete Figma design context or full node tree."
}
```

Do not generate publishable HTML from:

- screenshots;
- compact text summaries;
- human summaries such as "Key content includes" or "Visible content";
- image refs only;
- a reusable onboarding template;
- visual guesses.

Screenshots are visual evidence only. They are not layout source.

Truncated MCP transcripts are incomplete layout sources. A screen whose
`figma-design-context.json` or `figma-node-tree.json` explicitly says
`truncated`, `omitted`, or `partial` must remain `needs-layout-source`.
Likewise, a file that only describes visible content or preview observations is
not a complete layout source even if the catalog status says `complete`.

## Output Files

The worker writes only:

- `screens/<screenId>/updated/index.html`;
- `screens/<screenId>/updated/data-source-plan.json`;
- `screens/<screenId>/updated/interaction-map.json`;
- `screens/<screenId>/checks/visual-baseline.json`;
- `screens/<screenId>/conversion-status.json`;
- `work-items/<screenId>.json`.

The materializer later converts `data-source-plan.json` or `dataSourcePlan` into
`updated/data-sources.json`. The worker may also write
`updated/data-sources.json` for local preview, but the materializer remains the
canonical producer for CLI apply.

### `updated/index.html`

Expected properties:

- complete standalone HTML document;
- source-frame layout preserved from `layoutSource`;
- scoped CSS with no external runtime dependencies;
- `segmentlySDK` bindings for all runtime copy/media/options/products;
- fallback values allowed only for local preview;
- real clickable elements for back, skip, CTA, options, and products;
- stable `data-testid` on every clickable element.

The HTML must not contain final hardcoded user-facing content as the only
runtime source. It may contain fallback values, but the production path must
read from the generated data sources.

### `updated/data-source-plan.json`

Expected shape:

```json
[
  { "kind": "Text", "label": "Headline", "text": "Welcome" },
  {
    "kind": "SingleSelectionList",
    "label": "Goal Options",
    "items": [
      {
        "id": "feel_confident",
        "title": "Feel confident",
        "subtitle": "In what I wear",
        "variableValue": "feel_confident"
      }
    ]
  },
  {
    "kind": "Media",
    "label": "Hero Image",
    "url": "https://cdn.example/hero.png",
    "mediaType": "image"
  }
]
```

Every visible text string and every replaceable visual asset must be present.
For paywalls, add a `ProductCatalog` plan item and keep price/product identity
out of hardcoded HTML when SDK product APIs can provide it.

### `updated/interaction-map.json`

Expected shape:

```json
{
  "schemaVersion": "webembed-interaction-map/v1",
  "screenId": "S001",
  "elements": [
    {
      "role": "primary",
      "testId": "screen-S001-primary",
      "selector": "[data-testid=\"screen-S001-primary\"]",
      "action": "sdk.navigateNext"
    }
  ]
}
```

Selectors and `testId` values must be unique within the screen.

### `checks/visual-baseline.json`

Expected shape:

```json
{
  "schemaVersion": "webembed-screen-visual-baseline/v1",
  "screenId": "S001",
  "figmaNodeId": "2061:3608",
  "viewport": { "width": 402, "height": 868 },
  "baseline": {
    "kind": "figma-mcp-screenshot",
    "file": "screens/S001/figma-screenshot.png"
  }
}
```

This file is consumed by the custom-screen handoff skill after publish. It is
not a layout source and must not be used to generate HTML.

### `conversion-status.json`

Expected success shape:

```json
{
  "screenId": "S001",
  "status": "converted",
  "layoutSource": {
    "kind": "figma-design-context",
    "status": "complete",
    "file": "screens/S001/figma-design-context.json"
  },
  "outputs": {
    "html": "screens/S001/updated/index.html",
    "dataSourcePlan": "screens/S001/updated/data-source-plan.json",
    "interactionMap": "screens/S001/updated/interaction-map.json"
  }
}
```

Failure statuses must explain the blocker:

- `needs-layout-source`;
- `needs-user-decision`;
- `failed-conversion`;
- `failed-validation`.

## Algorithm

1. Load the work item and resolve paths relative to the run directory.
2. Validate `layoutSource.status === "complete"` and `layoutSource.kind` is one
   of:
   - `figma-design-context`;
   - `figma-node-tree`;
   - `existing-html-minimal-edit`.
3. Load `conversionDecisions`. If status bar/device chrome, footer CTA, or
   header actions are detected but unresolved, set `needs-user-decision` and
   stop. When `statusBar.decision` is `omit`, do not render the top status bar,
   browser/URL chrome, notch controls, bottom home indicator stripe, or
   decorative footer preview strip, and do not create Media data sources for
   those preview elements.
4. Reconstruct the screen from the layout source:
   - preserve major layer hierarchy and order;
   - preserve frame dimensions and responsive aspect constraints;
   - preserve text/card/media positions from measured bounds;
   - preserve fills, strokes, radii, typography, spacing, and image placement
     as far as the source provides them.
5. Extract every user-visible text into a `Text`, selection-list, bullet-list,
   or `ProductCatalog` plan item.
6. Extract every replaceable visual asset into a `Media` plan item. Runtime
   image URLs must come from data sources; local asset paths are preview
   fallbacks only.
7. Replace runtime copy/media reads with `segmentlySDK` child-section bindings:
   - `getChildSectionText(label).title`;
   - `getChildSectionMedia(label).url`;
   - `getChildSection(label).data.options` or equivalent selection-list data.
8. Add real interactive controls for detected click targets:
   - back/skip/close buttons;
   - primary and secondary CTAs;
   - options;
   - product cards and purchase buttons.
9. Add stable `data-testid` values to every clickable element and record them
   in `interaction-map.json`.
10. For `webembed-paywall`, set `screenKind: "webembed-paywall"`,
    `renderMode: "shadow-dom"`, and `isIframe: false`. Product identity/pricing
    must be backed by `ProductCatalog` and product SDK calls.
11. Mark the work item `converted` only after `index.html`,
    `data-source-plan.json`, and `interaction-map.json` exist and pass local
    checks.
12. Write `checks/visual-baseline.json` so published screenshots can be
    compared against the Figma source after CLI publish.

## Minimal-Edit Rule For Existing HTML

When the source is `existing-html-minimal-edit`, preserve DOM structure, CSS,
classes, event handlers, and layout. Only replace hardcoded text/media/product
values with data-source bindings and add missing `data-testid` attributes.

## Acceptance Criteria

The worker output is acceptable only if:

- it is visibly recognizable as the source Figma frame;
- the first viewport matches the source hierarchy and spacing within normal
  responsive tolerance;
- no major layout has been replaced by a generic template;
- every visible text string is represented in the data-source plan;
- every replaceable image/video/icon/background is represented in the
  data-source plan;
- every clickable element has a unique `data-testid` and an interaction-map
  entry;
- visual baseline evidence exists for post-publish comparison;
- paywalls are classified as non-iframe WebEmbed paywalls;
- the screen can be materialized by the CLI materializer.

If any of these fail, keep the status below `converted`.
