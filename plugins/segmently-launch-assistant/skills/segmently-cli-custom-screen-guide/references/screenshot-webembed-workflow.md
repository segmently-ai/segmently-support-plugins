# Screenshot-To-WebEmbed Custom Screen Workflow

Use this workflow when the source is one or more screenshot images and the
requested output is a Segmently WebEmbed custom screen or published onboarding.
This is a CLI artifact workflow. It is not a Figma handoff and it must not
claim Figma layout-source guarantees.

## Inputs

Required:

- screenshot file path or screenshot image reference;
- target project id;
- target funnel/version id, or permission to create a new dev/test funnel.

Optional:

- desired screen names and order;
- whether screenshot device chrome is app UI or preview chrome;
- intended CTA destinations;
- required legal or external URLs.

If the user has not specified the target funnel, create or clone a dev/test
funnel for first publication checks. Do not use a production funnel for the
first screenshot reproduction pass.

## Source Analysis

Inspect the screenshot visually and write down:

- screen count and order;
- viewport width/height;
- background treatment;
- text hierarchy and exact visible copy;
- buttons, links, and other interactive elements;
- decorative shapes and geometry;
- device chrome such as status bars, browser chrome, safe-area indicators, and
  home indicators.

Treat device chrome as preview chrome by default. Omit status bars, browser
bars, and other OS preview controls unless the user explicitly says they are
part of the product UI. If the user corrects a chrome decision, update the HTML,
data sources, interaction map, and visual report before publishing.

## Artifact Layout

Create a normal `custom-screen-catalog.json` run directory. For screenshot
source runs, use:

```json
{
  "schemaVersion": "custom-screen-cli-catalog/v1",
  "source": {
    "kind": "screenshot-reference",
    "file": "path/to/reference.png",
    "dimensions": { "width": 838, "height": 858 }
  },
  "outputDir": "."
}
```

When the catalog file lives inside the run directory, set `outputDir` to `"."`.
This avoids resolving `screens/...` paths as `<run-dir>/<run-dir>/screens/...`
when using the full-flow helper script.

For each screen, create:

```text
screens/<screenId>/
  original/
    source.json
    data-sources.json
  updated/
    index.html
    data-sources.json
    interaction-map.json
  checks/
```

Also create:

```text
checks/
  visual-baseline.json
  visual-report.json
preview.html
```

`original/source.json` should record the screenshot reference and manual
analysis. `original/data-sources.json` can be an empty array for newly created
screens.

## HTML Generation Rules

Build editable HTML/CSS/JS. Do not use the screenshot as a single runtime
background bitmap. Recreate the layout with CSS, SVG, DOM elements, gradients,
and data-source-backed text. Use Media data sources only for real content
images that must remain images, and migrate them to stable project/CDN URLs
before publishing.

Move visible text into `updated/data-sources.json` as Text child sections, and
read those sections by exact label or id:

```js
var section = sdk.getChildSectionText("Headline");
if (node && section && section.title) node.textContent = section.title;
```

Do not invent labels that differ from the HTML SDK references. Treat Text data
sources as title-only unless an exported source screen proves richer fields are
supported.

Generated HTML must include:

- `segmentlySDK.ready()` or `segmentlySDKReady` initialization;
- stable `data-testid` attributes for every important visual assertion and
  interactive element;
- `trackEvent` calls for meaningful interactions;
- `navigateNext` / `navigateBack` only where the interaction map says routing
  is expected.

For splash/loading screens, use a short SDK-backed `navigateNext()` timeout only
when the desired onboarding flow should automatically advance. Record this in
`interaction-map.json` as an `autoAdvance` action with `delayMs`.

## Visual Geometry Checks

Check generated decorative geometry directly. Screenshot reproduction often
fails through small math mistakes rather than missing elements. Examples:

- circular rings must use equal x/y radius math, not y-axis compression;
- fixed CTA/footer elements must not overlap legal text;
- text must fit in the mobile viewport without horizontal overflow;
- status bar selectors must be absent when status chrome is omitted.

Prefer stable dimensions and explicit responsive breakpoints over viewport-based
font scaling.

## Link And CTA Rules

Clickable legal links must use real HTTPS URLs, not `href="#"`. Use:

```html
<a href="https://example.org/terms" target="_blank" rel="noopener noreferrer">
  Terms of Service
</a>
```

