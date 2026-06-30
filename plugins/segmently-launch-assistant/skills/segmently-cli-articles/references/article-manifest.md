# Segmently Article Manifest Reference

Use this reference when editing an exported article JSON from:

```bash
segmently --project <projectId> content-plan articles get <articleId> --output article.json
```

Apply the edited JSON with:

```bash
segmently --project <projectId> content-plan articles apply article.next.json --article-id <articleId>
```

## Top-Level Article

An article JSON includes:

- `id`, `projectId`, `title`, and `alias`
- `status`: `draft` or `published`
- `defaultLanguage`
- `representationProfile`: `standard`, `phone`, `tablet`, or `laptop`
- `flowDocument`
- optional `publishedUrl`, `configUrl`, `webShellVersion`, and `publishedAt`

Preserve fields you are not intentionally changing. When changing title,
alias, locale, or profile, prefer CLI flags on `apply` when available and keep
the JSON metadata in sync.

## Flow Document

The article is a single-screen V2 document:

- `flowDocument.schemaVersion` is `2.0.0`.
- `flowDocument.launchScreenId` points to the article screen.
- `flowDocument.metadata.kind` is `article`.
- `flowDocument.metadata.projectId`, `articleId`, and `alias` match the target.
- `flowDocument.metadata.articlePresentation.profiles` stores responsive page
  presentation settings.
- `flowDocument.content.flexibleLayout.sections` stores the article sections.

## Sections

Edit `content.flexibleLayout.sections` as a complete array. Keep stable
`section.id` values and sort by `order`.

Common section kinds:

- `Text`: headings, paragraphs, captions, notes.
- `Media`: images or video.
- `BulletList`: short editable lists.
- `CustomEmbed`: shaped HTML blocks such as hero shells, figure shells, grids,
  galleries, comparisons, and callouts.
- `Background`, `Header`, and `Footer`: screen-level markers; their actual
  content is stored on the screen-level content object.

Use separate sections for article body chunks that should remain easy to edit.

## Text

For editable article copy, store visible text in `textContent.title`.
`textContent.subtitle` may render in some contexts, but do not use it as the
only storage for normal body copy unless the user explicitly accepts that editor
support may be limited.

Typical shape:

```json
{
  "id": "intro",
  "kind": "Text",
  "order": 10,
  "layout": {
    "heightMode": "auto"
  },
  "textContent": {
    "title": {
      "text": "Intro paragraph",
      "appearance": {
        "fontSize": 18,
        "lineHeight": 1.45,
        "fontWeight": 400,
        "color": "#1f2937"
      }
    }
  }
}
```

## Media

Use `Media` for a single editable image or video. Prefer HTTPS URLs returned by
Segmently asset upload or article `add-image`.

Typical shape:

```json
{
  "id": "hero-image",
  "kind": "Media",
  "order": 20,
  "layout": {
    "heightMode": "fixed",
    "heightValue": 320
  },
  "mediaContent": {
    "kind": "Image",
    "url": "https://api.segmently.ai/assets/projects/<projectId>/hero.png",
    "alt": "Hero image"
  }
}
```

## Bullet Lists

Use `BulletList` for short editable item lists. Store visible item copy in
`optionsListContent.items[*].title`.

## Custom Embeds

Use `CustomEmbed` only when the article needs shaped layout that simple sections
cannot represent honestly: image grids, side-by-side comparisons, carousel-like
rails, branded callouts, or figure shells with controlled width.

Rules:

- Keep editable text, images, and list items in `embedContent.childSections`.
- Keep only layout, CSS, and behavior in `embedContent.html`.
- Read child data from `segmentlySDK` helpers such as
  `getChildSectionText()`, `getChildSectionMedia()`, `getChildSection()`, and
  `getChildSections()`.
- Do not hardcode editable article body copy or permanent image URLs directly
  in the HTML string.

## Responsive Presentation

Use `metadata.articlePresentation.profiles` for page/container-level behavior:
container width, content insets, and representation profile. Use section
`layout` for local spacing, height, background, border, radius, and alignment.

When reconstructing a source article, capture or estimate desktop and phone
layout separately. Do not make a laptop article a centered phone mock unless the
user explicitly wants phone-only presentation.

## Verification Checklist

After editing:

1. Apply the JSON to a draft article.
2. Re-export the article and confirm the intended fields persisted.
3. Publish only when the user wants a public URL.
4. Check the returned `publishedUrl` and `configUrl` with a read request.
5. If editor manageability matters, open the article editor and confirm key
   text/list/media values are editable before claiming the article is easy to
   maintain.
