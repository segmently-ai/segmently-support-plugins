# Segmently CLI Command Map

Use this file to choose customer-safe command families, scopes, and follow-up
checks for the installed production CLI.

## Authentication

| Goal | Commands | Notes |
|---|---|---|
| Check installed CLI | `segmently --version` | Use `@segmently/cli` `0.1.4` or newer for Product insights/source and strategy generation flows. |
| Sign in interactively | `segmently auth login`, `segmently auth status`, `segmently auth logout` | Opens the browser and stores a CLI session. |
| Create/list/revoke service tokens | `segmently auth token create/list/revoke --project <projectId>` | Requires user login. Standard user-created tokens are short-lived by default and cannot exceed the public maximum lifetime. |
| Discover supported commands | `segmently capabilities` | Use when an account or installed CLI may not support a command yet. |

For automation, use a service token with the smallest required scopes. Store it
outside the repository, for example in your CI system's encrypted secret store.
Never paste token values into chat, docs, or issue trackers.

## Subscription Access

CLI project operations require two independent permissions:

- CLI auth/scope: a signed-in user or service token with the command scope.
- Product subscription: the project must have the product entitlement required
  by the command family.

Service-token scopes do not grant subscription access. If a command returns a
payment/subscription error, confirm that the project has the required product
subscription before changing token scopes.

Structured `402 payment_required` responses with `reason: missing_capability`
identify the missing project feature in `requiredCapability` (for example
`product_analysis.access` or `web_onboarding.access`). Treat this as a project
access blocker, not an authentication or token-scope problem.

| CLI surface | Required product access |
|---|---|
| Funnels, themes, Stripe sandbox paywalls, launch preflight, analytics launch settings, domains, publish, web placements, and A/B tests | Web onboarding access |
| CLI image upload | CLI asset upload access |
| Product Page tasks, variables, mode, and generated insights | Product analysis access |
| Product Page audiences | Audiences access |
| Content Plan strategy/profile/pillar/post-template/design-profile commands | Content Plan access |

## Core Read And Audit

| Goal | Commands | Scopes |
|---|---|---|
| Find projects | `segmently projects list`, `segmently projects get <projectId>` | `projects:read` |
| Update Product Workspace project metadata | `segmently projects update <projectId> --file project-patch.json` | `projects:write`; requires Product analysis access |
| Discover screen contracts | `segmently screen-types list/search/get` | `funnels:read` |
| Inspect funnels | `segmently funnels list/get/versions/export` | `funnels:read` |
| Compare funnels | `segmently funnels diff --source-funnel ... --target-funnel ... --explain` | `funnels:read` |
| Audit one funnel | `segmently funnels audit <funnelId> <versionId> --required-variable goal,name,email --require-paywall` | `funnels:read` |
| List version screens | `segmently funnels screens list --project <projectId> --funnel <funnelId> --version-id <versionId> [--type ListMultiPick]` | `funnels:read` |
| Read one full screen | `segmently funnels screens get <screenId> --project <projectId> --funnel <funnelId> --version-id <versionId> [--output screen.json]` | `funnels:read` |
| Inspect screen dependencies | `segmently funnels screens inspect <screenId> --project <projectId> --funnel <funnelId> --version-id <versionId> --dependencies` | `funnels:read` |
| Launch checklist | `segmently launch preflight --funnel <funnelId> --version-id <versionId> --web-placement <webPlacementId>` | `funnels:read,themes:read,stripe:read,publish:read` plus analytics/domain scopes when requested |

### Project Lookup Pattern

When the user names a project, first run `segmently projects list` and match
against `id`, `name`, and `projectName`. `projectName` is the UI card title, so
it may differ from the canonical `name`. If the user gives a project ID, confirm
with `segmently projects get <projectId>` before running scoped commands. When
names are ambiguous, use secondary clues from list/get output such as
description, created/updated dates, platform, or role, then ask for confirmation.

### Funnel Version And Export Pattern

Use `funnels get` to read the funnel summary and `latestVersionId`, then use
that version id for screens, audit, or export:

```bash
segmently funnels get <funnelId> <projectId>
segmently funnels versions <funnelId> <projectId>
segmently funnels export <funnelId> <versionId> <projectId> --output flow.json
```

`funnels export` takes `versionId` as a positional argument. Do not use
`--version-id` with `funnels export`. Without `--output`, export writes the full
envelope (`funnel`, `version`, and `flowDocument`) to stdout; with `--output`,
it writes only the canonical `FlowDocument` JSON to the file and prints a short
summary.

If `funnels versions` is empty on an older backend but `funnels get` returns a
`latestVersionId`, use that `latestVersionId` directly for read-only commands
and report the version-list issue. Versions without `updatedAt` may be readable
by id even when an older list endpoint omits them.

