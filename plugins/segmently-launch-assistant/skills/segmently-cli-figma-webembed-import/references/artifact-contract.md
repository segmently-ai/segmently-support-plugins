# Figma WebEmbed Artifact Contract

The import run directory is self-contained and can be copied between runtimes.

```text
<run-dir>/
  figma-catalog.json
  project-profile.json
  custom-screen-catalog.json
  work-items/
    S001.json
    S002.json
  screens/
    S001/
      figma-design-context.json
      conversion-input.json
      conversion-result.json
      assets/
        manifest.json
      checks/
        visual-baseline.json
      updated/
        index.html
        data-sources.json
        interaction-map.json
  checks/
    pilot-report.json
    media-cdn-upload-manifest.json
```

## Figma Catalog

```json
{
  "schemaVersion": "figma-webembed-catalog/v1",
  "source": {
    "kind": "figma",
    "figmaUrl": "<figmaUrl>",
    "fileKey": "<fileKey>",
    "fileName": "<fileName>"
  },
  "outputDir": "<run-dir>",
  "projectProfileFile": "project-profile.json",
  "contentMode": "data-driven",
  "createdAt": "<iso-date>",
  "screens": [
    {
      "id": "S001",
      "figmaNodeId": "<nodeId>",
      "figmaNodeName": "<frameName>",
      "figmaUrl": "<figmaFrameUrl>",
      "status": "converted",
      "statusHistory": ["pending", "extracted", "converted"],
      "workItemFile": "work-items/S001.json",
      "designContextFile": "screens/S001/figma-design-context.json",
      "layoutSource": {
        "kind": "figma-design-context",
        "status": "complete",
        "file": "screens/S001/figma-design-context.json"
      },
      "assetsManifestFile": "screens/S001/assets/manifest.json",
      "outputHtmlFile": "screens/S001/updated/index.html",
      "outputDataSourcesFile": "screens/S001/updated/data-sources.json",
      "interactionMapFile": "screens/S001/updated/interaction-map.json",
      "dataSourcePlan": [],
      "contentBindingPolicy": "text-and-media-data-sources",
      "screenKind": "webembed-screen",
      "renderMode": "iframe",
      "conversionDecisions": {
        "statusBar": {
          "detected": true,
          "decision": "omit",
          "source": "user"
        },
        "footerCta": {
          "detected": true,
          "decision": "sticky-footer",
          "source": "user"
        },
        "headerActions": {
          "detected": true,
          "decision": {
            "back": { "action": "navigateBack" },
            "skip": { "action": "navigateNext" }
          },
          "source": "project-profile"
        }
      },
      "isIframe": true,
      "error": null,
      "attempts": 1
    }
  ],
  "statistics": {
    "total": 1,
    "pending": 0,
    "extracted": 0,
    "converted": 1,
    "ready-for-cli-apply": 0,
    "needs-user-decision": 0,
    "failed": 0
  }
}
```

## Media CDN Manifest

Figma-generated Media sections must be stabilized before handoff. The import
flow writes `checks/media-cdn-upload-manifest.json` after running
`scripts/stabilize-media-assets.mjs`.

```json
{
  "schemaVersion": "figma-webembed-media-cdn-upload/v1",
  "status": "uploaded",
  "projectId": "<projectId>",
  "assetSizePolicy": {
    "maxUploadBytes": 10485760,
    "warnUploadBytes": 5242880,
    "resizeMaxEdge": 2400,
    "resizeFormat": "webp",
    "resizeQuality": 85
  },
  "totalSources": 12,
  "alreadyStable": 0,
  "uploaded": 12,
  "failed": 0,
  "items": [
    {
      "source": "https://www.figma.com/api/mcp/asset/...",
      "refs": [{ "screenId": "S001", "label": "Hero Image" }],
      "filePath": "checks/media-cdn-source/S001-hero-image-abc123-resized.webp",
      "mimeType": "image/webp",
      "bytes": 245120,
      "sizeInfo": {
        "sourceBytes": 7340032,
        "uploadBytes": 245120,
        "sourceMimeType": "image/png",
        "uploadMimeType": "image/webp",
        "sourceWidth": 4096,
        "sourceHeight": 4096,
        "uploadWidth": 2400,
        "uploadHeight": 2400,
        "resized": true,
        "warnings": []
      },
      "asset": {
        "original": "https://...",
        "small": "https://..."
      },
      "status": "uploaded"
    }
  ]
}
```

The custom-screen handoff must reject Figma catalogs with Media sections when:

- the manifest is missing;
- `status` is not `uploaded`;
- `failed` is not `0`;
- any non-stable source failed the image size preflight;
- any `updated/data-sources.json` Media URL is empty, a Figma MCP asset URL, or
  a local/relative preview path.

Before uploading a full batch, run the manifest in dry-run size-check mode:

```bash
node <skill-root>/scripts/stabilize-media-assets.mjs \
  --catalog <run-dir>/custom-screen-catalog.json \
  --dry-run \
  --check-sizes \
  --resize-max-edge 2400 \
  --resize-format webp
```

The size check uses the same resize policy as upload mode, so the dry-run
manifest is valid evidence that generated Media assets will fit under the
Builder image upload limit before network upload starts.

