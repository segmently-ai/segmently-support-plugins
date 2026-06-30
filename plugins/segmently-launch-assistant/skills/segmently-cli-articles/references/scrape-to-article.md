# Scrape Source Article Into Segmently Article

Use this workflow when a user provides a URL and asks to recreate, copy, adapt,
or transform the source page into a Segmently Content Plan article. The output is
a FlexibleLayout article manifest that can be applied and published with
`segmently content-plan articles`.

## Mode Selection

Choose the mode before scraping beyond basic page inspection.

### `exact-copy`

Use only when the user explicitly confirms they own the source article or have
permission to reproduce it. In this mode:

- Preserve the title, text, order, section meaning, and media as closely as the
  Segmently article format allows.
- Download source media into local artifacts and upload owned media to the
  Segmently CDN before public publication where possible.
- Avoid hotlinking source assets in a published dev/stage/prod article unless
  the user explicitly accepts it for a temporary test.
- Keep a source URL note in local working notes or metadata so the case can be
  audited later.

### `adapted`

Use this mode by default when ownership/permission is not explicit, or when the
user asks to avoid copyright risk. In this mode:

- Treat the source as research and structure, not reusable copy.
- Rewrite title, headings, paragraphs, bullets, captions, and CTAs in original
  wording. Do not preserve distinctive sentences or the source article's exact
  expression.
- Replace images, GIFs, screenshots, icons, diagrams, and illustrations with
  owned, licensed, generated, or user-provided alternatives.
- Describe needed visuals from their purpose and layout, not as instructions to
  clone the source image.
- Keep facts, citations, and product names only when they are necessary and
  accurate for the new article.

This is workflow guidance, not legal advice. If the user needs a binding legal
review, stop and ask them to provide legal approval.

## Artifact Layout

Prefer deterministic, reviewable artifacts:

```text
segmently-articles/<slug>/article.json
segmently-articles/<slug>/article.next.json
segmently-articles/<slug>/notes.md
segmently-articles/<slug>/assets/<asset-name>.<ext>
segmently-articles/<slug>/screenshots/source-desktop.png
segmently-articles/<slug>/screenshots/source-phone.png
segmently-articles/<slug>/screenshots/published-desktop.png
segmently-articles/<slug>/screenshots/published-phone.png
```

Use the customer's current workspace or a clearly named working directory. Do
not require a Segmently source checkout.

## Scraping Procedure

Use Playwright/browser automation for dynamic pages.

1. Open the source URL and wait for network idle or for the main article text.
2. Capture a full-page screenshot before extraction.
3. Extract page metadata: `title`, canonical URL, language, meta description,
   main headings, and publication/update dates if present.
4. Extract main text from semantic containers first:
   `article`, `main`, `[role="main"]`, then known CMS containers.
5. Extract media inventory:
   - `<img>` `src`, `srcset`, `alt`, rendered size, natural size.
   - CSS background images on visible hero/container elements.
   - `<video>`, `<source>`, animated GIFs, and iframes.
   - Captions and nearby text for context.
6. Record the DOM order of headings, paragraphs, lists, images, embeds, and
   callouts. Preserve this order in `exact-copy`; use it as an outline in
   `adapted`.
7. Save raw extraction JSON or notes locally when the page structure is complex.

For exact-copy or high-fidelity reconstruction, add a visual parity pass before
building the final manifest:

1. Capture source screenshots at desktop and phone widths. Add tablet when the
   source has a distinct tablet layout.
2. Measure rendered DOM metrics for the visible article elements:
   - hero title x/y/width/height, font size, line height, weight, color, and
     vertical position;
   - body text, heading, caption, and list typography;
   - paragraph/list margins and vertical gaps;
   - rendered image widths/heights and their mobile overrides;
   - gallery/carousel card widths, heights, gaps, overflow behavior, caption
     placement, and image `object-fit`.
3. Save the measurements next to the screenshots so the build can be audited
   later.
4. Encode the measured choices in `article.next.json` or in working notes next
   to the manifest so a future update can repeat the same visual decisions.

Useful browser-side extraction shape:

```js
await page.evaluate(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  const textNodes = [...document.querySelectorAll('h1,h2,h3,p,li,blockquote')]
    .filter(visible)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: element.textContent.trim(),
    }))
    .filter((item) => item.text);

  const images = [...document.images]
    .filter(visible)
    .map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt || '',
      width: image.naturalWidth,
      height: image.naturalHeight,
      renderedWidth: Math.round(image.getBoundingClientRect().width),
      renderedHeight: Math.round(image.getBoundingClientRect().height),
    }));

  const backgrounds = [...document.querySelectorAll('*')]
    .filter(visible)
    .map((element) => {
      const backgroundImage = getComputedStyle(element).backgroundImage;
      return backgroundImage && backgroundImage !== 'none'
        ? { tag: element.tagName.toLowerCase(), backgroundImage }
        : null;
    })
    .filter(Boolean);

  return { url: location.href, title: document.title, textNodes, images, backgrounds };
});
```