For iframe WebEmbed screens, runtime supports popups through the iframe sandbox.
Still add a click handler when you need tracking:

```js
link.addEventListener("click", function (event) {
  sdk.trackEvent("legal_link_clicked", { url: link.href });
  event.preventDefault();
  window.open(link.href, "_blank", "noopener,noreferrer");
});
```

Record each legal link in `interaction-map.json` with
`action.type: "openUrl"` and the exact URL. Verify with browser automation that
clicking the link opens a new page and that the opened URL is correct.

For primary CTAs, record `action.type: "navigateNext"` when the button should
advance. If a user adds a downstream test screen to verify the transition, do
not delete that screen or edge during cleanup.

## Local Validation Before CLI Apply

Also run a fast artifact check:

- JSON parse all `custom-screen-catalog.json`, `data-sources.json`, and
  `interaction-map.json` files;
- parse inline `<script>` bodies with `new Function(...)`;
- search for forbidden leftovers such as `href="#"`, omitted chrome selectors,
  or known bad geometry expressions;
- open `preview.html` in a browser runner;
- assert each iframe loaded by `data-testid`;
- assert `documentElement.scrollHeight <= innerHeight` for fixed mobile
  screens when no scrolling is expected;
- capture preview screenshots under the run directory for visual inspection.

For legal links, check popup behavior locally before applying:

- click each `interaction-map` legal selector;
- wait for a new browser page;
- assert the opened URL starts with the expected HTTPS origin;
- close the popup and continue the smoke run.

## CLI Apply And Publish

Apply one screen at a time:

```bash
segmently funnels custom-screen apply <funnelId> <versionId> <projectId> \
  --screen <screenId> \
  --create \
  --name "<screenName>" \
  --html-file screens/<screenId>/updated/index.html \
  --data-sources-file screens/<screenId>/updated/data-sources.json \
  --iframe true \
  --position <x,y>
```

Pass `--launch` only for the first screen in a new test funnel. After each
screen:

```bash
segmently funnels custom-screen healthcheck <funnelId> <versionId> <screenId> <projectId>
```

Link screens only after all required screens exist. A catalog-order linear route
is acceptable for smoke testing when the user explicitly wants the flow to
advance through generated screens and no authored edges exist.

Then run:

```bash
segmently funnels audit <funnelId> <versionId> <projectId>
segmently publish web <projectId> --funnel <funnelId> --version-id <versionId> --alias <alias>
segmently publish verify <projectId> --url /<alias>
```

If `publish verify` fails with a backend `fetch failed` but publish web returned
success, do not treat the deployment as proven yet. Run replacement checks using
the published URL and config URL returned by the CLI:

- `curl -I <published-url>`;
- `curl -I <published-config-url>`;
- browser smoke against the published URL and the `about:srcdoc` WebEmbed
  frame.

Record the verify failure and the direct replacement checks in
`checks/visual-report.json`.

## Published Browser Smoke

After publishing, use the interaction map rather than visible text:

- wait for auto-advance screens to settle;
- find the WebEmbed frame;
- assert required `data-testid` elements exist;
- assert omitted chrome selectors are absent;
- click legal links and verify popup URLs;
- click primary CTA and verify the expected next screen or test screen appears;
- capture screenshots before and after navigation when both states matter.

Write `checks/visual-report.json` with:

- published URL and alias;
- screenshots;
- screen ids and smoke results;
- chrome decisions;
- link URLs and popup result;
- CTA routing result;
- known warnings, such as intentional final dead-end screens.

Use explicit smoke keys when possible, for example:

```json
{
  "legalPopupOpened": true,
  "primaryCtaNavigatesToTestScreen": true,
  "statusChromeSelectorCount": 0,
  "orbRingShape": "circle"
}
```

## Iteration Rules

When the user reports a visual or behavior mismatch:

1. Patch only the affected `updated/index.html`, `data-sources.json`, or
   `interaction-map.json`.
2. Re-run local parse and browser preview checks.
3. Re-apply only the affected screen.
4. Re-run that screen's healthcheck.
5. Re-publish the same alias when the user expects the public URL to update.
6. Re-run published browser smoke and update `visual-report.json`.

Do not clean up user-added screens or edges unless the user asks for cleanup.
