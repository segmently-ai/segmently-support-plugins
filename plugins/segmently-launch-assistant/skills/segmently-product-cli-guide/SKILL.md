---
name: segmently-product-cli-guide
description: "Customer-safe high-level guide for Segmently Product Page CLI availability: product mode, tasks, variables, audiences, generated insights, onboarding strategies, blocks, screens, B2B/B2C concepts, required scopes, project access, and safe verification. Does not expose detailed mutation payloads."
---

# Segmently Product CLI Guide

Use this Product CLI guide when a customer or customer-facing agent needs a
high-level overview of Segmently Product Page CLI availability.

When Segmently Launch Assistant returns `executeWith.skill`, route here only
when its ownership marker is `owningSkill=segmently-product-cli-guide`.

## Scope

Use only the command families explicitly listed in this guide. Treat unlisted
capabilities as unavailable through the public Product CLI flow.

## Core Concepts

- Tasks are user jobs or goals used by the Product pipeline to create downstream
  audiences, actors, interviews, and insights.
- Variables are project-level product inputs and analysis variables stored in
  the Product Page variable set.
- B2C audiences are clusters of similar end users.
- B2B audiences are ICP archetypes with buying-committee context.
- Insights are generated JTBD aggregation documents. Product CLI support for
  generated insights is available for approved workflows.
- Strategies are onboarding plans made of strategy blocks and strategy-owned
  screens. Current generation is insight-first: pin an InsightsAnalysis,
  resolve accepted insight-derived variables when available, then generate
  blocks/screens from that grounded package.
- `product mode` controls the project audience model (`b2c` or `b2b`). Switching
  mode changes future pipeline semantics; it does not migrate existing data.

## Core Workflow

1. Identify whether the project is B2C or B2B with `product mode get`.
2. Read tasks, variables, audiences, or insights before changing them.
3. Use approved Product CLI workflows for writes.
4. Verify every write with the matching `get` or `list` command.

## Installed CLI And Access Troubleshooting

- This guide assumes the globally installed `segmently` CLI is
  `@segmently/cli` `0.1.4` or newer. Check with `segmently --version` before
  relying on Product insights/source commands or the relaxed `generate strategy`
  file-mode option contract.
- Service-token scopes and project feature access are separate checks. If a
  command returns structured `402 payment_required` with
  `reason: missing_capability`, use `requiredCapability` to identify the
  missing project feature and do not retry by broadening CLI scopes first.
- Common missing capabilities: Product read/edit commands need
  `product_analysis.access`; audience commands need `audiences.access`;
  insights analysis generation needs `insights.generate`; insight-variable
  generation needs `insights.variables.generate`; strategy/block generation
  needs `web_onboarding.block.regenerate`; strategy/block/screen inspection
  needs web onboarding access. `screen-types show` has no project feature gate.

## Insights Generation And Recompute

Insights analysis, category recompute, and insight-variable generation start
backend tasks through the `/api/cli/v1` facade:

```bash
segmently product insights generate --actor-selections-file sel.json --wait [projectId]
segmently product insights recompute-categories <analysisId> --categories coreJobs,fears --wait [projectId]
segmently product insights variables generate <analysisId> --categories coreJobs,fears --wait [projectId]
```

- Start scope: `generate:write`.
- Required project access: insights generation for analysis generation and
  recompute; insight-variable generation for insight-variable generation.
- `--wait` and manual polling require `tasks:read` because polling uses
  `segmently tasks get <taskId>`.
- Verify completed output with `product insights get <analysisId>` or the
  corresponding variables review flow.
- For insight-variable generation, use `--task-scope global` for a shared
  variable package, or `--task-scope task --task-id <taskId>` when variables
  must be scoped to one selected task. Use `--existing-variable-ids` to avoid
  duplicating already accepted variables.

Product CLI generation uses existing actor selections supplied by file. No
Product CLI command currently exposes audience generation, actor generation, or
interviews.

## Strategy, Blocks, And Screens Generation

Use `generate strategy` for first-time onboarding strategy generation. Add
`--generate-screens` when the run should continue from strategy blocks into full
strategy-owned screens.

```bash
segmently product insights variables generate <analysisId> --categories coreJobs,fears --wait [projectId]
segmently strategies create --file strategy.json [projectId]
segmently generate strategy --file strategy-generation.json --wait [projectId]
segmently generate strategy --strategy-id <strategyId> --name "Acme onboarding" --strategy-type "IOS Onboarding" --source-data-file source.json --insights-analysis-id <analysisId> --insight-variable-generation-id <generationId> --variable-ids primary_goal --use-project-variables true --generate-screens --wait [projectId]
```

