# Materialization

Materialization converts authoring-friendly plans into CLI-ready files.

It must preserve non-data-source metadata needed by the custom-screen handoff:

- `projectProfileFile`;
- `conversionDecisions`;
- `screenKind`, `renderMode`, and `isIframe`;
- `updated/interaction-map.json` paths.

## Data Source Plan Input

```json
[
  { "kind": "Text", "label": "Headline", "title": "Welcome" },
  {
    "kind": "Media",
    "label": "Hero Image",
    "url": "https://cdn.example/hero.png",
    "type": "image"
  },
  {
    "kind": "BulletList",
    "label": "Benefits",
    "items": [{ "title": "Fast setup" }]
  }
]
```

## CLI Data Source Output

The materializer writes `updated/data-sources.json` as materialized
`LayoutSection[]`:

```json
[
  {
    "id": "headline",
    "kind": "Text",
    "label": "Headline",
    "order": 0,
    "textContent": {
      "title": {
        "kind": "static",
        "translations": { "en-US": "Welcome" },
        "appearance": {}
      }
    }
  }
]
```

Media sections must be materialized into the canonical `LayoutSection`
`mediaContent` shape used by the WebEmbed serializer. Do not emit flat
`{ "url": "...", "type": "image" }` media content; that produces editor-visible
sections whose SDK media URL resolves to an empty string.

```json
{
  "id": "hero-image",
  "kind": "Media",
  "label": "Hero Image",
  "order": 1,
  "mediaContent": {
    "kind": "Image",
    "content": {
      "image": {
        "translations": {
          "en-US": {
            "original": "https://cdn.example/hero.png",
            "small": "https://cdn.example/hero.png"
          }
        }
      }
    }
  }
}
```

## Command

```bash
node <skill-root>/scripts/materialize-catalog.mjs \
  --catalog <run-dir>/figma-catalog.json
```

## Handoff

After materialization, enforce project profile decisions before continuing with
media upload or `segmently-cli-custom-screen-guide`. This step applies choices
such as `statusBar: "omit"` and footer CTA behavior to the generated HTML and
data sources. `statusBar: "omit"` covers all device preview chrome, including
the bottom iOS home indicator stripe and decorative footer preview strips.

```bash
node <skill-root>/scripts/enforce-project-profile.mjs \
  --catalog <run-dir>/custom-screen-catalog.json
```

Then stabilize Media section URLs. Figma MCP asset URLs and local preview paths
are extraction artifacts; they are not acceptable runtime Media data source
URLs.

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

The script writes `checks/media-cdn-upload-manifest.json`, downloads Figma/local
sources, uploads them with `segmently assets upload-image`, rewrites
`updated/data-sources.json` and `updated/data-source-plan.json`, and updates the
catalog checks. It also records the source and upload size metadata for every
Media source. The default preflight limit is 10 MB, matching the Builder image
upload limit. Use `--warn-upload-bytes` to flag large-but-valid files and
`--resize-max-edge` with `--resize-format`/`--resize-quality` to downscale
raster images client-side before upload. Client-side resize must preserve the
original aspect ratio: scale the image to fit inside the max edge, do not crop,
stretch, pad, or distort it. GIF and SVG sources are not resized by this helper
and must already fit under `--max-upload-bytes`. The script is resumable:
re-run the command to retry failed downloads or uploads while keeping
successful CDN assets from the manifest.

After the media CDN manifest is clean, continue with
`segmently-cli-custom-screen-guide`.
The generated `custom-screen-catalog.json` must include each screen's
`updated.interactionMapFile` when it exists, so the handoff flow can build a
click map without rediscovering interactive elements from HTML.

For a single existing screen migration, apply the screen directly:

```bash
segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen <screenId> \
  --html-file <run-dir>/screens/<screenId>/updated/index.html \
  --data-sources-file <run-dir>/screens/<screenId>/updated/data-sources.json

segmently funnels custom-screen healthcheck <funnelId> <versionId> <screenId> <projectId>
```

If a screen is classified as `webembed-paywall`, the handoff catalog must keep
`isIframe: false`. During apply, the custom-screen workflow must pass
`--iframe false` and follow
`segmently-cli-custom-screen-guide/references/paywall.md`.

For a full Figma-to-published-funnel check, use the custom-screen guide's Figma
handoff full flow:

```bash
node <custom-screen-skill-root>/scripts/apply-handoff-full-flow.mjs \
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

The Segmently CLI defaults to its configured environment, usually production.
Pass a non-production `--env` only when the user explicitly requests a
dev/debug publication check.
