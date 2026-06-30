---
name: segmently-cli-figma-webembed-import
description: Segmently CLI-oriented Figma to WebEmbed import guide. Use when extracting Figma frames into portable per-screen work items, converting them to standalone WebEmbed HTML, materializing CLI-ready data sources, and handing the result to segmently-cli-custom-screen-guide for apply and healthcheck. Also trigger when Segmently Launch Assistant or segmently-cli-custom-screen-guide names segmently-cli-figma-webembed-import for a Figma-to-WebEmbed preparation step.
---

# Segmently CLI Figma WebEmbed Import

Use this skill to turn selected Figma frames into CLI-ready WebEmbed artifacts.
This skill stops before applying anything to a funnel. For the full user flow,
hand off to `segmently-cli-custom-screen-guide`, which owns applying,
healthchecking, publishing, and verifying the generated screens.

## Output Contract

The final output is:

- `figma-catalog.json` - source extraction and conversion status.
- `project-profile.json` - optional reusable project import profile for
  decisions that form the project's Figma-to-WebEmbed design system.
- `work-items/<screenId>.json` - one isolated conversion task per frame.
- `screens/<screenId>/figma-design-context.json` - extracted design context.
- `screens/<screenId>/assets/manifest.json` - downloaded asset map.
- `screens/<screenId>/updated/index.html` - standalone WebEmbed HTML.
- `screens/<screenId>/updated/data-sources.json` - materialized
  `LayoutSection[]`.
- `screens/<screenId>/updated/interaction-map.json` - clickable element map
  with stable `data-testid` selectors and expected actions.
- `checks/pilot-report.json` - mandatory one-screen pilot report for
  multi-screen imports before the remaining screens are processed or handed off.
- `checks/media-cdn-upload-manifest.json` - manifest proving generated Media
  sections have stable CDN URLs instead of Figma MCP or local preview paths.
- `custom-screen-catalog.json` - handoff file for
  `segmently-cli-custom-screen-guide`.

## Workflow

1. Parse the Figma URL. Extract `fileKey`, optional `nodeId`, and a readable
   file name.
2. Use Figma MCP inspection paths in the main agent context to inspect
   metadata:
   - call `get_metadata` without `nodeId` to list pages when the URL does not
     identify a concrete frame;
   - for top-level screen discovery, use chunked `use_figma` read-only code
     against the selected page or section and inspect only direct children,
     maximum depth 1;
   - first probe `figma.root.children` / `figma.currentPage` for page id,
     page name, and child count;
   - then read direct children in small slices such as
     `figma.currentPage.children.slice(start, start + limit)` with `limit`
     around 5-10;
   - return only compact fields: index, id, name, type, x, y, width, height,
     visible, and direct child count. Do not return full node objects or
     descendants during discovery.
   - if a direct child times out even with a single-index compact probe, record
     it as `unresolved` in `figma-frames.json`; do not fabricate or silently
     skip it in a claimed full-flow import.
3. List candidate frames from the sparse node map or direct section children
   and let the user choose all, a range, or explicit frame numbers. Do not
   guess sibling node ids from numeric patterns.
4. Create a run directory, `figma-catalog.json`, and one screen directory per
   selected frame.
5. Load or create a `project-profile.json` for reusable conversion decisions.
   Ask the user before setting new project-level defaults.
6. For large files or multi-screen flows, initialize the catalog from the MCP
   discovery file:
   ```bash
   node <skill-root>/scripts/extract-figma-screens.mjs \
     --frames <run-dir>/figma-frames.json \
     --out <run-dir>
   ```
   The script is an MCP-only local initializer. It does not contact Figma; the
   main agent writes the discovery file from Figma MCP results.
