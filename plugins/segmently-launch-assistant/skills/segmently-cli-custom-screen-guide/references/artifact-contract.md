# Custom Screen CLI Artifact Contract

Use `custom-screen-catalog.json` as the durable state file for screen-by-screen
work. The same contract is used for existing funnel migrations and for Figma
imports handed off from `segmently-cli-figma-webembed-import`.

## Catalog Shape

```json
{
  "schemaVersion": "custom-screen-cli-catalog/v1",
  "source": {
    "kind": "funnel",
    "projectId": "<projectId>",
    "funnelId": "<funnelId>",
    "versionId": "<versionId>"
  },
  "outputDir": "<run-dir>",
  "createdAt": "<iso-date>",
  "screens": [
    {
      "id": "<screenId>",
      "name": "<screenName>",
      "screenType": "WebEmbed",
      "status": "drafted",
      "statusHistory": ["pending", "fetched", "analyzed", "drafted"],
      "original": {
        "getFile": "screens/<screenId>/original/get.json",
        "htmlFile": "screens/<screenId>/original/index.html",
        "dataSourcesFile": "screens/<screenId>/original/data-sources.json"
      },
      "updated": {
        "htmlFile": "screens/<screenId>/updated/index.html",
        "dataSourcesFile": "screens/<screenId>/updated/data-sources.json",
        "edgesFile": "screens/<screenId>/updated/edges.json",
        "variablesFile": "screens/<screenId>/updated/variables.json",
        "interactionMapFile": "screens/<screenId>/updated/interaction-map.json"
      },
      "checks": {
        "applyResultFile": "screens/<screenId>/checks/apply-result.json",
        "healthcheckFile": "screens/<screenId>/checks/healthcheck.json",
        "imageScanFile": "screens/<screenId>/checks/image-scan.json"
      },
      "screenKind": "webembed-screen",
      "renderMode": "iframe",
      "isIframe": true,
      "position": { "x": 0, "y": 0 },
      "changePolicy": "minimal-html-diff",
      "attempts": 1,
      "error": null
    }
  ],
  "statistics": {
    "total": 1,
    "pending": 0,
    "drafted": 1,
    "applied": 0,
    "failed": 0
  }
}
```

For Figma handoff catalogs, the root may also include:

```json
{
  "projectProfileFile": "project-profile.json"
}
```

The project profile records reusable Figma-to-WebEmbed design-system decisions
such as status bar handling, footer CTA behavior, header action behavior, and
test id patterns. Treat the profile as input metadata; do not change it during
apply unless the user explicitly asked to save new defaults.

## Directory Layout

```text
<run-dir>/
  custom-screen-catalog.json
  flow.export.json
  variables.json
  screens/
    <screenId>/
      original/
        get.json
        index.html
        data-sources.json
      updated/
        index.html
        data-sources.json
        edges.json
        variables.json
        interaction-map.json
      checks/
        image-scan.json
        apply-result.json
        healthcheck.json
        visual-baseline.json
        flow-interaction-map.json
        visual-report.json
        visual/
          <screenId>-published.png
          <screenId>-diff.json
      assets/
        manifest.json
```

## Statuses

For existing funnel updates:

```text
pending
fetched
analyzed
drafted
variables-dry-run-passed
applied
healthcheck-passed
healthcheck-warning
failed
skipped
```

For Figma-generated artifacts handed off to this skill:

```text
ready-for-cli-apply
applied
healthcheck-passed
healthcheck-warning
failed
skipped
```

Update `statusHistory` every time a status changes. Keep failed screens in the
catalog with `error` populated so the run can resume screen by screen.

## Render Mode

Use these catalog fields consistently:

- `screenKind: "webembed-screen"` with `renderMode: "iframe"` and
  `isIframe: true` for ordinary WebEmbed screens unless the source screen
  already uses shadow DOM.
- `screenKind: "webembed-paywall"` with `renderMode: "shadow-dom"` and
  `isIframe: false` for Web Embedded Paywalls.