For `generate strategy`, use either `--file <path>` with a complete request body
or explicit flags. In CLI `0.1.4+`, file mode does not require a duplicate
`--strategy-id` flag when the JSON file already includes `strategyId`; pass
`--strategy-id` only when overriding or targeting explicitly from flags. Without
`--file`, the required inputs are `--strategy-id`, `--name`, `--strategy-type`,
and `--source-data-file`. `--variables-file` is the manual override for
strategy variables. In the current flow, `sourceData` should be prepared from
the selected insights analysis plus its selected tasks and social proof; do not
use audience-first source data unless the product flow explicitly selected
audience fallback context. `--insight-variable-generation-id`, `--variable-ids`,
`--use-project-variables`, `--insights-analysis-id`,
`--predecessor-strategy-id`, and `--fork-hypothesis` are optional targeting and
lineage controls.

Use `generate block` for targeted block screen generation or regeneration. Use
`--file` for a complete request body, or explicit input files when the caller is
assembling the request from local artifacts.

```bash
segmently generate block --file block-generation.json --wait [projectId]
segmently generate block --strategy-id <strategyId> --block-id <blockId> --prompt-file block-prompt.md --source-data-file source.json --current-block-file current-block.json --block-contract-file block-contract.json --variables-file variables.json --full-strategy-file full-strategy-sequence.json --wait [projectId]
```

For `generate block`, use either `--file <path>` with a complete request body or
explicit flags. Without `--file`, the required inputs are `--strategy-id`,
`--block-id`, `--prompt` or `--prompt-file`, and `--source-data-file`.
`--current-block-file`, `--block-contract-file`, `--variables-file`,
`--full-strategy-file`, `--starting-screen-index`, `--block-type`, `--provider`,
`--model`, and `--max-tokens` are optional controls.

## Block Library Authoring

Route reusable block-example authoring to `screen-block-builder`. It owns the
dual blueprint/full-preview review, exact runtime packet, local agent eval, and
the dry-run → approval → apply → readback discipline.

Project-library commands are public and dry-run-first:

```bash
segmently strategies blocks library list [projectId]
segmently strategies blocks library get <exampleId> [projectId]
segmently strategies blocks library validate --file block-library-draft.json [projectId]
segmently strategies blocks library prompt-packet --request-file <compile-input.json> --out <packet.json> [projectId]
segmently strategies blocks library capture <strategyId> <blockId> --id <exampleId> --out block-library-draft.json --dry-run [projectId]
segmently strategies blocks library create <exampleId> --file block-library-draft.json --dry-run [projectId]
segmently strategies blocks library create <exampleId> --file block-library-draft.json --apply --dry-run-checksum <reviewedChecksum> [projectId]
segmently strategies blocks library get <exampleId> --out saved-example.json [projectId]
```

`update`, `disable`, and `delete` follow the same contract: dry-run first, show
the receipt/checksum to the user, require explicit approval, apply with
`--dry-run-checksum`, then get/readback. Full `previewScreens` remain available
for exact viewing but are never model input. The simplified `blueprint` is the
authoring/adaptation input; asset examples are pattern references and target
output produces semantic `aiMeta.assetIntents`.

For a local adaptation eval, `screen-block-builder` asks the CLI for
`strategies blocks library prompt-packet` and consumes that packet without
assembling prompt text. Check command availability first. If the installed CLI
does not expose `prompt-packet`, report the missing exact-runtime adapter and do
not substitute prompt files or an approximate message.

Staged placement is the primary policy: add the screenless draft, place and
connect it on the canvas, review the server-resolved context, then adapt and
save. The review/adapt endpoints derive compact predecessor/successor summaries,
eligible evidence, variable conflicts, and the target theme from current
project state; callers must never supply neighbour blocks or hydrated evidence.
Immediate adaptation is secondary and has no placed-neighbour context; the
block becomes visible only after validated adaptation succeeds. Insert-as-is is
an explicit non-AI escape hatch.

## Strategy Screen Asset Slots

The Strategy screen asset workflow operates only on existing screen-owned image slots.
List/get the slot before mutation. For slot commands, `screenId` is required
because slot keys repeat across screens. Prompt experiments are
created with `regenerate-prompt`; `conceptCount` controls how many prompt
concepts are generated. Reusable inputs include `asset-instruction.md`,
`asset-screen-context.json`, `asset-reference-images.json`, and
`asset-issue-report.json`. Generate images only from a reviewed prompt
experiment, then select and read back the resulting slot state.

## Choosing An AI Model (`--model`) — Always Project Truth

Every `--model` value MUST come from the PROJECT's availability, never from a
memorized or global model catalogue — a model that exists in general may have
no key connected in this project and the task will fail. The mandatory
workflow before any `--model` flag:

```bash
segmently ai models list [projectId]
```

- Returns `textModels[]` / `imageModels[]` the project can ACTUALLY run
  (checked against the same key resolver generation uses: project user key →
  admin key → platform key) plus a per-provider `providers` map
  (`configured`, `source`).
- Use `textModels[].id` values verbatim for `--model` in
  `strategies blocks from-library`, `generate block` (incl. `--variants`),
  and `generate strategy`.
- Scope: `projects:read`. Never suggest a model whose provider shows
  `configured: false` for the project.
