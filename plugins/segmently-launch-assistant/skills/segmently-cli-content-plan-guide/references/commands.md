# Content Plan CLI Commands

Use this file for command and scope lookup.

## Authentication And Access

| Goal | Command | Requirement |
|---|---|---|
| Interactive login | `segmently auth login` | Browser login. Production is the public default. |
| Service-token automation | `segmently auth token create --project <projectId> --scopes content-plan:read,content-plan:write` | User auth is required to create tokens. Store the token secret immediately. |
| Project lookup | `segmently projects list`, `segmently projects get <projectId>` | `projects:read`; use before scoped operations when the project is named by UI title. |

Content Plan commands require Content Plan subscription access in addition to
CLI scopes. `content-plan:write` satisfies read.

## CLI 1.0.0 Flow Entry

Use `doctor` before assembling a full flow by hand. It reads the same readiness
predicates as the Content Plan wizard and reports the exact next command for the
first missing required step.

| Goal | Command | Scope / result |
|---|---|---|
| Check installed CLI | `segmently --version` | Content Plan workflows in this guide require `1.0.0` or newer. |
| Check environment command families | `segmently capabilities` | Read-only; use when the backend may lag the installed CLI. |
| Diagnose the default author flow | `segmently content-plan doctor --project <projectId>` | `content-plan:read`; exits `0` only when every required step is ready. |
| Diagnose one author flow | `segmently content-plan doctor --project <projectId> --author <authorId>` | Read `steps[].nextCommand`; a not-ready exit `1` is a readiness result, not an execution failure. |

Canonical 1.0.0 verbs: `apply` = manifest upsert, `accept` = promote a generated
draft, `set-current` = activate, `delete` = delete a document, and `remove` =
remove list membership. Generated-draft filters use `--generation`, never the
removed `--task` option.

## Full Project Bootstrap

Use these when an empty or partially configured project must be prepared for a
manual demo or reviewer flow from a local manifest. The bootstrap command is an
orchestrator over atomic CLI APIs; use the atomic commands below when only one
resource needs to change.

| Goal | Command | Scope |
|---|---|---|
| Validate manifest locally | `segmently content-plan bootstrap validate --project <projectId> --file content-plan-bootstrap.json --out bootstrap.validate.json` | Local validation only |
| Print ordered operations and UI URLs | `segmently content-plan bootstrap plan --project <projectId> --file content-plan-bootstrap.json --out bootstrap.plan.json` | Local planning only |
| Dry-run complete setup | `segmently content-plan bootstrap apply --project <projectId> --file content-plan-bootstrap.json --dry-run --out bootstrap.apply.dry.json` | `content-plan:write` |
| Apply complete setup | `segmently content-plan bootstrap apply --project <projectId> --file content-plan-bootstrap.json --out bootstrap.apply.json` | `content-plan:write` |
| Resume after interruption | Re-run `segmently content-plan bootstrap apply --project <projectId> --file content-plan-bootstrap.json --out bootstrap.apply.json` | Reuses `<manifest>.bootstrap-state.json` and skips completed operation keys. |
| Relocate checkpoint | `segmently content-plan bootstrap apply --project <projectId> --file content-plan-bootstrap.json --state-file ./state/bootstrap.json --out bootstrap.apply.json` | Useful for checked/temporary operator workspaces. |
| Restart every operation | `segmently content-plan bootstrap apply --project <projectId> --file content-plan-bootstrap.json --restart --out bootstrap.apply.json` | Mutating; use only when replaying completed operations is intentional. |
| Verify created resources and calendar readiness | `segmently content-plan bootstrap verify --project <projectId> --file content-plan-bootstrap.json --run bootstrap.apply.json --require-calendar --require-posts --out bootstrap.verify.json` | `content-plan:read` |

`bootstrap apply` validates the manifest and the referenced `system_platforms`
catalog before any mutating request. `--skip-validation` bypasses only the
manifest validator; it never bypasses the platform preflight.

## Authors

Use these first when the author ID is unknown.

