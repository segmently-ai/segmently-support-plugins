# Conversion Guidelines

Convert the Figma design context into standalone WebEmbed HTML.

## HTML Rules

- Produce one complete `index.html` per work item.
- Use plain HTML, CSS, and browser JavaScript.
- Include `segmentlySDK.ready()` only when the screen needs data sources,
  variables, navigation, or product APIs.
- Keep CSS scoped to the screen.
- Reference local assets through `assets/<filename>` only as local preview
  fallbacks. Runtime image/video/icon sources must be represented by `Media`
  data sources and read through the SDK binding layer.
- Avoid external packages and network dependencies.

## Layout Source Gate

Do not generate publishable WebEmbed HTML from text summaries, screenshots, or a
generic template. Those artifacts are evidence, not layout source.

Before a screen can move to `converted`, it must have an explicit
`layoutSource` recorded in the catalog/work item:

```json
{
  "layoutSource": {
    "kind": "figma-design-context",
    "status": "complete",
    "file": "screens/S001/figma-design-context.json"
  }
}
```

Accepted `layoutSource.kind` values:

- `figma-design-context` - full design context/reference code from the Figma MCP
  design-context tool;
- `figma-node-tree` - full node tree with layout, text, fills, strokes, effects,
  typography, and child order;
- `existing-html-minimal-edit` - an existing WebEmbed HTML file that is being
  minimally edited to bind copy/media to data sources without changing layout.

Rejected as publishable HTML sources:

- `figma-node-summary`;
- `figma-screenshot`;
- `figma-render-fallback`;
- `text-summary`;
- any converter output that uses a reusable screen template instead of the
  source frame's measured layout.

If only screenshots and compact summaries are available, set the screen status
to `needs-layout-source` and stop. A screenshot-only fallback may be used only
for a local visual reference or for an explicitly user-approved throwaway smoke
test, and it must not be published as the final Figma import.

The generated HTML must preserve the source frame's measured structure:

- same major layer hierarchy and ordering;
- same frame dimensions/aspect ratio constraints;
- same visible image/card/text positions within normal responsive tolerances;
- no replacement of the design with a generic onboarding template.

## Conversion Decisions

Resolve these before writing final HTML. A decision may come from:

- `user` - the user answered for this run or screen;
- `project-profile` - an explicit reusable rule in `project-profile.json`;
- `screen-override` - an explicit exception recorded on one screen.

If a decision is detected but not answered by one of these sources, mark the
screen `needs-user-decision` instead of `converted`.

### Device Chrome: Status Bar And Home Indicator

Detect an OS/browser status bar when the Figma context contains signals such as
`System`, `Status Bar`, `Time Style`, `9:41`, `Battery`, `Wifi`, or
`Cellular Connection`. Also treat the bottom iOS home indicator stripe and any
decorative footer preview strip as the same class of device preview chrome.

When detected, ask the user whether to:

- `include` - copy the device chrome into the WebEmbed HTML;
- `omit` - remove the top status bar, bottom home indicator, and decorative
  footer preview strip because the Web Shell or host environment supplies
  chrome;
- `spacer` - remove the visual chrome but preserve equivalent safe-area
  spacing when the host does not provide it.

Do not automatically copy detected device chrome into generated WebEmbed HTML.
Record the answer in `conversionDecisions.statusBar`. If the decision is
`omit`, do not create `Media` data sources for status bar, home indicator, or
decorative footer preview strip assets, and make sure the generated HTML cannot
display them.

### Footer CTA Scroll Behavior

Detect a footer CTA when the frame has a bottom action such as `Continue`,
`Next`, `See my plan`, `Start`, purchase CTA, or a visually equivalent sticky
button/footer control.

When detected, ask the user which content model is intended:

- `scroll-with-content` - the CTA belongs to the scrolling content and moves
  away with the rest of the screen;
- `sticky-footer` - the CTA remains fixed/sticky at the bottom while content
  scrolls underneath it with bottom padding;
- `fixed-outside-scroll` - only the main content scrolls and the CTA sits
  outside the scroll container.

Record the answer in `conversionDecisions.footerCta`. Do not infer this from
the Figma layer order alone, because the same visual layout can represent
different runtime behavior.

When the decision is `sticky-footer` or `fixed-outside-scroll`, the CTA height
and vertical position must be stable across screens with different content
amounts. Do not let option count, selected state, or body copy length move the
footer to a different viewport height.

### Header Navigation Actions

Detect header actions when the frame contains any back, skip, close, dismiss,
or equivalent navigation control. Common signals include text `Skip`, `Back`,
`Close`, `Maybe later`, symbols such as `‹`, `←`, or `×`, and Figma layer names
such as `Navigation Icons`, `Back`, `Skip`, `Close`, `Header`, or `Top Bar`.