## Write And Publish

| Goal | Commands | Scopes |
|---|---|---|
| Ensure project theme | `segmently themes list/global/import/set-active` | `themes:read`, `themes:write` for import/set-active |
| Create a V2 funnel shell | `segmently funnels create --name ... --project <projectId>` | `funnels:write`, usually `themes:read` |
| Clone a V2 funnel version | `segmently funnels clone <sourceFunnelId> --version-id <sourceVersionId> --name ... --project <projectId> [--version-name ...] [--folder <folderId> \| --root]` | `funnels:write`; source must be a same-project V2 version |
| Apply a full funnel manifest | `segmently funnels apply --file funnel.json --project <projectId>` | `funnels:write`, `publish:write` when manifest creates/publishes placement |
| Patch graph parts | `segmently funnels graph dry-run/apply`, `screens apply`, `variables apply`, `edges apply`, `conditions apply` | `funnels:write`; use dry-run first where available |
| Clone one screen | `segmently funnels screens clone <screenId> --project <projectId> --funnel <funnelId> --version-id <versionId> [--position x,y \| --offset dx,dy] [--edge-mode clear\|copy-outgoing] [--dry-run]` | `funnels:write`; clone-first replacement workflow |
| Patch one full screen | `segmently funnels screens patch <screenId> --project <projectId> --funnel <funnelId> --version-id <versionId> --file patch.json [--dry-run]` | `funnels:write`; full StepNode replace with allow-listed operations |
| Rewire incoming edges | `segmently funnels screens rewire --project <projectId> --funnel <funnelId> --version-id <versionId> --from <sourceId> --to <targetId> --incoming [--dry-run]` | `funnels:write`; never deletes the source screen |
| Delete one screen | `segmently funnels screens delete <screenId> --project <projectId> --funnel <funnelId> --version-id <versionId> [--dry-run] [--force-if-unreachable]` | `funnels:write`; refuses launch or connected screens without safety guards |
| Read Stripe account status | `segmently stripe account --mode test <projectId>` and `segmently stripe account --mode live <projectId>` | `stripe:read`; test/sandbox and live are separate OAuth connections |
| Read Stripe sandbox products/prices | `segmently stripe products/prices --mode test --project <projectId>` | `stripe:read` |
| Ensure sandbox paywall product | `segmently stripe paywall-product ensure --file paywall-product.json --project <projectId>` | `stripe:write`; manifest must use sandbox/test intent |
| Apply web placement | `segmently web-placements apply --file placement.json --project <projectId>` | `publish:write` |
| Publish web placement | `segmently web-placements publish <webPlacementId> --project <projectId>` | `publish:write` |
| Verify published runtime | `segmently publish verify --url <path-or-url> --required-variant control,treatment` | `publish:read`; `publish:write` satisfies it |
| Apply A/B test | `segmently ab-tests apply --file ab-test.json --project <projectId>` | `publish:write` |
| One-shot A/B rollout | `segmently ab-tests rollout apply --file rollout.json --publish --probe --project <projectId>` | `funnels:write,publish:write`, plus `themes:read/stripe:write` depending on sources |

### Screen-Level Atomic Operations

Use these operations as composable building blocks. They are safer than applying
a full funnel manifest when the task is scoped to existing V2 StepNode screens.

| Operation | Command | What it changes | Safety notes |
|---|---|---|---|
| Inventory | `funnels screens list --funnel <funnelId> --version-id <versionId> [--type <screenType>]` | Nothing | Use before batch migrations to count candidates. |
| Snapshot | `funnels screens get <screenId> --funnel <funnelId> --version-id <versionId> [--output screen.json]` | Nothing | Keep the JSON when manual review or diff tooling is needed. |
| Dependency inspect | `funnels screens inspect <screenId> --funnel <funnelId> --version-id <versionId> --dependencies` | Nothing | Reports incoming/outgoing edges, launch status, bound variables, screen bindings, and condition references. |
| Clone screen | `funnels screens clone <screenId> --funnel <funnelId> --version-id <versionId> [--position x,y \| --offset dx,dy] [--edge-mode clear\|copy-outgoing] [--dry-run]` | Adds one `screensV2` document, optionally copies outgoing edges and variable bindings | Default `clear` matches canvas safety. Use `copy-outgoing` for replacement flows. |
| Patch screen | `funnels screens patch <screenId> --funnel <funnelId> --version-id <versionId> --file patch.json [--dry-run]` | Replaces the full target StepNode document after applying allow-listed operations; may update variables for `convertSelection` | Full replace prevents stale nested keys. Always run dry-run first for variable/condition warnings. |
| Rewire incoming | `funnels screens rewire --from <sourceId> --to <targetId> --funnel <funnelId> --version-id <versionId> --incoming [--dry-run]` | Updates edges on other screens whose `nextScreenId` points to `sourceId` | Does not edit outgoing edges on source and does not delete source. Old screen remains visible as rollback. |
| Delete inactive screen | `funnels screens delete <screenId> --funnel <funnelId> --version-id <versionId> [--dry-run] [--force-if-unreachable]` | Deletes one `screensV2` document | Refuses launch screens and screens with incoming edges. Use `--force-if-unreachable` only after inspect confirms no incoming edges. |