| Goal | Command | Scope |
|---|---|---|
| List self authors | `segmently content-plan authors list --project <projectId>` | `content-plan:read` |
| List without nested platform summaries | `segmently content-plan authors list --project <projectId> --no-include-platforms` | `content-plan:read` |
| Resolve default author | `segmently content-plan authors default --project <projectId>` | `content-plan:read` |
| Get author by id | `segmently content-plan authors get <authorId> --project <projectId> --include-platforms` | `content-plan:read` |
| Create or update manual author | `segmently content-plan authors apply --project <projectId> --file author.json --dry-run` | `content-plan:write` |
| Mark default author | `segmently content-plan authors set-current <authorId> --project <projectId> --dry-run` | `content-plan:write` |
| Launch AI author onboarding | `segmently content-plan authors onboard --project <projectId> --file author-onboard.json --mode manual --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Inspect external/tracked authors | `segmently content-plan authors list --project <projectId> --base-path external_authors` | `content-plan:read` |

## Author Platforms And Voice

Use platform commands to seed the Content Plan tabs and publishing platforms
before creating strategies or calendar posts.

| Goal | Command | Scope |
|---|---|---|
| List enabled platforms | `segmently content-plan platforms list --project <projectId> --author <authorId>` | `content-plan:read` |
| Get one platform | `segmently content-plan platforms get <platformId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Create or update one platform | `segmently content-plan platforms apply --project <projectId> --author <authorId> --file platform.json --dry-run` | `content-plan:write` |
| Get platform voice | `segmently content-plan platforms voice get --project <projectId> --author <authorId> --platform <platformId>` | `content-plan:read` |
| Apply platform voice | `segmently content-plan platforms voice apply --project <projectId> --author <authorId> --platform <platformId> --file platform-voice.json --dry-run` | `content-plan:write` |

## AI Models

Content Plan CLI model preferences are resolved from project-scoped user keys
only. The current CLI surface exposes Google models for post generation and
image generation; it does not use fallback keys outside the configured project
user scope.

| Goal | Command | Scope |
|---|---|---|
| List available Google models | `segmently content-plan models available --project <projectId>` | `content-plan:read` |
| Get saved model preferences | `segmently content-plan models get --project <projectId>` | `content-plan:read` |
| Set text/image model preferences | `segmently content-plan models set --project <projectId> --platform-post gemini-3-flash-preview --asset-planner gemini-3.1-pro-preview --image-gen gemini-3.1-flash-image-preview` | `content-plan:write` |
| Clear saved model preferences | `segmently content-plan models set --project <projectId> --clear` | `content-plan:write` |

## Articles / Flexible Layout Drafts

| Goal | Command | Scope |
|---|---|---|
| List article drafts | `segmently content-plan articles list --project <projectId> --status draft --limit 20` | `content-plan:read` |
| Get article flow document | `segmently content-plan articles get <articleId> --project <projectId> --output article.json` | `content-plan:read` |
| Preview default draft creation | `segmently content-plan articles create --project <projectId> --title "Article title" --alias article-alias --locale en --dry-run` | `content-plan:write`; no draft is created. |
| Preview/apply article JSON | `segmently content-plan articles apply --file article.json --project <projectId> --article-id <articleId> --dry-run` | `content-plan:write`; repeat without `--dry-run` after review. |
| Preview clone | `segmently content-plan articles clone <articleId> --project <projectId> --title "Clone title" --alias clone-alias --dry-run` | `content-plan:write` |
| Preview media section | `segmently content-plan articles add-image <articleId> --project <projectId> --file ./image.png --label "Hero" --height 420 --dry-run` | `content-plan:write`; no upload/write in dry-run. |
| Preview publish | `segmently content-plan articles publish <articleId> --project <projectId> --dry-run` | `content-plan:write`; repeat without `--dry-run` only after readback. |

## Strategies

| Goal | Command | Scope |
|---|---|---|
| Inventory | `segmently content-plan strategies list --project <projectId> --author <authorId> --include-counts` | `content-plan:read` |
| Get compact bundle | `segmently content-plan strategies get <strategyId> --project <projectId> --include-posts` | `content-plan:read` |
| Export | `segmently content-plan strategies get <strategyId> --project <projectId> --include-posts --output strategy.json` | `content-plan:read` |
| Apply deterministic strategy | `segmently content-plan strategies apply --project <projectId> --file strategy.json --dry-run` | `content-plan:write` |
| Run AI strategy preflight | `segmently content-plan strategies preflight --project <projectId> --author <authorId> --user-id <uid> --file strategy-planning.json` | `content-plan:write` |
| Launch AI strategy creation | `segmently content-plan strategies create --project <projectId> --author <authorId> --user-id <uid> --file strategy-planning.json --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Preview editable AI strategy draft | `segmently content-plan strategies draft create --project <projectId> --author <authorId> --user-id <uid> --file strategy-planning.json --dry-run` | `content-plan:write`; repeat with `--wait` only after review. |
| Preview draft patch | `segmently content-plan strategies draft patch <strategyId> --project <projectId> --author <authorId> --file draft-patch.json --dry-run` | `content-plan:write` |
| Preview draft approval | `segmently content-plan strategies draft approve <strategyId> --project <projectId> --author <authorId> --user-id <uid> --model gemini-3-flash-preview --force-restart --dry-run` | `content-plan:write`; repeat with `--wait` only after review. |
| Preview draft regeneration | `segmently content-plan strategies draft regenerate <strategyId> --project <projectId> --author <authorId> --user-id <uid> --preserve-user-edits --dry-run` | `content-plan:write`; repeat with `--wait` only after review. |
| Generate sprint topics | `segmently content-plan strategies sprints generate-topics <strategyId> <sprintId> --project <projectId> --author <authorId> --theme theme-a,theme-b --count 2 --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Readiness audit | `segmently content-plan strategies audit <strategyId> --project <projectId> --required-platform linkedin,x --require-generated-posts` | `content-plan:read` |

