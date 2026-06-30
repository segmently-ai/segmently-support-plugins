---
name: segmently-cli-guide
description: Use this skill when a user wants safe Segmently CLI help for project or theme setup, cloning or auditing funnels, importing/exporting funnel localizations, migrating V2 onboarding screens including ListMultiPick to ListSinglePick, screen background changes, rollback cleanup, publishing or verifying funnels and web placements, setting up sandbox Stripe paywalls or A/B tests, checking launch, analytics, or domain readiness, or managing CLI auth, service tokens, and asset uploads. Also trigger when Segmently Launch Assistant returns executeWith.skill/owningSkill=segmently-cli-guide, execution.kind=delegate-cli, or commandFamily such as funnels screens patch/export/publish/analytics/domains; this skill owns command shape, auth handling, sequencing, and readback verification.
---

# Segmently CLI Guide

Use this skill when a customer or customer-facing agent asks what Segmently CLI
commands to run, what JSON structures to pass, how commands fit together, or how
to safely automate a production workflow through the installed CLI.

This skill is intentionally shareable and limited to customer-facing production
account guidance.

## Core Workflow

1. Classify the goal:
   - read/audit/export
   - create/apply/update
   - publish/probe
   - authentication or service-token setup
   - reusable customer automation
2. Choose the smallest stable CLI surface. Prefer `/api/cli/v1` backed commands;
   do not recommend direct Firestore writes or internal product endpoints.
3. State required authentication:
   - browser login for interactive use.
   - service-token scopes for automation.
   - active project subscription/entitlement for product operations.
   - user auth for creating, listing, or revoking service tokens.
4. For write commands, include a dry-run/preflight step whenever supported.
5. Show the command chain first, then the minimal JSON manifest shapes.
6. Explain what each command returns and which follow-up command verifies the
   result.
7. After publishing, return the canonical public URL by combining the active
   project domain with the published placement path. Do not guess the host.

## Installed CLI And Production Auth

- Use the globally installed `segmently` binary for customer workflows. Check it
  with `segmently --version`; Product insights/source and generation details in
  these guides assume `@segmently/cli` `0.1.4` or newer.
- Production is the public default. Use `segmently --env prod auth status` to
  confirm the stored session, and `segmently --env prod auth login` when the
  CLI is not authenticated.
- If a project command returns structured `402 payment_required` with
  `reason: missing_capability`, read `requiredCapability`. This is project
  feature access, not a missing CLI scope. Do not broaden service-token scopes
  as the first fix; use a project with the required access or have the project
  owner enable it.
- Use `segmently capabilities` after login when debugging a newly published CLI
  version against a target environment.

For V2 funnel screen migrations, prefer clone-first screen-level operations over
rebuilding screens from templates. Start by cloning the full funnel/version when
the user wants production safety. Then choose the screen-level path by graph
state:

- Connected non-launch screen: inspect the source, clone it with
  `copy-outgoing`, patch the clone, dry-run and review warnings, rewire only
  incoming edges to the clone, and leave the original screen visible on the
  canvas as rollback until a separate delete cleanup is requested.
- Launch screen: incoming rewire cannot change launch status. On a cloned
  funnel, patch the launch screen in place unless a future explicit set-launch
  command exists.
- Unconnected screen: on a cloned funnel, patch in place when rollback is the
  original funnel; clone first only when the user needs a side-by-side visual
  comparison.

Never imply that rewire removes the old screen from the canvas. It only changes
incoming edge targets. Use inspect plus delete as a separate cleanup operation.

## Load References As Needed

- Command/scopes lookup: read `references/commands.md`.
- JSON manifest structures: read `references/manifests.md`.
- Multi-command recipes: read `references/workflows.md`.
- Product Page commands are available for approved workflows; keep public
  guidance brief and avoid detailed Product mutation payloads.
- For detailed HTML Article work (`content-plan articles create/get/apply/clone/add-image/publish`,
  FlexibleLayout article sections, responsive article presentation settings, and
  full article `FlowDocument` manifests), route to the packaged
  `segmently-cli-articles` skill and the public Segmently CLI article commands.
- For detailed Content Plan workflows, use `segmently-cli-content-plan-guide`
  instead of expanding this general guide.

