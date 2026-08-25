---
name: screen-block-builder
description: Author, validate, preview, and publish reusable Segmently strategy block examples through the public CLI and an exact runtime prompt packet. Use for block-library authoring, creating example blocks, adapting a library block, generating or revising one block's simplified screens, instructions, data usage, data mappings, or asset intents, and for dry-run/apply/readback library workflows.
---

# Screen Block Builder

Build one reusable strategy-block example without approximating the runtime
agent prompt. Treat full screens as render-only previews and simplified screens
as the authoring/adaptation contract.

When Segmently Launch Assistant delegates here, the routing marker is
`owningSkill=screen-block-builder`.

## Non-negotiable boundaries

- Obtain `systemPrompt`, provider-neutral `userMessage`, exact
  `effectiveUserMessage`, `renderInput`, resolved branch state, and selected
  output schema from one CLI-exported runtime packet. Never reconstruct them
  from prompt files or prose.
- Give a fresh agent only the generated `agent-request.json`. Do not give it
  repository access, editing tools, expected output, evaluator notes, or
  held-back `eval-context.json` / `validation-schema.json` files.
- Keep `previewScreens` as full render-only snapshots. Never include them in a
  runtime packet, model request, adapted output, or target materialization.
- Treat asset examples as references to intent and visual function. Author new
  target `aiMeta.assetIntents`; later asset generation creates provider-ready
  prompts from target context.
- A write is incomplete until dry-run review, explicit user approval, apply,
  and authoritative readback all succeed. Create, update, and disable use CLI
  `get`; delete uses the apply response's `readback.exists=false` receipt.
- Use only public project-library commands. Do not expose privileged catalogue
  maintenance syntax in customer output.

## Inputs

Collect or discover:

- project id;
- source strategy id and source block id for capture, or a local v2 block
  example file for create/update;
- target name, description, tags, instructions, contract, and data semantics;
- full `previewScreens` for exact visual review;
- simplified blueprint screens plus `aiMeta.dataMapping` and semantic
  `aiMeta.assetIntents`;
- model id from `segmently ai models list <projectId>` when an agent run is
  requested.

Use `examples/library-authoring-request.json` as the complete
`UpdateBlockFromLibraryCompileInput` template. Replace `<projectId>` in the
CLI command and `<project-model-id>` / target-id placeholders in the file with
values read from the project. Do not put credentials in authoring files.

## Workflow

### 1. Read current state

```bash
segmently strategies blocks library list <projectId> --format json
segmently strategies blocks library get <exampleId> <projectId> --format json
segmently strategies blocks list <strategyId> <projectId> --format json
segmently strategies screens list <strategyId> <blockId> --simplified <projectId> --format json
```

For a new captured example, export before authoring:

```bash
segmently strategies blocks library capture <strategyId> <blockId> <projectId> \
  --id <exampleId> --out block-library-draft.json --dry-run --format json
```

Review the blueprint and preview separately:

- blueprint: brief, regenerated instructions, simplified screens, contract,
  data semantics, data mappings, and asset intents/examples;
- preview: full screen snapshots only, used to confirm what the example looks
  like.

### 2. Validate the dual representation

```bash
node <skill-root>/scripts/validate-library-example.mjs \
  --input block-library-draft.json --format json

node <skill-root>/scripts/render-library-preview.mjs \
  --input block-library-draft.json --out block-library-preview.html

segmently strategies blocks library validate \
  --file block-library-draft.json <projectId> --format json
```

Stop if the blueprint and preview screen ids/count/order differ, a screen is
missing, the checksum is invalid, or full-preview/generated-asset material
appears in the blueprint.

### 3. Export the exact runtime packet

Build the compile input from the project-library readback and compact target
strategy context. Copy only `source.blueprint`; never copy `previewScreens`
into this file. `target.sequence`, `predecessor`, and `successor` are compact
block summaries with no full screens. Set exactly one evidence state under
`evidence.selection`: `strategy-default`, `selected-only`, or `no-evidence`.

Validate the complete input, then use the public preview adapter. The adapter
calls the same compiler as the runtime:

```bash
node <skill-root>/scripts/validate-compile-input.mjs \
  --input examples/library-authoring-request.json --format json
```

```bash
segmently strategies blocks library prompt-packet \
  --request-file examples/library-authoring-request.json \
  --out runtime-packet.json <projectId> --format json

node <skill-root>/scripts/validate-runtime-packet.mjs \
  --packet runtime-packet.json --format json
```

The packet contract is in `references/runtime-packet-contract.md`. If the
installed CLI does not expose `prompt-packet`, stop and report the missing
capability. Do not fall back to manual prompt assembly.

