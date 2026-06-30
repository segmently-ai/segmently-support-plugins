# Figma Handoff Full Flow

Use this workflow when a Figma import run has produced
`custom-screen-catalog.json` and the user wants a real funnel publication check.

## Preconditions

- The target environment is intentional. The Segmently CLI default is
  production; pass `--env dev` only for dev/debug publication checks.
- The CLI is authenticated in that environment. If it reports `auth_required`,
  run `segmently auth login --env <env>` and retry the same command after
  `segmently auth status --env <env>` succeeds.
- The target funnel is a dev/test funnel, or a freshly cloned copy of a source
  funnel version.
- Multi-screen handoffs have a passing `checks/pilot-report.json` from
  `segmently-cli-figma-webembed-import/references/pilot-gate.md`. The pilot
  must include a generated HTML render screenshot, data-source coverage for
  text and media, a hardcoded runtime asset URL scan, and a Figma visual
  comparison. This Figma visual comparison is the pre-batch proof that the
  generated HTML is still faithful to the source frame. If the report is
  missing or failed, do not apply, link, audit, or publish the batch.
- Every Figma-generated screen has complete `layoutSource` metadata copied from
  the Figma import materializer. The handoff script refuses stale catalogs and
  screens generated from screenshots, compact summaries, or generic templates.
- Every screen in the catalog has resolved `conversionDecisions` when those are
  present.
- Project profile enforcement has passed when profile-sensitive decisions are
  present. In particular, `statusBar: "omit"` must remove all device preview
  chrome, including the top status bar, bottom iOS home indicator, and
  decorative footer preview strips, and must remove status/home/footer chrome
  `Media` data sources from the handoff.
- `updated/index.html` and `updated/data-sources.json` exist for every screen.
- Header navigation decisions are resolved when back, skip, close, or dismiss
  controls were detected.
- Figma-generated clickable elements have stable `data-testid` attributes and
  matching `updated/interaction-map.json` entries.
- Figma-generated text and media assets are backed by data sources. HTML may
  contain local preview fallbacks, but runtime copy must use `Text` /
  selection-list sections and runtime visuals must use `Media` sections.
- Figma-generated Media sections have been stabilized with the Figma import
  skill's `stabilize-media-assets.mjs` step. The handoff catalog must reference
  `checks/media-cdn-upload-manifest.json`, the manifest must have
  `status: "uploaded"` and `failed: 0`, and `updated/data-sources.json` must not
  contain Figma MCP asset URLs, empty media URLs, or local preview paths.

## CLI Defect Contract

The post-graph content restore is a compatibility workaround, not the desired
architecture. The CLI/backend defect to fix is:

```text
funnels graph apply stores WebEmbed child sections under aiContent.embed.childSections
but leaves content.embed.childSections empty.
```

Correct behavior is that `graph apply` persists WebEmbed `html`, `isIframe`,
and `childSections` in `content.embed`, so the editor and runtime can read the
same data sources through `funnels custom-screen get` and `segmentlySDK`.

## Recommended Flow

1. Verify the pilot gate. Read `checks/pilot-report.json` and confirm
   `status: "passed"` plus `batchGate.remainingScreensMayProcess: true`.
   If `batchGate.existingBatchArtifactsUsable` is `false`, regenerate the
   remaining screens after the pilot fix before applying the handoff.
2. Verify the project profile gate. Read
   `checks/project-profile-enforcement.json` and confirm generated screens no
   longer display device preview chrome when `statusBar: "omit"` was selected.
   The bottom iOS home indicator stripe and decorative footer preview strip are
   device chrome too.
3. Verify the media CDN gate. Read `checks/media-cdn-upload-manifest.json` and
   confirm every Media section URL is an HTTP(S) CDN/runtime URL, not a Figma
   MCP asset URL or a local preview path.
4. Create or clone a target funnel version in the intended environment.
5. Apply each catalog screen with `funnels custom-screen apply`.
6. Use `--create` when the Figma screen ID does not exist in the target version.
7. Pass `--launch` only for the first screen in a new test funnel.
8. Pass `--position <x,y>` when the catalog has a canvas position. Position is
   optional on update; omit it to preserve the existing canvas position.
9. Run healthcheck immediately after each screen apply.
10. Validate that the interaction map exists when referenced by the catalog and
   contains entries for detected back, skip, primary CTA, options, and paywall
   products.
11. Add callback edges only after every target screen exists.
12. For a smoke test, use catalog-order linear routing only when the user wants a
   multi-screen flow check and no authored edges exist.
13. If the target CLI does not support `custom-screen apply --position`, apply
    a graph layout manifest as a compatibility fallback so every screen gets a
    unique canvas `position`.
14. Verify editor-visible data sources with `custom-screen get`. For every
    WebEmbed that uses data-source-backed copy or media, `getConfig.dataSources`
    must be non-empty and must match the expected Text, selection-list, Media,
    or ProductCatalog sections.
