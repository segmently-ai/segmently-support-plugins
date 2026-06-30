# Responsive Adaptation & Hardcode Judgment

Designs arrive from a **fixed-width frame** (a Figma board, a Claude Design canvas,
typically ~322–402px). A WebEmbed custom screen renders inside a **variable-width
iframe** in the funnel / web-shell. Pixel geometry that is correct in the source
frame can break when the runtime viewport is wider or narrower.

Goal: make the screen **responsive** while changing **as little as possible**, so it
stays visually as close to the design as possible. Adapt the geometry that would
break; copy everything else verbatim.

## The fixed-height + width:100% trap (most common failure)

**Symptom:** a chart / illustration / hero image overflows its box, and its internal
or absolutely-positioned labels/badges overlap the next element — but only at a
viewport wider (or narrower) than the design frame.

**Cause:** a container with a **fixed height** wraps a child (`<svg>` / `<img>`) sized
`width:100%` with a `viewBox` / intrinsic aspect ratio. The child's height scales with
the (wider) width, but the box height is frozen → the child overflows the box.

> Real example (Lumen import): `<div style="...height:172px"><svg width="100%"
> viewBox="0 0 278 168">…</svg></div>`. In the 322px design frame the SVG was ~168px
> tall and fit. In the wider funnel iframe it scaled to ~209px, overflowed the 172px
> box, and the in-SVG `WEEK 1 / WEEK 4` labels landed on top of the next heading.

**Fix (keeps the look, adds responsiveness):**

- Drive the box height **from its width**: replace `height:<N>px` with
  `aspect-ratio: <W> / <H>` (use the child's `viewBox` / natural W and H).
- Give the child `height:100%` and, for SVG, `preserveAspectRatio="xMidYMid meet"`
  (for `<img>`, `object-fit:contain` or `cover` to match intent).
- Do **not** "fix" it with `max-height` or another fixed pixel height — that
  distorts, crops, or just moves the overflow.

## Responsive adaptation rules (apply during import; preserve visual parity)

- **Root screen container:** `min-height:100vh; display:flex; flex-direction:column`
  so content fills any height. Keep the chosen footer-CTA behavior (sticky / fixed /
  scroll) stable across screens with different content amounts.
- **Width-filling media** (charts, illustrations, hero images, backgrounds): use an
  `aspect-ratio` box, never a fixed height.
- **Never hardcode the design frame width** as a content width (e.g. `width:322px` /
  `375px` on a content block). Use `%`, `max-width`, or flex (`flex:1`).
- **Absolutely-positioned overlays / badges** must live inside a `position:relative`
  parent that **itself scales** (aspect-ratio or normal flow) so they track the media
  instead of colliding with siblings.
- **Keep the design's spacing, radii, typography, colors, and flex ratios as-is** —
  those are what make it look the same. Only swap the dimension *units* that overflow.
- Avoid introducing media queries unless a layout genuinely must reflow; prefer
  relative units that preserve the original proportions.

## Hardcode judgment — two orthogonal questions

### (A) Content: hardcode vs data source — see `hardcoded-to-data-sources.md`

- **MUST be a data source** (never the hardcoded runtime source; HTML keeps the value
  only as a local-preview fallback): user-facing copy (headline, subtitle, CTA, option
  titles/subtitles, errors, placeholders), replaceable media (hero / option /
  background images, video, content icons), products & prices (`ProductCatalog`).
- **MAY stay static (hardcode is appropriate):** decorative / brand SVG icons & logos,
  ornaments, press / award marks, structural CSS, and brand legal boilerplate — unless
  localization is required, in which case make it a `Text` source.
- Rule of thumb: **text a user reads, an asset they see, or a price they pay → data
  source. Chrome / decoration / structure → static is fine.**

### (B) Geometry: hardcode vs responsive

- **Hardcode is appropriate** for the design's visual *system*: paddings, gaps,
  border-radius, font sizes, colors, flex ratios — copy them verbatim to match.
- **Hardcode is NOT appropriate** for: a fixed height on a width-scaling media box; a
  fixed width equal to the design frame; absolute positions that assume the frame size.
  Convert these to responsive equivalents (`aspect-ratio`, `%`, `max-width`, flex).

## Verify — visual parity at the REAL width, not just the design frame

After apply + publish, screenshot the published screen at the **funnel's real viewport
width** (the iframe is usually wider than the design frame), then:

- compare with the source design — overall composition must match;
- confirm **no overflow / overlap** (labels, badges, CTA) and that aspect-ratio media
  is not distorted or cropped;
- check at a narrow **and** a wide width when possible;
- confirm footer-CTA height / position is stable across screens.

Record any mismatch before handing the flow back. This is the visual-parity gate; see
`visual-parity.md` for the screenshot + `data-testid` smoke-navigation procedure.
