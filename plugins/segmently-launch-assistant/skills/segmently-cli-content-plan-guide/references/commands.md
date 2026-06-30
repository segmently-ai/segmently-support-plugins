# Content Plan CLI Commands

Use this file for command and scope lookup.

## Authentication And Access

| Goal | Command | Requirement |
|---|---|---|
| Interactive login | `segmently auth login` | Browser login. Production is the public default. |
| Service-token automation | `segmently auth token create --project <projectId> --scope content-plan:read,content-plan:write` | User auth is required to create tokens. Store the token secret immediately. |
| Project lookup | `segmently projects list`, `segmently projects get <projectId>` | `projects:read`; use before scoped operations when the project is named by UI title. |

Content Plan commands require Content Plan subscription access in addition to
CLI scopes. `content-plan:write` satisfies read.

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
| Verify created resources and calendar readiness | `segmently content-plan bootstrap verify --project <projectId> --file content-plan-bootstrap.json --run bootstrap.apply.json --require-calendar --require-posts --out bootstrap.verify.json` | `content-plan:read` |

## Authors

Use these first when the author ID is unknown.

| Goal | Command | Scope |
|---|---|---|
| List self authors | `segmently content-plan authors list --project <projectId>` | `content-plan:read` |
| List without nested platform summaries | `segmently content-plan authors list --project <projectId> --no-include-platforms` | `content-plan:read` |
| Resolve default author | `segmently content-plan authors default --project <projectId>` | `content-plan:read` |
| Get author by id | `segmently content-plan authors get <authorId> --project <projectId> --include-platforms` | `content-plan:read` |
| Create or update manual author | `segmently content-plan authors apply --project <projectId> --file author.json --dry-run` | `content-plan:write` |
| Mark default author | `segmently content-plan authors set-default <authorId> --project <projectId> --dry-run` | `content-plan:write` |
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
| Create default draft | `segmently content-plan articles create --project <projectId> --title "Article title" --alias article-alias --locale en` | `content-plan:write` |
| Apply article JSON | `segmently content-plan articles apply article.json --project <projectId> --article-id <articleId>` | `content-plan:write` |
| Clone article | `segmently content-plan articles clone <articleId> --project <projectId> --title "Clone title" --alias clone-alias` | `content-plan:write` |
| Add media section | `segmently content-plan articles add-image <articleId> --project <projectId> --file ./image.png --label "Hero" --height 420` | `content-plan:write`; uses asset upload for `--file` |
| Publish article | `segmently content-plan articles publish <articleId> --project <projectId>` | `content-plan:write` |

## Strategies

| Goal | Command | Scope |
|---|---|---|
| Inventory | `segmently content-plan strategies list --project <projectId> --author <authorId> --include-counts` | `content-plan:read` |
| Get compact bundle | `segmently content-plan strategies get <strategyId> --project <projectId> --include-posts` | `content-plan:read` |
| Export | `segmently content-plan strategies export <strategyId> --project <projectId> --include-posts --output strategy.json` | `content-plan:read` |
| Apply deterministic strategy | `segmently content-plan strategies apply --project <projectId> --file strategy.json --dry-run` | `content-plan:write` |
| Run AI strategy preflight | `segmently content-plan strategies preflight --project <projectId> --author <authorId> --user-id <uid> --file strategy-planning.json` | `content-plan:write` |
| Launch AI strategy creation | `segmently content-plan strategies create --project <projectId> --author <authorId> --user-id <uid> --file strategy-planning.json --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Create editable AI strategy draft | `segmently content-plan strategies draft create --project <projectId> --author <authorId> --user-id <uid> --file strategy-planning.json --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Patch AI strategy draft | `segmently content-plan strategies draft patch <strategyId> --project <projectId> --author <authorId> --file draft-patch.json` | `content-plan:write` |
| Approve AI strategy draft | `segmently content-plan strategies draft approve <strategyId> --project <projectId> --author <authorId> --user-id <uid> --model gemini-3-flash-preview --force-restart --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Regenerate AI strategy draft | `segmently content-plan strategies draft regenerate <strategyId> --project <projectId> --author <authorId> --user-id <uid> --preserve-user-edits --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
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

## Topics And Aspects

