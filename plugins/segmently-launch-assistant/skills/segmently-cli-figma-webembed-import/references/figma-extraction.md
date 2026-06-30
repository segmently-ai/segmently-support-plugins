# Figma Extraction

The main agent context performs all Figma MCP calls because design-tool session
state may not transfer to optional workers.

## URL Parsing

Accept Figma design or file URLs. Extract:

- file key from `/design/<key>/` or `/file/<key>/`;
- optional node id from `node-id`;
- readable file name from the path when available.

Normalize node ids by converting URL dashes to MCP colons when required by the
tool.

## Metadata

Use only Figma MCP paths for node discovery. Prefer these in order:

1. `get_metadata` without `nodeId` when the URL has no concrete target. This
   returns the document's top-level pages.
2. `get_metadata` for a selected frame when the URL identifies one concrete
   screen.
3. `use_figma` read-only inspection for page or section discovery. Inspect only
   direct children, maximum depth 1. Use chunked reads for large pages. Return
   compact JSON with ids, names, node types, positions, dimensions, visibility,
   direct child counts, and ordering keys.

Do not use private Figma web app Redux state, DOM state, internal network
payloads, or direct network extraction outside MCP. This skill works through
Figma MCP only.

## Top-Level Node Discovery

For large pages, avoid full page metadata dumps. Do not call `get_metadata` for
an entire large page after the page list is known; it can time out or return too
much context. Do not use `getNodeByIdAsync(pageId)` for page discovery when
`figma.currentPage` is already the target page; reading the current page is more
stable in large files.

Use this two-step MCP-only algorithm.

Step 1: probe pages and current page only.

```js
return {
  pages: figma.root.children.map((page) => ({
    id: page.id,
    name: page.name,
    childCount: page.children.length
  })),
  currentPage: {
    id: figma.currentPage.id,
    name: figma.currentPage.name,
    childCount: figma.currentPage.children.length
  }
};
```

Step 2: read direct children in small chunks. Use `limit` around 5-10. Increase
only after a successful run. Never return `node.children`, full node objects, or
descendant payloads in this step.

```js
function n(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

const start = 0; // replace per chunk: 0, 5, 10, ...
const limit = 5;
const nodes = figma.currentPage.children
  .slice(start, start + limit)
  .map((node, offset) => ({
    index: start + offset,
    id: node.id,
    name: node.name,
    type: node.type,
    x: n(node.x),
    y: n(node.y),
    width: n(node.width),
    height: n(node.height),
    visible: node.visible !== false,
    childCount: 'children' in node ? node.children.length : 0
  }));

return {
  page: {
    id: figma.currentPage.id,
    name: figma.currentPage.name,
    childCount: figma.currentPage.children.length
  },
  start,
  limit,
  nodes
};
```

After all chunks are collected, filter candidate screen roots locally in the
main agent:

- keep visible `FRAME`, `SECTION`, `GROUP`, `COMPONENT`, and `INSTANCE` nodes;
- prefer phone-sized direct children for onboarding screens;
- keep explicit ordering by `index`, then by `y`, then by `x` only when needed;
- preserve the original node id and frame name exactly.

If a chunk still times out, reduce `limit` to 1-2 and omit `width`/`height` for
one diagnostic pass. If the diagnostic pass succeeds, rerun only the affected
indexes with geometry. If it still fails, ask the user for a more specific
section/frame URL or to select the target frame in Figma.

When a direct child cannot be read even as a single compact index, record it in
the discovery artifact as `unresolved` with the index and timeout reason. Do
not fabricate its node id, do not infer it from neighboring ids, and do not
silently drop it from a claimed full-flow import. If the user asked for a full
onboarding, unresolved top-level children are a gate: either prove they are
decorative/non-screen by another MCP-safe signal, or ask the user for a narrower
section/frame URL before publishing.

