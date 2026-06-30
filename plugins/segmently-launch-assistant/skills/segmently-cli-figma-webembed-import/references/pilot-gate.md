# One-Screen Pilot Gate

Use this gate before processing a multi-screen Figma import in bulk. The goal
is to prove the conversion strategy on one screen before it can damage many
screens with the same wrong assumption.

## When Required

Run the pilot gate when:

- the user asks to import or publish more than one Figma screen;
- a previous import produced visual drift;
- the project profile has new status bar, footer, header action, media, or
  data-source decisions;
- the conversion worker or materializer changed.

For a single-screen task, still run the same checks, but there is no remaining
batch to unblock.

## Pilot Selection

Choose one screen and record why it was chosen:

- default: the first screen in user-approved screen order;
- stronger choice: the first screen that contains media plus real interactive
  controls;
- paywall choice: if the first risky screen is a Web Embedded Paywall, load the
  custom-screen paywall reference and classify it as `isIframe: false` before
  conversion.

Do not use a screenshot-only or generic template pilot. The pilot must use the
same complete layout source contract as every later screen.

## Required Checks

The pilot passes only when all checks pass:

- `updated/index.html`, `updated/data-source-plan.json`,
  `updated/data-sources.json`, and `updated/interaction-map.json` exist;
- every visible text string is represented by a Text, list, selection, or
  ProductCatalog-backed data source;
- every user-facing image, video, icon, thumbnail, or background asset is
  represented by a Media or ProductCatalog-backed data source;
- production HTML reads copy and media through `segmentlySDK`
  child-section helpers, not as final hardcoded runtime content;
- hardcoded runtime asset URLs are absent from HTML. Local preview fallbacks are
  allowed only when they are not the production source of truth and are reported
  in the pilot report;
- every clickable element has a stable `data-testid` and an
  `interaction-map.json` entry;
- a local render screenshot was captured from the generated HTML using
  `scripts/render-local-webembed.mjs`, with a mock SDK backed by
  `updated/data-sources.json`;
- the local render report has `metrics.deviceChrome.nodeCount === 0` when
  `conversionDecisions.statusBar.decision` is `omit`;
- the render screenshot was compared with the Figma baseline screenshot;
- any mismatch has an owner decision: fix now, accepted tolerance, or blocker.

## Report

Write the report to:

```text
checks/pilot-report.json
```

Expected shape:

```json
{
  "schemaVersion": "figma-webembed-pilot-report/v1",
  "screenId": "S001",
  "status": "passed",
  "chosenBecause": "first screen with text, media, and primary CTA",
  "artifacts": {
    "html": "screens/S001/updated/index.html",
    "dataSources": "screens/S001/updated/data-sources.json",
    "interactionMap": "screens/S001/updated/interaction-map.json",
    "figmaScreenshot": "screens/S001/figma-screenshot.png",
    "renderScreenshot": "checks/pilot/S001-render.png",
    "renderReport": "checks/pilot/S001-render.json"
  },
  "dataSourceCoverage": {
    "text": { "expected": 4, "actual": 4, "missing": [] },
    "media": { "expected": 12, "actual": 12, "missing": [] }
  },
  "htmlRuntimeScan": {
    "usesSdkText": true,
    "usesSdkMedia": true,
    "hardcodedRuntimeAssetUrls": []
  },
  "renderMetrics": {
    "deviceChromeNodeCount": 0,
    "footerStable": true,
    "brokenRuntimeImages": []
  },
  "interactionMap": {
    "clickableCount": 2,
    "missingTestIds": [],
    "duplicateTestIds": []
  },
  "visualComparison": {
    "method": "pixel-or-manual",
    "status": "passed",
    "notes": []
  },
  "batchGate": {
    "remainingScreensMayProcess": true,
    "existingBatchArtifactsUsable": true
  }
}
```

Use `status: "failed"` when any blocker remains and set
`batchGate.remainingScreensMayProcess` to `false`. If screens were already
converted before the pilot found a reusable issue, set
`batchGate.existingBatchArtifactsUsable` to `false` until those screens are
regenerated with the pilot lessons applied.

## Debug Loop

When the pilot fails:

1. Patch only the pilot screen output or the reusable project profile decision
   that caused the failure.
2. Re-materialize only the pilot.
3. Re-render the pilot screenshot with the same mock SDK.
4. Re-run the data-source and hardcoded asset checks.
5. Update `checks/pilot-report.json`.

Do not process remaining screens until the report passes.

## Handoff Rule

`segmently-cli-custom-screen-guide` should reject a multi-screen handoff when
`checks/pilot-report.json` is missing, failed, or says existing batch artifacts
are not usable. The pilot is a pre-apply gate, not a replacement for per-screen
healthcheck, post-publish visual parity, or smoke navigation.