- `strategies blocks from-library` additionally VALIDATES `--model` against
  this list before sending anything and refuses with the actual available ids
  on a mismatch (if the availability endpoint itself is unreachable it warns
  and proceeds — the server remains the final authority).

Use `strategies blocks from-library` only after choosing an insertion mode.
Route library authoring and local packet evals to `screen-block-builder`;
`from-library`, `review-library`, and `adapt-library` are the strategy insertion
surface. The staged flow is:

```bash
segmently ai models list [projectId]   # pick a textModels[].id first
segmently strategies blocks from-library <strategyId> --example <exampleId> --source system --mode staged --position 120,80 [projectId]
# Place/connect the returned staged block on the canvas before review.
segmently strategies blocks review-library <strategyId> <stagedBlockId> --evidence-mode strategy-default [projectId]
segmently strategies blocks adapt-library <strategyId> <stagedBlockId> --model <id-from-ai-models-list> --evidence-mode strategy-default --expected-context-fingerprint <reviewedFingerprint> --wait [projectId]
```

- `from-library` defaults to `--mode staged`; it saves a screenless draft and
  never starts AI. `adapt-library` requires `--model`, validates it against
  `ai models list`, and saves only after the exact reviewed context remains
  current.
- `review-library` starts no task. Its `contextFingerprint`, compact topology,
  evidence labels, target-theme status, and variable conflicts are the review
  receipt for `adapt-library`.
- Evidence has exactly three modes: `strategy-default`, `selected-only`, and
  `no-evidence`. `selected-only` additionally requires `--evidence-file` with
  an array of identity-only `{ "kind": "...", "id": "..." }` entries.
- If review reports incompatible variables, pass
  `--variable-resolutions-file` to both review and adapt. The JSON object is
  keyed by source variable id; each value is one explicit decision:
  `{ "action": "bind", "targetVariableId": "..." }`,
  `{ "action": "create" }`, or `{ "action": "drop" }`. Adapt stays blocked
  until every conflict has a valid decision.
- `--source` is `project` (default) or `system`; `--name` overrides the block
  name; `--position <x,y>` places the node.
- `--mapping-file <path>` overrides the automatic variable mapping with a JSON
  object keyed by example variable id:
  `{ "<exampleVarId>": {"action":"bind","targetVarId":"..."} | {"action":"create"} | {"action":"drop"} }`.
  Omitted entries use the server auto-resolution (exact-id + compatible →
  bind; new ids → create).
- `--wait` polls the ADAPTATION task (`tasks:read`); the response also carries
  `blockId`, `entityId`, `screensCreated`, `variableDiff`, and `adaptTaskId`.
- Immediate mode is explicit and pre-placement:

  ```bash
  segmently strategies blocks from-library <strategyId> --example <exampleId> --source system --mode immediate --model <id-from-ai-models-list> --evidence-mode strategy-default --wait [projectId]
  ```

  It cannot see placed predecessor/successor context and does not expose a
  screenless block while the provider runs. Do not present it as equivalent to
  staged placement.
- As-is is explicit and non-AI:

  ```bash
  segmently strategies blocks from-library <strategyId> --example <exampleId> --mode as-is [projectId]
  ```

  `--no-adapt` remains an alias for `--mode as-is`.

Library examples can also participate in full strategy generation: pass
`libraryBlockSelections` in the `generate strategy --file` body
(`[{"exampleId":"...","source":"project|system","mode":"include|adapt|pattern"}]`,
server-enforced caps: 3 materialized / 5 pattern).

Inspect and verify generated content with the public strategy commands:

```bash
segmently screen-types show ListSinglePick
segmently strategies get <strategyId> --staleness [projectId]
segmently strategies blocks list <strategyId> [projectId]
segmently strategies screens list <strategyId> <blockId> --simplified [projectId]
segmently strategies screens get <strategyId> <blockId> <screenId> --simplified [projectId]
```

- Start scope: `generate:write`.
- Read/verification scope: `projects:read`; `--wait` and manual polling require
  `tasks:read`.
- Required project access: web onboarding generation access for
  `generate strategy` and `generate block`; web onboarding access for strategy,
  block, and screen inspection/update commands.
- `strategies contract report` and `strategies contract repair` are available
  when a strategy generation task stops at contract compilation. Use repair for
  targeted strategy-block recovery, and pass `--generate-screens true` only when
  the repaired draft should continue into screen generation.

## Strategy And Onboarding Sync (Compile / Lift / Push / Pull)

A strategy can be compiled into a runnable onboarding funnel, polished by hand
in the editor, and then kept in sync in both directions. All four sync verbs are
dry-run-first: run with `--dry-run` (or read the returned plan) before the real
write.

```bash
segmently funnels compile-strategy <strategyId> [projectId] --theme-mode project-default [--dry-run]
segmently funnels lift-strategy <funnelId> <versionId> [projectId] [--resolutions-file <path>] [--dry-run]
segmently strategies push <strategyId> [projectId] [--resolutions-file <path>] [--dry-run]
segmently strategies blocks push <strategyId> <blockId> [projectId] [--resolutions-file <path>] [--dry-run]
segmently strategies blocks pull <strategyId> <blockId> [projectId] [--resolutions-file <path>] [--dry-run]
```

