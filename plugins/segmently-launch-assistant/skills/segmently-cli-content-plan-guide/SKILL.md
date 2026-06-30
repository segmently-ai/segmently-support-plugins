---
name: segmently-cli-content-plan-guide
description: "Use this customer-safe skill for Segmently CLI Content Plan operations: full project bootstrap, author/platform setup, strategy/calendar/post preparation, publish-ready demo posts, creator profile export/apply, pillars, post templates, post generation, post asset/brief repair, design profile transfer, visual reference variants, text budgets, dry-run safety, scopes, subscriptions, and UI verification. Also trigger when Segmently Launch Assistant or segmently-cli-articles names segmently-cli-content-plan-guide for article/content-plan command scope, manifest, or workflow lookup."
---

# Segmently CLI Content Plan Guide

Use this skill when the user asks how to inspect, export, apply, transfer, or
verify Segmently Content Plan data through the CLI.

This skill is specialized for Content Plan. For non-Content Plan CLI tasks, use
`segmently-cli-guide`. This customer-facing skill stays on public Segmently CLI
surfaces; if a request needs Segmently support-only diagnostics, say that the
public skill cannot perform that step and provide the closest public read/verify
command instead.

## Core Workflow

1. Confirm target context: production project ID, author ID, platform ID, and
   profile key when design profiles are involved. Use `content-plan authors
   default` or `content-plan authors list` when the author ID is not known.
2. Choose the smallest CLI surface:
   - `content-plan bootstrap validate|plan|apply|verify` for empty or
     partially configured projects that need author, platform, strategy,
     post, and calendar setup from one manifest;
   - read/export for inspection;
   - focused apply for pillars/templates/design profiles;
   - dry-run before every write that supports it.
3. Keep target IDs explicit. Do not rely on IDs embedded in imported manifests.
4. For reference images, separate CDN upload from profile apply. Uploading an
   image only creates an asset URL; it does not make the reference visible in
   Content Plan Design.
5. For generated posts, resolve the post storage first when the user gives a
   draft ID. `posts resolve` and `posts drafts list` cover `content_posts`,
   sprint posts, post examples, and `post_generations/*/generatedPosts`.
6. For topic-source-driven planning, use `content-plan topics generate` to
   create generated topic drafts from manual text and/or URL source context,
   then `content-plan topics drafts list` and `content-plan topics apply` to
   promote accepted drafts into the backlog. For topic-source-driven posts, put
   the same material into `content-plan topics resources`. Post generation reads
   those resources from
   `projects/{projectId}/topics/{topicId}/resources`.
7. For image/asset repairs, inspect the post brief, operate one `aiAssets` slot
   at a time, regenerate or patch the prompt if needed, generate a new
   experiment, then select/reject/delete experiments explicitly.
8. For full post QA, group commands by lifecycle stage instead of treating every
   operation as isolated: model preflight, post generation, draft/canonical
   resolution, brief regeneration, slot repair, image experiment generation,
   selection, and task/debug evidence.
9. For publishing demos, make the post canonical first, then attach it to
   Calendar with `posts schedule` or `posts schedule-batch`; a standalone
   `content_posts` document is not enough for reviewer navigation.
10. Verify with the matching list/export command and, when useful, the
    generated UI URLs from bootstrap plan/apply/verify output.

## Load References As Needed

- Command/scopes lookup: read `references/commands.md`.
- Manifest structures: read `references/manifests.md`.
- End-to-end workflows: read `references/workflows.md`.
- CLI improvement backlog: read `references/backlog.md` only when planning
  product/CLI changes.

Do not load every reference by default. A design reference question usually
needs `commands.md`, `manifests.md`, and the specific design workflow from
`workflows.md`.

## Response Shape

For Content Plan CLI guidance, answer in this order:

```text
Goal:
Target context:
Required auth/scopes:
Commands:
Manifest fields:
Dry-run checks:
Verification:
UI location:
Notes / risks:
```

Keep commands copyable. Use placeholders like `<projectId>`, `<authorId>`, and
`<profileId>` unless the user supplied real IDs. Never invent secrets or print
tokens.

## Safety Rules

- Content Plan commands are author-scoped. Always include or resolve
  `--author <authorId>` before profile/design/template operations.
- Use `--dry-run` before write commands when supported.
- `content-plan designs apply` accepts flat editor JSON, skill composite JSON,
  or CLI transfer manifests. Prefer transfer manifests for project-to-project
  moves and reference-driven profile variants.
- Use `--set-current` only when the profile should become the runtime
  generation profile. Without it, design apply creates or updates a library
  variant that the user opens inside the publication type card only when the
  input manifest does not already set `profile.setCurrent: true`. If exporting a
  current profile to create a new variant, explicitly edit the manifest to
  `profile.setCurrent: false` before apply.
- Use `content-plan designs make-current` to switch runtime generation to an
  existing library profile without reapplying the full design manifest.
- Use `--references upload` to copy references into a target project. Use
  `--references keep` when references already live in the target project or are
  intentionally external.
- `visualReferences[].textBudgets[]` are per controllable text field. They are
  not aggregate budgets for the whole image.
- Use `--wait` when supported and the operator needs the terminal task result
  in the same CLI run. Current Content Plan wait support covers `posts
  generate`, `topics generate`, `topics aspects generate`, `posts assets plan`,
  `posts assets regenerate-brief`, `posts assets regenerate-text` when it returns a task,
  `posts assets slots generate`, and `posts assets slots batch-generate`.
- Research launch commands return `runId`, not `taskId`; use
  `content-plan research wait <runId>` or inspect with `content-plan research
  get/list`.
- `content-plan posts assets regenerate-text` is best-effort: it only works
  when the existing post still has enough generation context. Use
  `posts generate` when full text generation should be launched from topic,
  aspect, platform, and model settings.
- The CLI exposes first-class author/platform bootstrap, deterministic strategy
  and calendar bootstrap, manual post creation, schedule batch attachment,
  topic resource import, topic/theme bulk apply, draft generation apply, AI copy
  refine, post asset brief inspection, asset preview, one-slot prompt
  regeneration, batch slot generation, and experiment reject/delete. The
  remaining known post gap is true full `regenerate-post` from only an existing
  post ID when stored generation context is absent.

## Verification

After editing this skill, run:

```bash
node <skill-root>/scripts/run-evals.mjs
```
