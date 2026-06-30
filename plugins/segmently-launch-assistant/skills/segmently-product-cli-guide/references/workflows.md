# Segmently Product CLI Public Workflow Note

Product Page CLI workflows are available for approved Product operations with
`product:read` or `product:write` scopes and the relevant active project
feature access.

Customer-facing guidance should stay at command-selection and verification
level. Do not include detailed Product mutation payloads or low-level generated
insight editing instructions.

## Public Insight Generation Flow

1. Confirm the project has the required generation access. A structured
   `402 payment_required` response with `reason: missing_capability` means the
   project lacks the response's `requiredCapability`; select an entitled project
   or enable access before retrying.
2. Prepare an actor selections file from existing Product actors.
3. Start insight generation:

   ```bash
   segmently product insights generate --actor-selections-file sel.json --wait [projectId]
   ```

4. Recompute selected insight categories when an existing analysis needs a
   targeted refresh:

   ```bash
   segmently product insights recompute-categories <analysisId> --categories coreJobs,fears --wait [projectId]
   ```

5. Generate insight variables from a completed analysis:

   ```bash
   segmently product insights variables generate <analysisId> --categories coreJobs,fears --wait [projectId]
   segmently product insights variables generate <analysisId> --task-scope task --task-id <taskId> --existing-variable-ids primary_goal --wait [projectId]
   ```

6. Verify task completion with `segmently tasks get <taskId>` when not using
   `--wait`, then verify the output with `product insights get <analysisId>`.

No Product CLI command currently exposes audience generation, actor generation,
or interviews. Do not present unlisted command families as public Product CLI
workflows.

## Public Strategy, Blocks, And Screens Flow

1. Start from a completed insights analysis. Generate and review
   insight-derived variables when the strategy should use accepted variables
   from that analysis.

   ```bash
   segmently product insights variables generate <analysisId> --categories coreJobs,fears --wait [projectId]
   ```

2. Create or select a strategy shell. `strategy.json` stores selected source
   references such as `insightIds`, task IDs, variable IDs, and social proof IDs.

   ```bash
   segmently strategies create --file strategy.json [projectId]
   ```

3. Generate strategy blocks. Add `--generate-screens` when the same run should
   continue into screen generation.

   ```bash
   segmently generate strategy --file strategy-generation.json --wait [projectId]
   segmently generate strategy --strategy-id <strategyId> --name "Acme onboarding" --strategy-type "IOS Onboarding" --source-data-file source.json --insights-analysis-id <analysisId> --insight-variable-generation-id <generationId> --variable-ids primary_goal --use-project-variables true --wait [projectId]
   segmently generate strategy --strategy-id <strategyId> --name "Acme onboarding" --strategy-type "IOS Onboarding" --source-data-file source.json --insights-analysis-id <analysisId> --insight-variable-generation-id <generationId> --variable-ids primary_goal --use-project-variables true --generate-screens --wait [projectId]
   ```

   File mode requires the JSON body to include `strategyId`, `name`,
   `strategyType`, and `sourceData`. In CLI `0.1.4+`, do not add a duplicate
   `--strategy-id` flag in file mode unless intentionally overriding the file.
   Required without `--file`: `--strategy-id`, `--name`, `--strategy-type`, and
   `--source-data-file`. Use `--variables-file` for the strategy variable
   package. Optional targeting controls: `--insight-variable-generation-id`,
   `--variable-ids`, `--use-project-variables`, `--insights-analysis-id`,
   `--predecessor-strategy-id`, and `--fork-hypothesis`.

   Current strategy generation should pin `--insights-analysis-id`. The
   `source.json` file should include `insights.analyses` for the selected
   analysis plus only selected tasks and social proof. Do not make audience
   objects the primary input unless they were explicitly selected as fallback
   context.

4. Generate or regenerate a specific block's screens when the strategy already
   has block context.

   ```bash
   segmently generate block --file block-generation.json --wait [projectId]
   segmently generate block --strategy-id <strategyId> --block-id <blockId> --prompt-file block-prompt.md --source-data-file source.json --current-block-file current-block.json --block-contract-file block-contract.json --variables-file variables.json --full-strategy-file full-strategy-sequence.json --wait [projectId]
   ```

   Required without `--file`: `--strategy-id`, `--block-id`, `--prompt` or
   `--prompt-file`, and `--source-data-file`. Optional controls:
   `--current-block-file`, `--block-contract-file`, `--variables-file`,
   `--full-strategy-file`, `--starting-screen-index`, `--block-type`,
   `--provider`, `--model`, and `--max-tokens`.

   For strategies with an input manifest, backend block regeneration uses the
   frozen strategy source data even though the CLI request still needs a
   `sourceData` object for validation.

5. Inspect generated blocks and screens.

   ```bash
   segmently strategies blocks list <strategyId> [projectId]
   segmently strategies screens list <strategyId> <blockId> --simplified [projectId]
   ```

6. Apply focused screen edits with simplified content when needed.

   ```bash
   segmently screen-types show <screenType>
   segmently strategies screens update <strategyId> <blockId> <screenId> --content-file content.json --return-simplified [projectId]
   ```

   Use exactly one of `--content-file`, `--simplified-file`, or `--file`.
   Prefer `--content-file` with the `SimplifiedV2Content` shape shown by
   `screen-types show`.

7. If a strategy task stops at contract compilation, inspect and repair only the
   failed target.

   ```bash
   segmently strategies contract report <strategyId> --source-task-id <taskId> [projectId]
   segmently strategies contract repair <strategyId> --source-task-id <taskId> --target common --generate-screens true --wait [projectId]
   ```

8. Add or revise generated assets only through existing screen-owned slots.
   Public CLI asset work creates prompt/image experiments for a slot; it does
   not create new asset slots.

   ```bash
   segmently strategies blocks assets slots list <strategyId> <blockId> [projectId]
   segmently strategies blocks assets slots get <strategyId> <blockId> <slotKey> --screen-id <screenId> --output slot.json [projectId]
   segmently strategies blocks assets slots regenerate-prompt <strategyId> <blockId> <slotKey> --screen-id <screenId> --instruction-file asset-instruction.md --concept-count 3 --wait [projectId]
   segmently strategies blocks assets slots regenerate-prompt <strategyId> <blockId> <slotKey> --screen-id <screenId> --source-experiment-id <experimentId> --instruction "Make the visual less literal" --concept-count 3 --select --wait [projectId]
   segmently strategies blocks assets slots generate <strategyId> <blockId> <slotKey> --screen-id <screenId> --source-experiment-id <promptExperimentId> --model gemini-3.1-flash-image-preview --aspect-ratio 9:16 --select --wait [projectId]
   segmently strategies blocks assets slots select <strategyId> <blockId> <slotKey> <experimentId> --screen-id <screenId> [projectId]
   ```

   Always pass `--screen-id` for slot-level commands because slot keys repeat
   across screens. Use `regenerate-prompt` as the public prompt-authoring path;
   do not use or recommend old static asset prepare commands. Verify each write
   with `tasks get` when not using `--wait`, then `assets slots get`.