## Cadence And Calendar Publications

Use these when a strategy exists and the operator needs deterministic Calendar
slots or cadence edits.

| Goal | Command | Scope |
|---|---|---|
| Get strategy cadence | `segmently content-plan cadence get <strategyId> --project <projectId>` | `content-plan:read` |
| Apply cadence | `segmently content-plan cadence apply <strategyId> --project <projectId> --file cadence.json --dry-run` | `content-plan:write` |
| List publications | `segmently content-plan publications list --project <projectId> --strategy <strategyId> --platform <platformId> --sprint <sprintId> --has-post true` | `content-plan:read` |
| Get one publication | `segmently content-plan publications get <publicationId> --project <projectId> --strategy <strategyId>` | `content-plan:read` |
| Create/update publication | `segmently content-plan publications apply --project <projectId> --strategy <strategyId> --file publication.json --dry-run` | `content-plan:write` |
| Patch publication | `segmently content-plan publications patch <publicationId> --project <projectId> --strategy <strategyId> --file publication-patch.json --dry-run` | `content-plan:write` |
| Delete publication | `segmently content-plan publications delete <publicationId> --project <projectId> --strategy <strategyId> --dry-run` | `content-plan:write` |

## Official X Research And Listening

All X operations are explicit and budget-gated. `--dry-run` validates bounds,
connection, feature gates, and project policy while making zero X requests.
Before using this table, run `segmently capabilities` and confirm it advertises
both the `content-plan x ...` family and the engagement/publication X delivery
family. A documented command is not available when the selected backend or
installed CLI does not expose it.

| Goal | Command | Scope |
|---|---|---|
| Safe connection/budget status | `segmently content-plan x status --project <projectId>` | `content-plan:read` |
| Start interactive OAuth | `segmently content-plan x connect --project <projectId> --open --wait` | Interactive user auth; not a service token |
| Preview/import own corpus | `segmently content-plan x sync-own-posts --project <projectId> --author <authorId> --max-pages 2 --limit 200 --max-cost-usd 1.00 --dry-run` | `social:read`, `content-plan:write` |
| Search public users | `segmently content-plan x users search --project <projectId> --query "product designer onboarding" --audience <audienceId> --limit 20 --max-cost-usd 0.50 --dry-run` | `social:read` |
| Import one selected account | `segmently content-plan x account import <username> --project <projectId> --external-author <externalAuthorId> --max-pages 2 --limit 100 --max-cost-usd 1.00 --dry-run` | `social:read`, `content-plan:write` |
| Search recent posts | `segmently content-plan x posts search --project <projectId> --query "onboarding friction -is:retweet" --audience <audienceId> --limit 25 --max-cost-usd 0.50 --dry-run` | `social:read` |
| Preview/refresh mentions | `segmently content-plan x mentions sync --project <projectId> --limit 50 --max-cost-usd 0.25 --dry-run` | `social:read`, `content-plan:write` |
| List/save listening sources | `segmently content-plan x listening queries list|save --project <projectId>` | `content-plan:read|write` |
| Explicitly refresh one source | `segmently content-plan x listening queries refresh <queryId> --project <projectId> --max-pages 1 --limit 50 --max-cost-usd 0.25 --dry-run` | `social:read`, `content-plan:write` |
| Inspect local usage | `segmently content-plan x usage --project <projectId> --period month` | `content-plan:read` |

## X Human Review, Manual Delivery, And Analytics

Approval never sends. A non-dry create requires the exact confirmation string
returned by approval/dry-run. `needs_reconciliation` blocks another send.
Reply estimates/results include a separate source-post read as
`sourceCheckUsage` and aggregate that cost with the create.