What each verb does:

- `compile-strategy` creates a full onboarding funnel/version from strategy
  blocks. A theme is required for the REAL run (`--theme-mode`,
  `--project-theme`, or an existing strategy theme snapshot); a dry-run can
  succeed without one, so do not treat dry-run success as proof.
- `lift-strategy` converts one onboarding version back into strategy blocks
  (`--target-strategy <strategyId>` to aim at an existing strategy). Without
  `--replace-existing` it appends and never silently overwrites an existing
  strategy. Unassigned screens stay in a deterministic `Loose Screens` group
  unless a resolutions manifest places them.
- `strategies push` / `blocks push` applies strategy-side changes into the
  linked onboarding with a three-way merge. **Safe default: when a screen was
  edited on both sides, the funnel version wins (preserve).** Overwriting from
  the strategy requires an explicit per-screen resolution.
- `blocks pull` refreshes one strategy block from its linked onboarding
  screens.

Dry-run plans include per-screen rows (`create/replace/preserve/delete`,
`conflict`, `changeKinds`), `variableDiff`, `assetDiff`, `looseScreens` with
`suggestedBlockEntityIds`, and `foreignTagIgnored`. These fields are additive
to the public CLI contract.

### Flow Healthcheck In The Sync Loop

Compile and push responses now carry a `healthcheck` field (status, errors,
warnings, issues) computed over the resulting document, and both commands print
a `⚠ HEALTHCHECK` block on stderr when findings exist — stdout stays parseable.
Compiled funnels also get runtime variable `screenBindings` baked in, and
compile warns when a Paywall screen references a `productId` unknown to the
project product catalog (that same mismatch BLOCKS publish later).

Two dedicated verbs make "zero findings" an explicit gate:

```bash
segmently strategies healthcheck <strategyId> [projectId]   # dry-run compile + strict checks, exit 1 on findings
segmently strategies push <strategyId> --strict             # healthcheck errors on the merged doc → 422, nothing written
```

### Safe Sync Recipe

Follow this loop for every push, lift, or pull that can touch existing work.
Never hand-write ids into a manifest; only copy ids the dry-run reported.

1. Dry-run and save the plan:
   `segmently strategies push <strategyId> --dry-run --format json > plan.json`
   (same pattern for `blocks push`, `blocks pull`, `funnels lift-strategy`).
2. Build the resolutions manifest ONLY from ids found in `plan.json`. Start
   from `examples/sync-resolutions-push.json` (push) or
   `examples/sync-resolutions-lift.json` (lift/pull) and delete every entry you
   do not need. Omitted entries always take the safe default.
3. Re-run the SAME command with `--dry-run --resolutions-file <path>` and check
   the returned plan: conflict rows show `resolvedWith` (`funnel`/`strategy`),
   and the `created/replaced/preserved/deleted` counts must match your intent.
4. Run the real command (drop `--dry-run`, keep `--resolutions-file`). Sync
   commands are synchronous — there is no task to poll and no `--wait` flag.
5. Verify the result: `strategies blocks list` / `strategies screens list
   --simplified` (strategy side) or `funnels get` / `funnels audit`
   (onboarding side).

### Sync Command Parameters

`segmently funnels compile-strategy <strategyId> [projectId]`

| Option | Required | Default | Effect |
|---|---|---|---|
| `--name <name>` | no | derived | Created funnel name |
| `--version-name <name>` | no | `Compiled from strategy` | Created version name |
| `--folder <folderId>` | no | none | Target funnel folder |
| `--project-theme <projectThemeId>` | no | none | Project/product theme to attach |
| `--source-theme <themeId>` | no | none | Global themesV2 source theme to attach |
| `--theme-mode <mode>` | no | `strategy-current` | Theme source when no explicit theme is passed: `strategy-current` or `project-default` |
| `--default-language <locale>` | no | `en-US` | Default language locale |
| `--languages <locales>` | no | default language only | Comma-separated supported locales |
| `--exclude-unreachable` | no | off | Skip blocks not transitively reachable from the launch block; excluded ids are recorded in the manifest (`excludedBlockEntityIds`), push default-skips them, a scoped `blocks push <id>` re-includes one, absorb-lift keeps them on the strategy |
| `--dry-run` | no | off | Return the compiled FlowDocument without creating a funnel |
| `--output <path>` | no | none | Write only the compiled FlowDocument JSON to a file |

Compile responses also report `manifestBytes` / `manifestBudgetPct` (transform
manifest size against the 900KB version budget) and warn above 60%.

`segmently funnels lift-strategy <funnelId> <versionId> [projectId]`

