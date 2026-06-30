# Work Queue

Each selected Figma frame becomes one work item. A work item owns one screen
directory, so items can be processed independently.

## Work Item Shape

```json
{
  "schemaVersion": "figma-webembed-work-item/v1",
  "screenId": "S001",
  "screenName": "pricing",
  "figmaNodeId": "12:34",
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
  "contentMode": "data-driven",
  "screenKind": "webembed-screen",
  "renderMode": "iframe",
  "projectProfileFile": "project-profile.json",
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
  }
}
```

Use `decision: "unresolved"` and screen status `needs-user-decision` when a
status bar, footer CTA, header navigation action, or unknown clickable behavior
is detected and neither the user nor `project-profile.json` has answered yet.

## Processing Rules

- Process work items sequentially by default.
- Optional runtime workers are allowed only when each worker receives one work
  item and writes inside that screen directory.
- Workers must not call Figma tools.
- Workers must not apply screens to a funnel.
- The output contract must be identical for sequential and parallel execution.
- Workers may use `screenKind` to choose conversion details, but paywall apply
  rules remain in `segmently-cli-custom-screen-guide`.
- Workers must not guess unresolved `conversionDecisions`.
- Workers must not mark a screen `converted` without complete `layoutSource`.
  Use `needs-layout-source` when only screenshots, compact summaries, or image
  refs are available.
- Workers must write matching `data-testid` attributes and
  `interactionMapFile` entries for generated clickable elements.
- Workers may read `projectProfileFile`, but must not change it unless the main
  agent has asked the user and recorded that the answer should become a project
  default.

## Retry Rules

- A failed work item keeps its error in `figma-catalog.json`.
- Retrying a screen should reuse downloaded assets and design context unless
  the user asks to refresh from Figma.
- A converted screen is not ready for CLI apply until materialization succeeds.