## Media Handling

### Exact-copy media

- Download only after permission is confirmed.
- Prefer original media URLs over resized preview URLs when the source exposes
  both, but keep the rendered dimensions for layout.
- Upload local media to Segmently before publishing:

```bash
segmently --project <projectId> assets upload-image \
  --file /absolute/path/image.png \
  --folder articles/<slug> \
  --name hero \
  --asset
```

- Use the returned `original` URL in regular `Media` sections or in
  `CustomEmbed` child `Media` data-source sections. Do not hardcode uploaded
  image URLs directly in `CustomEmbed` HTML when the image should remain
  editable.
- If a media type is not supported by the upload command, ask whether to keep
  the source URL for a temporary dev test or provide/upload another asset path.

### Adapted media

- Do not publish source images or visually near-identical recreations unless
  they are licensed or owned.
- Build an image brief for each visual: purpose, key idea, aspect ratio, style,
  required text/no-text, and placement.
- Use user-provided brand assets, Segmently-owned assets, licensed stock, or
  generated images. Upload the final images to Segmently CDN.
- For screenshots of software UIs, prefer newly created screenshots from the
  user's own product or a neutral schematic instead of copying the source.

## Section Mapping

Map the source into the smallest useful set of FlexibleLayout sections:

| Source pattern | Preferred article section |
|---|---|
| Hero with background/image and title overlay | `CustomEmbed` hero or `Media` + `Text` |
| Main image, GIF, screenshot, diagram | `Media` |
| Paragraph group | `Text` |
| Ordered/unordered key points | `BulletList` |
| Complex callout or branded HTML block | `CustomEmbed` |
| Image grid, gallery, side-by-side examples, before/after, or comparison layout | `CustomEmbed` with child `Media`/`Text` data sources |
| Source carousel, horizontal screenshot rail, or offscreen/overlapping card sequence | `CustomEmbed` carousel/rail shell with child `Media`/`Text` data sources |
| Width-constrained figure that native `Media` stretches incorrectly | `CustomEmbed` figure shell with child `Media` and optional child `Text` caption |
| Repeated cards or steps | `BulletList` first; custom HTML only if layout matters |
| Raw embed/iframe | `CustomEmbed`, with sandbox and responsive sizing checked |

Keep first-pass article cases focused on `Text`, `Media`, `BulletList`, and
`CustomEmbed`. Add richer section helpers only after a repeated editorial need
appears.

For editable article text, use one `Text` section per paragraph, heading,
caption, note, or small paragraph group, and store the visible text in
`textContent.title`. Do not place article body copy only in
`textContent.subtitle`: the schema allows it, but the current reused
FlexibleLayout `Text` editor exposes only the title field. `subtitle` can be
used later only after the editor supports it or when the text is intentionally
not part of the manual editing workflow.

Before applying a scraped article manifest, run an editor-manageability audit:

- Every source paragraph, heading, caption, or note that an editor should manage
  must map to a `Text` section with `textContent.title`.
- No `Text` section should contain visible article copy only in
  `textContent.subtitle`.
- Lists that editors should manage should map to `BulletList`
  `optionsListContent.items[*].title`.
- `CustomEmbed.embedContent.html` should contain only intentional HTML blocks
  such as a hero, callout, iframe, or branded composition. Do not hide normal
  body paragraphs in HTML just because it was faster to scrape.
- When `CustomEmbed` needs visible text, images, or list content, create
  `embedContent.childSections` data sources for those values. The HTML should
  read them through the SDK, for example:
  `segmentlySDK.getChildSectionText('hero-title')`,
  `segmentlySDK.getChildSectionMedia('hero-image')`, or
  `segmentlySDK.getChildSection('hero-list')`. Keep only layout/CSS/behavior in
  the HTML. Do not hardcode editable text or image URLs directly in
  `embedContent.html`.
- Use `CustomEmbed` for source image grids or galleries when the current
  FlexibleLayout section set would flatten the intended composition into a
  misleading vertical list. The embed HTML should act as the layout shell
  (`display: grid`, responsive columns, figure/caption styling, spacing, and
  optional light behavior). Each grid item must still be an editable child data
  source: use `Media` child sections for images and `Text` child sections for
  captions/headings. Avoid putting image URLs, captions, or visible article copy
  directly in the HTML string.
