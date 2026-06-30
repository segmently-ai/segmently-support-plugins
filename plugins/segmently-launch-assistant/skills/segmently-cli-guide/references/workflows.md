# Segmently CLI Workflows

Use this file when the user asks for linked customer-safe command sequences.

## Content Plan Workflows

For Content Plan profile, pillar, template, design-profile, visual-reference,
and text-budget workflows, use `segmently-cli-content-plan-guide`. This general
guide only keeps cross-product workflows such as launch, A/B, Stripe, analytics,
domains, and publishing.

## Sandbox Paywall A/B Launch

Goal: build a sandbox Stripe paywall onboarding experiment and return URLs.

```bash
segmently capabilities
segmently themes list --project <projectId>
segmently stripe account --project <projectId> --mode test
segmently stripe paywall-product ensure --project <projectId> --file paywall-monthly.json
segmently funnels apply --project <projectId> --file funnel-control.json
segmently funnels apply --project <projectId> --file funnel-treatment.json
segmently ab-tests rollout apply --project <projectId> --file rollout.json --publish --probe
segmently launch preflight --project <projectId> --funnel <funnelId> --version-id <versionId> --web-placement <webPlacementId> --required-variable goal,name,email --require-paywall --require-stripe-sandbox --require-published --require-facebook-attribution
segmently publish verify --project <projectId> --url <abUrl> --required-variant control,treatment
```

Required scopes usually include:
`projects:read,themes:read,themes:write,stripe:read,stripe:write,funnels:read,funnels:write,publish:read,publish:write`.

Required subscription: Web onboarding access.

## Standalone V2 Funnel Clone

Goal: copy one same-project V2 onboarding version into a new funnel before
manual edits, review, or a separate experiment.

```bash
segmently funnels clone <sourceFunnelId> \
  --project <projectId> \
  --version-id <sourceVersionId> \
  --name "Treatment copy" \
  --version-name "Draft"
```

The source funnel/version stays unchanged. Omit folder flags to preserve the
source folder, use `--folder <folderId>` to place the clone in a specific
folder, or `--root` to place it at project root.

Required scopes: `funnels:write`.

Required subscription: Web onboarding access.

## Clone-First Connected Screen Migration

Goal: migrate one connected non-launch V2 screen while keeping the original
screen visible on the canvas as rollback. Use this for full StepNode changes
such as `ListMultiPick` to `ListSinglePick` or replacing background image URLs.
Do not use `funnels screens apply` for this workflow; it is intended for
supported manifest/template screen creation.

```bash
segmently funnels screens inspect <sourceScreenId> \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --dependencies

segmently funnels screens clone <sourceScreenId> \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --offset 180,0 \
  --edge-mode copy-outgoing

segmently funnels screens patch <cloneScreenId> \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --file screen-patch.json \
  --dry-run

segmently funnels screens patch <cloneScreenId> \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --file screen-patch.json

segmently funnels screens rewire \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --from <sourceScreenId> \
  --to <cloneScreenId> \
  --incoming \
  --dry-run

segmently funnels screens rewire \
  --project <projectId> \
  --funnel <funnelId> \
  --version-id <versionId> \
  --from <sourceScreenId> \
  --to <cloneScreenId> \
  --incoming
```

For `ListMultiPick` to `ListSinglePick`, use a patch file like:

```json
{
  "operations": [
    { "op": "convertSelection", "to": "ListSinglePick", "variableMode": "new-enum" }
  ]
}
```

For background replacement, use:

```json
{
  "operations": [
    { "op": "setBackgroundImageUrl", "url": "https://cdn.example.com/background.png" }
  ]
}
```

After rewiring, run `funnels screens inspect` for both source and clone. The
source should have no incoming edges and remains available for rollback unless
the user explicitly asks to run `funnels screens delete`. The old screen still
appears on the canvas; rewire changes graph targets, not canvas visibility.

Required scopes: `funnels:read,funnels:write`.

Required subscription: Web onboarding access.

## Batch Selection Migration On A Cloned Funnel

Goal: convert many `ListMultiPick` screens to `ListSinglePick` while keeping the
source funnel untouched and leaving connected originals as rollback screens.

1. Clone the full source funnel/version.
2. List candidates:

```bash
segmently funnels screens list \
  --project <projectId> \
  --funnel <cloneFunnelId> \
  --version-id <cloneVersionId> \
  --type ListMultiPick
```

3. For each candidate, inspect dependencies and choose the path:

| Screen state | Safe path |
|---|---|
| Connected non-launch | Clone screen with `--edge-mode copy-outgoing`, patch clone, rewire incoming edges, keep original as visible rollback. |
| Launch screen | Patch in place inside the cloned funnel; incoming rewire cannot change launch status. |
| Unconnected screen | Patch in place inside the cloned funnel; the original funnel is the rollback. |

4. Verify counts:

```bash
segmently funnels screens list --project <projectId> --funnel <cloneFunnelId> --version-id <cloneVersionId> --type ListMultiPick
segmently funnels screens list --project <projectId> --funnel <cloneFunnelId> --version-id <cloneVersionId> --type ListSinglePick
segmently funnels audit <cloneFunnelId> <cloneVersionId> --project <projectId>
```