When applying a paywall screen, pass `--iframe false` explicitly. Do not rely on
the CLI default.

## Canvas Position

For Figma handoff catalogs, each screen should include a `position` when source
coordinates or calculated layout are available. If positions are missing, the
full-flow script must assign deterministic positions, such as a horizontal row.

When screens are created through `funnels custom-screen apply --create`, do not
assume the editor canvas will lay them out automatically. Prefer passing the
catalog position directly with `funnels custom-screen apply --position <x,y>`.
Position is optional for updates; omit it to preserve the existing canvas
layout. Use graph dry-run/apply with a generated layout manifest only as a
compatibility fallback when the target CLI does not support direct position
updates, so the canvas shows all screens instead of overlapping them at
`{ "x": 0, "y": 0 }` (`x:0,y:0`).

## Interaction Map

Generated WebEmbed screens should include
`updated/interaction-map.json`. The map lists the clickable elements, their
stable `data-testid` selectors, and expected SDK or routing behavior. Example:

```json
{
  "schemaVersion": "webembed-interaction-map/v1",
  "screenId": "S001",
  "elements": [
    {
      "role": "back",
      "testId": "screen-S001-back",
      "selector": "[data-testid=\"screen-S001-back\"]",
      "action": { "type": "navigateBack" }
    },
    {
      "role": "primary",
      "testId": "screen-S001-primary",
      "selector": "[data-testid=\"screen-S001-primary\"]",
      "action": { "type": "navigateNext" }
    }
  ]
}
```

The HTML must contain matching `data-testid` attributes. Every selector must be
unique within the screen. If a source screen has repeated labels, preserve the
visible labels but use deterministic ordinal suffixes in `data-testid`,
`data-value`, and the interaction map. During smoke checks, prefer clicking
these selectors instead of fuzzy text selectors.

The full-flow verification should also aggregate interaction maps into
`checks/flow-interaction-map.json` so published smoke tests can navigate the
flow using stable selectors only.

## Visual Parity

Figma handoff runs should preserve baseline evidence and published screenshots:

- `checks/visual-baseline.json` maps each screen to its Figma screenshot
  evidence and viewport.
- `checks/visual/<screenId>-published.png` stores the post-publish screenshot.
- `checks/visual/<screenId>-diff.json` stores manual or numeric diff findings.
- `checks/visual-report.json` summarizes accepted screens and mismatches.

Visual parity is required after publish verification. Healthcheck success only
proves runtime validity; it does not prove the screen matches the Figma source.

## Header And Footer Behavior

For Figma-generated screens, do not invent runtime behavior during apply. The
Figma import catalog must already resolve:

- `conversionDecisions.statusBar`;
- `conversionDecisions.footerCta`;
- `conversionDecisions.headerActions`.

If any detected decision is unresolved, stop before apply and ask the user. For
header actions, generated back/skip/close controls must be wired to the
recorded SDK action or target route. For footer CTAs marked `sticky-footer` or
`fixed-outside-scroll`, verify that the CTA's vertical position is stable across
screens with different content heights.

When `conversionDecisions.statusBar.decision` is `omit`, treat the whole Figma
device preview chrome as excluded from the runtime screen. This includes the
top status bar, browser/notch controls, the bottom iOS home indicator stripe,
and decorative footer preview strips. The handoff catalog should have
`checks.projectProfileEnforcementFile` pointing to
`checks/project-profile-enforcement.json`, and the corresponding
`updated/data-sources.json` files must not contain runtime `Media` sections for
that chrome.

## Resume Rules

- Do not re-fetch a screen already marked `fetched` unless the source funnel
  changed.
- Do not reapply a screen already marked `healthcheck-passed` unless its
  `updated/*` files changed.
- If healthcheck returns warnings, mark `healthcheck-warning` and decide whether
  the warning is acceptable before moving on.
- If a screen fails after apply, keep the original files intact and patch only
  `updated/*`.