`ContentTopic.postBreakdown[]` is the topic-aspect list. Aspects are not
standalone documents.

| Goal | Command | Scope |
|---|---|---|
| List topics | `segmently content-plan topics list --project <projectId> --author <authorId> --platform linkedin --limit 50` | `content-plan:read` |
| Get topic | `segmently content-plan topics get <topicId> --project <projectId> --output topic.json` | `content-plan:read` |
| Create manual topic | `segmently content-plan topics create --project <projectId> --author <authorId> --file topic.json` | `content-plan:write` |
| Bulk create/update topics | `segmently content-plan topics bulk-apply --project <projectId> --author <authorId> --file topics.json --dry-run` | `content-plan:write` |
| Generate topics from text/URL sources | `segmently content-plan topics generate --project <projectId> --author <authorId> --count 1 --source-file source.txt --source-url https://example.com --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| List generated topic drafts | `segmently content-plan topics drafts list --project <projectId> --author <authorId> --generation <generationId>` | `content-plan:read` |
| Apply generated topic drafts | `segmently content-plan topics apply <generationId> --project <projectId> --author <authorId> --accepted <topicId>` | `content-plan:write` |
| Patch topic | `segmently content-plan topics patch <topicId> --project <projectId> --author <authorId> --file patch.json --dry-run` | `content-plan:write` |
| Set platforms | `segmently content-plan topics platforms set <topicId> --project <projectId> --author <authorId> --platform linkedin,x --dry-run` | `content-plan:write` |
| Add platforms | `segmently content-plan topics platforms add <topicId> --project <projectId> --author <authorId> --platform linkedin` | `content-plan:write` |
| Remove platforms | `segmently content-plan topics platforms remove <topicId> --project <projectId> --author <authorId> --platform x` | `content-plan:write` |
| List topic resources | `segmently content-plan topics resources list <topicId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Add text/link resource | `segmently content-plan topics resources add <topicId> --project <projectId> --author <authorId> --type link --content-file source.txt --source-url https://example.com --reliability verified` | `content-plan:write` |
| Import HTTPS URL as resource | `segmently content-plan topics resources import-url <topicId> --project <projectId> --author <authorId> --url https://example.com/source --title "Source title" --dry-run` | `content-plan:write` |
| Patch resource | `segmently content-plan topics resources patch <topicId> <resourceId> --project <projectId> --author <authorId> --file resource-patch.json --dry-run` | `content-plan:write` |
| Remove resource | `segmently content-plan topics resources remove <topicId> <resourceId> --project <projectId> --author <authorId> --dry-run` | `content-plan:write` |
| List aspects | `segmently content-plan topics aspects list <topicId> --project <projectId> --author <authorId>` | `content-plan:read` |
| Generate aspects | `segmently content-plan topics aspects generate <topicId> --project <projectId> --author <authorId> --count 4 --mode append --instruction "Split into cover/body/CTA angles" --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Replace aspects | `segmently content-plan topics aspects apply <topicId> --project <projectId> --author <authorId> --file post-breakdown.json --dry-run` | `content-plan:write` |
| Add aspect | `segmently content-plan topics aspects add <topicId> --project <projectId> --author <authorId> --file aspect.json` | `content-plan:write` |
| Patch aspect | `segmently content-plan topics aspects patch <topicId> <aspectKey> --project <projectId> --author <authorId> --file aspect-patch.json` | `content-plan:write` |
| Remove aspect | `segmently content-plan topics aspects remove <topicId> <aspectKey> --project <projectId> --author <authorId> --dry-run` | `content-plan:write` |

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
| Analyse research | `segmently content-plan research analyse <runId> --project <projectId> --author <authorId> --model gemini-2.5-pro` | `content-plan:write` |
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
| Resolve/apply generated output | `content-plan posts drafts list`, `content-plan posts list|get|resolve`, `content-plan posts apply`, `tasks get` | Finds canonical posts and draft-review posts across supported storage locations, then applies accepted drafts when needed. |
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
| List generated drafts | `segmently content-plan posts drafts list --project <projectId> --task <taskId> --include-slots` | `content-plan:read` |
| Apply one generated draft | `segmently content-plan posts drafts apply-one <draftPostId> --project <projectId> --author <authorId> --scope topic --topic <topicId>` | `content-plan:write` |
| Reject one generated draft | `segmently content-plan posts drafts reject <draftPostId> --project <projectId> --author <authorId> --reason "Not review-ready" --dry-run` | `content-plan:write` |
| Apply reviewed drafts | `segmently content-plan posts apply <generationId> --project <projectId> --author <authorId> --accepted <draftPostId> --scope topic --topic <topicId>` | `content-plan:write` |
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
drafts list --task <taskId> --include-slots`, `content-plan posts resolve`, or
`content-plan posts assets slots list|get`. If that is not enough, explain that
the remaining evidence requires Segmently support/operator diagnostics.