| Goal | Command | Scope |
|---|---|---|
| List queue | `segmently content-plan engagement list --project <projectId> --platform twitter --status pending` | `content-plan:read` |
| Approve edited reply | `segmently content-plan engagement approve <itemId> --project <projectId> --text "Reviewed reply"` | `content-plan:write` |
| Dismiss candidate | `segmently content-plan engagement dismiss <itemId> --project <projectId>` | `content-plan:write` |
| Preview reply | `segmently content-plan engagement reply-x <itemId> --project <projectId> --max-cost-usd 0.25 --dry-run` | `social:publish`, `content-plan:read` |
| Send approved reply | `segmently content-plan engagement reply-x <itemId> --project <projectId> --confirm '<projectId>:<itemId>:<approvedContentHash>'` | `social:publish`, `content-plan:read` |
| Reconcile ambiguous reply | `segmently content-plan engagement reconcile-x <itemId> --project <projectId> --max-cost-usd 0.25` | `social:read`, `content-plan:read` |
| Approve publication | `segmently content-plan publications approve <publicationId> --project <projectId> --strategy <strategyId>` | `content-plan:write` |
| Preview original/reply send | `segmently content-plan publications publish-x <publicationId> --project <projectId> --strategy <strategyId> --max-cost-usd 0.25 --dry-run` | `social:publish`, `content-plan:read` |
| Send approved publication | `segmently content-plan publications publish-x <publicationId> --project <projectId> --strategy <strategyId> --confirm '<projectId>:<publicationId>:<approvedContentHash>'` | `social:publish`, `content-plan:read` |
| Reconcile ambiguous publication | `segmently content-plan publications reconcile-x <publicationId> --project <projectId> --strategy <strategyId>` | `social:read`, `content-plan:read` |
| Refresh one publication analytics | `segmently content-plan x analytics sync --project <projectId> --strategy <strategyId> --publication <publicationId> --max-cost-usd 0.25 --dry-run` | `social:read`, `content-plan:read` |
| Compare stored snapshots | `segmently content-plan x analytics compare --project <projectId> --group-by pillar|series|audience|post_type` | `content-plan:read`; zero X requests |

Provider error meaning is stable: `401` requires reconnect; `403` is
`x_provider_forbidden` (usually app/project entitlement) and must not be
presented as a disconnected account. Analytics `403` creates no snapshot.

## Topics And Aspects

`ContentTopic.postBreakdown[]` is the topic-aspect list. Aspects are not
standalone documents.

| Goal | Command | Scope |
|---|---|---|
| List topics | `segmently content-plan topics list --project <projectId> --author <authorId> --platform linkedin --limit 50` | `content-plan:read` |
| Get topic | `segmently content-plan topics get <topicId> --project <projectId> --output topic.json` | `content-plan:read` |
| Create manual topic | `segmently content-plan topics create --project <projectId> --author <authorId> --file topic.json` | `content-plan:write` |
| Bulk create/update topics | `segmently content-plan topics apply --project <projectId> --author <authorId> --file topics.json --dry-run` | `content-plan:write` |
| Generate topics from text/URL sources | `segmently content-plan topics generate --project <projectId> --author <authorId> --count 1 --source-file source.txt --source-url https://example.com --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| List generated topic drafts | `segmently content-plan topics drafts list --project <projectId> --author <authorId> --generation <generationId>` | `content-plan:read` |
| Apply generated topic drafts | `segmently content-plan topics accept <generationId> --project <projectId> --author <authorId> --accepted <topicId>` | `content-plan:write` |
| Patch topic | `segmently content-plan topics patch <topicId> --project <projectId> --author <authorId> --file patch.json --dry-run` | `content-plan:write` |
| Set platforms | `segmently content-plan topics platforms set <topicId> --project <projectId> --author <authorId> --platform linkedin,x --dry-run` | `content-plan:write` |
| Add platforms | `segmently content-plan topics platforms add <topicId> --project <projectId> --author <authorId> --platform linkedin` | `content-plan:write` |
| Remove platforms | `segmently content-plan topics platforms remove <topicId> --project <projectId> --author <authorId> --platform x` | `content-plan:write` |
| List topic resources | `segmently content-plan topics resources list <topicId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Get/export one topic resource | `segmently content-plan topics resources get <topicId> <resourceId> --project <projectId> --author <authorId> --output resource.json` | `content-plan:read` |
| Add text/link resource | `segmently content-plan topics resources add <topicId> --project <projectId> --author <authorId> --type link --content-file source.txt --source-url https://example.com --reliability verified` | `content-plan:write` |
| Import HTTPS URL as resource | `segmently content-plan topics resources import-url <topicId> --project <projectId> --author <authorId> --url https://example.com/source --title "Source title" --dry-run` | `content-plan:write` |
| Patch resource | `segmently content-plan topics resources patch <topicId> <resourceId> --project <projectId> --author <authorId> --file resource-patch.json --dry-run` | `content-plan:write` |
| Remove resource | `segmently content-plan topics resources delete <topicId> <resourceId> --project <projectId> --author <authorId> --dry-run` | `content-plan:write` |
| List aspects | `segmently content-plan topics aspects list <topicId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Generate aspects | `segmently content-plan topics aspects generate <topicId> --project <projectId> --author <authorId> --count 4 --mode append --instruction "Split into cover/body/CTA angles" --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Replace aspects | `segmently content-plan topics aspects apply <topicId> --project <projectId> --author <authorId> --file post-breakdown.json --dry-run` | `content-plan:write` |
| Add aspect | `segmently content-plan topics aspects add <topicId> --project <projectId> --author <authorId> --file aspect.json` | `content-plan:write` |
| Patch aspect | `segmently content-plan topics aspects patch <topicId> <aspectKey> --project <projectId> --author <authorId> --file aspect-patch.json` | `content-plan:write` |
| Remove aspect | `segmently content-plan topics aspects delete <topicId> <aspectKey> --project <projectId> --author <authorId> --dry-run` | `content-plan:write` |