| Option | Required | Default | Effect |
|---|---|---|---|
| `--name <name>` | no | derived | Created strategy name |
| `--target-strategy <strategyId>` | no | new strategy | Existing or desired strategy id |
| `--replace-existing` | no | off | Replace blocks in `--target-strategy` if it already exists (otherwise lift appends) |
| `--dry-run` | no | off | Return lifted blocks without creating/updating a strategy |
| `--resolutions-file <path>` | no | none | Manifest with `variables` / `looseScreens` keys |
| `--output <path>` | no | none | Write only the lifted blocks JSON to a file |

`segmently strategies push <strategyId> [projectId]` and
`segmently strategies blocks push <strategyId> <blockId> [projectId]`

| Option | Required | Default | Effect |
|---|---|---|---|
| `--funnel <funnelId>` | no | resolved from strategy links | Linked funnel id |
| `--version-id <versionId>` | no | linked or latest version | Funnel version id |
| `--dry-run` | no | off | Return the push plan without writing |
| `--resolutions-file <path>` | no | none | Manifest with `screens` / `variables` / `assetSlots` keys |

For `blocks push`, `<blockId>` accepts the block Firestore doc id OR the block
`entityId`.

⚠ `--version-id` is honored only TOGETHER with `--funnel`; alone it is silently
ignored and the version resolves through the strategy links.

When a push lands as `syncGate.action: 'branched'` (frozen published target),
the response includes `shipHint`: the placements still pointing at the frozen
version, the published A/B tests routing through them, a ready
`repointManifest` per placement, and the ordered command chain
(repoint → `web-placements publish` → `ab-tests publish`). The CLI prints it
as a `⚠ SHIP` stderr block; executing the chain verbatim reuses the epoch
(identical routingHash, no 409).

`segmently strategies blocks pull <strategyId> <blockId> [projectId]`

| Option | Required | Default | Effect |
|---|---|---|---|
| `--funnel <funnelId>` | no | resolved from strategy links | Linked funnel id |
| `--version-id <versionId>` | no | linked or latest version | Funnel version id |
| `--allow-empty` | no | off | Allow clearing the block when no tagged screens remain |
| `--dry-run` | no | off | Return the pull plan without writing |
| `--resolutions-file <path>` | no | none | Manifest with `variables` / `looseScreens` keys |

For `blocks pull`, `<blockId>` must be the block **Firestore doc id** (from
`strategies blocks list`), not the `entityId`.

### Resolutions Manifest

`--resolutions-file` takes a small JSON decision manifest keyed by the ids
reported in the dry-run. Unknown top-level keys are rejected before any request
is sent. Omitted entries use the safe defaults (funnel wins, target variable
definitions preserved, asset experiments merged as alternates, loose screens
stay loose).

Copy-ready starter templates: `examples/sync-resolutions-push.json` (push:
`screens` / `variables` / `assetSlots`) and `examples/sync-resolutions-lift.json`
(lift/pull: `variables` / `looseScreens`). Full per-key documentation, including
where each id comes from in the dry-run output, is in the `## User Input Files`
section below.

```json
{
  "screens": { "<globalScreenId>": "strategy" },
  "variables": { "<variableId>": "preserve" },
  "assetSlots": { "<globalScreenId>": { "<slotKey>": { "merge": true, "selectedExperimentId": "<expId>" } } },
  "looseScreens": { "<globalScreenId>": { "action": "existing-block", "blockEntityId": "<blockEntityId>" } }
}
```

- `screens`: conflict rows only; `funnel` (default) or `strategy`.
- `variables`: `preserve` | `overwrite` | `fork` | `drop`. `fork` creates
  `copy_<id>` and writes it back to the strategy.
- `assetSlots`: choose which generated image experiment stays visible; both
  sides' experiments are kept as alternates either way.
- `looseScreens` (lift/pull only): `keep-loose` | `existing-block` |
  `new-block`.

### Common Sync Mistakes

- **Expecting push to overwrite funnel edits.** It never does by default: on a
  both-sides-edited screen the funnel version wins. Overwriting requires an
  explicit `"screens": { "<globalScreenId>": "strategy" }` entry.
- **Treating a green compile dry-run as proof.** A dry-run compile succeeds
  without a theme; the real run fails when no theme can be resolved. Confirm
  the theme source (`--theme-mode` / `--project-theme` / `--source-theme`)
  before the real run.
- **Green dry-run but healthcheck errors.** A compile/push can succeed while
  its `healthcheck` field reports errors (unwired handles, unbound collect
  screens, unresolved paywall products, missing email capture before a
  paywall). Read the stderr `⚠ HEALTHCHECK` block or run
  `segmently strategies healthcheck <strategyId>`; a funnel with healthcheck
  errors will disappoint at launch even though the sync itself "worked".
- **Wrong block id kind.** `blocks pull` needs the Firestore doc id; only
  `blocks push` also accepts the `entityId`. When in doubt, take the `id` field
  from `strategies blocks list`.
- **Keying manifest maps with local screen ids.** `screens`, `assetSlots`, and
  `looseScreens` are keyed by GLOBAL screen ids exactly as printed in the
  dry-run plan (`plan[].screenId`, `looseScreens[].screenId`).