7. For each selected frame that needs richer generation context, call the Figma
   design-context tool once with screenshot excluded when possible. Save the
   raw MCP text response verbatim to
   `screens/<screenId>/figma-design-context.json`; do not replace it with a
   human summary. Also call `get_screenshot` for the same frame and save the
   screenshot URL or downloaded file path as visual parity evidence.
   If the tool transcript cannot safely carry the full raw output, mark that
   screen `needs-layout-source` and ask the user to retry a narrower frame or
   provide an exported design context file. Do not replace raw design context
   with a summary.
8. Download referenced assets into `screens/<screenId>/assets/` and save
   `assets/manifest.json`.
9. Create one `work-items/<screenId>.json` file per frame. See
   `references/work-queue.md`.
10. Resolve conversion decisions before writing HTML. If a status bar, footer
   CTA, header navigation action, or unknown clickable behavior is detected,
   ask the user or apply an explicit `project-profile.json` rule and record the
   source in `conversionDecisions`.
11. For multi-screen imports, process exactly one pilot screen first. Choose the
    first screen or a more representative screen when it exercises critical
    behavior such as media, options, footer CTA, or header actions. Convert only
    that screen, materialize its data sources, render a screenshot from
    `updated/index.html` with `scripts/render-local-webembed.mjs`, validate
    data-source coverage, scan for hardcoded runtime asset URLs, compare the
    render with the Figma screenshot, and write `checks/pilot-report.json`. See
    `references/pilot-gate.md`.
12. If the pilot fails, debug only the pilot screen and update
    `project-profile.json` or the conversion guidance with the lesson learned.
    Do not process remaining screens, do not create `custom-screen-catalog.json`
    for full handoff, and do not publish.
13. Process remaining work items only after the pilot passes. Sequential
    processing is the default. If the runtime provides generic worker tasks,
    they may process independent work items in parallel, but this is optional.
14. Convert each item into standalone HTML, an interaction map, and an
   authoring-level `dataSourcePlan`. Follow
   `references/screen-conversion-worker.md` for the per-screen worker contract
   and `references/conversion-guidelines.md` for shared conversion rules. A
   screen without a complete `layoutSource` must become `needs-layout-source`,
   not `converted`.
15. Classify each item as `webembed-screen` or `webembed-paywall`. The Figma
    skill records the classification only; paywall implementation rules live in
    `segmently-cli-custom-screen-guide`.
16. Run the materializer:
    ```bash
    node <skill-root>/scripts/materialize-catalog.mjs \
      --catalog <run-dir>/figma-catalog.json
    ```
17. Enforce project profile decisions on generated artifacts before the CLI
    handoff. This is mandatory when the profile says `statusBar: "omit"` or a
    footer CTA mode has been chosen. `statusBar: "omit"` removes all device
    preview chrome, including the top status bar, the bottom iOS home
    indicator, and decorative footer preview strips:
    ```bash
    node <skill-root>/scripts/enforce-project-profile.mjs \
      --catalog <run-dir>/custom-screen-catalog.json
    ```
18. Stabilize Media data sources before CLI apply. Upload every Figma MCP or
    local preview Media source through the Segmently CLI asset command and
    rewrite `updated/data-sources.json`, `updated/data-source-plan.json`, and
    `figma-catalog.json`. The stabilization step must also check image upload
    sizes before the network request. The Builder image upload limit is 10 MB
    by default; use `--check-sizes` in dry-run mode and use
    `--resize-max-edge` for client-side raster downscale before upload when
    Figma exports are too large. Resizing must preserve the original aspect ratio;
    do not crop, stretch, or change aspect ratio:
    ```bash
    node <skill-root>/scripts/stabilize-media-assets.mjs \
      --catalog <run-dir>/custom-screen-catalog.json \
      --dry-run \
      --check-sizes \
      --resize-max-edge 2400 \
      --resize-format webp

    node <skill-root>/scripts/stabilize-media-assets.mjs \
      --catalog <run-dir>/custom-screen-catalog.json \
      --project <projectId> \
      --env <env> \
      --resize-max-edge 2400 \
      --resize-format webp
    ```
    Re-run the same command to retry failures; existing successful uploads in
    `checks/media-cdn-upload-manifest.json` are reused. GIF and SVG sources are
    not resized by this helper; reduce or replace them before upload if they
    exceed `--max-upload-bytes`.