### 4. Prepare a packet-only agent run

```bash
node <skill-root>/scripts/prepare-agent-run.mjs \
  --packet runtime-packet.json --out-dir agent-run
```

This writes:

- `agent-request.json`: the only file given to a fresh agent;
- `eval-context.json`: held back for deterministic evaluation;
- `validation-schema.json`: checksum-pinned, held-back output schema snapshot;
- `run-manifest.json`: immutable prepared packet hash and advisory-proof metadata.

Run a fresh agent with no inherited conversation and no repository/filesystem
tools. Its task is only: obey `systemPrompt`, use `userMessage` (which is the
packet's exact `effectiveUserMessage`), and return JSON matching the supplied
output schema when present. Save its raw response as
`agent-run/raw-output.json`.

Subagent smoke is advisory. It never replaces a real runtime task and its
recorded prompt version/readback.

### 5. Evaluate and review the authored block

```bash
node <skill-root>/scripts/evaluate-agent-output.mjs \
  --packet runtime-packet.json \
  --output agent-run/raw-output.json \
  --validation-schema agent-run/validation-schema.json \
  --run-manifest agent-run/run-manifest.json \
  --report agent-run/evaluation.json
```

After a passing evaluation, the operator records the fresh-agent identity,
agent-request-only boundary, artifact checksums, and concise evaluator notes in
a separate completion receipt. Never rewrite the prepared manifest to claim a
completed run:

```bash
node <skill-root>/scripts/record-agent-completion.mjs \
  --run-dir agent-run \
  --scenario <scenario-name> \
  --run-id <run-id> \
  --agent-task <fresh-agent-task-id> \
  --note "Topology matched the resolved branch." \
  --note "Evidence, variables, routes, and assets passed review."
```

For Google packets, both held-back files are mandatory. Evaluation fails before semantic
acceptance if the manifest does not bind the exact packet or the schema bytes do not match the
manifest checksum. Never substitute the current packaged schema for a prepared run snapshot.

Review these surfaces separately:

1. description and reusable job/pattern;
2. instructions rewritten for the target context;
3. simplified screens, routes, and required variable collection;
4. `dataUsage` and every screen's `aiMeta.dataMapping`;
5. `aiMeta.assetIntents` and asset examples as pattern references;
6. full render-only preview;
7. evaluator failures and earliest failure stage.

Repeat with a new fresh agent when the packet or example changes. Preserve raw
outputs, evaluator reports, and `completion.json` receipts for each cycle.

### 6. Dry-run, ask approval, apply, read back

For create or update, first ask the CLI for a deterministic receipt:

```bash
segmently strategies blocks library create \
  <exampleId> --file block-library-draft.json --dry-run <projectId> --format json
```

Show the receipt/checksum and material changes to the user. Do not apply until
the user explicitly approves that exact revision.

After approval:

```bash
segmently strategies blocks library create \
  <exampleId> --file block-library-draft.json --apply \
  --dry-run-checksum <reviewedChecksum> \
  <projectId> --format json

segmently strategies blocks library get <exampleId> <projectId> --format json
```

Use the matching `update` or `disable` verb for an existing example, with the
same dry-run → approval → apply → get/readback discipline. For `delete`,
require `readback.exists=false` in the successful apply response; a later
`get` is expected to return structured `not_found`, not a successful entity
readback. If the checksum changes between review and apply, stop and repeat the
review.

## Updating a normal strategy block

For a block that is not being authored as a library example, use the standard
`segmently generate block` flow from the Product CLI guide. This skill still
requires the runtime packet when evaluating a library-derived adaptation; it
does not read prompt source files.

## Failure handling

- Missing CLI auth: ask the user to run `segmently auth login`, then retry.
- Missing project access/capability: report the structured CLI error; do not
  broaden scopes or use a private fallback.
- Missing `prompt-packet`: stop; the exact-runtime guarantee cannot be met.
- Empty or invalid selected evidence: stop before the agent call and ask for a
  new selection or explicit no-evidence mode.
- Empty strategy-default evidence: accept only when the packet records an
  explicit resolved no-evidence fallback.
- First, last, or isolated/manual target: accept absent neighbours as valid;
  never invent them.
- Packet hash mismatch or forbidden preview/source asset leakage: discard the
  packet and export again.
- Invalid agent JSON/schema/routes/variables/data mappings: do not create or
  update the library record; revise the packet/example and rerun.

## Verification

Run deterministic skill checks after edits:

```bash
node <skill-root>/scripts/run-evals.mjs
```

For an actual authoring session, retain the CLI dry-run receipt, approved
checksum, apply response, authoritative readback, runtime packet, raw agent
output, evaluation report, and completion receipt.
