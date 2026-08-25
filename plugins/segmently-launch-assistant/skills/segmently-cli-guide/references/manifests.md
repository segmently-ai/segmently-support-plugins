# Segmently CLI Manifest Shapes

Use these compact examples to explain what should be passed to CLI commands.
Keep secrets out of examples.

## Paywall Product

Command:

```bash
segmently stripe paywall-product ensure --project <projectId> --file paywall-product.json
```

Minimal shape:

```json
{
  "version": "cli.paywall-product.v1",
  "mode": "test",
  "product": {
    "name": "CLI Test Monthly",
    "type": "subscription",
    "checkoutMode": "embedded",
    "unitAmount": 999,
    "currency": "usd",
    "interval": "month",
    "intervalCount": 1
  }
}
```

The product fields are NESTED under `product` (verified against
`CliStripePaywallProductEnsureRequest` and builder-side validation):
`unitAmount` is the integer amount in the smallest currency unit (not
`amount`), `checkoutMode` is `embedded` or `redirect` (it is NOT the product
type), `type` is `one_time` or `subscription`, and subscription cadence uses
flat `interval`/`intervalCount`/`trialDays` (no `recurring` object). Omit
`trialDays` for a no-trial subscription. The command is idempotent by product
name and returns `paywallProduct.id` (`cli_pp_<slug>_<sha8>`) — that id is what
Paywall screens reference as `productId`.

## Funnel Apply

Command:

```bash
segmently funnels apply --project <projectId> --file funnel.json
```

Use Simplified V2 content for screens; the backend maps it to full StepNode
schema.

```json
{
  "version": "cli.funnel-apply.v1",
  "name": "CLI Onboarding",
  "projectThemeId": "<projectThemeId>",
  "variables": [
    { "key": "goal", "type": "string" },
    { "key": "name", "type": "string" },
    { "key": "email", "type": "string" }
  ],
  "screens": [
    {
      "id": "goal",
      "type": "singleSelectionList",
      "title": "Choose your main goal",
      "variableKey": "goal",
      "options": [
        { "id": "fitness", "label": "Fitness" },
        { "id": "sleep", "label": "Sleep" }
      ]
    },
    {
      "id": "email",
      "type": "input",
      "title": "What is your email?",
      "variableKey": "email",
      "inputType": "email"
    }
  ],
  "edges": [
    { "source": "goal", "target": "email" }
  ]
}
```

## Focused Graph Parts

Use focused commands when changing one dimension:

```bash
segmently funnels screens apply --project <projectId> --funnel <funnelId> --version-id <versionId> --file screens.json
segmently funnels variables apply --project <projectId> --funnel <funnelId> --version-id <versionId> --file variables.json --dry-run
segmently funnels edges apply --project <projectId> --funnel <funnelId> --version-id <versionId> --file edges.json
segmently funnels conditions apply --project <projectId> --funnel <funnelId> --version-id <versionId> --file conditions.json
```

`variables apply` upserts FULL definitions, but binding fields are protected
(C9-S3): an update that OMITS `boundScreenIds`/`screenBindings`/`boundSectionId`
carries them over from the current definition — a rewrite built from a list
projection no longer unbinds collect screens. An explicit empty array still
clears; pass `--replace-bindings` to let omission clear them too.

Typical shapes:

```json
{
  "screens": [
    { "id": "name", "type": "input", "title": "Your name", "variableKey": "name" }
  ]
}
```

## Screen-Level Patch Files

Use screen-level patch files for clone-first full StepNode updates. The command
is:

```bash
segmently funnels screens patch <screenId> --project <projectId> --funnel <funnelId> --version-id <versionId> --file patch.json --dry-run
```

Patch file shape:

```json
{
  "operations": [
    {
      "op": "setBackgroundImageUrl",
      "url": "https://cdn.example.com/background.png",
      "locales": ["en-US"]
    },
    {
      "op": "convertSelection",
      "to": "ListSinglePick",
      "variableMode": "new-enum"
    }
  ]
}
```

`setBackgroundImageUrl` updates `content.canvas.background` while preserving
the rest of the screen. If `locales` is omitted, all languages in the funnel
version are updated. `convertSelection` currently supports only
`ListMultiPick -> ListSinglePick`: it sets `screenType`, sets
`content.options.selectionMode` to `one`, removes multi-select min/max keys,
creates a compatible `enum` variable when the source had an `enum[]` variable
binding, and reports complex `enum[]` conditions for manual review instead of
rewriting them automatically.

Use one operation per patch file when the user wants highly auditable atomic
steps. Combining operations is supported, but the response reports all changed
paths together.

```json
{
  "variables": [
    { "key": "name", "type": "string" }
  ]
}
```

```json
{
  "edges": [
    { "source": "name", "target": "email" }
  ]
}
```

```json
{
  "conditions": [
    {
      "edge": { "source": "goal", "target": "paywall" },
      "logic": "all",
      "rules": [
        { "variableKey": "goal", "operator": "equals", "value": "fitness" }
      ]
    }
  ]
}
```

## A/B Rollout

Command:

```bash
segmently ab-tests rollout apply --project <projectId> --file rollout.json --publish --probe
```

Use this for two common source types:

- `funnelManifest`: create a new variant from an inline funnel manifest.
- `clonedFunnelVersion`: clone a source funnel/version and mutate only the
  treatment screen, commonly Paywall products.

Skeleton:

```json
{
  "version": "cli.ab-test-rollout.v1",
  "operationId": "paywall-copy-iter-001",
  "abTest": {
    "id": "cli_paywall_copy_test",
    "alias": "paywall-copy-test",
    "name": "Paywall Copy Test",
    "tags": ["paywall", "copy-test"],
    "iteration": { "id": "iter-001", "label": "May 2026 copy test" }
  },
  "variants": [
    {
      "id": "control",
      "weight": 50,
      "source": {
        "type": "existingFunnelVersion",
        "funnelId": "<sourceFunnelId>",
        "versionId": "<sourceVersionId>"
      },
      "webPlacement": { "alias": "paywall-copy-control" }
    },
    {
      "id": "treatment",
      "weight": 50,
      "source": {
        "type": "clonedFunnelVersion",
        "funnelId": "<sourceFunnelId>",
        "versionId": "<sourceVersionId>",
        "clone": { "name": "Paywall Treatment" },
        "mutation": {
          "screenId": "Paywall",
          "paywall": {
            "products": [{ "paywallProductId": "<testPaywallProductId>" }]
          }
        }
      },
      "webPlacement": { "alias": "paywall-copy-treatment" }
    }
  ],
  "probe": { "samples": 30 }
}
```

## Analytics Settings

Command:

```bash
segmently analytics settings apply --project <projectId> --file analytics.json --merge
```

Use `--merge` for partial settings updates.

```json
{
  "facebook": {
    "enabled": true,
    "pixelId": "<pixelId>",
    "enableClientSide": true,
    "enableServerSide": true
  }
}
```

## Content Plan

Detailed Content Plan profile, pillar, template, design-profile, visual reference
and text-budget manifests live in
`segmently-cli-content-plan-guide`. This general guide intentionally keeps only
the high-level command map so non-Content Plan CLI workflows stay compact.
