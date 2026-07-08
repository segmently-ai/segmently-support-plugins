# Workflow 2 — Push your design system → Claude Design

**Direction:** your project → `claude.ai/design`. Goal: get your project's brand (your Theme V2
tokens + key design-system components) into a Claude Design **design-system project**, so every
design Claude generates starts inside your system instead of a generic one.

## Delegate the mechanics to the native `/design-sync`

The actual sync is owned by Anthropic's native **`/design-sync` skill + `DesignSync` tool** — they
handle the diffing, the plan boundary, and the incremental upload. **Do not re-implement that.**
This workflow only adds the project-specific part: *what* to push and *how to package it*.

When the user wants the real push, invoke the native `/design-sync` skill and let it drive the
`DesignSync` tool. Everything below is how to prepare the local bundle it consumes.

## What Claude Design expects: `@dsCard` preview HTML

The Design System pane indexes a project by reading the **first-line marker** of each preview HTML
file:

```html
<!-- @dsCard group="Colors" -->
```

Just author preview files with the marker — explicit `register_assets` is **not** required for
`/design-sync` uploads. `group` is a free-form section label; use your own categories
(e.g. `Type`, `Colors`, `Spacing`, `Components`, `Brand`).

> 🔒 **Operator / internal (strip before customer release).** The app's self-check compiles those
> first-line markers into `_ds_manifest.json`; that manifest is a Segmently-internal build artifact
> and is not something a customer authors or ships.

## Assemble the bundle (local dir)

**Preferred: generate the bundle with the CLI** — `segmently design snapshot` renders a
ready-to-push flat bundle (real SSR screen HTML + token cards, each file starting with its
`@dsCard` marker) straight from a saved theme or live funnel screens:

```bash
segmently design snapshot [projectId] --out <dir>                                  # active project theme
segmently design snapshot [projectId] --project-theme-id <id> --out <dir>          # specific project theme
segmently design snapshot [projectId] --funnel <funnelId> --out <dir>              # onboarding theme snapshot
segmently design snapshot [projectId] --funnel <fid> --version-id <vid> --all-screens --out <dir>  # live screens
```

The bundle contains `screen-<kind>[__<subtype>].html` (group `Screens`, full standalone
script-free HTML with inlined runtime CSS — renders pixel-faithfully in the design pane; each
card carries the `--tv-*` round-trip token contract in `:root` + an identity `<meta>`),
`colors.html` / `type.html` / `spacing.html` / `screens.html` / `how-to-edit.html` cards, plus
`settings.json` (theme + per-screen tokens + `tokenIndex`) and `manifest.json` (source
coordinates for reconcile). Push the HTML cards INCLUDING `how-to-edit.html` (it is the editing
contract for the design side); the JSON files are useful provenance. Changes made in Claude Design
come back via `design extract` / `design apply` — see Workflow 5
[capture-design-system.md](capture-design-system.md) Step C. Requires the account to expose the
`segmently design snapshot`, `segmently design extract`, and `segmently design apply` commands.
If those commands are unavailable, stop and ask Segmently support to confirm the round-trip feature
is enabled before continuing.

Fallback — hand-build a local directory (e.g. `exports/claude-design-bundle/`) of static
preview HTML, one card per concept. Sources:

- **Tokens** → from your active Theme V2 (`colors`, `fonts`, `optionsListSettings`, `layoutSettings`
  spacing/radius). Render simple swatch/type/spacing preview cards. The token shape is documented in
  [import-native-theme.md](import-native-theme.md).
- **Components** → your key design-system components (buttons, list items, dialogs, action bar)
  rendered as **static** preview HTML using the same token values. These are previews for the design
  pane, not the live components.

> **Scope note (v1).** Auto-generating a faithful preview card for *every* component is a large
> effort. v1 ships a **starter**: the token cards (Colors / Type / Spacing) plus a handful of
> high-traffic component cards, and hands the rest to incremental `/design-sync` over time. Add
> cards as the user needs them — the push is incremental by design, so this is fine.

## DesignSync ordering (what the native skill runs)

The `DesignSync` tool enforces: **list/read → finalize_plan → write/delete**. For reference:

1. `list_projects` — find a **writable** design-system project (filtered to writable only).
2. `get_project` — verify the target is `type: PROJECT_TYPE_DESIGN_SYSTEM` (immutable at creation;
   pushing to a regular project never makes it a design system). If none exists, `create_project`.
3. `finalize_plan` — lock the exact `writes` / `deletes` globs and the `localDir` (defaults to cwd)
   the upload reads from. The user sees and approves this path list.
4. `write_files` (prefer `localPath` so contents never enter the model context; ≤256 files/call) /
   `delete_files` — using the returned `planId`.

**Push incrementally, one component at a time — never a wholesale replace.** That keeps the design
project reviewable and avoids clobbering work other org members did in the pane.

## Verification

- `DesignSync list_projects` returns a writable project (auth OK).
- After a push, open the Design System pane in `claude.ai/design` and confirm the cards appear under
  the expected `group` labels.
- Generate one test screen in Claude Design and confirm it picks up Segmently tokens (colors/type
  match), proving the system was actually consumed.
