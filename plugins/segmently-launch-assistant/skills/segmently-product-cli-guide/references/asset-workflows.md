# Segmently Product CLI Asset Slot Workflow

Strategy screen asset slot commands operate on existing screen-owned slots. The
public Product CLI can add prompt and image experiments to a slot, regenerate a
slot prompt, generate a new image, and select an experiment. It does not create brand-new asset slots.

## 1. Inspect available slots

List slots for a strategy block, then inspect a specific slot. Always pass
`--screen-id` for slot-level operations because the same `slotKey` can appear on
multiple screens.

```bash
segmently strategies blocks assets slots list <strategyId> <blockId> [projectId]
segmently strategies blocks assets slots get <strategyId> <blockId> <slotKey> --screen-id <screenId> --output slot.json [projectId]
```

## 2. Generate the first prompt experiment

Use `regenerate-prompt` even when the slot has no usable prompt yet. Request
three concepts for normal review workflows.

```bash
segmently strategies blocks assets slots regenerate-prompt \
  <strategyId> <blockId> <slotKey> \
  --screen-id <screenId> \
  --instruction-file asset-instruction.md \
  --concept-count 3 \
  --wait \
  [projectId]
```

When measured screen context is available, include it so the prompt designer can
preserve the intended aspect ratio and slot fit:

```bash
segmently strategies blocks assets slots regenerate-prompt \
  <strategyId> <blockId> <slotKey> \
  --screen-id <screenId> \
  --instruction-file asset-instruction.md \
  --screen-context-file asset-screen-context.json \
  --concept-count 3 \
  --wait \
  [projectId]
```

## 3. Regenerate or repair from an existing prompt experiment

Use `--source-experiment-id` when revising a selected prompt experiment or
repairing a weak prompt. Use `--select` only when the new draft should become
the selected prompt experiment.

```bash
segmently strategies blocks assets slots regenerate-prompt \
  <strategyId> <blockId> <slotKey> \
  --screen-id <screenId> \
  --source-experiment-id <experimentId> \
  --instruction "Make the visual less literal" \
  --concept-count 3 \
  --select \
  --wait \
  [projectId]
```

For targeted repair, add a compact issue report:

```bash
segmently strategies blocks assets slots regenerate-prompt \
  <strategyId> <blockId> <slotKey> \
  --screen-id <screenId> \
  --source-experiment-id <experimentId> \
  --source-package-id <packageId> \
  --issue-report asset-issue-report.json \
  --instruction-file asset-instruction.md \
  --concept-count 3 \
  --wait \
  [projectId]
```

## 4. Generate a new image experiment

Generate from a stored prompt experiment by passing `--source-experiment-id`.
Add public reference image URLs only when the operator explicitly selected them.

```bash
segmently strategies blocks assets slots generate \
  <strategyId> <blockId> <slotKey> \
  --screen-id <screenId> \
  --source-experiment-id <promptExperimentId> \
  --model gemini-3.1-flash-image-preview \
  --aspect-ratio 9:16 \
  --reference-images-file asset-reference-images.json \
  --select \
  --wait \
  [projectId]
```

Use explicit prompt overrides only for manual experiments:

```bash
segmently strategies blocks assets slots generate \
  <strategyId> <blockId> <slotKey> \
  --screen-id <screenId> \
  --prompt-file image-prompt.md \
  --provider google \
  --model gemini-3.1-flash-image-preview \
  --aspect-ratio 9:16 \
  --select \
  --wait \
  [projectId]
```

## 5. Select an existing experiment

Select a generated experiment when it has already been reviewed:

```bash
segmently strategies blocks assets slots select <strategyId> <blockId> <slotKey> <experimentId> --screen-id <screenId> [projectId]
```

## Verification

- `--wait` returns the terminal backend task status. Without `--wait`, poll with
  `segmently tasks get <taskId> --project <projectId>`.
- Run `assets slots get` after every write to confirm `selectedExperimentId`,
  prompt text, generated URL/status, and experiment count.
- If generation fails because of project access, read the structured
  `requiredCapability` value and stop until access is enabled.

## Access

- Read commands use `projects:read`.
- Prompt/image mutations use `generate:write`.
- Waiting or polling tasks requires `tasks:read`.
- Project access is web onboarding access.