19. Hand off `custom-screen-catalog.json` to
    `segmently-cli-custom-screen-guide`.
20. When the user asks for a full flow check, continue with the custom-screen
    guide's Figma handoff full flow: create or clone the target funnel, apply
    screens, healthcheck, link, audit, publish, and verify.

## Runtime Portability

The portable abstraction is the work queue, not a named sub-agent. This keeps
the workflow usable in Codex, Claude Code, and future local runners:

- default processing is sequential;
- optional runtime workers may process separate work items;
- every worker receives files only, not Figma session state;
- every worker writes the same output files;
- failed screens can be retried independently.

## References

Load only what is needed:

- `references/artifact-contract.md` - catalog and directory shapes.
- `references/work-queue.md` - per-screen task format and statuses.
- `references/figma-extraction.md` - URL parsing, metadata, design context,
  and asset rules.
- `references/screen-conversion-worker.md` - explicit per-screen conversion
  contract after Figma content and layout have been extracted.
- `references/pilot-gate.md` - mandatory one-screen render/data-source/visual
  check before multi-screen batch processing.
- `references/conversion-guidelines.md` - standalone WebEmbed conversion rules.
- `references/project-profile.md` - reusable project-level Figma import
  decisions and override rules.
- `references/materialization.md` - data-source materialization and handoff.
- `scripts/enforce-project-profile.mjs` - apply project profile decisions to
  generated HTML/data-source artifacts before media upload or CLI handoff.
- `scripts/render-local-webembed.mjs` - render generated HTML locally with a
  Segmently SDK mock backed by `updated/data-sources.json`.
- `scripts/stabilize-media-assets.mjs` - upload generated Media section sources
  to the Segmently CDN and rewrite data sources before custom-screen handoff.
- `../segmently-cli-custom-screen-guide/references/paywall.md` - Web Embedded
  Paywall render mode and ProductCatalog rules. Load this from the custom
  screen skill only when a screen is classified as `webembed-paywall`.
- `../segmently-cli-custom-screen-guide/references/figma-handoff-full-flow.md`
  - composed apply, healthcheck, publish, and verify workflow for real funnel
    checks.

## Safety Rules

- Do not apply generated screens to a funnel from this skill.
- Do not require runtime-specific agents.
- Do not put secrets, local absolute paths, or environment defaults in the
  skill output.
- Do not depend on editor UI automation.
- Do not call Figma tools from optional workers. Only the main context uses
  Figma MCP tools.
- Do not depend on Figma web app internals such as Redux store shape, private
  network payloads, or DOM state. Use Figma MCP tools only.
- Preserve visual intent, but keep generated HTML maintainable and compatible
  with `segmentlySDK`.
- Do not silently choose layout or navigation behavior. Use an explicit
  project profile rule or ask the user and record the answer.
- Do not batch-process or hand off a multi-screen import until the one-screen
  pilot has a passing `checks/pilot-report.json`.
- Do not hand off Figma-generated Media sections that still point to Figma MCP
  asset URLs or local preview paths. Run the media CDN stabilization step first.
- Do not hand off generated screens that still display device preview chrome
  after `statusBar: "omit"` has been chosen. The top status bar, bottom iOS
  home indicator, and decorative footer preview strips are preview chrome.

## Verification

```bash
node <skill-root>/scripts/run-evals.mjs
node <skill-root>/scripts/extract-figma-screens.mjs --help
node <skill-root>/scripts/materialize-catalog.mjs --help
node <skill-root>/scripts/enforce-project-profile.mjs --help
node <skill-root>/scripts/render-local-webembed.mjs --help
node <skill-root>/scripts/stabilize-media-assets.mjs --help
```
