# Visual Parity And Interaction Debugging

Use this reference after CLI apply, healthcheck, audit, publish, and publish
verify have succeeded. This is a verification/debugging layer, not a deployment
mechanism.

For multi-screen Figma handoffs, this post-publish pass is not the first visual
check. The import skill must already have produced a passing
`checks/pilot-report.json` from one generated HTML render screenshot before the
remaining screens were processed or applied.

## Inputs

Required artifacts:

- `custom-screen-catalog.json`;
- `checks/pilot-report.json` for multi-screen Figma handoffs;
- `screens/<screenId>/updated/interaction-map.json`;
- Figma baseline evidence from the import run:
  - `screens/<screenId>/figma-screenshot.json`, or
  - `screens/<screenId>/figma-screenshot.png`, or
  - a screenshot URL captured from Figma MCP;
- published onboarding URL returned by `publish web`;
- expected screen order or `flow-interaction-map.json`.

## Test ID Map

Every converted screen must provide an interaction map before publish:

```json
{
  "schemaVersion": "webembed-interaction-map/v1",
  "screenId": "S001",
  "elements": [
    {
      "role": "primary",
      "testId": "screen-S001-primary",
      "selector": "[data-testid=\"screen-S001-primary\"]",
      "action": { "type": "navigateNext" }
    }
  ]
}
```

The full-flow handoff should aggregate per-screen maps into
`checks/flow-interaction-map.json`. Prefer `data-testid` selectors for smoke
navigation and interaction checks. Do not rediscover click targets from visible
text when an interaction map exists.

## Visual Baseline

For each screen, create a baseline entry in `checks/visual-baseline.json`:

```json
{
  "schemaVersion": "webembed-visual-baseline/v1",
  "screens": [
    {
      "screenId": "S001",
      "figmaNodeId": "2061:3608",
      "baseline": "screens/S001/figma-screenshot.png",
      "viewport": { "width": 402, "height": 868 }
    }
  ]
}
```

If only a Figma screenshot URL is available, store the URL and timestamp. The
URL may expire, so prefer saving a local screenshot file when possible.

## Published Visual Check

After `publish verify`, open the published URL in a browser runner and capture
published screenshots into:

```text
checks/visual/
  S001-published.png
  S001-diff.json
  S002-published.png
  S002-diff.json
```

Use the same mobile viewport as the Figma frame when possible. Compare:

- screen bounds and background;
- status/header/footer placement;
- CTA vertical position stability;
- visible copy text and line breaks;
- card and option positions;
- media/image presence;
- paywall product card layout.

The first pass may be manual visual inspection. If pixel comparison tooling is
available, record numeric diff metrics in `Sxxx-diff.json`. Either way, write a
human-readable `checks/visual-report.json`.

## Debug Loop

For each mismatch:

1. Patch only `screens/<screenId>/updated/index.html` or
   `updated/data-sources.json`.
2. Re-run `funnels custom-screen apply` for that one screen.
3. Re-run its healthcheck.
4. Re-publish or re-verify the published URL.
5. Capture a new screenshot and update `checks/visual-report.json`.

Do not change unrelated screens during visual debugging.

## Blocking Rules

- Do not publish a Figma-generated flow when any screen lacks complete
  `layoutSource`.
- Do not start post-publish visual parity for a multi-screen Figma handoff when
  the one-screen pilot report is missing or failed.
- Healthcheck success only proves runtime validity; it does not prove visual
  acceptance.
- Do not accept a screen when required clickable elements are missing
  `data-testid` attributes.
- Do not accept paywall visual parity without checking non-iframe render mode
  and ProductCatalog-backed product text/prices.