- **Sending the wrong manifest keys to a verb.** Push manifests use `screens` /
  `variables` / `assetSlots`; lift and pull manifests use `variables` /
  `looseScreens`. Keep the two template files separate — do not merge them.
- **Adding `--wait`.** Sync commands are synchronous and have no `--wait` flag;
  the response is the final result.

### Sync Auth And Access

- `compile-strategy`, `strategies push`, `blocks push`: scope `funnels:write`.
- `lift-strategy`, `blocks pull`: scopes `funnels:read` + `generate:write`.
- All four require web onboarding project access.
- Verify after a real write: `strategies blocks list` / `strategies screens
  list --simplified` (strategy side) or `funnels get` / `funnels audit`
  (onboarding side).

## User Input Files

All file inputs are JSON except prompt files for `--prompt-file`, which are
plain text or Markdown. File paths are resolved by the local shell. Prefer small,
explicit files and keep token values out of every file.

Reusable starter templates live in `examples/`. When an agent needs to prepare
CLI input files, copy the matching example into the working directory, replace
placeholder IDs and project-specific content, then run the command shown in this
guide. Keep the shape small and explicit; do not add unrelated fields.

### `actor-selections.json`

Used by `product insights generate --actor-selections-file`.

```json
{
  "actorSelections": [
    { "audienceId": "audience_1", "actorId": "actor_1" }
  ]
}
```

The file may also be a bare array with the same objects. Each item must include
`audienceId` and `actorId`. `actorId` may also be supplied as `id`.

### `strategy.json`

Used by `strategies create --file`.

```json
{
  "strategyId": "strategy_1",
  "name": "Acme onboarding",
  "description": "Personalized onboarding for Acme users",
  "strategyType": "IOS Onboarding",
  "toneOfVoice": "clear and encouraging",
  "designDescription": "Clean mobile onboarding with concise copy",
  "sourceData": {
    "insightIds": ["analysis_1"],
    "tasks": ["task_1"],
    "variableIds": ["primary_goal"],
    "reviews": [],
    "studyCases": [],
    "ratings": [],
    "bigNumbers": []
  },
  "sourceDataMapping": [],
  "strategyVariables": {},
  "replaceExisting": false
}
```

`name` is required. `strategyType` defaults to `IOS Onboarding` when omitted.
The `--strategy-id` and `--replace-existing` flags override `strategyId` and
`replaceExisting` from the file.

### `source-refs.json`

Reference-only template for the compact selection stored in
`strategy.json.sourceData`. It is not passed directly to `generate strategy`.

```json
{
  "insightIds": ["analysis_1"],
  "tasks": ["task_1"],
  "variableIds": ["primary_goal"],
  "reviews": ["review_1"],
  "studyCases": ["case_1"],
  "ratings": [],
  "bigNumbers": []
}
```

Use this shape when saving strategy metadata. Use `source.json` for the hydrated
generation input.

### `strategy-generation.json`

Used by `generate strategy --file`.

```json
{
  "strategyId": "strategy_1",
  "name": "Acme onboarding",
  "description": "Generated from CLI inputs",
  "strategyType": "IOS Onboarding",
  "toneOfVoice": "clear and encouraging",
  "designDescription": "Clean mobile onboarding with concise copy",
  "sourceData": {
    "audiences": [],
    "tasks": [
      {
        "id": "task_1",
        "name": "Improve daily focus",
        "description": "Create a daily plan that reduces distraction."
      }
    ],
    "reviews": [],
    "studyCases": [],
    "ratings": [],
    "bigNumbers": [],
    "insights": {
      "analyses": [
        {
          "id": "analysis_1",
          "name": "Acme JTBD insights",
          "summary": "Users want a faster setup that proves the app understands their goal.",
          "aggregatedInsights": {
            "coreJobs": [
              {
                "id": "core_job_1",
                "category": "coreJobs",
                "canonicalDescription": "Build a realistic daily focus plan quickly.",
                "cumulativeWeight": 0.68,
                "frequency": 12,
                "questionText": "What are you trying to improve first?"
              }
            ]
          }
        }
      ]
    }
  },
  "strategyVariables": {},
  "generateScreens": true,
  "insightsAnalysisId": "analysis_1",
  "insightVariableGenerationId": "insight_vars_1",
  "variableIds": ["primary_goal"],
  "useProjectVariables": true,
  "predecessorStrategyId": "previous_strategy_1",
  "forkHypothesis": "Shorter first-run personalization will improve completion",
  "provider": "google",
  "model": "gemini-3-flash-preview",
  "maxTokens": 64000,
  "evalEnabled": false
}
```

Required in file mode: `strategyId`, `name`, `strategyType`, and `sourceData`.
For current strategy generation, also pin `insightsAnalysisId` to the selected
completed analysis. Use `insightVariableGenerationId` only after the accepted
variables from that analysis have been reviewed.

### `source.json`