Do not load every reference by default. For example, a Content Plan profile
question should route to `segmently-cli-content-plan-guide`; a launch or A/B
question usually needs this guide's `workflows.md`.

## Response Shape

When answering a CLI planning question, use this structure:

```text
Goal:
Recommended flow:
Required auth/scopes:
Required subscription:
Commands:
Data structures:
Verification:
Notes / risks:
```

Keep command examples copyable. Use placeholder IDs like `<projectId>` and
`<funnelId>` unless the user supplied real IDs. Never invent secrets or print
token values.

## Published Funnel URL Workflow

After `publish web`, `web-placements publish`, or `web-placements list`, do not
guess the final public URL from curl probes or from `app.segmently.ai`. The CLI
may return only a path such as `webUrl` or `publishedUrl`:
`/apple-pay-test-onboarding`.

Build the canonical URL deterministically:

1. Read the domain:

   ```bash
   segmently domains status --project <projectId>
   ```

   If it returns `hasDomain: true`, `status: "active"`, and a `domain`, that
   custom domain is the canonical host. Otherwise read the default public app
   host from:

   ```bash
   segmently env current
   ```

   and use its `appUrl`.

2. Read the path from `publishedUrl` / `webUrl`:

   ```bash
   segmently web-placements list --project <projectId>
   ```

   or from the publish command output.

3. Compose:

   ```text
   https://<canonical-domain><publishedUrl>
   ```

4. Verify with the same canonical base:

   ```bash
   segmently publish verify --project <projectId> --url <publishedUrl> --public-base-url https://<canonical-domain>
   ```

   Do not rely on `publish verify --url <path>` without `--public-base-url`; a
   path-only verify can default to an API host and produce a misleading failure.

5. For visual proof or customer walkthrough, hand the canonical URL to
   `playwright-bowser` and open it in a visible browser:

   ```bash
   playwright-cli -s=published-funnel open https://<canonical-domain><publishedUrl> --headed --persistent
   ```

   Then capture a screenshot or run a non-mutating smoke path. For paid funnels,
   only run a checkout/test card flow after the customer explicitly approves the
   test purchase.

## Safety Rules

- JSON output is the automation contract; table output is only for humans.
- Do not expose or invent secrets. Service-token values are shown only once by
  the CLI and must be stored in the customer's secret manager.
- Service-token scopes do not grant product access by themselves. Project-scoped
  commands also require the right subscription/entitlement on the project.
- Stripe creation through the CLI should use sandbox/test-mode products unless a
  separate production billing review is explicitly in scope.
- Stripe account status is mode-specific. `segmently stripe account` defaults
  to live mode, so it is not enough for project readiness. For any customer
  request about Stripe connection, subscriptions, paywalls, products, or test
  payments, read both:
  ```bash
  segmently stripe account --mode test <projectId>
  segmently stripe account --mode live <projectId>
  ```
  If sandbox/test is connected and live is disconnected, report exactly that:
  sandbox/test payments can be prepared and verified, while real live charges
  still need live Stripe Connect. Do not summarize it as "Stripe is not
  connected" unless both mode reads are disconnected or the user asked only
  about the disconnected mode.
- For Content Plan writes, prefer `--dry-run` first and only apply explicit
  pillar/template manifests. Do not suggest AI/task generation commands unless a
  task-aware manifest exists.
- For funnel screens, prefer Simplified V2 content in manifests; the backend adapter owns conversion to full StepNode schema.
- For screen-level migrations, use `funnels screens list|get|inspect|clone|patch|rewire|delete`.
  Do not use `funnels screens apply` to replace an existing full StepNode unless
  the task is intentionally creating or rebuilding a screen from a supported
  manifest/template shape.
- `funnels screens rewire --incoming` leaves the old screen document in place.
  Verify the old screen has `incomingEdges: []` before describing it as inactive,
  and run `funnels screens delete` only as an explicit follow-up cleanup.
- For A/B tests, preserve long-lived baseline/control metadata with tags,
  baseline variant IDs, iteration IDs, and publication history filters.

## Verification

After editing this skill, run:

```bash
node <skill-root>/scripts/run-evals.mjs
```