Do not call unsupported or expensive helpers such as `loadAllPagesAsync`. Do not
return `node.children` recursively, full node objects, image bytes, or style
payloads during discovery. The merged discovery output becomes
`figma-frames.json`.

Build a list of candidate top-level frames with:

- node id;
- frame name;
- parent page or section;
- dimensions;
- visible ordering.

For multi-screen onboarding imports, if the user provides one frame inside a
section, inspect that frame's direct parent section and propose the ordered
direct child frames. Never infer sibling frames by incrementing numeric node
ids.

Ask the user which frames to import unless they already provided an exact node
and the task is explicitly single-screen.

## Screen-by-Screen MCP Extraction

For large nodes and full onboarding flows, do not fetch all screens in one
design-context request. Use the initializer after MCP discovery:

```bash
node <skill-root>/scripts/extract-figma-screens.mjs \
  --frames <run-dir>/figma-frames.json \
  --out <run-dir>
```

This creates `figma-catalog.json`, `work-items/*.json`, and the initial
extraction report. It does not call Figma.

For each screen, the main agent then calls Figma MCP tools one screen at a time
and writes:

- `screens/<screenId>/figma-design-context.json`
- `screens/<screenId>/figma-screenshot.json` or a downloaded screenshot file
- `screens/<screenId>/assets/manifest.json`
- `screens/<screenId>/figma-mcp-status.json`

Only after complete design context is present should the screen receive a
complete `layoutSource`.

## Design Context

For each selected frame, call the design-context tool once and save the raw MCP
text response verbatim. Prefer `excludeScreenshot: true` for this call so the
layout source is the reference code/styles and not a mixed screenshot payload.
The response usually contains generated reference code, styles, node ids, and
asset URLs.

Do not replace the MCP response with a human summary. Phrases such as "Key
content includes", "Visible content", or "Embedded preview" are review notes,
not layout source. If the runtime cannot persist the raw response without
truncation, mark the screen `needs-layout-source`.

Also call `get_screenshot` for each selected frame. Store the screenshot URL or
downloaded image as visual parity evidence before generating HTML.

The design-context response or a full node tree is the layout source. A compact
summary that contains only frame dimensions, text strings, and image refs is not
enough to generate final HTML. If design context and full node tree extraction
both fail for a frame, keep the screenshot and summary, but mark the work item
`needs-layout-source` instead of `converted`.

If `get_design_context` output is truncated by the tool transcript, do not mark
the design context complete. Try one MCP-only repair pass using `use_figma` on
that exact screen node to produce a compact `figma-node-tree`:

- inspect only the target screen node, not the whole page;
- include major containers, all visible text nodes, option cards, CTA/header
  controls, media/image containers, and overlay/modal bounds;
- summarize or omit decorative vector descendants;
- keep measured bounds relative to the screen root;
- save the result as `screens/<screenId>/figma-node-tree.json`.

When the runtime cannot safely return or persist a large `use_figma` result
through the tool transcript, do not fall back to summaries or host-specific
callback receivers. Record `checks/mcp-capture-unavailable.json`, keep the
screen `needs-layout-source`, and ask the user to retry with a narrower frame or
provide an exported design context file. Convert the screen only in the same
main/worker context that receives the raw `get_design_context` output.

If that repair pass times out or is also truncated, leave the screen in
`needs-layout-source`. Do not apply, materialize, or publish partial layout
source.

Use this source priority:

1. `figma-design-context` with reference code and styles.
2. Full `figma-node-tree` with measured positions and visual properties.
3. `existing-html-minimal-edit` only when migrating an existing WebEmbed screen.

Do not use a screenshot-only or text-summary fallback for final publication.

## Assets

Download assets into the screen's `assets/` folder. Save a manifest mapping the
source asset reference to local filename:

```json
{
  "imgHero": "hero.png",
  "imgLogo": "logo.svg"
}
```

Prefer semantic filenames. If the type is ambiguous, inspect response headers or
file bytes before choosing an extension.
