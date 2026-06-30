# Segmently CLI Commands For WebEmbed Work

Run commands from an environment where the Segmently CLI is authenticated and
configured for the target environment. Prefer JSON output when saving command
results for catalogs.

## CLI Auth Preflight

Confirm the Segmently CLI is installed and authenticated for the target
environment before reading or applying custom screens:

```bash
segmently auth status
```

If the CLI reports `auth_required`, start the public login flow for the target
environment and retry the same command after login:

```bash
segmently auth login --env <env>
segmently auth status --env <env>
```

Do not document passwords or copy token values into artifacts. Use a cloned or
test funnel for risky apply/publish checks unless the user explicitly approves
the target production funnel.

## Export Funnel

```bash
segmently funnels export <funnelId> <versionId> <projectId> --output <run-dir>/flow.export.json
```

Use the export to inventory screens, variables, callback edges, and existing
data sources before editing.

## Read A Custom Screen

```bash
segmently funnels custom-screen get <funnelId> <versionId> <screenId> <projectId> \
  > <screen-dir>/original/get.json
```

Save from the response:

- `html` to `<screen-dir>/original/index.html`;
- `childSections` to `<screen-dir>/original/data-sources.json`;
- `getConfig` for variable and SDK reference inspection.

## Apply A Custom Screen

```bash
segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen <screenId> \
  --html-file <screen-dir>/updated/index.html \
  --data-sources-file <screen-dir>/updated/data-sources.json \
  --position <x,y>
```

Add `--edges-file <screen-dir>/updated/edges.json` only when parent
`embed.callback` routing must change. It is callback-only and does not create
`Button` or `SingleSelectionList` child action edges. Add `--iframe true|false`
only when preserving or intentionally changing render mode. For
`screenKind: "webembed-paywall"`, always pass `--iframe false`.

`--position` is optional. Pass it when the screen catalog owns the canvas
layout, especially for Figma handoffs; omit it during focused content updates
when the existing canvas position should stay unchanged.

For Figma handoff catalogs whose screen IDs do not exist in the target version,
create the screens explicitly:

```bash
segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen <screenId> \
  --create \
  --name "<screenName>" \
  --html-file <screen-dir>/updated/index.html \
  --data-sources-file <screen-dir>/updated/data-sources.json \
  --iframe true \
  --position <x,y>
```

Pass `--launch` on the first screen only when creating a new test funnel and
that screen should become the launch screen.

## Child Action Edges

Use graph manifests or editor handles for WebEmbed child data-source branching:

```json
{
  "edges": [
    { "from": "embed-screen", "to": "next-screen", "action": "section.cta.button" },
    { "from": "embed-screen", "to": "choice-a", "action": "section.goals.item.0" }
  ]
}
```

Validate and apply those edges through the graph flow:

```bash
segmently funnels graph dry-run <projectId> --funnel <funnelId> --version-id <versionId> --file <run-dir>/graph.json
segmently funnels edges apply <projectId> --funnel <funnelId> --version-id <versionId> --file <run-dir>/edges.json
```

Use `section.{childSectionId}.button` only for `Button` child sections. Use
`section.{childSectionId}.item.{index}` only for `OptionsList` or
`SingleSelectionList` child sections; the index is zero-based.
`MultipleSelectionList` is not a `triggerOptionAction` branching surface.

## Healthcheck

```bash
segmently funnels custom-screen healthcheck <funnelId> <versionId> <screenId> <projectId> \
  > <screen-dir>/checks/healthcheck.json
```

Healthcheck validates:

- `segmentlySDK.getChildSection*()` references;
- variable reads and writes;
- empty data sources;
- callback condition variables;
- selection variables backed by selection data sources.

Healthcheck proves SDK/data-source references and callback condition safety. It
does not replace graph validation for child action edges.

## Image Scan

```bash
segmently funnels custom-screen scan-images <funnelId> <versionId> <screenId> <projectId> --dry-run \
  > <screen-dir>/checks/image-scan.json
```

After review, run without `--dry-run` and with `--base-dir` pointing at the
screen asset folder when local image paths need CDN upload and HTML rewrite.

## Variables

```bash
segmently funnels variables apply <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --file <run-dir>/variables.json \
  --dry-run
```

Only remove `--dry-run` after the dry run passes.

## Audit And Publish

```bash
segmently funnels audit <funnelId> <versionId> <projectId>
segmently publish web <projectId> --funnel <funnelId> --version-id <versionId> --alias <alias>
segmently publish verify <projectId> --url <path-or-url>
```

Use `--require-paywall` on audit when a ProductCatalog-backed paywall is part of
the work.

## Figma Handoff Full Flow Script

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

The script is a command sequencer only. It calls the Segmently CLI, writes
per-screen apply and healthcheck JSON files into the catalog `checks`
directories, passes catalog positions through
`custom-screen apply --position <x,y>` when available, verifies editor-visible
data sources through `custom-screen get`, uses graph dry-run/apply for layout
only when `--force-canvas-layout` is explicitly set, reapplies WebEmbed HTML/data
sources after forced graph layout only as a compatibility workaround for
environments where graph apply drops `content.embed.childSections`, runs final
audit, publishes, and verifies. It does not call
Figma, rewrite HTML, infer conversion decisions, or bypass CLI validation.

When catalog screens include `updated.interactionMapFile`, the script also
writes `checks/flow-interaction-map.json` as a combined click map for smoke
checks. Use that map's `data-testid` selectors for browser verification instead
of guessing targets by visible text.
