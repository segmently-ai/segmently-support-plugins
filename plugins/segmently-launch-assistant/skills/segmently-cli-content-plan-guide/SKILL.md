---
name: segmently-cli-content-plan-guide
description: "Use this customer-safe skill for Segmently CLI Content Plan operations: full project bootstrap, author/platform setup, strategy/calendar/post preparation, official X research/listening, human-reviewed engagement, manual X publishing/reconciliation/analytics, publish-ready demo posts, creator profile export/apply, pillars, post templates, post generation, post asset/brief repair, design profile transfer, visual reference variants, text budgets, dry-run safety, scopes, subscriptions, and UI verification. Also trigger when Segmently Launch Assistant or segmently-cli-articles names segmently-cli-content-plan-guide for article/content-plan command scope, manifest, or workflow lookup."
---

# Segmently CLI Content Plan Guide

Use this skill when the user asks how to inspect, export, apply, transfer, or
verify Segmently Content Plan data through the CLI.

This skill is specialized for Content Plan. For non-Content Plan CLI tasks, use
`segmently-cli-guide`. This customer-facing skill stays on public Segmently CLI
surfaces; if a request needs Segmently support-only diagnostics, say that the
public skill cannot perform that step and provide the closest public read/verify
command instead.

## CLI 1.0.0 Contract

Content Plan workflows in this skill target `@segmently/cli` 1.0.0 or newer.
Start with `segmently --version`; use `segmently capabilities` when the selected
environment may lag the installed CLI.

The command vocabulary is deliberate:

- `apply` imports or upserts an explicit manifest through `--file`;
- `accept` promotes a generated draft identified by a positional generation id;
- `set-current` makes an existing author, design profile, or design-system
  package active;
- `delete` removes a document;
- `remove` only removes list membership, such as a platform from a topic.

Removed 0.1.x names are migration errors, not aliases. In particular, generated
topic/post draft lookup uses `--generation <generationId>`, never
`--task <taskId>`.

## Core Workflow

1. Confirm the installed CLI and environment with `segmently --version` and,
   when environment capability matters, `segmently capabilities`.
2. Confirm target context: production project ID, author ID, platform ID, and
   profile key when design profiles are involved. Use `content-plan authors
   default` or `content-plan authors list` when the author ID is not known.
3. For an existing project or an uncertain end-to-end state, run
   `content-plan doctor --author <authorId>` first. It evaluates the shared
   eight-step flow (`author -> platforms -> pillars -> backlog -> strategy ->
   publications -> posts -> assets`) and returns the exact next command for a
   missing step. A not-ready result exits non-zero by design.
4. Choose the smallest workflow from `references/workflows.md`, then the
   smallest CLI surface inside it:
   - `content-plan bootstrap validate|plan|apply|verify` for empty or
     partially configured projects that need author, platform, strategy,
     post, and calendar setup from one manifest;
   - read/export for inspection;
   - focused apply for pillars/templates/design profiles;
   - dry-run before every write that supports it.
5. Keep target IDs explicit. Do not rely on IDs embedded in imported manifests.
6. Validate manifest-backed writes locally, then dry-run them. Content Plan
   1.0.0 validates bootstrap, topic apply, aspect apply, research phase patch,
   post generation files, and design-profile apply before any network call.
7. For reference images, separate CDN upload from profile/package apply. Uploading an
   image only creates an asset URL; it does not make the reference visible in
   Content Plan Design.
8. For generated posts, resolve the post storage first when the user gives a
   draft ID. `posts resolve` and `posts drafts list` cover `content_posts`,
   sprint posts, post examples, and `post_generations/*/generatedPosts`. State
   the boundary in the answer: a generated draft can live under
   `post_generations/*/generatedPosts` rather than canonical `content_posts`, so
   resolve it before slot or asset operations.
9. For topic-source-driven planning, use `content-plan topics generate` to
   create generated topic drafts from manual text and/or URL source context,
   then `content-plan topics drafts list` and `content-plan topics accept` to
   promote accepted drafts into the backlog (`topics apply` applies a
   deterministic manifest instead). For topic-source-driven posts, put
   the same material into `content-plan topics resources`. Post generation reads
   those resources from
   `projects/{projectId}/topics/{topicId}/resources`.
10. For image/asset repairs, inspect the post brief, operate one `aiAssets` slot
   at a time, regenerate or patch the prompt if needed, generate a new
   experiment, then select/reject/delete experiments explicitly.
11. For full post QA, group commands by lifecycle stage instead of treating every
   operation as isolated: model preflight, post generation, draft/canonical
   resolution, brief regeneration, slot repair, image experiment generation,
   selection, and task/debug evidence.
12. For publishing demos, make the post canonical first, then attach it to
   Calendar with `posts schedule` or `posts schedule-batch`; a standalone
   `content_posts` document is not enough for reviewer navigation.
13. Treat task output as control flow. With `--wait`, failed, cancelled, or
    timed-out tasks exit non-zero. Without `--wait`, a launched task reports
    `taskState: "pending"` plus a copyable `followUp`; run that command before
    claiming completion.