## Statuses

```text
pending
needs-user-decision
needs-layout-source
mcp-discovered
layout-source-ready
extracted
converted
materialized
ready-for-cli-apply
failed
skipped
```

`mcp-discovered` means top-level Figma MCP discovery has identified the screen
node and written the run catalog/work item.

`layout-source-ready` means the Figma MCP design-context step has written a
complete per-screen layout source. It does not mean the screen has been
converted to WebEmbed HTML yet.

The materializer updates converted screens to `ready-for-cli-apply` and writes
`custom-screen-catalog.json`.

`needs-layout-source` means Figma screenshot/render/summary extraction exists,
but no complete layout source is available. The screen must not be converted,
materialized, applied, or published until it has a complete `layoutSource`.

`layoutSource` is required for every `converted` Figma screen. Accepted kinds:

- `figma-design-context`;
- `figma-node-tree`;
- `existing-html-minimal-edit`.

Rejected as final conversion sources:

- screenshots;
- rendered PNGs;
- compact text summaries;
- image refs only;
- generic templates.

## Conversion Decisions

Every converted screen may include `conversionDecisions`. Use it to record
layout decisions that cannot be inferred safely from Figma alone.

### `statusBar`

Set `detected: true` when the Figma context includes OS status bar signals such
as `System`, `Status Bar`, `Time Style`, `9:41`, `Battery`, `Wifi`, or
`Cellular Connection`. The decision also covers bottom device preview chrome
such as the iOS home indicator stripe and decorative footer preview strips.

Allowed decisions:

- `include`
- `omit`
- `spacer`
- `unresolved`

If `detected: true` and `decision: "unresolved"`, keep the screen in
`needs-user-decision`.

If `decision: "omit"`, the top status bar, bottom home indicator, and
decorative footer preview strip must not be visible in the generated WebEmbed
and must not appear as runtime `Media` data sources.

### `headerActions`

Set `detected: true` when the frame includes back, skip, close, dismiss, or
similar header navigation controls.

Allowed action values:

- `navigateBack`
- `navigateNext`
- `navigateTo:<screenId>`
- `complete`
- `custom-event:<name>`
- `disabled`
- `unresolved`

If `detected: true` and `decision: "unresolved"`, keep the screen in
`needs-user-decision`. When resolved, `decision` may be an object keyed by
semantic action name, such as `back`, `skip`, or `close`.

## Interaction Map

Every generated clickable element must be represented in
`screens/<screenId>/updated/interaction-map.json`.

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
      "role": "skip",
      "testId": "screen-S001-skip",
      "selector": "[data-testid=\"screen-S001-skip\"]",
      "action": { "type": "navigateNext" }
    },
    {
      "role": "option",
      "testId": "screen-S001-option-beginner",
      "selector": "[data-testid=\"screen-S001-option-beginner\"]",
      "action": {
        "type": "setVariable",
        "variableId": "poker_level",
        "value": "BEGINNER"
      }
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

## Visual Baseline

Every converted screen should write
`screens/<screenId>/checks/visual-baseline.json`. The baseline points to Figma
MCP screenshot evidence and the expected mobile viewport. The custom-screen
handoff uses it for post-publish visual parity checks.

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

The HTML must contain matching `data-testid` attributes. Do not add entries for
decorative or non-interactive layers. Every `testId` and selector must be
unique within the screen. When source labels repeat, preserve the visible label
and add a deterministic ordinal suffix to the generated selector and
interaction-map value.

## Text And Media Data Sources

Figma-generated WebEmbed screens must be data-source-backed for runtime
content:

- visible copy, labels, placeholders, and CTA text use `Text`, `BulletList`, or
  selection-list data sources;
- images, video, icons, thumbnails, app icons, and content backgrounds use
  `Media` data sources;
- paywall products use `ProductCatalog`.

HTML can keep fallback text or fallback asset paths for local preview, but it
must bind runtime values through `segmentlySDK.getChildSection*()` labels that
exist in `updated/data-sources.json`. Do not leave final user-facing asset URLs,
base64 images, or generated SVG images hardcoded in HTML.

### `footerCta`

Set `detected: true` when the frame has a bottom CTA such as `Continue`, `Next`,
`See my plan`, `Start`, a purchase CTA, or an equivalent footer action.

Allowed decisions:

- `scroll-with-content`
- `sticky-footer`
- `fixed-outside-scroll`
- `unresolved`

If `detected: true` and `decision: "unresolved"`, keep the screen in
`needs-user-decision`.

## Screen Classification

Each selected Figma frame must be classified before materialization:

- `webembed-screen` - ordinary WebEmbed content. Use `renderMode: "iframe"` and
  `isIframe: true` unless the user explicitly asks for shadow DOM.
- `webembed-paywall` - Web Embedded Paywall content. Use
  `renderMode: "shadow-dom"` and `isIframe: false`.

Classification signals include paywall, pricing, payment, product naming,
product cards, subscription copy, purchase CTA text, Stripe/payment form
elements, or a known paywall section in the Figma source. The Figma skill
records this classification only. ProductCatalog, purchase SDK, routing, and
audit rules are owned by `segmently-cli-custom-screen-guide`.
