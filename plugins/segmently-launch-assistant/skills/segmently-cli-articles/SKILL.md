---
name: segmently-cli-articles
description: "Use this Segmently skill for detailed CLI work with Content Plan HTML articles: create/get/apply/clone/add-image/publish Flexible Layout article drafts, edit full FlowDocument manifests, configure article sections and responsive presentation settings, and return custom-domain article URLs plus asset verification URLs. Also trigger when Segmently Launch Assistant returns articleFetch.owningSkill, executeWith.skill, or owningSkill=segmently-cli-articles for full article lookup, article URL/body fetch, or support article maintenance."
---

# Segmently CLI Articles

Use this skill when the user asks to create, edit, clone, configure, publish, or
inspect Segmently HTML articles. Articles are single-screen V2 `FlexibleLayout`
documents stored under a project and published as static article assets served
through the project's configured article custom domain.

For general CLI usage, auth, scopes, and environment selection, use
`segmently-cli-guide`. This skill is self-contained for customer/runtime use and
does not require a Segmently repository checkout.

## Required Context

Read these packaged references only as needed:

- `references/article-manifest.md` for the public article JSON shape, section
  kinds, responsive presentation fields, and editing rules.
- `references/scrape-to-article.md` when a user provides a URL and asks to
  scrape, copy, adapt, or reconstruct an external/source article as a Segmently
  article.

## Command Surface

All commands are under:

```bash
segmently content-plan articles <command>
```

Commands:

| Command | Purpose |
|---|---|
| `list [projectId] --status draft|published --limit N` | List article drafts. |
| `get <articleId> [projectId] --output article.json` | Export the full article including `flowDocument`. |
| `create [projectId] --title --alias --locale` | Create a default FlexibleLayout article draft. |
| `apply <file|-> [projectId] --article-id --title --alias --locale --profile` | Create/update a draft from full JSON. |
| `clone <articleId> [projectId] --title --alias` | Copy an article and all FlexibleLayout settings into a new draft. |
| `add-image <articleId> [projectId] --url ...` | Add a Media section from an existing public/CDN URL. |
| `add-image <articleId> [projectId] --file ...` | Upload a local image, then add a Media section. |
| `publish <articleId> [projectId]` | Publish the draft to article storage and return the custom-domain public URL plus asset verification URLs. |

Reusable local manifest block commands:

| Command | Purpose |
|---|---|
| `article-blocks list` | List reusable article `CustomEmbed` presets. |
| `article-blocks add image-grid --file article.json --section-id <id> --items-file items.json --design-system-file package.json --design-profile carousel_square --out article.next.json` | Add a responsive image-grid CustomEmbed with editable child `Media`/`Text` data sources and resolved design tokens. Use `--image-max-height` / `--phone-image-max-height` for tall phone screenshots. |
| `article-blocks add callout --file article.json --section-id <id> --content-file callout.json --design-system-file package.json --design-profile carousel_square --out article.next.json` | Add a responsive editorial callout CustomEmbed with editable child `Text` data sources for eyebrow/title/body and resolved design tokens. |

## Auth, Scopes, And Access

- User auth: `segmently auth login`; verify it with `segmently auth status`.
- Automation auth: use a scoped Segmently service token stored in the
  customer's secret manager, never pasted into chat or committed to files.
- Required CLI scopes:
  - `content-plan:read` for `list` and `get`.
  - `content-plan:write` for `create`, `apply`, `clone`, `add-image`, and `publish`.
  - `assets:write` is also required when `add-image --file` uploads a local image.
- Required project entitlement: `content_plan.access`.
- For `add-image --file`, the customer account also needs the CLI asset upload
  entitlement (`cli_assets.upload_image`).

Never print token values or refresh tokens. If a command returns `401`,
authenticate. If it returns `403`, check both service-token scopes and project entitlements.
If it returns `404`, verify the target backend has the matching `/api/cli/v1`
article routes deployed.

## Standard Workflows

### Create And Publish A Simple Article

```bash
segmently --project <projectId> content-plan articles create \
  --title "How to launch a paid onboarding" \
  --alias paid-onboarding-launch \
  --locale en

segmently --project <projectId> content-plan articles publish <articleId>
```

Return the `url` / `publishedUrl` from the publish response to the user; it is
the customer-facing custom-domain URL when the project has an article domain.
Use `assetUrl` and `configUrl` for technical verification. Verify with `curl -I`
when a public URL is requested.

