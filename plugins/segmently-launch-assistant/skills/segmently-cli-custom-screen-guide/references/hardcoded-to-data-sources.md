# Moving Hardcoded Content To Data Sources

The goal is to move content out of HTML while keeping layout and behavior
unchanged.

## Inventory

For each screen:

1. Save original HTML and data sources.
2. Identify visible strings, alt text, placeholders, error messages, button
   labels, option titles, option subtitles, list items, testimonial copy, and
   product card labels.
3. Identify image, video, icon, thumbnail, background, and app icon assets that
   are part of the user-facing screen content.
4. Mark strings that are business logic, selectors, CSS values, or external API
   payloads as not localizable content unless the user asks otherwise.
5. Keep the inventory close to the screen folder so changes can be reviewed
   against the original.

## Data Source Mapping

Use these mappings by default:

- single title, button, label, note, or error string: one `Text` section per
  value;
- CTA buttons that should branch to another screen: `Button`;
- ordered bullets or loading steps: `BulletList`;
- single-choice options, especially option cards that branch by item:
  `SingleSelectionList`;
- multi-choice options: `MultipleSelectionList`;
- static images or videos: `Media`;
- paywall products: `ProductCatalog`.

Text sections should be treated as title-only. If a screen has `title`,
`subtitle`, `cta`, and `footnote`, create four Text sections with stable labels
instead of relying on non-editor subtitle fields.

Media sections should own runtime asset URLs. HTML may keep a visual fallback
for local preview, but the applied screen must read images, videos, icons,
thumbnails, and content backgrounds from `Media` data sources. Do not leave
final asset URLs, generated SVG data URLs, or base64 image blobs hardcoded in
HTML when they are user-facing content.

## Minimal Binding Pattern

Prefer a tiny binding layer over rewriting the screen:

```html
<h1 data-copy="headline">Original headline</h1>
<button data-copy="cta">Continue</button>
<img data-media="hero" src="assets/hero.png" alt="">

<script>
segmentlySDK.ready().then(function (sdk) {
  function text(label, fallback) {
    var section = sdk.getChildSectionText(label);
    return section && section.title ? section.title : fallback;
  }

  document.querySelector('[data-copy="headline"]').textContent =
    text('Headline', 'Original headline');
  document.querySelector('[data-copy="cta"]').textContent =
    text('CTA', 'Continue');

  var hero = sdk.getChildSectionMedia('Hero Image');
  var heroUrl = hero && hero.url;
  if (heroUrl) {
    document.querySelector('[data-media="hero"]').src = heroUrl;
  }
});
</script>
```

Only add markers when existing selectors are not stable enough. Do not change
classes or layout wrappers just to make binding easier.

## Selection Lists

For `.option-card` style screens:

1. Preserve existing card markup and click handlers.
2. Create `SingleSelectionList` or `MultipleSelectionList` data sources.
3. Use option `title` and `subtitle` from current card copy.
4. Set `variableValue` from the current stored value, not from display text.
5. If callback conditions use enum option IDs, align `variableValue` with those
   option IDs before applying.

For single-choice branching, prefer a `SingleSelectionList` child data source
and `segmentlySDK.triggerOptionAction(labelOrId, optionIdOrIndex)`. The
destination should be an editor-managed graph edge on
`section.{childSectionId}.item.{index}`. Do not use this API for
`MultipleSelectionList`; multi-select screens should write the variable and use
an explicit fallback continue action.

## CTA Buttons

For a visible CTA that should branch independently from the parent WebEmbed
callback:

1. Create a `Button` child data source with the editor-owned label.
2. Render the existing HTML button yourself, binding its text from the `Button`
   section.
3. Call `segmentlySDK.triggerButtonAction(labelOrId)` from the click handler.
4. Connect the destination through `section.{childSectionId}.button`.

Keep `Text` data sources for non-action copy. Use `embed.callback` only when
the whole custom screen has a single fallback/continue transition.

## Review Checklist

- HTML diff changes only bindings, not layout.
- All `segmentlySDK.getChildSection*()` labels exist in `data-sources.json`.
- CTA and single-choice branches use `Button` / `SingleSelectionList` child
  action edges when possible.
- No display strings remain hardcoded unless deliberately kept as fallbacks.
- No user-facing image/video/icon asset remains hardcoded as the runtime
  source; it is backed by a `Media` data source.
- Existing `setVariable()` keys still exist in `variables.json`.
- Healthcheck passes before the next screen is touched.