For `posts generate --apply-mode draft_review`, generated post artifacts may be
stored under `post_generations/{taskId}/generatedPosts` and referenced from
`task.result.artifacts[]` before they are applied as canonical `content_posts`.
Use `content-plan posts drafts list --task <taskId> --include-slots` to inspect
those drafts directly.

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
| Apply pillars | `segmently content-plan pillars apply --project <projectId> --author <authorId> --file pillars.json --dry-run` | `content-plan:write` |
| List post templates | `segmently content-plan post-templates list linkedin --project <projectId> --author <authorId>` | `content-plan:read` |
| Apply post templates | `segmently content-plan post-templates apply linkedin --project <projectId> --author <authorId> --file templates.json --dry-run` | `content-plan:write` |

## Content Themes

Use deterministic theme commands for bootstrap/demo setup. Use AI generation
only when the user wants generated theme candidates before applying them.

| Goal | Command | Scope |
|---|---|---|
| List themes | `segmently content-plan themes list --project <projectId>` | `content-plan:read` |
| Apply deterministic theme manifest | `segmently content-plan themes apply-manifest --project <projectId> --file themes.json --mode merge --dry-run` | `content-plan:write` |
| Create one manual theme | `segmently content-plan themes create --project <projectId> --file theme.json --user-id <uid>` | `content-plan:write` |
| Generate theme candidates | `segmently content-plan themes generate --project <projectId> --file theme-generation.json --count 3 --model gemini-3-flash-preview --wait` | `content-plan:write`; add `tasks:read` for `--wait` |
| Apply generated themes | `segmently content-plan themes apply <generationId> --project <projectId> --accepted <themeIds>` | `content-plan:write` |

## Design Profiles

| Goal | Command | Scope |
|---|---|---|
| List profiles | `segmently content-plan designs list linkedin --project <projectId> --author <authorId> --include-profiles` | `content-plan:read` |
| Export profile | `segmently content-plan designs export linkedin --project <projectId> --author <authorId> --profile-key carousel_portrait --profile-id <profileId> --output design.json` | `content-plan:read`; add `--flat` for editor JSON |
| Apply profile | `segmently content-plan designs apply linkedin --project <projectId> --author <authorId> --profile-key carousel_portrait --profile-id <profileId> --file design.json --dry-run` | `content-plan:write` |
| Make existing profile current | `segmently content-plan designs make-current linkedin --project <projectId> --author <authorId> --profile-key carousel_portrait --profile-id <profileId> --dry-run` | `content-plan:write` |

Design profile apply accepts flat design-system JSON, skill composite JSON, or a
CLI transfer manifest.

## Assets For Design References

| Goal | Command | Scope |
|---|---|---|
| Upload one image | `segmently assets upload-image ./ref.png --project <projectId> --folder content-plan-design-references/linkedin/carousel_portrait/<slug> --asset` | `assets:write`; requires CLI asset upload access |
| Upload and emit Content Plan reference fragment | `segmently assets upload-image ./ref.png --project <projectId> --content-plan-reference linkedin --profile-key carousel_portrait --reference-role layout --reference-name "Cover layout"` | `assets:write`; returns `visualReference`, `visualReferences[]`, and `assetManifest` fragments |
| Upload raw URL output | `segmently assets upload-image ./ref.png --project <projectId> --raw-url` | `assets:write` |

Asset upload is not a Content Plan write. Uploaded images appear in Design only
after their URLs are included in `visualReferences` and applied with
`content-plan designs apply`.