Used by `generate strategy --source-data-file` and
`generate block --source-data-file`.

```json
{
  "audiences": [],
  "tasks": [
    {
      "id": "task_1",
      "name": "Improve daily focus",
      "description": "Create a daily plan that reduces distraction."
    }
  ],
  "studyCases": [],
  "reviews": [],
  "ratings": [],
  "bigNumbers": [],
  "insights": {
    "analyses": [
      {
        "id": "analysis_1",
        "name": "Acme JTBD insights",
        "summary": "Users want a faster setup that proves the app understands their goal.",
        "aggregatedInsights": {
          "coreJobs": [
            {
              "id": "core_job_1",
              "category": "coreJobs",
              "canonicalDescription": "Build a realistic daily focus plan quickly.",
              "cumulativeWeight": 0.68,
              "frequency": 12,
              "questionText": "What are you trying to improve first?"
            }
          ],
          "fears": [
            {
              "id": "fear_1",
              "category": "fears",
              "canonicalDescription": "A long setup will feel like another chore.",
              "cumulativeWeight": 0.41,
              "frequency": 7,
              "questionText": "What could make setup feel too heavy?"
            }
          ]
        }
      }
    ]
  }
}
```

The generator accepts a broader object, but the current customer flow is
insight-first. Include the completed analysis under `insights.analyses`, include
only the selected tasks needed for task-scoped packages, and keep audience
objects empty unless they were explicitly selected as fallback context.

### `variables.json`

Used by `generate strategy --variables-file` and
`generate block --variables-file`.

```json
{
  "primary_goal": {
    "id": "primary_goal",
    "name": "Primary goal",
    "type": "enum",
    "required": true,
    "options": [
      { "id": "focus", "label": "Improve focus", "value": "focus" },
      { "id": "sleep", "label": "Sleep better", "value": "sleep" }
    ],
    "insightSource": {
      "analysisId": "analysis_1",
      "category": "coreJobs",
      "insightId": "core_job_1"
    }
  }
}
```

Keys should match variable IDs. Insight-variable generation output can be used
directly as this file after review. Insight-derived variables must reference the
same analysis that `generate strategy` pins with `insightsAnalysisId`.

### `block-generation.json`

Used by `generate block --file`.

```json
{
  "strategyId": "strategy_1",
  "blockId": "block_1",
  "blockType": "welcome",
  "prompt": "Generate concise welcome screens for this block.",
  "sourceData": {
    "audiences": [],
    "tasks": [
      {
        "id": "task_1",
        "name": "Improve daily focus",
        "description": "Create a daily plan that reduces distraction."
      }
    ],
    "reviews": [],
    "studyCases": [],
    "ratings": [],
    "bigNumbers": [],
    "insights": {
      "analyses": [
        {
          "id": "analysis_1",
          "name": "Acme JTBD insights",
          "summary": "Users want a faster setup that proves the app understands their goal.",
          "aggregatedInsights": {
            "coreJobs": [
              {
                "id": "core_job_1",
                "category": "coreJobs",
                "canonicalDescription": "Build a realistic daily focus plan quickly.",
                "cumulativeWeight": 0.68,
                "frequency": 12,
                "questionText": "What are you trying to improve first?"
              }
            ]
          }
        }
      ]
    }
  },
  "currentBlock": {},
  "blockContract": {},
  "strategyVariables": {},
  "fullStrategySequence": [],
  "startingScreenIndex": 0,
  "provider": "google",
  "model": "gemini-3-flash-preview",
  "maxTokens": 64000
}
```

Recommended required fields in file mode: `strategyId`, `blockId`, `prompt`,
and `sourceData`. Without `--file`, the CLI requires `--strategy-id`,
`--block-id`, `--prompt` or `--prompt-file`, and `--source-data-file`. For
strategies already generated with an input manifest, block regeneration uses the
strategy's frozen source data on the backend.

### `current-block.json`, `block-contract.json`, and `full-strategy-sequence.json`

Used by explicit `generate block` flags when not using `block-generation.json`.

```json
{
  "id": "block_1",
  "entityId": "welcome",
  "name": "Welcome",
  "blockType": "welcome",
  "description": "Introduce the product value and ask for the user's goal.",
  "order": 0,
  "isFirstBlock": true,
  "isLaunchBlock": true
}
```

`block-contract.json` should contain the block's variable and routing contract.
`full-strategy-sequence.json` should be an array of compact block summaries, not
the `strategy.json` metadata shell.

### Screen Update Files

Before writing screen content, inspect the screen type contract:

```bash
segmently screen-types show <screenType>
```

Use exactly one of these inputs with `strategies screens update`:

- `--content-file content.json`: a `SimplifiedV2Content` object. REPLACE
  semantics — the file becomes THE simplified content, so always send the FULL
  content (fetch it with `screens get --simplified`, edit, send back); a
  partial object silently drops everything else, including title text.
- `--simplified-file simplified-screen.json`: a full simplified screen object
  with optional `id`, `name`, `screenType`, `position`, and `content`.