## Research Runs

Research runs are one document under `research_runs/{runId}` with inline
`brief`, `research`, and `analysis` phase fields. Launch commands return a
`runId`, not a backend `taskId`; inspect status with `research get/list`.

| Goal | Command | Scope |
|---|---|---|
| List runs | `segmently content-plan research list --project <projectId> --author <authorId> --topic <topicId> --active true` | `content-plan:read` |
| Get run | `segmently content-plan research get <runId> --project <projectId> --author <authorId> --output run.json` | `content-plan:read` |
| Export phase | `segmently content-plan research phase get <runId> analysis --project <projectId> --author <authorId> --output analysis.json` | `content-plan:read` |
| Patch phase | `segmently content-plan research phase patch <runId> analysis --project <projectId> --author <authorId> --file analysis-patch.json --dry-run` | `content-plan:write` |
| Compose brief | `segmently content-plan research brief <topicId> --project <projectId> --author <authorId> --title "Study title" --focus-kind aspect --aspect-key cover` | `content-plan:write` |
| Execute research | `segmently content-plan research execute <runId> --project <projectId> --author <authorId> --provider perplexity --depth deep` | `content-plan:write` |
| Analyse research | `segmently content-plan research analyze <runId> --project <projectId> --author <authorId> --model gemini-2.5-pro` | `content-plan:write` |
| Run all phases | `segmently content-plan research run-all <topicId> --project <projectId> --author <authorId> --focus-kind topic --title "Study title"` | `content-plan:write` |
| Wait for run | `segmently content-plan research wait <runId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Set active | `segmently content-plan research active <runId> --project <projectId> --author <authorId> --active true` | `content-plan:write` |
| Delete run | `segmently content-plan research delete <runId> --project <projectId> --author <authorId>` | `content-plan:write` |

## Post Generation

`posts generate` can be flag-driven for one topic/aspect/platform cell or
manifest-driven with `--file` for the full `generate-posts` contract. Launch
commands return a backend `taskId`; always inspect the task before assuming the
workflow finished.

### Post Command Groups

Use these groups when planning a full post QA run. The operator can execute the
groups one by one; the CLI does not need one giant command for the whole flow.

| Group | Current commands | Coverage |
|---|---|---|
| Model and key preflight | `content-plan models available|get|set` | Project-scoped user keys and Google model preferences. |
| Generate post text and optional initial assets | `content-plan posts generate --asset-mode text_only|plan_only|plan_and_generate --wait` | Launches the backend post pipeline and can auto-apply topic/sprint posts. |
| Resolve/apply generated output | `content-plan posts drafts list`, `content-plan posts list|get|resolve`, `content-plan posts accept`, `tasks get` | Finds canonical posts and draft-review posts across supported storage locations, then applies accepted drafts when needed. |
| Attach post to Calendar | `content-plan posts schedule --strategy <strategyId> --scheduled-at <iso> --dry-run` | Attaches an existing canonical `content_posts` document to a strategy publication slot so it appears in Calendar. |
| Refine post copy | `content-plan posts refine` | Uses the same AI refine endpoint as the UI and preserves scheduling/publication metadata. |
| Regenerate visual brief / slots | `content-plan posts assets regenerate-brief`, legacy `posts assets plan` | Rebuilds the post-level design brief/storyboard/slot prompts without rewriting copy. |
| Repair one slot | `posts assets brief get`, `posts assets preview`, `posts assets slots list|get|regenerate-prompt|patch-prompt|generate|select`, `posts assets slots experiments reject|delete` | Supports AI prompt regeneration, manual prompt edits, selected URL preview, single-image experiment regeneration, and experiment lifecycle. |
| Batch image generation | `posts assets slots batch-generate` | Generates multiple slot experiments from a manifest and can select completed experiments. |
| Debug evidence | `tasks get`, related `content-plan posts drafts list`, and explicit post/asset read commands | Public task status and generated artifact reads are CLI-safe. Full internal prompt bundles are not part of the customer CLI surface. |

Known gap: true full post regeneration from only an existing post ID still
depends on stored generation context. Track it in `references/backlog.md`.

| Goal | Command | Scope |
|---|---|---|
| List posts | `segmently content-plan posts list --project <projectId> --author <authorId> --topic <topicId> --platform linkedin` | `content-plan:read` |
| Create/update canonical post | `segmently content-plan posts create --project <projectId> --file post.json --dry-run` | `content-plan:write` |
| Get post | `segmently content-plan posts get <postId> --project <projectId> --author <authorId> --output post.json` | `content-plan:read` |
| Resolve post storage | `segmently content-plan posts resolve <postId> --project <projectId> --author <authorId> --output post.json` | `content-plan:read` |
| List generated drafts | `segmently content-plan posts drafts list --project <projectId> --generation <generationId> --include-slots` | `content-plan:read` |
| Apply one generated draft | `segmently content-plan posts drafts accept <draftPostId> --project <projectId> --author <authorId> --scope topic --topic <topicId>` | `content-plan:write` |
| Reject one generated draft | `segmently content-plan posts drafts reject <draftPostId> --project <projectId> --author <authorId> --reason "Not review-ready" --dry-run` | `content-plan:write` |
| Apply reviewed drafts | `segmently content-plan posts accept <generationId> --project <projectId> --author <authorId> --accepted <draftPostId> --scope topic --topic <topicId>` | `content-plan:write` |
| Schedule canonical post into Calendar | `segmently content-plan posts schedule <postId> --project <projectId> --author <authorId> --strategy <strategyId> --scheduled-at <iso> --platform <platformId> --publication pub-<postId> --dry-run` | `content-plan:write` |
| Schedule multiple posts | `segmently content-plan posts schedule-batch --project <projectId> --file schedule-batch.json --dry-run` | `content-plan:write` |
| Refine post copy | `segmently content-plan posts refine <postId> --project <projectId> --author <authorId> --prompt-file refine.txt --model gemini-3-flash-preview` | `content-plan:write` |
| Generate simple topic posts | `segmently content-plan posts generate --project <projectId> --author <authorId> --topic <topicId> --platform linkedin --apply-mode auto_apply_topic --asset-mode plan_only --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Generate one cell | `segmently content-plan posts generate --project <projectId> --author <authorId> --topic <topicId> --platform linkedin --cell-mode single --aspect-key cover --method cope --apply-mode auto_apply_topic` | `content-plan:write` |
| Generate direct cell | `segmently content-plan posts generate --project <projectId> --author <authorId> --topic <topicId> --platform linkedin --cell-mode single --aspect-key body --method direct --apply-mode auto_apply_topic` | `content-plan:write` |
| Generate from manifest | `segmently content-plan posts generate --project <projectId> --file post-generation.json` | `content-plan:write` |