Expected result: active connected paths point at `ListSinglePick` screens.
Remaining `ListMultiPick` screens should be intentional rollback screens with
no incoming edges, or unrelated screens that were not selected for migration.

## Rollback Screen Cleanup

Goal: remove old visible rollback screens after review.

```bash
segmently funnels screens inspect <oldScreenId> \
  --project <projectId> \
  --funnel <cloneFunnelId> \
  --version-id <cloneVersionId> \
  --dependencies

segmently funnels screens delete <oldScreenId> \
  --project <projectId> \
  --funnel <cloneFunnelId> \
  --version-id <cloneVersionId> \
  --dry-run

segmently funnels screens delete <oldScreenId> \
  --project <projectId> \
  --funnel <cloneFunnelId> \
  --version-id <cloneVersionId>
```

If inspect shows `incomingEdges: []` but the screen still has outgoing edges,
delete requires `--force-if-unreachable`. Never delete a launch screen through
this cleanup flow.

## Screen-Level Scenario Catalog

These scenarios can be implemented with the current atomic screen operations:

| Scenario | Operations | Notes |
|---|---|---|
| Convert one connected `ListMultiPick` to `ListSinglePick` | `inspect -> clone --edge-mode copy-outgoing -> patch convertSelection --dry-run -> patch -> rewire --incoming --dry-run -> rewire -> inspect` | Leaves old screen visible as rollback with no incoming edges. |
| Convert launch `ListMultiPick` to `ListSinglePick` on a cloned funnel | `inspect -> patch convertSelection --dry-run -> patch -> inspect` | Launch status is not rewired by incoming edges; source funnel clone is the rollback boundary. |
| Convert isolated/unconnected `ListMultiPick` screens | `list --type ListMultiPick -> inspect -> patch convertSelection --dry-run -> patch` | No active flow is affected because there are no incoming edges. |
| Replace one screen background image | `inspect -> clone/patch path based on graph state -> patch setBackgroundImageUrl --dry-run -> patch` | Use `locales` in the patch file to target specific languages. |
| Replace backgrounds across many screens | `list -> inspect each -> patch setBackgroundImageUrl` | On a cloned funnel, in-place patch is acceptable for unconnected/launch screens; connected screens can use clone-first if visual rollback is required. |
| Create a side-by-side visual alternative | `clone --position x,y` or `clone --offset dx,dy --edge-mode clear` | No graph rewiring unless the user explicitly chooses the alternative. |
| Promote a side-by-side alternative into the active flow | `inspect source and target -> rewire --incoming --dry-run -> rewire` | Only incoming edges change. Outgoing edges must already be correct on the target. |
| Remove inactive rollback screens | `inspect -> delete --dry-run -> delete [--force-if-unreachable]` | Allowed only when the screen is not launch and has no incoming edges. |
| Dependency audit before manual edits | `inspect --dependencies -> get --output screen.json` | Captures edges, variables, bindings, and condition references before editing. |

Scenarios that are not covered by current atomic operations:

| Scenario | Current status |
|---|---|
| Rename an existing screen without other changes | Not a dedicated atomic operation yet. |
| Move an existing screen after clone/patch | Not a dedicated atomic operation yet; only `clone` can set `--position` or `--offset`. |
| Change `screensGraph.launchScreenId` to a different screen | Not supported by current `rewire --incoming`; requires a future explicit set-launch operation. |
| Rewrite complex `enum[]` conditions into `enum` conditions | Not automatic. `inspect` and patch dry-run report warnings for manual review. |

## Clone-And-Mutate Paywall Product Experiment

Goal: preserve a source funnel as control, clone it into treatment, mutate one
Paywall screen's products, publish both placements, and publish an A/B test.

```bash
segmently funnels export <sourceFunnelId> <sourceVersionId> --project <projectId> --output source-flow.json
segmently stripe paywall-product ensure --project <projectId> --file treatment-product.json
segmently ab-tests rollout apply --project <projectId> --file clone-rollout.json --publish --probe
segmently funnels diff --project <projectId> --source-funnel <sourceFunnelId> --source-version <sourceVersionId> --target-funnel <treatmentFunnelId> --target-version <treatmentVersionId> --explain
segmently publish verify --project <projectId> --url <abUrl> --required-variant control,treatment
```

The diff should show only real changes; unchanged screens and unchanged edges
should not be shown by default.

In the rollout manifest, the treatment source uses `clonedFunnelVersion`; the
source/control funnel stays read-only while the treatment clone receives the
Paywall product mutation.

Required subscription: Web onboarding access.

## Launch Readiness Gate

Goal: fail automation before publishing or before handing a URL to QA.

```bash
segmently funnels audit <funnelId> <versionId> --project <projectId> --required-variable goal,name,email --require-paywall
segmently launch preflight --project <projectId> --funnel <funnelId> --version-id <versionId> --web-placement <webPlacementId> --required-variable goal,name,email --require-paywall --require-stripe-sandbox --require-published
segmently analytics probe --project <projectId> --required-platform facebook_pixel,facebook_capi --required-url-param fbclid,utm_source,utm_medium,utm_campaign --require-client-side --require-server-side
segmently domains verify --project <projectId> --allow-pending
```

Use `domains verify` without `--allow-pending` when the custom domain must be
fully active.
