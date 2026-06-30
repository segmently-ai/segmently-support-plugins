# Shadow-DOM Render Correctness (Paywalls)

A WebEmbed applied with `--iframe false` (paywalls — `isIframe: false`,
`renderMode: shadow-dom`) renders **inside a shadow root attached to a fixed-size host**
in the web-shell, not in its own document/iframe. Several CSS and font assumptions that
are safe in an iframe silently break in a shadow root.

Treat this as a **separate, required render check** run after publish, distinct from
healthcheck: healthcheck validates data-source/variable/SDK references, it does **not**
validate that the screen actually renders or scrolls. Both failures below pass
healthcheck and only show up in the published page.

This is general to any shadow-DOM WebEmbed; it is written for paywalls because they are
the screens applied with `--iframe false`.

## 1. Web fonts must load from the MAIN document head

`@font-face` declared **inside a shadow root** (the screen's own embedded `<head>`
`<link>` or `<style>`) does **not** register in the document `FontFaceSet`. So web fonts
and icon fonts referenced only from the embedded `<head>` never load: text falls back
(often to serif) and **icon-font ligatures render as their literal source words** (e.g.
`chevron_right`, `check`, `sell`).

- **Fix:** from the screen's own inline `<script>` (it executes in the main-document
  context), append the font `<link>` elements to `document.head`. Guard against
  double-injection with a `data-*` marker. External fonts are not blocked — only the
  registration location matters.
- **Do not trust `document.fonts.check("'Family'")`** — it returns a **false positive**
  (vacuously `true`) when no matching face exists, so it "confirms" a font that never
  loaded. Verify instead by measuring rendered width (a custom-font span whose width
  equals the fallback span means it is not rendering; an icon ligature whose width
  equals the plain word means the glyph never formed) or by screenshot.
- For zero flash-of-unstyled-text and no network dependency, prefer **inline SVG** over
  an icon font; otherwise document-head injection is sufficient.

```html
<script>
(function () {
  // @font-face inside a shadow root does not register at document level — inject the
  // font stylesheets into the MAIN document head so they apply to this shadow content.
  ['https://fonts.googleapis.com/css2?family=Example:wght@400;700&display=swap']
    .forEach(function (href) {
      if (document.head.querySelector('link[data-embed-font][href="' + href + '"]')) return;
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-embed-font', '');
      document.head.appendChild(l);
    });
})();
</script>
```

## 2. Height & scroll: never viewport-pin the page wrappers

The shadow host is a **fixed-height scroll container** (its own `overflow:auto`). Designs
exported from a device frame usually wrap content in `min-height:100vh` plus
`overflow:hidden`. In an iframe that is harmless (the iframe is its own scroll viewport).
In a shadow root those wrappers pin the content to one viewport and `overflow:hidden`
**clips everything below the fold** — the screen will not scroll to the end even though
every section is present in the DOM.

- **Fix:** remove `min-height:100vh` and `overflow:hidden` from the page wrappers; let
  content flow to its natural height and center the column with `margin:0 auto` (or a
  non-stretching flex). Use `min-height:100%` (not `100vh`) when you need a full-bleed
  background on short screens.
- `overflow:hidden` on an ancestor also breaks `position:sticky`, so removing it usually
  restores a "stuck" sticky header/footer at the same time.

## Verification (required, post-publish)

Load the published URL and confirm, inside the embed's shadow root:

- the host's `scrollHeight` is far greater than its `clientHeight`, and scrolling reaches
  the last section (footer / final CTA) — not clipped at roughly one viewport;
- the intended web fonts appear in `document.fonts` as `loaded`, and icon-font elements
  render as glyphs rather than literal ligature words;
- any `position:sticky` header/footer stays pinned while scrolling.

Capture before/after screenshots into `checks/visual/` and record the outcome in
`checks/visual-report.json` (see `references/visual-parity.md`). Never assert
shadow-DOM render correctness from healthcheck alone.