## Post Asset Slots

Use these when a post already exists and the operator wants to repair or
regenerate only its visual asset plan or one image slot. Always run
`posts resolve` first if the post ID may be a generated draft instead of a
canonical `content_posts` document.

| Goal | Command | Scope |
|---|---|---|
| Plan asset slots | `segmently content-plan posts assets plan <postId> --project <projectId> --author <authorId> --mode plan_only --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Get asset brief/storyboard | `segmently content-plan posts assets brief get <postId> --project <projectId> --author <authorId> --output brief.json` | `content-plan:read` |
| Preview selected assets | `segmently content-plan posts assets preview <postId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Regenerate design brief and slots | `segmently content-plan posts assets regenerate-brief <postId> --project <projectId> --author <authorId> --asset-mode plan_only --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Attempt text regeneration | `segmently content-plan posts assets regenerate-text <postId> --project <projectId> --author <authorId> --wait` | `content-plan:write`; best-effort when context is available, `--wait` only polls when the backend returns `taskId` |
| List slots | `segmently content-plan posts assets slots list <postId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Get slot | `segmently content-plan posts assets slots get <postId> <slotKey> --project <projectId> --author <authorId> --output slot.json` | `content-plan:read` |
| AI-regenerate slot prompt | `segmently content-plan posts assets slots regenerate-prompt <postId> <slotKey> --project <projectId> --author <authorId> --instruction "Make the diagram clearer" --model gemini-3-flash-preview --dry-run` | `content-plan:write` |
| Patch slot prompt | `segmently content-plan posts assets slots patch-prompt <postId> <slotKey> --project <projectId> --author <authorId> --prompt-file prompt.txt --dry-run` | `content-plan:write` |
| Select existing experiment | `segmently content-plan posts assets slots select <postId> <slotKey> <experimentId> --project <projectId> --author <authorId> --dry-run` | `content-plan:write` |
| Generate one slot experiment | `segmently content-plan posts assets slots generate <postId> <slotKey> --project <projectId> --author <authorId> --prompt-file prompt.txt --model <imageModel> --experiment-id <experimentId> --wait` | `content-plan:write`, `assets:write`; add `tasks:read` for `--wait` |
| Generate and select | `segmently content-plan posts assets slots generate <postId> <slotKey> --project <projectId> --author <authorId> --experiment-id <experimentId> --select --wait` | `content-plan:write`, `assets:write`, `tasks:read` |
| Batch generate slots | `segmently content-plan posts assets slots batch-generate <postId> --project <projectId> --author <authorId> --file slot-batch.json --select --wait` | `content-plan:write`, `assets:write`, `tasks:read` |
| Reject experiment | `segmently content-plan posts assets slots experiments reject <postId> <slotKey> <experimentId> --project <projectId> --author <authorId> --reason "Wrong composition"` | `content-plan:write` |
| Delete experiment | `segmently content-plan posts assets slots experiments delete <postId> <slotKey> <experimentId> --project <projectId> --author <authorId> --dry-run` | `content-plan:write` |

