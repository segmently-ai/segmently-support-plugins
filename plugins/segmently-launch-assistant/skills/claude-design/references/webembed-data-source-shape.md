# WebEmbed Data Source Shape

Use this reference when converting standalone Claude Design HTML into a Segmently
WebEmbed custom screen. The goal is to make the editor's Data Sources panel own
customer-visible content while the HTML stays a renderer.

## Section Shape

Each editable content source is a StepContent-style section:

```json
{
  "id": "hero-title",
  "kind": "Text",
  "label": "Hero title",
  "textContent": {
    "translations": {
      "en": {
        "title": "Start your plan"
      }
    }
  }
}
```

Use the same pattern for media and options:

```json
{
  "id": "hero-media",
  "kind": "Media",
  "label": "Hero media",
  "mediaContent": {
    "url": "https://example.com/image.png",
    "type": "image"
  }
}
```

```json
{
  "id": "plan-options",
  "kind": "OptionsList",
  "label": "Plan options",
  "optionsListContent": {
    "items": [
      { "id": "monthly", "title": "Monthly" },
      { "id": "yearly", "title": "Yearly" }
    ]
  }
}
```

## Runtime Access

In the HTML, read content through `segmentlySDK` by section label:

```js
const title = await segmentlySDK.getChildSectionText('Hero title');
const media = await segmentlySDK.getChildSectionMedia('Hero media');
const options = await segmentlySDK.getChildSection('Plan options');
```

The label passed to the SDK must match the section label exactly. Keep fallback
text or images only for local preview; customer-facing content should come from
Segmently data sources.

## Common Failure

Do not use a flat shape like:

```json
{ "type": "Text", "title": "Start your plan" }
```

That shape can make the HTML preview appear correct while the editor's Data
Sources panel is empty.