When a header action is detected, ask the user what runtime behavior it should
perform unless a `project-profile.json` rule already covers it. Valid examples:

- `navigateBack` - call `sdk.navigateBack()` if available;
- `navigateNext` - call `sdk.navigateNext()` or the current screen's primary
  next route;
- `navigateTo:<screenId>` - navigate to a known screen;
- `complete` - finish/exit the flow when the host SDK supports it;
- `custom-event:<name>` - dispatch a documented custom event for host code;
- `disabled` - render as non-interactive or omit the control.

Generated interactive header controls must be real controls, normally
`<button type="button">`, not passive `<span>` elements. Preserve the visual
class names when possible, but add accessible labels, `data-testid`, and event
listeners that implement the recorded behavior. Record the answer in
`conversionDecisions.headerActions`.

### Clickable Element Test IDs

Every clickable element generated from Figma must receive a stable
`data-testid` and an entry in `screens/<screenId>/updated/interaction-map.json`.
Use deterministic IDs based on the screen id and semantic role:

- `screen-S001-back`
- `screen-S001-skip`
- `screen-S001-primary`
- `screen-S001-secondary`
- `screen-S001-option-<slug>`
- `screen-S001-product-<slug>`

Selectors must be unique within the screen. If Figma has repeated option or
product labels, keep the visible label unchanged but append a deterministic
ordinal suffix to the `data-testid` and runtime value, for example
`screen-S007-option-marcus-curtis-2` and `marcus-curtis-2`. Never let two
clickable elements share the same selector in `interaction-map.json`.

For option cards, also record the variable write expectation in the interaction
map. For navigation actions, record the expected SDK call or target screen.
This map is used by the custom-screen handoff flow to build smoke-test routes
without rediscovering click targets from arbitrary HTML.

## Screen Kind

Classify every converted frame:

- `webembed-screen` for ordinary custom content;
- `webembed-paywall` for Web Embedded Paywall content.

For `webembed-paywall`, set `renderMode: "shadow-dom"` and `isIframe: false`
in the catalog. Do not duplicate paywall implementation guidance in this Figma
skill. Load `segmently-cli-custom-screen-guide/references/paywall.md` during
handoff for ProductCatalog, purchase SDK, routing, and audit requirements.

## Data Source Plan

Generated Figma WebEmbed screens are data-source-first. Every user-visible
text string and every replaceable visual asset must be represented in
`dataSourcePlan` and materialized into `LayoutSection[]`. HTML may keep the
original value only as a local preview fallback, never as the runtime source of
truth.
In short: data sources are the runtime source of truth.

Use:

- `Text` for single copy values such as headline, body, CTA, legal, error, or
  placeholder;
- `BulletList` for repeated bullet copy;
- `SingleSelectionList` for one-choice cards;
- `MultipleSelectionList` for multi-choice cards;
- `Media` for replaceable images, videos, icons, thumbnails, app icons,
  backgrounds, and card imagery;
- `ProductCatalog` for paywall product cards.

Do not hardcode final asset URLs, base64 blobs, or generated SVGs directly in
HTML when the image is part of the screen content. Store the asset URL in a
`Media` section and bind it by label, for example `Hero Image`, `Option Image
1`, or `Background Video`.

For option cards with images or icons, keep option text in the selection list
and store visuals in parallel `Media` sections keyed by stable labels. The
interaction map may include the same option test id, but the visual source
still comes from `Media`.

Generated runtime bindings must use the SDK's materialized child-section shape:
`getChildSectionText(label).title` for text, `getChildSectionMedia(label).url`
for media, and `getChildSection(label).data.options` for selection lists.
Do not bind generated HTML only to authoring-time fields such as
`mediaContent.url` or `optionsListContent.items`.

## Segmently SDK Binding

Prefer data-source fallbacks that preserve the visual content in local preview:

```js
segmentlySDK.ready().then(function (sdk) {
  var headline = sdk.getChildSectionText('Headline');
  if (headline && headline.title) {
    document.querySelector('[data-copy="headline"]').textContent = headline.title;
  }
  var hero = sdk.getChildSectionMedia('Hero Image');
  var heroUrl = hero && hero.url;
  if (heroUrl) {
    document.querySelector('[data-media="hero"]').src = heroUrl;
  }
});
```

## Quality Bar

- The first viewport should match the source frame's hierarchy and spacing.
- Buttons and form controls should remain interactive.
- Product screens should use SDK product APIs, not hardcoded prices.
- Generated screens should not rely on hardcoded user-facing copy or
  hardcoded image/video/icon URLs for runtime content.
- Do not generate apply commands from this skill.