Slot generation accepts `--negative-prompt`, `--provider`, `--quality`,
`--openai-size`, `--aspect-ratio`, `--image-size`, `--style`,
repeatable `--reference-image`, and `--reference-images-file`.
When these options are omitted, `slots generate` inherits the rich prompt package
from the selected slot experiment, falling back to the first experiment that has
prompt metadata. This includes `aspectRatio`, `imageSize`, `quality`,
`provider`, `model`, and reference images. Use explicit flags only to override
the stored package for an eval.
Use `--source-experiment-id <id>` to inherit from a specific experiment. Use
`--no-inherit-slot-package` only for fully manual eval payloads where all prompt,
model, aspect, and reference fields are provided explicitly.

## Backend Tasks

Use these after any command that returns `taskId`, including topic aspect AI
generation, post generation, post asset planning/regeneration, and slot image
generation. Research launch commands return `runId` instead, so inspect them
with `content-plan research wait/get/list`.

| Goal | Command | Scope |
|---|---|---|
| Read task status and phase outputs | `segmently tasks get <taskId> --project <projectId>` | `tasks:read` |
| Cancel a running task | `segmently tasks cancel <taskId> --project <projectId> --reason "operator stopped"` | `tasks:write` |

`tasks get` intentionally returns the task document summary and phase data but
does not expand internal prompt bundles, private model call payloads, or hidden
reference downloads. For customer troubleshooting, combine `tasks get` with the
public artifact read that matches the workflow, such as `content-plan posts
drafts list --generation <generationId> --include-slots`, `content-plan posts resolve`, or
`content-plan posts assets slots list|get`. If that is not enough, explain that
the remaining evidence requires Segmently support/operator diagnostics.

For `posts generate --apply-mode draft_review`, generated post artifacts may be
stored under `post_generations/{taskId}/generatedPosts` and referenced from
`task.result.artifacts[]` before they are applied as canonical `content_posts`.
Use `content-plan posts drafts list --generation <generationId> --include-slots` to inspect
those drafts directly.

Task outcome is part of the command contract:

- with `--wait`, failed, cancelled, or timed-out tasks exit non-zero while
  retaining task/result evidence on stdout;
- without `--wait`, a launch that returns `taskId` also reports
  `taskState: "pending"` and a copyable `followUp` command;
- run the `followUp` or `segmently tasks get <taskId> --project <projectId>`
  before claiming that generation completed.

Post generation flags map to the existing agent contract:

- `--scope topic|sprint|strategy`
- `--topic`, `--strategy`, `--sprint`, `--publication`
- `--platform`, `--posts-per-platform`, `--as-series`, `--series-count`,
  `--series-flavor`
- `--apply-mode draft_review|auto_apply_topic|auto_apply_sprint`
- `--asset-mode text_only|plan_only|plan_and_generate`
- `--planning-mode auto|manual`
- `--cell-mode single|variants|series|fresh-variants`, `--aspect-key`,
  `--method cope|direct`, `--template-id`, `--template-ids`, `--format-id`,
  `--asset-intent`, `--length-bucket`, `--fresh-variants-count`
- `--research-selection researchSelectionByTopic.json`
- `--wait`, `--poll-interval-ms`, `--timeout-ms` for immediate task polling

## Creator Profile, Pillars, And Templates

