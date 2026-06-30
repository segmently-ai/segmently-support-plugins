# Workflow 4 — Import Claude Design output → native Theme V2 (CLI)

**Direction:** `claude.ai/design` → Segmently. Goal: turn a Claude Design's visual style into a
Segmently **native Theme V2** and apply it to a project or onboarding via the CLI.

Segmently projects the extracted Claude Design tokens into a native Theme V2 and applies it with the
public `themes create-from-figma` command. Write the Claude Design tokens in the theme-extraction
shape (below), build a theme artifact, then apply it to a project / onboarding target.

Use the globally installed `segmently` binary; production is the default (omit `--env`). For auth and account setup, see `segmently-cli-guide`.

## Step 1 — Extract tokens from the Claude Design output

From exported design tokens, the standalone HTML, or a styleguide screenshot, capture the
high-impact tokens Theme V2 actually projects. Write
`<run-dir>/claude-design-theme-extraction.json` in the theme-extraction shape (only these
fields are projected today; the projection ignores the rest):

```jsonc
{
  "colors": {                       // exact values from the design → confidence 1.0
    "buttonsBackground": "#5B5BD6", // primary / CTA background
    "titlesSubtitles":  "#FFFFFF",  // main text color
    "buttonsTitle":     "#0B0B0F"   // button label color
  },
  "background": "#1A1A1A",          // SOLID screen fill → ThemeV2.background (solid Backdrop only)
  "typography": {
    "mainFontFamily": "Inter",      // arbitrary family — normalized to the 4 supported (warns)
    "title":    { "fontSize": 28, "fontWeight": 700, "align": "center" },
    "subtitle": { "fontSize": 17, "fontWeight": 500 }
  },
  "geometry": {
    "basis": "exact-variable",      // use this when tokens are declared (no "verify" warning)
    "spacingScale": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
    "radiusScale":  { "sm": 8, "md": 12, "lg": 20 },
    "actionBar":    { "buttonGap": 8, "insets": { "start": 16, "end": 16, "bottom": 32 } }
  },
  "source": {                       // provenance / audit only
    "fileName": "Claude Design — <project>",
    "sourceUrl": "https://claude.ai/design/<id>"
  },
  "variableRefs": []
}
```

Rules:
- **Never invent values** — extract them or omit. Use `basis: "exact-variable"` when the design
  declares tokens; only fall back to a second `screenshot-measured` geometry block (confidence ≈
  0.8, surfaces a "verify" warning) for numbers you genuinely had to measure.
- **Font families** normalize to `SF Pro` / `SF ProRounded` / `SF Mono` / `New York`. A non-supported
  family (Inter, Roboto, custom) maps to the nearest and warns — expected, not an error.
- **Background** must be a **solid** color. Gradient/image backdrops and header styling are **not
  projected** — omit them (a non-solid kind is skipped with an `unsupported-token` warning). Don't
  include shadows/grids.

## Step 2 — Build the theme artifact

Segmently projects the extraction into a theme artifact (`projectedTheme`, provenance, a stable
`artifactHash`, `warnings[]`). **Surface the warnings** (lossy fonts, inferred geometry, dropped
low-confidence tokens) to the user.

If the installed Segmently CLI provides a public artifact builder for Claude Design or generic theme
extractions, use that command and keep the generated artifact in `<run-dir>`. If no public artifact
builder is available, stop after the validated extraction JSON and tell the user that native Theme V2
apply needs a public theme-artifact generation path before it can be completed. Do not claim that the
theme was applied from extraction alone.

## Step 3 — Apply via the CLI (`themes create-from-figma`)

This is the public, customer path. Targets: `project` | `onboarding`.

```bash
# Project theme (set active):
segmently themes create-from-figma \
  --input <run-dir>/claude-design-theme-artifact.json --target project --project <projectId> --set-active

# Native ONBOARDING theme (writes themeSettingsV2/settings):
segmently themes create-from-figma \
  --input <run-dir>/claude-design-theme-artifact.json --target onboarding \
  --project <projectId> --onboarding <onboardingId>
```

`--input -` reads from stdin (you can pipe the build artifact straight in). Scopes:
`themes:write` for the project target; **`funnels:write` additionally** for the onboarding target.

**Resolve the target from a Segmently link**: an onboarding link
`https://app.segmently.ai/project/<projectId>/onboarding-v2/<funnelId>` →
`--target onboarding --onboarding <funnelId>`; a project-only link → `--target project` (or ask if a
specific onboarding is meant).

The global catalog target is not part of the customer path. Use `--target project` or
`--target onboarding`.

## Step 4 — Save the import summary

Write a compact import summary containing the Claude Design source, extraction file, artifact hash
when one exists, target type, `themeId` from the CLI response, and onboarding id when applicable.
Theme idempotency is the `artifactHash` when a public artifact builder is available.

## ⚠️ The CLI updates the theme settings, NOT already-diverged live screens

`--target onboarding` writes the onboarding's `themeSettingsV2/settings`. A V2 theme only reaches the
**live canvas screens** automatically at onboarding-creation time; after that the theme template and
the live `screensV2/{id}` diverge. Pushing an updated theme onto **existing** canvas screens is the
**in-app** "Selective Theme -> Canvas Apply" feature (Theme editor "Apply to canvas" / canvas
"Update UI from theme"). There is **no CLI equivalent** for re-applying onto live screens. So:

- New onboardings created from this theme → pick it up automatically.
- Existing onboardings → set the theme via CLI, then tell the user to run the in-app "Apply to
  canvas" to propagate selected groups (Background/Header/Footer/Body) onto chosen screens.

State this boundary to the user so they aren't surprised that the CLI didn't repaint live screens.

## Idempotency

Re-running the SAME extraction yields the SAME `artifactHash` (it excludes timestamps), so
re-importing to the same target returns the existing theme with `alreadyImported: true` instead of
duplicating. Change the tokens to produce a new theme.

## Verification

After applying, print the CLI JSON (`theme.id`, `name`, `target`, `isActive`, `artifactHash`,
`alreadyImported?`, `warnings[]`) and the onboarding editor URL
(`https://app.segmently.ai/project/<projectId>/onboarding-v2/<funnelId>`).