15. If `graph apply` leaves `getConfig.dataSources` empty while export shows
    `aiContent.embed.childSections`, treat it as a CLI/backend regression:
    graph apply must persist WebEmbed child sections into
    `content.embed.childSections`. Until that fix is deployed, run
    `custom-screen apply` again for every WebEmbed with the same `--html-file`
    and `--data-sources-file` as a compatibility workaround before publication.
16. Run healthcheck again for every screen whose edges or data sources changed.
17. Run `funnels audit`.
18. Publish with `publish web --alias <alias>`.
19. Run `publish verify` against the returned URL.
20. Run the visual parity and interaction debugging pass from
    `references/visual-parity.md`. Capture published screenshots, compare them
    against Figma baseline evidence, and write `checks/visual-report.json`.
21. Use `flow-interaction-map.json` and per-screen `data-testid` selectors for
    smoke navigation. Do not rediscover click targets from arbitrary text when
    interaction maps exist.

## Command Skeleton

```bash
segmently funnels create <projectId> --name "<test name>" --platform web --version-name "<version name>"

segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen S001 \
  --create \
  --name "S001" \
  --html-file <run-dir>/screens/S001/updated/index.html \
  --data-sources-file <run-dir>/screens/S001/updated/data-sources.json \
  --iframe true \
  --position 0,0 \
  --launch

segmently funnels custom-screen healthcheck <funnelId> <versionId> S001 <projectId>

segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen S001 \
  --edges-file <run-dir>/screens/S001/updated/edges.json

# Optional fallback only for older CLIs that do not support
# `custom-screen apply --position`.
segmently funnels graph dry-run <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --file <run-dir>/checks/graph-layout-apply.json

segmently funnels graph apply <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --file <run-dir>/checks/graph-layout-apply.json

# Required only after the fallback graph layout path if graph apply drops
# WebEmbed child sections in the target environment.
segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen S001 \
  --html-file <run-dir>/screens/S001/updated/index.html \
  --data-sources-file <run-dir>/screens/S001/updated/data-sources.json \
  --iframe true

segmently funnels custom-screen healthcheck <funnelId> <versionId> S001 <projectId>

segmently funnels custom-screen get <funnelId> <versionId> S001 <projectId>

segmently funnels audit <funnelId> <versionId> <projectId>
segmently publish web <projectId> --funnel <funnelId> --version-id <versionId> --alias <alias>
segmently publish verify <projectId> --url <published-url>
```

After publish verification, capture visual parity artifacts:

```bash
# Browser runner of your environment, using the published URL from publish web.
# Store screenshots and comparison reports under <run-dir>/checks/visual/.
```

## Script

Use the script for repeatable checks:

```bash
node <skill-root>/scripts/apply-handoff-full-flow.mjs \
  --catalog <run-dir>/custom-screen-catalog.json \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --create-missing \
  --link-linear \
  --publish \
  --alias <alias> \
  --verify
```

Set `SEGMENTLY_CLI` to a local CLI binary path when `segmently` is not on
`PATH`. Use `--env <env>` to target a non-default environment.

## Safety Notes

- Do not use catalog-order linear routing for production unless the user
  explicitly confirms that this is the intended flow.
- Do not publish before every screen healthcheck has passed or the user has
  accepted warnings.
- Do not apply or publish a multi-screen Figma handoff before the one-screen
  pilot report has passed. The pilot must render generated HTML, prove data
  source coverage, scan hardcoded runtime asset URLs, and compare against the
  Figma baseline.
- Do not apply or publish Figma-generated Media sections before
  `checks/media-cdn-upload-manifest.json` has passed. Figma MCP asset URLs and
  local preview paths are extraction artifacts, not runtime Media data.
- Do not bypass the `layoutSource` guard. If a Figma handoff screen is
  `needs-layout-source`, go back to the Figma import skill and extract complete
  design context or a full measured node tree before applying.
- Do not treat human summaries such as "Key content includes" or
  "Visible content" as layout source. They are review notes only and must block
  apply/publish until replaced with complete Figma design context or a measured
  node tree.
- Do not infer status bar or footer CTA behavior here. Those are Figma
  conversion decisions and must already be recorded by the import skill.
- Do not apply Figma handoffs whose project profile enforcement is missing or
  stale. If `statusBar: "omit"` is selected, the generated screen must not show
  the top status bar, bottom home indicator stripe, or decorative footer
  preview strip.
- Do not infer header back/skip behavior here. Missing behavior is a conversion
  blocker, not an apply-time default.
- Do not publish a newly created multi-screen Figma handoff until export or
  graph apply confirms that screens have distinct canvas positions.
- Do not treat `publish verify` or custom-screen healthcheck as visual
  acceptance. Complete the visual parity pass and record mismatches before
  handing the flow back to the user.