- `--file screen.patch.json`: a raw StepNode merge patch for advanced cases.
  Each provided top-level subtree REPLACES the stored one; a patch whose
  `content` would drop existing keys is refused with a 400 naming them — pass
  `--replace-content` to replace the content subtree intentionally.

Note: `appearance.*` fields are not part of the simplified projection, so
appearance-only edits never register in push/pull sync diffs.

Recommended `content.json` pattern:

```json
{
  "copy": {
    "title": "Build your plan in seconds",
    "subtitle": "Answer a few quick questions so we can personalize your setup."
  },
  "options": [
    { "id": "focus", "label": "Improve focus" },
    { "id": "sleep", "label": "Sleep better" }
  ]
}
```

The exact content keys depend on the screen type. Use `--return-simplified` to
verify the saved simplified projection after an update.

### `sync-resolutions-push.json`

Used by `strategies push --resolutions-file` and
`strategies blocks push --resolutions-file`. Valid top-level keys for push:
`screens`, `variables`, `assetSlots`. Any key outside
`screens`/`variables`/`assetSlots`/`looseScreens` aborts before any request is
sent.

```json
{
  "screens": {
    "step_02__goals": "strategy"
  },
  "variables": {
    "user_goal": "fork",
    "user_name": "preserve"
  },
  "assetSlots": {
    "step_03__hero": {
      "heroImage": { "merge": true, "selectedExperimentId": "exp_dog" }
    }
  }
}
```

- `screens` — only for rows the dry-run marked `conflict: true`. Values:
  `funnel` (default, keeps the onboarding version) or `strategy` (overwrites
  from the strategy). Entries for non-conflict screens are ignored.
- `variables` — values: `preserve` (default for changed variables — keep the
  target definition), `overwrite` (take the source definition), `fork` (create
  `copy_<id>` and rewrite references in written screens), `drop` (do not carry
  the variable over).
- `assetSlots` — per screen, per slot. `merge` (default `true`) unions both
  sides' image experiments as alternates; `selectedExperimentId` picks which
  experiment stays visible and is mirrored into screen content. Omit the slot
  entirely to keep the target's current selection.

### `sync-resolutions-lift.json`

Used by `funnels lift-strategy --resolutions-file` and
`strategies blocks pull --resolutions-file`. Valid top-level keys for
lift/pull: `variables`, `looseScreens`.

```json
{
  "looseScreens": {
    "step_09__thanks": { "action": "keep-loose" },
    "step_10__promo": { "action": "existing-block", "blockEntityId": "paywall" },
    "step_11__quiz": { "action": "new-block", "newBlockName": "Motivation Quiz" }
  },
  "variables": {
    "discount_code": "overwrite",
    "legacy_flag": "drop"
  }
}
```

- `looseScreens` — one entry per unassigned screen. Actions: `keep-loose`
  (default — screen stays in the deterministic `Loose Screens` group),
  `existing-block` (requires `blockEntityId`), `new-block` (requires
  `newBlockName`).
- `variables` — same values as in the push manifest.

#### Where each manifest id comes from

Build manifests only from ids the dry-run reported — never invent them:

| Manifest key | Dry-run source field |
|---|---|
| `screens.<id>` | `plan[].screenId` where `conflict: true` |
| `variables.<id>` | `variableDiff[].variableId` |
| `assetSlots.<screenId>` | `assetDiff[].screenId` |
| `assetSlots.<screenId>.<slotKey>` | `assetDiff[].slotKey` |
| `assetSlots...selectedExperimentId` | `assetDiff[].sourceExperimentIds` / `targetExperimentIds` |
| `looseScreens.<id>` | `looseScreens[].screenId` |
| `looseScreens...blockEntityId` | `looseScreens[].suggestedBlockEntityIds` or `strategies blocks list` |

After editing a manifest, re-run the same command with `--dry-run
--resolutions-file` and confirm `plan[].resolvedWith` and the plan counts match
your intent before the real run (see the Safe Sync Recipe).

## Load References As Needed

- Command/scopes lookup: read `references/commands.md`.
- Public command summary: read `references/commands.md`.
- File templates: use `examples/*.json` and `examples/block-prompt.md`.

## Response Shape

When answering a Product CLI planning question, use this structure:

```text
Goal:
Recommended flow:
Required auth/scopes:
Required project access:
Commands:
Verification:
Notes / risks:
```

Keep command examples copyable. Use placeholder IDs like `<projectId>`,
`<analysisId>`, and `<audienceId>` unless the user supplied real IDs. Never
invent or print token values.

## Safety Rules

- Use only `/api/cli/v1` backed commands. Do not recommend direct Firestore
  writes or non-CLI API routes for Product CLI automation.
- Use only command families listed in this guide for public Product CLI answers.
- Service-token scopes do not grant project feature access by themselves.
- Product write workflows may include additional safety checks depending on the
  entity.
- Do not expose detailed Product mutation payloads in customer-facing answers.