- Prefer reusable `content-plan article-blocks add ...` presets before writing
  one-off HTML:
  - use `image-grid` for grids, galleries, comparisons, before/after blocks, and
    multi-image compositions;
  - use `callout` for editorial notes, branded side notes, warnings, quotes, and
    key insight panels.
  Use one-off `CustomEmbed` only when no existing custom block preset fits the
  source composition. For tall mobile screenshots in `image-grid`, pass
  `--image-max-height` and `--phone-image-max-height` so the source composition
  stays readable without hardcoding CSS in the article HTML.
- If the source has a carousel or horizontal phone-screenshot rail, preserve the
  interaction and proportions rather than converting it to a regular grid.
  Source-shaped custom blocks may use horizontal scrolling, snap points,
  offscreen cards, overlay captions, and desktop/mobile card dimensions measured
  from the source, but image URLs and captions must remain child data sources.
- If native article `Media` sections render too wide, use a figure `CustomEmbed`
  shell. The shell should enforce the measured desktop/mobile max width and
  image fit; the child `Media` section supplies the editable image and the child
  `Text` section supplies the editable caption.
- When polishing a source article, make typography explicit. Do not assume
  current article defaults match the source; copy measured font sizes,
  line-heights, weights, colors, and spacing into `textContent.title.appearance`,
  `optionsListContent.items[*].title.appearance`, article presentation profiles,
  or the custom block CSS shell as appropriate.

## Manifest Build

1. Create or clone a draft article:

```bash
segmently --project <projectId> content-plan articles create \
  --title "<title>" \
  --alias <slug> \
  --locale en
```

2. Export the draft:

```bash
segmently --project <projectId> content-plan articles get <articleId> \
  --output article.json
```

3. Edit the full manifest directly using `references/article-manifest.md`.
   Preserve the exported top-level article fields, replace or append sections
   with stable ids, and keep complex HTML visible content in child data-source
   sections.

4. Review before apply:
   - JSON parses successfully.
   - The article still has one launch screen and `metadata.kind = "article"`.
   - `content.flexibleLayout.sections` is an array sorted by `order`.
   - Important editable paragraphs live in `Text.textContent.title`.
   - `CustomEmbed` visible text/media lives in `childSections`.

5. Apply and publish:

```bash
segmently --project <projectId> content-plan articles apply article.next.json \
  --article-id <articleId> \
  --title "<title>" \
  --alias <slug> \
  --profile laptop

segmently --project <projectId> content-plan articles publish <articleId>
```

## Responsive Layout Rules

- Always check desktop, tablet, and phone before publishing.
- Use article presentation profiles for page/container behavior.
- Use section `layout` only for local spacing, height, background, and border
  decisions.
- Keep desktop/laptop as a real desktop layout with a wider article container;
  do not treat it as a phone preview centered on the page.
- Tune large vertical paddings carefully. A value that looks acceptable on
  desktop can create huge empty regions on mobile if it is not overridden.
- For GIFs/screenshots, use a stable section height and scale mode that preserves
  aspect ratio.
- For copied source articles, compare source and generated desktop/phone
  screenshots side by side. Check hero placement, text line length, image width,
  carousel/rail behavior, caption placement, and total vertical rhythm.
- Keep measured visual decisions in `article.next.json` or working notes when
  the article is generated from scraped source data. A rebuilt article should
  not lose custom figure widths, carousel dimensions, or typography overrides.

## Preview And QA

Before `apply`, create a local preview when the layout is non-trivial.

- Use an HTTP server instead of opening `file://` if the preview loads local
  JSON/assets with `fetch`.
- Capture screenshots for desktop, tablet, and phone.
- Check browser console errors. A known sandbox warning from `CustomEmbed`
  iframes can be acceptable; network, script, or image decode errors are not.
- Verify the following in the DOM:
  - title/hero visible,
  - all expected paragraphs/lists present,
  - media has non-zero natural dimensions,
  - no section has accidental extreme height,
  - final note/CTA is reachable on mobile.
- Verify the manifest can be managed in the article editor when the user wants
  maintainability proof:
  - Text sections open in the editor and show the current body copy.
  - List items are visible and editable.
  - CustomEmbed data sources expose editable `Text`, `Media`, or `BulletList`
    child values instead of hiding normal body copy in HTML.
  - A representative text or list item can be changed on a draft and read back
    with `content-plan articles get` after the user approves that edit.

After `publish`, verify:

```bash
curl -I <publishedUrl>
curl -I <configUrl>
```

Then open the published URL in a browser and capture desktop and mobile
screenshots for the user when visual proof was requested.

## Completion Response

Return:

- Mode used: `exact-copy` or `adapted`.
- Article id, alias, project id, and published URL.
- Config URL when available.
- Asset handling summary: uploaded Segmently CDN assets or intentional temporary
  external URLs.
- Validation summary: manifest validation, HTTP checks, browser console, and
  screenshots.

Do not claim copyright safety. Say what was copied with permission or what was
rewritten/replaced to reduce reuse of protected expression.
