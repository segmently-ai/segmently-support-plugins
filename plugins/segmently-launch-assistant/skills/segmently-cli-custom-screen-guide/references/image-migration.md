# Image Migration

Use image migration when custom HTML references local image files or temporary
asset paths that need stable CDN URLs.

## Scan First

```bash
segmently funnels custom-screen scan-images <funnelId> <versionId> <screenId> <projectId> --dry-run \
  > <screen-dir>/checks/image-scan.json
```

Review:

- local image paths;
- remote image paths;
- already-CDN images;
- paths that cannot be resolved.

## Apply Upload And Rewrite

```bash
segmently funnels custom-screen scan-images <funnelId> <versionId> <screenId> <projectId> \
  --base-dir <screen-dir>/assets \
  > <screen-dir>/checks/image-scan.json
```

The apply step uploads local images to the Segmently CDN, rewrites HTML URLs,
and can create `Media` child sections when supported by the backend response.

## Safe Rewrite Rules

- Do not rename CSS classes or wrappers around images.
- Keep `alt` text unless moving it to a Text data source.
- Preserve image dimensions and responsive CSS.
- Keep the original HTML file unchanged for review.
- If a path is ambiguous, stop and ask for the correct asset folder.

After image migration, run custom-screen healthcheck and compare the updated
HTML against the original.
