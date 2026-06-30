# Segmently Product CLI Public Summary

## Auth And Access

| Surface | Commands | Scopes | Project access |
|---|---|---|---|
| Product mode | `segmently product mode get/set` | `product:read`, `product:write` | Product analysis access (`product_analysis.access`) |
| Tasks | `segmently product tasks list/get/create/update/delete` | `product:read`, `product:write` | Product analysis access (`product_analysis.access`) |
| Variables | `segmently product variables list/get/apply/upsert/delete` | `product:read`, `product:write` | Product analysis access (`product_analysis.access`) |
| Audiences | Product audience read/write commands | `product:read`, `product:write` | Audiences access (`audiences.access`) |
| Insights read/write | `product insights list/get/export/patch/clone/delete`, `item patch`, `source add/remove` | `product:read`, `product:write` | Product analysis access (`product_analysis.access`) |
| Insight analysis generation | `segmently product insights generate` | `generate:write`; add `tasks:read` for `--wait` or polling | Insights generation access (`insights.generate`) |
| Insight category recompute | `segmently product insights recompute-categories` | `generate:write`; add `tasks:read` for `--wait` or polling | Insights generation access (`insights.generate`) |
| Insight-variable generation | `segmently product insights variables generate` | `generate:write`; add `tasks:read` for `--wait` or polling | Insight-variable generation access (`insights.variables.generate`) |
| Screen content discovery | `segmently screen-types list/search/show` | `funnels:read` | No project feature gate |
| Strategy/block/screen inspect | `segmently strategies get`, `segmently strategies blocks list/get`, `segmently strategies screens list/get` | `projects:read` | Web onboarding access |
| Strategy/block/screen update | `segmently strategies create/update`, `segmently strategies blocks update/clone`, `segmently strategies screens update/clone` | `generate:write` | Web onboarding access |
| Strategy and screen generation | `segmently generate strategy`, `segmently generate block`, `segmently strategies contract repair` | `generate:write`; add `tasks:read` for `--wait` or polling | Web onboarding generation access (`web_onboarding.block.regenerate`) |
| Strategy screen asset slots | `strategies blocks assets slots list/get`, `regenerate-prompt`, `generate`, `select` | Reads use `projects:read`; prompt/image mutations use `generate:write`; add `tasks:read` for `--wait` or polling | Web onboarding access |

`product:write` satisfies `product:read`. `generate:write` is separate from
Product CRUD scopes. Service-token scopes and project feature access are
separate checks. Project access labels are feature entitlements, not separate
public plan names.

If the CLI returns `402 payment_required` with `reason: missing_capability`,
read the response's `requiredCapability` and stop until that project access is
enabled or a different entitled project is selected. This is not fixed by adding
broader CLI scopes to the same token.

## Product Page Availability

```bash
segmently product mode get --project <projectId>
segmently product tasks list --project <projectId>
segmently product variables list --project <projectId>
segmently product audiences list --project <projectId>
segmently product insights list --project <projectId>
```

## Generation And Recompute

```bash
segmently product insights generate --actor-selections-file sel.json --wait [projectId]
segmently product insights recompute-categories <analysisId> --categories coreJobs,fears --wait [projectId]
segmently product insights variables generate <analysisId> --categories coreJobs,fears --wait [projectId]
segmently product insights variables generate <analysisId> --task-scope task --task-id <taskId> --existing-variable-ids primary_goal --wait [projectId]
segmently tasks get <taskId> --project <projectId>
```

Use existing actor selections for insight generation. No Product CLI command
currently exposes audience generation, actor generation, or interviews.

## Strategy, Blocks, And Screens

```bash
segmently strategies create --file strategy.json [projectId]
segmently generate strategy --file strategy-generation.json --wait [projectId]
segmently generate strategy --strategy-id <strategyId> --name "Acme onboarding" --strategy-type "IOS Onboarding" --source-data-file source.json --insights-analysis-id <analysisId> --insight-variable-generation-id <generationId> --variable-ids primary_goal --use-project-variables true --generate-screens --wait [projectId]
segmently generate block --file block-generation.json --wait [projectId]
segmently generate block --strategy-id <strategyId> --block-id <blockId> --prompt-file block-prompt.md --source-data-file source.json --current-block-file current-block.json --block-contract-file block-contract.json --variables-file variables.json --full-strategy-file full-strategy-sequence.json --wait [projectId]
segmently screen-types show <screenType>
segmently strategies blocks list <strategyId> [projectId]
segmently strategies screens list <strategyId> <blockId> --simplified [projectId]
segmently strategies screens update <strategyId> <blockId> <screenId> --content-file content.json --return-simplified [projectId]
segmently strategies blocks assets slots list <strategyId> <blockId> [projectId]
segmently strategies blocks assets slots get <strategyId> <blockId> <slotKey> --screen-id <screenId> [projectId]
segmently strategies blocks assets slots regenerate-prompt <strategyId> <blockId> <slotKey> --screen-id <screenId> --instruction-file asset-instruction.md --concept-count 3 --wait [projectId]
segmently strategies blocks assets slots generate <strategyId> <blockId> <slotKey> --screen-id <screenId> --source-experiment-id <promptExperimentId> --model gemini-3.1-flash-image-preview --aspect-ratio 9:16 --select --wait [projectId]
segmently strategies blocks assets slots select <strategyId> <blockId> <slotKey> <experimentId> --screen-id <screenId> [projectId]
segmently strategies contract report <strategyId> --source-task-id <taskId> [projectId]
segmently strategies contract repair <strategyId> --source-task-id <taskId> --target common --generate-screens true --wait [projectId]
```

Detailed Product mutation payloads are not included in this public guide.