## Operational Surfaces

| Goal | Commands | Scopes |
|---|---|---|
| Analytics settings | `segmently analytics settings get/apply --file analytics.json --merge` | `analytics:read`, `analytics:write`; write satisfies read |
| Analytics readiness | `segmently analytics probe --required-platform facebook_pixel,facebook_capi --required-url-param fbclid,...` | `analytics:read` |
| Custom domain | `segmently domains status`, `segmently domains verify --allow-pending` | `domains:read` |
| CDN image upload | `segmently assets upload-image ./hero.png --project <projectId>` | `assets:write`; requires CLI asset upload access |
| CDN image upload as V2 asset reference | `segmently assets upload-image ./hero.png --project <projectId> --folder content-plan/references --asset` | `assets:write`; returns `{ original, small }` only |

### Canonical Published URL

`publish web`, `web-placements publish`, and `web-placements list` can return a
path (`webUrl` / `publishedUrl`) rather than a fully qualified URL. Build the
customer-facing URL from authoritative reads:

```bash
segmently domains status --project <projectId>
segmently web-placements list --project <projectId>
segmently publish verify --project <projectId> --url <publishedUrl> --public-base-url https://<canonical-domain>
```

Use the active custom domain from `domains status` when `hasDomain=true` and
`status=active`; otherwise use `appUrl` from `segmently env current`. Never infer the canonical host by probing `api.segmently.ai` or `app.segmently.ai`.

## Product Page

Product Page commands are available for approved workflows. Detailed Product
entity mutation payloads are intentionally omitted from this public guide.

| Goal | Commands | Scopes |
|---|---|---|
| Product mode | `segmently product mode get/set` | `product:read`, `product:write` |
| Product tasks | `segmently product tasks list/get/create/update/delete` | `product:read`, `product:write` |
| Product variables | `segmently product variables list/get/apply/upsert/delete` | `product:read`, `product:write` |
| Product audiences | Product audience read/write commands | `product:read`, `product:write` |
| Product insights | Generated Product insights commands for approved workflows | `product:read`, `product:write` |

## Content Plan

| Goal | Commands | Scopes |
|---|---|---|
| Strategy inventory | `segmently content-plan strategies list --include-counts --author <authorId>` | `content-plan:read` |
| Strategy export | `segmently content-plan strategies export <strategyId> --include-posts --output strategy.json` | `content-plan:read` |
| Strategy readiness | `segmently content-plan strategies audit <strategyId> --required-platform linkedin,x --require-generated-posts` | `content-plan:read` |
| Creator profile export | `segmently content-plan profile export --author <authorId> --platform linkedin,x --output profile.json` | `content-plan:read` |
| Creator profile apply | `segmently content-plan profile apply --file profile.json --dry-run` | `content-plan:write`; write satisfies read |
| Pillar apply | `segmently content-plan pillars apply --author <authorId> --file pillars.json --dry-run` | `content-plan:write` |
| Platform template apply | `segmently content-plan post-templates apply linkedin --author <authorId> --file linkedin-templates.json --dry-run` | `content-plan:write` |
| Design profile list | `segmently content-plan designs list linkedin --author <authorId> --include-profiles` | `content-plan:read` |
| Design profile export | `segmently content-plan designs export linkedin --author <authorId> --profile-key carousel_square --output design.json` | `content-plan:read`; add `--flat` for editor-compatible `_schema: segmently-design-system/v1` JSON |
| Design profile apply | `segmently content-plan designs apply linkedin --author <authorId> --profile-key carousel_square --file design.json --dry-run` | `content-plan:write`; accepts flat JSON, skill composite JSON, or CLI transfer manifest |

Content Plan apply commands write explicit manifests for pillars, author platform
post templates, and author platform design profiles. They do not invoke AI
generation tasks.

For detailed Content Plan workflows, manifests, design-reference variants, and
text-budget rules, use `segmently-cli-content-plan-guide`. This general guide
keeps only the command map.
