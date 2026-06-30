---
name: segmently-product-cli-guide
description: "Customer-safe high-level guide for Segmently Product Page CLI availability: product mode, tasks, variables, audiences, generated insights, onboarding strategies, blocks, screens, strategy screen asset slots, B2B/B2C concepts, required scopes, project access, and safe verification. Does not expose detailed mutation payloads. Also trigger when Segmently Launch Assistant names executeWith.skill/owningSkill=segmently-product-cli-guide or routes a product-page/insights task to this companion."
---

# Segmently Product CLI Guide

Use this Product CLI guide when a customer or customer-facing agent needs a
high-level overview of Segmently Product Page CLI availability.

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
- Strategy screen asset slots are screen-owned image slots such as `hero` or
  option visuals. Public CLI asset work starts from an existing slot; it does
  not create brand-new slots.
- Prompt experiments store prompt drafts for one slot. Image experiments store
  generated media for one slot. A selected experiment is the slot result the
  screen should use.
- `screenId` is required for reliable asset slot writes because the same
  `slotKey` can appear on many screens inside one strategy block.
- `conceptCount` controls how many prompt concepts the prompt authoring task
  requests; use `3` as the default review-friendly value unless the operator
  asks for a narrower or wider exploration.
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
  needs web onboarding access; strategy screen asset slot reads need web
  onboarding access; strategy screen asset prompt/image mutations need web
  onboarding access plus generation scope. `screen-types show` has no project
  feature gate.

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

## Strategy Screen Asset Slots

Use strategy screen asset slot commands only for slots that already exist on
strategy-owned screens. To add a new asset through public CLI, create a new
prompt or image experiment for an existing slot; do not claim that the Product
CLI can create a new slot.

Inspect available slots first:

```bash
segmently strategies blocks assets slots list <strategyId> <blockId> [projectId]
segmently strategies blocks assets slots get <strategyId> <blockId> <slotKey> --screen-id <screenId> --output slot.json [projectId]
```

Use `regenerate-prompt` as the public prompt-authoring path for both first
prompt generation and prompt revision. Request multiple concepts when the
operator wants reviewable alternatives:

```bash
segmently strategies blocks assets slots regenerate-prompt <strategyId> <blockId> <slotKey> --screen-id <screenId> --instruction-file asset-instruction.md --concept-count 3 --wait [projectId]
segmently strategies blocks assets slots regenerate-prompt <strategyId> <blockId> <slotKey> --screen-id <screenId> --source-experiment-id <experimentId> --instruction "Make the visual less literal" --concept-count 3 --select --wait [projectId]
```

Generate an image from the selected or specified prompt experiment. Use
`--source-experiment-id` when the image should inherit the stored prompt package
from a prompt experiment. Use `--reference-images-file` only with public image
URLs that are safe to send to the image provider.

```bash
segmently strategies blocks assets slots generate <strategyId> <blockId> <slotKey> --screen-id <screenId> --source-experiment-id <promptExperimentId> --model gemini-3.1-flash-image-preview --aspect-ratio 9:16 --select --wait [projectId]
segmently strategies blocks assets slots select <strategyId> <blockId> <slotKey> <experimentId> --screen-id <screenId> [projectId]
```

- Read scope: `projects:read`.
- Prompt/image mutation scope: `generate:write`; add `tasks:read` for `--wait`
  or manual polling with `segmently tasks get <taskId>`.
- Required project access: web onboarding access for reads and strategy screen
  asset slot mutations.
- Verification: use `tasks get` when not using `--wait`, then use
  `assets slots get` to confirm `selectedExperimentId`, prompt text, generated
  URL/status, and experiment count.

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

- `--content-file content.json`: a `SimplifiedV2Content` object.
- `--simplified-file simplified-screen.json`: a full simplified screen object
  with optional `id`, `name`, `screenType`, `position`, and `content`.
- `--file screen.patch.json`: a raw StepNode merge patch for advanced cases.

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

### Asset Workflow Helper Files

`asset-instruction.md` is used by
`strategies blocks assets slots regenerate-prompt --instruction-file`.

```md
Create three visually distinct prompt concepts. Keep the screen meaning intact,
but avoid making the headline into a literal object.
```

`asset-screen-context.json` is used by
`strategies blocks assets slots regenerate-prompt --screen-context-file` when
measured slot context is available.

```json
{
  "slotKey": "hero",
  "screenId": "screen_1",
  "aspectRatio": { "label": "9:16", "value": 0.5625, "nearestPresetId": "portrait_9_16" },
  "targetBounds": { "width": 390, "height": 694 }
}
```

`asset-reference-images.json` is used by
`strategies blocks assets slots generate --reference-images-file`.

```json
[
  {
    "url": "https://example.com/reference-image.png",
    "role": "style"
  }
]
```

`asset-issue-report.json` is used by
`strategies blocks assets slots regenerate-prompt --issue-report` for targeted
prompt repair.

```json
{
  "status": "failure",
  "issues": [
    { "code": "generic_subject", "path": "$.promptTemplate" }
  ]
}
```

## Load References As Needed

- Command/scopes lookup: read `references/commands.md`.
- Public command summary: read `references/commands.md`.
- Strategy screen asset workflow: read `references/asset-workflows.md`.
- File templates: use `examples/*.json`, `examples/*.md`, and
  `examples/block-prompt.md`.

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

## Verification

After editing this skill, run:

```bash
node <skill-root>/scripts/run-evals.mjs
```