14. Verify with the matching list/export/doctor command and, when useful, the
    generated UI URLs from bootstrap plan/apply/verify output.
15. For X, first run `segmently capabilities` and require both advertised X
    command families, then inspect `content-plan x status`. State this gate in
    every X answer: continue only when both families are advertised; otherwise
    say the X workflow is unavailable in the selected environment and stop
    before any paid read, reply, or publication command. Documentation is not
    proof that the selected environment/backend and installed CLI support the
    workflow.
16. Separate X research/listening, approval, and delivery. Preview every paid
    operation with `--dry-run`; approval never sends; a real post/reply
    requires the exact confirmation returned by the server. Reconcile an
    ambiguous result before attempting any new send.

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
Selected workflow:
Preflight / doctor:
Commands and generated state files:
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
- Use `content-plan doctor` as the readiness entry point for a full or partially
  configured flow. Do not convert its not-ready exit code into a command failure;
  read `steps[].nextCommand` and advance the first required missing step.
- Use `--dry-run` before write commands when supported.
- Mutating aspect commands report `changedFields`. `changedFields: []` means
  the result is identical to the stored state — the server skips the write
  entirely and the command still exits 0. A no-op apply is SUCCESS, not
  failure; trust `changedFields` instead of building your own diff.
- Topic aspects (`topics aspects apply|add|patch`) accept ONLY the canonical
  fields `aspectKey`, `aspectLabel` (required, non-empty), and `aspectAngle`.
  Never invent field names from UI column headers — `aspect`, `hookAngle`, and
  `title` are rejected with did-you-mean hints. `aspects apply --file` accepts
  a bare array, `{ "postBreakdown": [...] }`, or the exact `aspects list`
  output `{ "aspects": [...] }`; a file containing BOTH keys is an ambiguity
  error. See `references/manifests.md > Topic Aspects Manifest`.
- Readback-before-retry (MANDATORY): when a REAL (non-dry-run) apply fails
  with `auth_required`, a network error, or any ambiguous outcome, never
  blindly re-run it. First read the state back (`topics aspects list`, the
  matching `get`/`list` for other surfaces), compare against the intended
  manifest, and re-apply only if the readback proves the write did not land.
- Verify UI-visible writes in the UI, not only via CLI readback: a readback
  echoes what was STORED, not what the product RENDERS. After applying data
  users see (topic aspects, posts, publications), confirm the values in the
  owning surface (e.g. `/project/{projectId}/content-plan?cpTab=backlog`) or
  ask the operator to. A stored-vs-rendered contract mismatch is invisible to
  readback alone.
- `bootstrap apply` validates by default and resumes from
  `<manifest>.bootstrap-state.json`. Preserve the checkpoint after an interrupted
  run; use `--restart` only when the operator intentionally wants every operation
  repeated. `--skip-validation` is an escape hatch and never skips the
  `system_platforms` preflight.
- X paid reads require `social:read`; X creates require `social:publish` plus
  the documented Content Plan scope. A connected account, enabled project
  budget, and environment feature gate are also required.
- Do not provide an executable X search/reply/publish sequence as unconditional
  guidance. Put the two-family `segmently capabilities` gate before it and make
  the unavailable/not-advertised stop condition explicit in the answer.
- X `scheduledAt` is editorial metadata only. Never describe it as an
  automatic or scheduled provider send.
- Never automate X replies, likes, follows, direct messages, polling, or
  recurring analytics. Saved listening sources are inert until explicit
  refresh.
- An X dry-run performs no provider request. If a create outcome is ambiguous,
  do not retry; use the matching `reconcile-x` command.
- An X reply budgets a bounded source-post verification read separately from
  the create. Review the aggregate estimate and `sourceCheckUsage`; do not
  assume a reply costs only one provider request.
- X `401` means reconnect-required. X `403` means the provider rejected the
  operation/app entitlement; report `x_provider_forbidden`, keep the
  connection intact, and never fabricate analytics metrics.
- `content-plan designs apply` accepts flat editor JSON, skill composite JSON,
  or CLI transfer manifests. Prefer transfer manifests for project-to-project
  moves and reference-driven profile variants.
- Use `--set-current` only when the profile should become the runtime
  generation profile. Without it, design apply creates or updates a library
  variant that the user opens inside the publication type card only when the
  input manifest does not already set `profile.setCurrent: true`. If exporting a
  current profile to create a new variant, explicitly edit the manifest to
  `profile.setCurrent: false` before apply.
- Use `content-plan designs set-current` to switch runtime generation to an
  existing library profile without reapplying the full design manifest.
- Use `content-plan design-systems list|export|inspect|apply|set-current` when the
  operation spans a full package and multiple profile formats. Dry-run package
  apply or activation, then verify with `design-systems list --include-profiles`
  and `design-systems inspect`.
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
- Never use the removed `--task` filter with `topics drafts list` or `posts
  drafts list`; use `--generation <generationId>`.
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