| Goal | Command | Scope |
|---|---|---|
| Export creator profile | `segmently content-plan profile export --project <projectId> --author <authorId> --platform linkedin,x --output profile.json` | `content-plan:read` |
| Apply creator profile | `segmently content-plan profile apply --project <projectId> --file profile.json --dry-run` | `content-plan:write` |
| List pillars | `segmently content-plan pillars list --project <projectId> --author <authorId>` | `content-plan:read` |
| Apply pillars | `segmently content-plan pillars apply --project <projectId> --author <authorId> --file pillars.json --dry-run` | `content-plan:write` |
| Reanalyze one pillar from newly selected source posts | `segmently content-plan pillars reanalyze-sources <pillarId> --project <projectId> --author <authorId> --file pillar-reanalysis.json --wait` | `content-plan:write`; add `tasks:read` for `--wait`. Inspect the task result before applying any returned pillar revision. |
| List post templates | `segmently content-plan post-templates list linkedin --project <projectId> --author <authorId>` | `content-plan:read` |
| Apply post templates | `segmently content-plan post-templates apply linkedin --project <projectId> --author <authorId> --file templates.json --dry-run` | `content-plan:write` |

## Content Themes

Use deterministic theme commands for bootstrap/demo setup. Use AI generation
only when the user wants generated theme candidates before applying them.

| Goal | Command | Scope |
|---|---|---|
| List themes | `segmently content-plan themes list --project <projectId>` | `content-plan:read` |
| Apply deterministic theme manifest | `segmently content-plan themes apply --project <projectId> --file themes.json --mode merge --dry-run` | `content-plan:write` |
| Create one manual theme | `segmently content-plan themes create --project <projectId> --file theme.json --user-id <uid>` | `content-plan:write` |
| Generate theme candidates | `segmently content-plan themes generate --project <projectId> --file theme-generation.json --count 3 --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Apply generated themes | `segmently content-plan themes accept <generationId> --project <projectId> --accepted <themeIds>` | `content-plan:write` |

## Design Profiles

| Goal | Command | Scope |
|---|---|---|
| List profiles | `segmently content-plan designs list linkedin --project <projectId> --author <authorId> --include-profiles` | `content-plan:read` |
| Export profile | `segmently content-plan designs export linkedin --project <projectId> --author <authorId> --profile-key carousel_portrait --profile-id <profileId> --output design.json` | `content-plan:read`; add `--flat` for editor JSON |
| Apply profile | `segmently content-plan designs apply linkedin --project <projectId> --author <authorId> --profile-key carousel_portrait --profile-id <profileId> --file design.json --dry-run` | `content-plan:write` |
| Make existing profile current | `segmently content-plan designs set-current linkedin --project <projectId> --author <authorId> --profile-key carousel_portrait --profile-id <profileId> --dry-run` | `content-plan:write` |

Design profile apply accepts flat design-system JSON, skill composite JSON, or a
CLI transfer manifest.

## Full Design-System Packages

Use packages when one visual foundation spans multiple platform formats/profile
keys. Use the narrower `designs` family only for one profile variant.

| Goal | Command | Scope |
|---|---|---|
| List packages and profiles | `segmently content-plan design-systems list linkedin --project <projectId> --author <authorId> --include-profiles` | `content-plan:read` |
| Export portable package | `segmently content-plan design-systems export linkedin --project <projectId> --author <authorId> --package-id <packageId> --output package.json` | `content-plan:read` |
| Inspect resolved format context | `segmently content-plan design-systems inspect linkedin --project <projectId> --author <authorId> --package-id <packageId> --format-ids carousel_portrait,single_image_square --output inspect.json` | `content-plan:read`; add `--include-prompt` only when full style-prompt evidence is needed. |
| Preview package import | `segmently content-plan design-systems apply linkedin --project <projectId> --author <authorId> --file package.json --package-id <targetPackageId> --references keep --dry-run` | `content-plan:write` |
| Apply package | Repeat the previous command without `--dry-run` after reviewing reference transfer and target confirmation. | `content-plan:write` |
| Preview activation | `segmently content-plan design-systems set-current linkedin --project <projectId> --author <authorId> --package-id <packageId> --dry-run` | `content-plan:write` |
| Activate existing package | Repeat `design-systems set-current` without `--dry-run`, then verify with list and inspect. | `content-plan:write` |

## Assets For Design References

| Goal | Command | Scope |
|---|---|---|
| Upload one image | `segmently assets upload-image ./ref.png --project <projectId> --folder content-plan-design-references/linkedin/carousel_portrait/<slug> --asset` | `assets:write`; requires CLI asset upload access |
| Upload and emit Content Plan reference fragment | `segmently assets upload-image ./ref.png --project <projectId> --content-plan-reference linkedin --profile-key carousel_portrait --reference-role layout --reference-name "Cover layout"` | `assets:write`; returns `visualReference`, `visualReferences[]`, and `assetManifest` fragments |
| Upload raw URL output | `segmently assets upload-image ./ref.png --project <projectId> --raw-url` | `assets:write` |

Asset upload is not a Content Plan write. Uploaded images appear in Design only
after their URLs are included in `visualReferences` and applied with
`content-plan designs apply`.