### Edit Full Article UI Through JSON

```bash
segmently --project <projectId> content-plan articles get <articleId> \
  --output article.json

# Edit article.json: title, alias, representationProfile, flowDocument metadata,
# and content.flexibleLayout.sections.

segmently --project <projectId> content-plan articles apply article.json \
  --article-id <articleId>

segmently --project <projectId> content-plan articles publish <articleId>
```

Use this path for detailed UI control. Do not try to patch deep section fields
through unsupported CLI flags; export, edit the manifest, apply the whole
article, then publish.

For deterministic JSON edits before `apply`, use the public shape in
`references/article-manifest.md`. Keep edits small and reviewable:

- preserve the exported top-level article fields;
- update `flowDocument.content.flexibleLayout.sections` as a whole array;
- keep stable section ids and sorted `order` values;
- store manually editable article body text in `Text.textContent.title`;
- put complex grids, galleries, and callouts in `CustomEmbed` shells only when
  a simple `Text`, `Media`, or `BulletList` section would misrepresent the
  layout.

Keep first-pass article operations focused on text, media/images, simple lists,
and custom HTML; add button/product/paywall/text-field helpers later only after
those patterns become common.

### Scrape A Source Article Into A Segmently Article

When the user provides a source article URL, read
`references/scrape-to-article.md` before doing the work. That workflow has two
modes:

- `exact-copy`: use only when the user explicitly confirms they own the source
  article or have permission to reproduce it. Preserve text and media, avoid
  hotlinking third-party assets when publishing, and upload owned assets to the
  Segmently CDN where possible.
- `adapted`: default when rights are not explicit. Use the source as structure
  and research input, rewrite text into a new article, and replace source media
  with owned, licensed, generated, or user-provided assets.

For both modes, produce a FlexibleLayout article manifest using
`references/article-manifest.md`, audit editor manageability, preview
desktop/tablet/phone layouts when visual fidelity matters, apply through the
article CLI, publish, and return the published article URL plus verification
evidence.

For visual reconstruction work, do not rely only on semantic extraction. Open
the source article in desktop and phone viewports, capture screenshots, and
measure visible layout metrics before building the final manifest:

- hero title font size, line height, weight, width, vertical position, and
  mobile overrides;
- body, heading, caption, and list typography, including line height and
  paragraph/list gaps;
- rendered image widths/heights on desktop and phone;
- gallery/carousel behavior: horizontal scroll, overlap/offscreen cards,
  captions, image fit, and mobile slide dimensions;
- page/container width and background color.

Encode those measured decisions in the article manifest or in customer-owned
working notes so future updates preserve the visual match. If native `Media`
sections stretch too wide, convert them to `CustomEmbed` figure shells with
editable child `Media` and optional child `Text` caption data sources. If the
source uses a carousel, gallery, phone-screenshot rail, comparison, or other
shaped layout, preserve that shape as a `CustomEmbed` shell and keep all
images/captions as child data sources. The HTML may contain CSS/behavior only;
visible content must come from `segmentlySDK`.

### Clone Existing Settings

```bash
segmently --project <projectId> content-plan articles clone <sourceArticleId> \
  --title "New article title" \
  --alias new-article-alias
```

Clone copies the full `flowDocument`, `representationProfile`, responsive
presentation metadata, sections, section layouts, and media references. It
retargets `metadata.articleId`, `metadata.alias`, `launchScreenId`, and the
launch screen name. It creates a `draft` and clears publication metadata.

### Add Images

Existing URL:

```bash
segmently --project <projectId> content-plan articles add-image <articleId> \
  --url https://api.segmently.ai/assets/projects/<projectId>/hero.png \
  --label "Hero image" \
  --order 2 \
  --height 320
```

Local file upload:

```bash
segmently --project <projectId> content-plan articles add-image <articleId> \
  --file /absolute/path/hero.png \
  --name hero \
  --label "Hero image" \
  --height 320
```

The command adds a `Media` section with `mediaContent.kind = "Image"`.

## Article Data Model

An article is a project document with:

- `id`, `projectId`, `title`, `alias`
- `status`: `draft` or `published`
- `defaultLanguage`
- `representationProfile`: `standard`, `phone`, `tablet`, or `laptop`
- `flowDocument`: full V2 `FlowDocument`
- optional `publishedUrl`, `configUrl`, `webShellVersion`, `publishedAt`
- new publishes may also include `assetUrl`, `gatewayUrl`, and
  `customDomainUrl`; treat `publishedUrl` as the customer-facing public URL and
  `assetUrl` as the direct `assets/articles` HTML storage URL.

