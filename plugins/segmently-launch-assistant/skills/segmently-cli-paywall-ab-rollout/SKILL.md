---
name: segmently-cli-paywall-ab-rollout
description: Segmently CLI scenario wrapper for creating and verifying sandbox Stripe paywall A/B onboarding rollouts. Use when a task needs to create or demonstrate two paywall onboarding variants, publish them, publish an A/B test, probe runtime routing, and return public URLs through the Segmently CLI. Also trigger when Segmently Launch Assistant returns executeWith.skill/owningSkill=segmently-cli-paywall-ab-rollout, especially for sandbox paywall products, paid onboarding offers, and A/B rollout DO flows.
---

# Segmently CLI Paywall A/B Rollout

Use this skill for the reusable sandbox paywall A/B scenario. It is an
automation wrapper around the CLI facade, not a new product API. It supports
two rollout modes:

- `funnelManifest`: create two new onboarding variants from inline manifests.
- `clonedFunnelVersion`: keep an existing source funnel as control, clone the
  source version into a treatment funnel, mutate one Paywall screen's product
  list, publish both placements, and publish the A/B test.

## Preconditions

- Run from the installed skill directory or pass the script path explicitly.
- Confirm the public Segmently CLI is installed and authenticated:
  ```bash
  segmently auth status
  ```
- If the CLI reports `auth_required`, run `segmently auth login --env <env>` for
  the intended environment and retry after `segmently auth status --env <env>`
  succeeds.
- Use a cloned/test funnel and Stripe sandbox/test account unless the user has
  explicitly approved the target production experiment.
- Minimum target context for clone-based rollout is: project id, source funnel
  id, source version/draft id, paywall screen id or confirmation to use the
  default `Paywall` screen, treatment product ids or approval to create sandbox
  products, and explicit approval before publishing A/B traffic.
- The authenticated CLI identity must include:
  `projects:read,funnels:read,funnels:write,themes:read,themes:write,publish:write,stripe:read,stripe:write`.
- The project must have a connected Stripe sandbox/test account.
- Prefer an active project theme. If the project has no active theme, run
  `segmently themes list/global/import/set-active` first.

## Canonical Command

```bash
node scripts/run-paywall-ab-rollout.mjs \
  --project <projectId>
```

Useful options:

```bash
--suffix <stable-id>              # deterministic aliases for reruns
--paywall-product-id <id>         # reuse an existing Segmently paywall product
--source-funnel-id <id>           # enable clonedFunnelVersion mode
--source-version-id <id>          # source version to clone
--source-web-placement-alias <a>  # optional source onboarding URL in summary
--paywall-screen-id <id>          # screen key/id to mutate, default Paywall
--clone-name <name>               # treatment funnel name
--clone-version-name <name>       # treatment version name
--treatment-paywall-product-ids <ids>
                                  # comma-separated treatment product ids
--probe-samples <count>           # default 30
--public-base-url <url>           # default comes from CLI env
--output <path>                   # write the final summary JSON
```

## What The Script Does

Default `funnelManifest` mode:

1. Ensures a Stripe test-mode paywall product unless `--paywall-product-id` is supplied.
2. Builds two inline `funnelManifest` variants:
   - control: goal -> name -> email -> paywall -> paid success
   - treatment: same variable and paywall contract with different copy
3. Runs:
   ```bash
   segmently ab-tests rollout apply --publish --probe
   ```
4. Returns the control URL, treatment URL, A/B URL, paywall product id, publication id,
   and probe results as JSON.

`clonedFunnelVersion` mode:

1. Requires `--source-funnel-id` and `--source-version-id`.
2. Ensures one Stripe test-mode treatment paywall product unless
   `--paywall-product-id` or `--treatment-paywall-product-ids` is supplied.
3. Builds a rollout manifest with:
   - control: `existingFunnelVersion` from the source funnel/version.
   - treatment: `clonedFunnelVersion` from the same source funnel/version.
4. Mutates `--paywall-screen-id` in the treatment clone through the backend
   `SimplifiedV2ScreenAdapter`, preserving the source funnel unchanged.
5. Publishes the generated control placement, treatment placement, and A/B
   placement, then probes the public A/B URL.
6. Returns source editor URL, optional source public URL, control/treatment
   onboarding URLs, treatment clone editor URL, A/B URL, publication id, and
   probe results as JSON.

Example clone run:

```bash
node scripts/run-paywall-ab-rollout.mjs \
  --project <projectId> \
  --source-funnel-id <funnelId> \
  --source-version-id <versionId> \
  --source-web-placement-alias <existing-source-alias> \
  --paywall-screen-id Paywall \
  --clone-name "Paywall Product Treatment"
```

## Safety Rules

- The wrapper is sandbox-only for Stripe product creation. It always sends
  `mode: "test"` to `stripe paywall-product ensure`.
- The wrapper must not print API keys, tokens, refresh tokens, or credentials.
- Use `--paywall-product-id` when you need to avoid creating another Stripe product.
- In clone mode, the source funnel/version is used read-only; the Paywall
  mutation is applied only to the treatment clone.
- Do not use this wrapper for production traffic experiments without a separate
  product rollout review.
- If runtime probe fails, inspect the JSON output first. The created artifacts are
  intentionally left in place for debugging and reruns.

## Verification

Minimum local smoke:

```bash
node --check scripts/run-paywall-ab-rollout.mjs
node scripts/run-paywall-ab-rollout.mjs --help
```

Full verification against a customer-approved test project:

```bash
node scripts/run-paywall-ab-rollout.mjs \
  --project <projectId> \
  --source-funnel-id <funnelId> \
  --source-version-id <versionId> \
  --probe-samples 30 \
  --output checks/paywall-ab-rollout-summary.json
```

## Related CLI Surfaces

- `segmently stripe paywall-product ensure`
- `segmently themes list/global/import/set-active`
- `segmently ab-tests rollout apply --publish --probe`
- `source.type = "existingFunnelVersion"`
- `source.type = "clonedFunnelVersion"`
- `/api/cli/v1/projects/:projectId/stripe/paywall-products/ensure`
- `/api/cli/v1/projects/:projectId/ab-tests/rollout/apply`