The `flowDocument` must be a single-screen article:

- `schemaVersion = "2.0.0"`
- `launchScreenId` points to a `FlexibleLayout` screen.
- `metadata.kind = "article"`
- `metadata.projectId`, `metadata.articleId`, and `metadata.alias` match the
  target project/article/alias.
- `metadata.articlePresentation` stores responsive article presentation
  profiles.

For full structure and examples, read the packaged
`references/article-manifest.md`.

## Section Editing Rules

- Always edit `content.flexibleLayout.sections` as a complete array.
- Do not depend on array index paths for durable edits; keep stable `section.id`
  values and sort by `order`.
- For article MVP `Text` sections, put every manually editable paragraph,
  heading, caption, and note in `textContent.title`. The current reused
  FlexibleLayout text editor is title-only; `textContent.subtitle` is schema
  valid and may render, but it is not exposed by the current article editor.
  Use separate `Text` sections with stable IDs instead of putting article body
  copy in `subtitle`.
- Treat editor manageability as part of the manifest contract. Before applying
  a CLI/scraped article, audit that:
  - no `Text` section stores visible article copy only in `textContent.subtitle`;
  - source/body paragraphs that should be manually editable are represented by
    `Text` sections with `textContent.title`;
  - short lists that editors should manage are represented by `BulletList`
    `optionsListContent.items[*].title`;
  - `CustomEmbed.embedContent.html` is used only for intentionally HTML-shaped
    blocks and does not hide ordinary article body copy unless the user accepts
    that it will be edited as HTML;
  - when `CustomEmbed` has visible copy or images, those values live in
    `embedContent.childSections` as `Text`, `Media`, or `BulletList` data-source
    sections, and the HTML reads them through
    `segmentlySDK.getChildSectionText()`, `segmentlySDK.getChildSectionMedia()`,
    `segmentlySDK.getChildSection()`, or `segmentlySDK.getChildSections()`.
    Do not hardcode editable text or image URLs inside `embedContent.html`.
  - image grids, galleries, comparison layouts, or multi-image compositions that
    cannot be represented cleanly with simple sequential `Media`/`Text` sections
    should be implemented as a `CustomEmbed` HTML layout shell. Keep each image,
    caption, heading, or list item as an editable child data-source section
    (`Media`, `Text`, or `BulletList`) and let the HTML only define the grid,
    spacing, responsive CSS, and rendering behavior.
- Treat visual consistency as part of the scrape/build contract:
  - compare desktop and phone source screenshots before publishing;
  - make single figures width-constrained to the measured source width instead
    of allowing the article container to stretch them;
  - make progress screenshots or other intentionally full-width media use their
    own measured width rules;
  - map source carousels and screenshot rails to source-shaped custom blocks
    instead of flattening them to a standard grid;
  - keep desktop/laptop as a real desktop article layout, not a centered phone
    representation;
  - put the measured values in the article manifest or customer-owned working
    notes so future rebuilds preserve the visual match.
- Use `layout` for height, flex, padding, margins, background, border, and
  corner radius.
- Use `textContent`, `mediaContent`, `buttonContent`, `optionsListContent`,
  `productCatalogContent`, or `embedContent` based on `section.kind`.
- `Background`, `Header`, and `Footer` are screen-level sections. They mark
  presence in the sections list but write their actual content to step-level
  `content.canvas`, `content.header`, and `content.actionBar`.
- For responsive desktop/tablet/phone tuning, prefer
  `metadata.articlePresentation.profiles` for page/container-level behavior and
  explicit per-section `layout` for local overrides.

## Verification

After changes:

```bash
segmently --project <projectId> content-plan articles get <articleId> --output verify.json
segmently --project <projectId> content-plan articles publish <articleId>
curl -I <publishedUrl>
curl -I <assetUrl>
curl -I <configUrl>
```

For scraped or CLI-created article content, also verify editor manageability in
the Segmently UI: open the article draft, confirm important `Text` and
`BulletList` content is editable from the editor, save a small harmless change
on a draft when the user approves it, then reread the article with
`content-plan articles get`. If the user did not approve a UI edit, keep this as
a read-only manual check and do not claim the edit was verified in the editor.
