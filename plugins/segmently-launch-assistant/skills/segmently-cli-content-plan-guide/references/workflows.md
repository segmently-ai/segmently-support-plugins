# Content Plan CLI Workflows

Use this file for end-to-end command chains.

## How To Use These Workflows

Treat each section as an operator recipe, not as a loose command catalog:

1. run the listed preflight/read commands;
2. save exported or generated JSON under stable local filenames;
3. run local validation and `--dry-run` before supported writes;
4. execute only the reviewed write;
5. follow asynchronous tasks to a terminal result;
6. finish with the listed readback or `content-plan doctor`.

Do not concatenate every command in this file into one automation. Select the
smallest workflow that reaches the requested outcome, then stop after its
verification step.

| Goal | Workflow | Entry command | Final verification |
|---|---|---|---|
| Diagnose an existing or partial setup | Doctor-First Flow Completion | `content-plan doctor` | rerun `doctor` |
| Prepare an empty project deterministically | Empty Project Bootstrap From One Manifest | `bootstrap validate` | `bootstrap verify` + `doctor` |
| Build creator/platform/strategy/post/calendar atomically | Atomic Social Publishing Demo Prep | `authors list|default` | `publications list` |
| Create or update a Flexible Layout article safely | Article Draft Review And Publish | `articles list|get` | `articles get` plus served URL/config |
| Create/review an AI strategy draft | Strategy Draft Review Loop | `strategies preflight` | `strategies get|audit` |
| Move topic -> aspects -> research -> post | Topic To Research To Post | `topics get` | `posts list|resolve` |
| Reanalyze a pillar from selected posts | Pillar Source Reanalysis | `pillars list` | `tasks get` + `pillars list` |
| Repair generated visuals | Full Post QA Loop | `posts resolve` | slot get + post resolve |
| Transfer one design profile | Design Profile Transfer Between Projects | `designs export` | `designs list` |
| Transfer/inspect a multi-format package | Full Design-System Package Workflow | `design-systems list|export` | `design-systems list|inspect` |
| Research/listen/publish manually on X | Official X Research, Engagement, And Manual Send | `capabilities` + `x status` | reconcile/analytics readback |

## Doctor-First Flow Completion

Goal: take an existing or partially configured Content Plan project to the next
valid step without guessing which resource is missing.

```bash
segmently --version
segmently capabilities

segmently content-plan doctor \
  --project <projectId> \
  --author <authorId>
```

Interpret the result as an ordered state machine:

```text
author -> platforms -> pillars -> backlog -> strategy -> publications -> posts -> assets
```

Run only the first required missing step's `nextCommand`, add the explicit
project/author/file arguments needed for the real operation, dry-run when the
command supports it, then rerun `doctor`. `assets` is advisory; all earlier
steps are required. `doctor` exits `1` while required steps are missing, so do
not treat a structured not-ready report as a transport or CLI crash.

Example loop:

```bash
segmently content-plan doctor --project <projectId> --author <authorId>

segmently content-plan pillars apply \
  --project <projectId> --author <authorId> \
  --file pillars.json --dry-run

segmently content-plan pillars apply \
  --project <projectId> --author <authorId> \
  --file pillars.json

segmently content-plan doctor --project <projectId> --author <authorId>
```

Keep following the newly returned `nextCommand`; never pre-apply later steps
just because their manifests already exist.

## Empty Project Bootstrap From One Manifest

Goal: prepare an empty project with a Content Plan author, publishing platform,
manual strategy, calendar slot, and review-ready post from one checked-in or
temporary JSON manifest.

1. Create `content-plan-bootstrap.json` using the
   `segmently.cli.content-plan-bootstrap.v1` manifest shape from
   `references/manifests.md`.
2. Validate locally before any API write.
3. Print the operation plan and review UI links.
4. Dry-run API writes.
5. Apply.
6. Verify resources and Calendar visibility.

```bash
segmently content-plan bootstrap validate \
  --project <projectId> \
  --file content-plan-bootstrap.json \
  --out bootstrap.validate.json

segmently content-plan bootstrap plan \
  --project <projectId> \
  --file content-plan-bootstrap.json \
  --out bootstrap.plan.json

segmently content-plan bootstrap apply \
  --project <projectId> \
  --file content-plan-bootstrap.json \
  --dry-run \
  --out bootstrap.apply.dry.json

segmently content-plan bootstrap apply \
  --project <projectId> \
  --file content-plan-bootstrap.json \
  --out bootstrap.apply.json

segmently content-plan bootstrap verify \
  --project <projectId> \
  --file content-plan-bootstrap.json \
  --run bootstrap.apply.json \
  --require-calendar \
  --require-posts \
  --require-facebook-publish-ready \
  --out bootstrap.verify.json
```

`bootstrap apply` validates the manifest and referenced platform catalog before
the first mutation. It writes `<manifest>.bootstrap-state.json` and resumes from
that checkpoint after interruption. Preserve the checkpoint and re-run the same
command to skip completed operation keys:

```bash
segmently content-plan bootstrap apply \
  --project <projectId> \
  --file content-plan-bootstrap.json \
  --out bootstrap.apply.json
```

Use `--state-file ./state/bootstrap.json` when the checkpoint must live in a
controlled work directory. Use `--restart` only when all operations should be
intentionally replayed. `--skip-validation` is an emergency escape hatch for
the manifest schema only; the `system_platforms` preflight still runs and may
block the apply before any write.

Use the `uiUrl` values emitted by `bootstrap plan`, `bootstrap apply`, or
`bootstrap verify` to open the prepared author, strategy Calendar, and specific
post in the web app. A canonical post that is not linked to a publication slot
will not be convenient for reviewers to find from Calendar.

Finish the flow with a shared readiness readback:

```bash
segmently content-plan doctor --project <projectId> --author <authorId>
```

## Atomic Social Publishing Demo Prep

Goal: create one publish-ready social post in Content Plan, attach it to a
Calendar slot, and leave the external-network connect/publish step to the
reviewer or operator in the UI. Use `facebook` as the `platformId` only when
the task is specifically a Facebook/Meta review flow.

Prepare these files:

- `author.json`: manual author with `authorId`, display name, locale, and
  positioning fields.
- `platform.json`: `{ "platformId": "<platformId>", "displayName":
  "<Platform display name>", "isActive": true }`.
- `platform-voice.json`: either raw voice fields or `{ "voice": { ... } }`.
- `strategy.json`: deterministic strategy containing at least one sprint.
- `post.json`: canonical social post with `postId`, `authorId`, `platform`,
  `hook`, `body`, optional `cta`, `sourceUrl`, and `status`.
- `schedule-batch.json`: `{ "items": [{ "postId", "strategyId",
  "scheduledAt", "platform": "<platformId>", "publicationId" }] }`.

Run atomic commands when the project should be prepared incrementally:

```bash
segmently content-plan authors apply \
  --project <projectId> \
  --file author.json \
  --dry-run

segmently content-plan authors apply \
  --project <projectId> \
  --file author.json

segmently content-plan authors set-current <authorId> \
  --project <projectId>

segmently content-plan platforms apply \
  --project <projectId> \
  --author <authorId> \
  --file platform.json

segmently content-plan platforms voice apply \
  --project <projectId> \
  --author <authorId> \
  --platform <platformId> \
  --file platform-voice.json

segmently content-plan strategies apply \
  --project <projectId> \
  --file strategy.json

segmently content-plan posts create \
  --project <projectId> \
  --file post.json

segmently content-plan posts schedule-batch \
  --project <projectId> \
  --file schedule-batch.json

segmently content-plan publications list \
  --project <projectId> \
  --strategy <strategyId> \
  --platform <platformId> \
  --has-post true
```

Open the prepared post with:

```text
/project/<projectId>/content-plan?author=<authorId>&cpTab=calendar&calMode=strategy&sid=<strategyId>&post=<postId>
```

Manual UI finish:

1. Open the post details modal.
2. In the platform publishing section, connect the external account if needed.
3. Select the publishing destination, such as a Page or account.
4. Review post text and link.
5. Click the platform publish action.
6. Click Check status and confirm post ID/permalink.

## Article Draft Review And Publish

Goal: export or create a Flexible Layout article draft, review every mutation,
and publish only the approved draft.

Start with discovery and export instead of assuming an article id or alias is
new:

```bash
segmently content-plan articles list \
  --project <projectId> --status draft --limit 100

segmently content-plan articles list \
  --project <projectId> --status published --limit 100

segmently content-plan articles get <articleId> \
  --project <projectId> --output article.before.json
```

Edit a copy as `article.after.json`, then preview and apply it:

```bash
segmently content-plan articles apply \
  --project <projectId> --article-id <articleId> \
  --file article.after.json --dry-run

segmently content-plan articles apply \
  --project <projectId> --article-id <articleId> \
  --file article.after.json

segmently content-plan articles get <articleId> \
  --project <projectId> --output article.readback.json
```

Preview publication separately, then publish and verify the returned public and
config URLs:

```bash
segmently content-plan articles publish <articleId> \
  --project <projectId> --dry-run

segmently content-plan articles publish <articleId> \
  --project <projectId>
```

The same dry-run-first rule applies to `articles create`, `clone`, and
`add-image`. For reusable `article-blocks`, delegate to the packaged
`segmently-cli-articles` skill; this Content Plan workflow owns the surrounding
draft/readback lifecycle.

## Official X Research, Engagement, And Manual Send

Goal: explicitly research X, prepare one human-reviewed reply or publication,
and send only after dry-run and exact confirmation. Saved sources and Calendar
dates never trigger provider traffic.

Start with safe status and usage reads:

```bash
segmently capabilities
segmently content-plan x status --project <projectId>
segmently content-plan x usage --project <projectId> --period month
```

Continue only when capabilities advertises both the X research/listening family
and the engagement/publication delivery family for the selected environment.

If disconnected, an interactive user completes OAuth:

```bash
segmently content-plan x connect --project <projectId> --open --wait
```

Preview a bounded paid read before executing it:

```bash
segmently content-plan x posts search \
  --project <projectId> \
  --query "onboarding friction -is:retweet" \
  --audience <audienceId> \
  --limit 25 \
  --max-cost-usd 0.50 \
  --dry-run

# Repeat without --dry-run only after reviewing query and estimate.
```

For durable listening, save a source, preview the explicit refresh, then run it:

```bash
segmently content-plan x listening queries save \
  --project <projectId> \
  --name "Onboarding friction" \
  --kind search \
  --query "onboarding friction -is:retweet" \
  --audience <audienceId>

segmently content-plan x listening queries refresh <queryId> \
  --project <projectId> --max-pages 1 --limit 50 \
  --max-cost-usd 0.25 --dry-run

segmently content-plan x listening queries refresh <queryId> \
  --project <projectId> --max-pages 1 --limit 50 \
  --max-cost-usd 0.25
```

Review and approve a reply. Approval stores a hash but sends nothing:

```bash
segmently content-plan engagement list \
  --project <projectId> --platform twitter --status pending

segmently content-plan engagement approve <itemId> \
  --project <projectId> --text "Reviewed reply text"

segmently content-plan engagement reply-x <itemId> \
  --project <projectId> --max-cost-usd 0.25 --dry-run

segmently content-plan engagement reply-x <itemId> \
  --project <projectId> \
  --confirm '<projectId>:<itemId>:<approvedContentHash>'
```

For a Calendar publication, the workflow is the same separation of approval,
preview, and send. scheduledAt remains editorial metadata:

```bash
segmently content-plan publications approve <publicationId> \
  --project <projectId> --strategy <strategyId>

segmently content-plan publications publish-x <publicationId> \
  --project <projectId> --strategy <strategyId> \
  --max-cost-usd 0.25 --dry-run

segmently content-plan publications publish-x <publicationId> \
  --project <projectId> --strategy <strategyId> \
  --confirm '<projectId>:<publicationId>:<approvedContentHash>'
```

If output reports `needs_reconciliation`, do not repeat the create command:

```bash
segmently content-plan publications reconcile-x <publicationId> \
  --project <projectId> --strategy <strategyId>

# Or for a queue reply:
segmently content-plan engagement reconcile-x <itemId> --project <projectId>
```

Refresh analytics manually and compare stored snapshots without provider
traffic:

```bash
segmently content-plan x analytics sync \
  --project <projectId> --strategy <strategyId> \
  --publication <publicationId> --max-cost-usd 0.25 --dry-run

segmently content-plan x analytics compare \
  --project <projectId> --group-by pillar
```

Required safety outcome: no background polling, timed send, automatic reply,
like, follow, or direct message is introduced by this workflow.

## Creator Profile Update

Goal: update creator pillars and per-platform post templates.

```bash
segmently content-plan profile export \
  --project <projectId> \
  --author <authorId> \
  --platform linkedin,x \
  --output creator-profile.json

# Edit creator-profile.json.

segmently content-plan profile apply \
  --project <projectId> \
  --file creator-profile.json \
  --dry-run

segmently content-plan profile apply \
  --project <projectId> \
  --file creator-profile.json
```

Use focused `pillars apply` or `post-templates apply` when only one part
changes.

## Pillar Source Reanalysis

Goal: ask the existing Content Plan AI flow to reconsider one pillar from newly
selected author posts without silently overwriting the current pillar first.

```bash
segmently content-plan pillars list \
  --project <projectId> --author <authorId>

segmently content-plan pillars reanalyze-sources <pillarId> \
  --project <projectId> --author <authorId> \
  --file pillar-reanalysis.json --wait
```

`pillar-reanalysis.json` contains the current pillar plus the newly selected
source posts. Treat the result as an AI task outcome: if `--wait` fails,
cancels, or times out, the CLI exits non-zero. Without `--wait`, follow the
returned `followUp` command. Review the returned proposal before applying any
pillar manifest, then verify with `pillars list`.

## Strategy Draft Review Loop

Goal: generate an editable strategy draft, review or patch it, and approve it
without bypassing dry-run boundaries.

```bash
segmently content-plan strategies preflight \
  --project <projectId> --author <authorId> --user-id <uid> \
  --file strategy-planning.json

segmently content-plan strategies draft create \
  --project <projectId> --author <authorId> --user-id <uid> \
  --file strategy-planning.json --dry-run

segmently content-plan strategies draft create \
  --project <projectId> --author <authorId> --user-id <uid> \
  --file strategy-planning.json --wait
```

Patch or regenerate only after reading the created strategy id:

```bash
segmently content-plan strategies draft patch <strategyId> \
  --project <projectId> --author <authorId> \
  --file strategy-draft-patch.json --dry-run

segmently content-plan strategies draft approve <strategyId> \
  --project <projectId> --author <authorId> --user-id <uid> \
  --dry-run

segmently content-plan strategies draft approve <strategyId> \
  --project <projectId> --author <authorId> --user-id <uid> \
  --wait
```

`draft regenerate` follows the same preview-then-`--wait` pattern. Finish with:

```bash
segmently content-plan strategies get <strategyId> \
  --project <projectId> --include-posts --output strategy.json

segmently content-plan strategies audit <strategyId> \
  --project <projectId> --required-platform linkedin,x
```

## Topic To Research To Post

Goal: operate one topic from CLI, add angles, run research phases, then launch
post generation for one LinkedIn cell.

```bash
segmently content-plan topics get <topicId> \
  --project <projectId> \
  --output topic.json

segmently content-plan topics platforms add <topicId> \
  --project <projectId> \
  --author <authorId> \
  --platform linkedin \
  --dry-run

segmently content-plan topics platforms add <topicId> \
  --project <projectId> \
  --author <authorId> \
  --platform linkedin
```

Generate or manually maintain aspects:

```bash
segmently content-plan topics aspects generate <topicId> \
  --project <projectId> \
  --author <authorId> \
  --count 4 \
  --mode append \
  --instruction "Create cover, body, proof, and CTA angles" \
  --wait

segmently content-plan topics aspects list <topicId> \
  --project <projectId> \
  --author <authorId>
```

For manual repair, export the aspect list, edit it, then replace. `apply --file`
accepts the exact `aspects list` output (`{ "aspects": [...] }`) as well as a
bare array or `{ "postBreakdown": [...] }` — edit only the canonical fields
`aspectKey` / `aspectLabel` / `aspectAngle` (shape:
`manifests.md > Topic Aspects Manifest`). Full safe sequence:

```bash
# 1. Export current state (this exact file can be fed back to apply)
segmently content-plan topics aspects list <topicId> \
  --project <projectId> \
  --author <authorId> \
  > aspects.json

# 2. Edit aspects.json, then dry-run and read changedFields:
#    changedFields: [] = no-op (nothing to write, still success)
segmently content-plan topics aspects apply <topicId> \
  --project <projectId> \
  --author <authorId> \
  --file aspects.json \
  --dry-run

# 3. Real apply
segmently content-plan topics aspects apply <topicId> \
  --project <projectId> \
  --author <authorId> \
  --file aspects.json

# 4. MANDATORY readback — also the ONLY correct move after auth_required or a
#    network error on step 3: never blindly re-run the apply; list first,
#    compare, re-apply only if the write did not land.
segmently content-plan topics aspects list <topicId> \
  --project <projectId> \
  --author <authorId>
```

Aspects are user-visible in the topic's Overview tab (PostBreakdownEditor).
After a repair, confirm the labels/angles actually render at
`/project/{projectId}/content-plan?cpTab=backlog` — a CLI readback echoes what
was stored, not what the UI renders.

Attach manual source material before research or post generation when the
operator already has text, a URL, a quote, or support evidence. Post generation
reads these resources from `projects/{projectId}/topics/{topicId}/resources`
and includes them as `Topic resources`.

```bash
segmently content-plan topics generate \
  --project <projectId> \
  --author <authorId> \
  --count 1 \
  --source-file source-note.txt \
  --source-url https://example.com/source \
  --model gemini-3-flash-preview \
  --wait

segmently content-plan topics drafts list \
  --project <projectId> \
  --author <authorId> \
  --generation <generationId>

segmently content-plan topics accept <generationId> \
  --project <projectId> \
  --author <authorId> \
  --accepted <topicId>

segmently content-plan topics resources add <topicId> \
  --project <projectId> \
  --author <authorId> \
  --type link \
  --content-file source-note.txt \
  --source-url https://example.com/source \
  --reliability verified

segmently content-plan topics resources list <topicId> \
  --project <projectId> \
  --author <authorId>
```

Run research one phase at a time when the operator wants control:

```bash
segmently content-plan research brief <topicId> \
  --project <projectId> \
  --author <authorId> \
  --title "LinkedIn angle research" \
  --focus-kind aspect \
  --aspect-key cover

segmently content-plan research phase get <runId> brief \
  --project <projectId> \
  --author <authorId> \
  --output brief.json

# Edit brief.json, then patch the changed fields.
segmently content-plan research phase patch <runId> brief \
  --project <projectId> \
  --author <authorId> \
  --file brief-patch.json \
  --dry-run

segmently content-plan research execute <runId> \
  --project <projectId> \
  --author <authorId> \
  --provider perplexity \
  --depth deep

segmently content-plan research analyze <runId> \
  --project <projectId> \
  --author <authorId> \
  --model gemini-2.5-pro

segmently content-plan research active <runId> \
  --project <projectId> \
  --author <authorId> \
  --active true
```

Use run-all when no phase editing is needed:

```bash
segmently content-plan research run-all <topicId> \
  --project <projectId> \
  --author <authorId> \
  --title "LinkedIn angle research"

# research launch commands return runId, not taskId.
segmently content-plan research wait <runId> \
  --project <projectId> \
  --author <authorId>
```

Launch post generation. COPE uses master + derivative; direct bypasses the
master when the platform mechanics should own the writing. Both commands return
`taskId`; read the backend task before deciding whether generation succeeded.

```bash
segmently content-plan posts generate \
  --project <projectId> \
  --author <authorId> \
  --topic <topicId> \
  --platform linkedin \
  --cell-mode single \
  --aspect-key cover \
  --method cope \
  --apply-mode auto_apply_topic \
  --asset-mode plan_only \
  --wait

segmently content-plan posts generate \
  --project <projectId> \
  --author <authorId> \
  --topic <topicId> \
  --platform linkedin \
  --cell-mode single \
  --aspect-key body \
  --method direct \
  --apply-mode auto_apply_topic \
  --asset-mode text_only \
  --wait

segmently tasks get <taskId> \
  --project <projectId>
```

With `--wait`, failed, cancelled, and timed-out tasks produce a non-zero exit;
do not continue to readback as if they completed. Without `--wait`, use the
returned `taskState: "pending"` and copyable `followUp` command to reach a
terminal result first.

Verify:

```bash
segmently content-plan research list \
  --project <projectId> \
  --author <authorId> \
  --topic <topicId>

segmently content-plan posts list \
  --project <projectId> \
  --author <authorId> \
  --topic <topicId> \
  --platform linkedin
```

If the task used `--apply-mode draft_review`, check
`task.result.artifacts[]`. Those generated drafts may live under
`post_generations/{taskId}/generatedPosts` until an operator applies them; they
will not necessarily appear in `content-plan posts list`, which reads canonical
`content_posts`.

Use the draft commands when the output is still in the review collection:

```bash
segmently content-plan posts drafts list \
  --project <projectId> \
  --generation <generationId> \
  --include-slots

segmently content-plan posts resolve <draftPostId> \
  --project <projectId> \
  --author <authorId> \
  --output resolved-post.json
```

## Repair One Generated Post Asset Slot

Goal: change a generated post visual without rerunning the whole post.

Start by resolving the post and listing slots. This works for canonical
`content_posts`, sprint posts, post examples, and
`post_generations/*/generatedPosts` drafts.

```bash
segmently content-plan posts resolve <postId> \
  --project <projectId> \
  --author <authorId> \
  --output post.json

segmently content-plan posts assets slots list <postId> \
  --project <projectId> \
  --author <authorId>

segmently content-plan posts assets slots get <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --output slot.json
```

If the prompt is wrong, patch only that slot first:

```bash
segmently content-plan posts assets slots patch-prompt <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --prompt-file slot-prompt.txt \
  --dry-run

segmently content-plan posts assets slots patch-prompt <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --prompt-file slot-prompt.txt
```

Generate a new experiment for only that slot. Use a stable
`--experiment-id` when the operator wants to select it immediately after the
task completes. By default, `slots generate` inherits the slot experiment's
stored prompt package, including aspect ratio, image size, model/provider, and
reference images. Add `--prompt-file`, `--aspect-ratio`, `--reference-image`,
or model flags only when intentionally overriding that package for an eval.

```bash
segmently content-plan posts assets slots generate <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --experiment-id <experimentId> \
  --wait

segmently content-plan posts assets slots select <postId> <slotKey> <experimentId> \
  --project <projectId> \
  --author <authorId> \
  --dry-run

segmently content-plan posts assets slots select <postId> <slotKey> <experimentId> \
  --project <projectId> \
  --author <authorId>
```

Shortcut: add `--select --wait --experiment-id <experimentId>` to
`slots generate` when the new experiment should become selected only after a
completed task.

When the entire visual plan is missing or stale, regenerate the brief/slots
before operating one slot:

```bash
segmently content-plan posts assets plan <postId> \
  --project <projectId> \
  --author <authorId> \
  --mode plan_only \
  --wait

segmently content-plan posts assets regenerate-brief <postId> \
  --project <projectId> \
  --author <authorId> \
  --asset-mode plan_only \
  --wait
```

## Full Post QA Loop

Goal: run one post from generation through visual validation and targeted image
repair without using the UI as the primary control surface.

Preflight the author and Google model setup first:

```bash
segmently content-plan authors default \
  --project <projectId>

segmently content-plan models available \
  --project <projectId>

segmently content-plan models get \
  --project <projectId>
```

Generate one post and let the backend create the initial design brief and
asset slots. Use `plan_only` when the operator wants to review prompts before
spending image-generation credits; use `plan_and_generate` for a full smoke.

```bash
segmently content-plan posts generate \
  --project <projectId> \
  --author <authorId> \
  --topic <topicId> \
  --platform linkedin \
  --cell-mode single \
  --aspect-key <aspectKey> \
  --method direct \
  --apply-mode auto_apply_topic \
  --asset-mode plan_only \
  --wait

segmently tasks get <taskId> \
  --project <projectId>
```

Resolve the generated post and inspect its brief/asset slots. Use `brief get`
for the focused storyboard/slot package and `preview` for selected image URLs.
`slots get` returns the raw slot prompt package and experiments.

```bash
segmently content-plan posts list \
  --project <projectId> \
  --author <authorId> \
  --topic <topicId> \
  --platform linkedin

segmently content-plan posts resolve <postId> \
  --project <projectId> \
  --author <authorId> \
  --output post.json

segmently content-plan posts assets brief get <postId> \
  --project <projectId> \
  --author <authorId> \
  --output asset-brief.json

segmently content-plan posts assets slots list <postId> \
  --project <projectId> \
  --author <authorId>

segmently content-plan posts assets slots get <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --output slot.json

segmently content-plan posts assets preview <postId> \
  --project <projectId> \
  --author <authorId>
```

If the whole visual brief is off, regenerate the brief and all slot prompts.
If only one image prompt is off, ask the CLI to regenerate that slot prompt or
manually patch it, then generate one new experiment.

```bash
segmently content-plan posts assets regenerate-brief <postId> \
  --project <projectId> \
  --author <authorId> \
  --asset-mode plan_only \
  --wait

segmently content-plan posts assets slots regenerate-prompt <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --instruction "Keep the same design system but make the proof diagram clearer" \
  --model gemini-3-flash-preview \
  --dry-run

segmently content-plan posts assets slots patch-prompt <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --prompt-file slot-prompt.txt \
  --dry-run

segmently content-plan posts assets slots generate <postId> <slotKey> \
  --project <projectId> \
  --author <authorId> \
  --model gemini-3.1-flash-image-preview \
  --experiment-id <experimentId> \
  --select \
  --wait
```

Use batch generation when the brief already contains multiple slots and the
operator wants to burn one pass across all selected slots:

```json
{
  "slots": [
    { "slotKey": "cover", "model": "gemini-3.1-flash-image-preview" },
    { "slotKey": "body_1", "model": "gemini-3.1-flash-image-preview" }
  ]
}
```

```bash
segmently content-plan posts assets slots batch-generate <postId> \
  --project <projectId> \
  --author <authorId> \
  --file slot-batch.json \
  --select \
  --wait
```

Final verification:

```bash
segmently content-plan posts assets slots get <postId> <slotKey> \
  --project <projectId> \
  --author <authorId>

segmently content-plan posts resolve <postId> \
  --project <projectId> \
  --author <authorId> \
  --output post-after-assets.json
```

For `--apply-mode draft_review`, apply accepted drafts after review:

```bash
segmently content-plan posts accept <generationId> \
  --project <projectId> \
  --author <authorId> \
  --accepted <draftPostId> \
  --scope topic \
  --topic <topicId>
```

Remaining CLI limitation in this loop: `posts assets regenerate-text` bridges
to the full `regenerate-post` endpoint, but that endpoint still returns a clear
conflict when the post lacks stored generation context.

## Design Profile Transfer Between Projects

Goal: copy an approved design profile and its references to another project.

```bash
segmently content-plan designs export linkedin \
  --project <sourceProjectId> \
  --author <sourceAuthorId> \
  --profile-key carousel_portrait \
  --profile-id <sourceProfileId> \
  --output design.json

segmently content-plan designs apply linkedin \
  --project <targetProjectId> \
  --author <targetAuthorId> \
  --profile-key carousel_portrait \
  --profile-id <targetProfileId> \
  --file design.json \
  --references upload \
  --dry-run

segmently content-plan designs apply linkedin \
  --project <targetProjectId> \
  --author <targetAuthorId> \
  --profile-key carousel_portrait \
  --profile-id <targetProfileId> \
  --file design.json \
  --references upload
```

Use `--references upload` when the references should be copied into target
project storage. Use `--references keep` only when the URLs already belong to
the target project or should intentionally remain external.

## Full Design-System Package Workflow

Goal: inspect, transfer, and optionally activate one multi-format design-system
package while keeping reference policy and runtime activation explicit.

Discover the current package/profile map and export the selected package:

```bash
segmently content-plan design-systems list <platformId> \
  --project <sourceProjectId> --author <sourceAuthorId> \
  --include-profiles

segmently content-plan design-systems export <platformId> \
  --project <sourceProjectId> --author <sourceAuthorId> \
  --package-id <sourcePackageId> \
  --output package.json
```

Inspect how the package resolves for concrete platform formats without running
generation:

```bash
segmently content-plan design-systems inspect <platformId> \
  --project <sourceProjectId> --author <sourceAuthorId> \
  --package-id <sourcePackageId> \
  --format-ids <formatIdA>,<formatIdB> \
  --output package.inspect.json
```

For a target project, keep the exported package non-current by default. Preview
reference transfer and target identity, then apply:

```bash
segmently content-plan design-systems apply <platformId> \
  --project <targetProjectId> --author <targetAuthorId> \
  --package-id <targetPackageId> \
  --file package.json \
  --references upload \
  --dry-run

segmently content-plan design-systems apply <platformId> \
  --project <targetProjectId> --author <targetAuthorId> \
  --package-id <targetPackageId> \
  --file package.json \
  --references upload
```

Use `--references keep` only when URLs intentionally remain valid in the target
context. A non-prod source manifest imported into prod may require the exact
`--confirm-target` value returned by dry-run.

Activate later as a separate reviewed mutation:

```bash
segmently content-plan design-systems set-current <platformId> \
  --project <targetProjectId> --author <targetAuthorId> \
  --package-id <targetPackageId> --dry-run

segmently content-plan design-systems set-current <platformId> \
  --project <targetProjectId> --author <targetAuthorId> \
  --package-id <targetPackageId>
```

Verify the applied package and each resolved format:

```bash
segmently content-plan design-systems list <platformId> \
  --project <targetProjectId> --author <targetAuthorId> \
  --include-profiles

segmently content-plan design-systems inspect <platformId> \
  --project <targetProjectId> --author <targetAuthorId> \
  --package-id <targetPackageId>
```

## Design References As New Variant

Goal: make uploaded reference images visible in the Design tab without changing
runtime generation.

```bash
segmently assets upload-image ./cover.png \
  --project <projectId> \
  --folder content-plan-design-references/linkedin/carousel_portrait/<slug> \
  --name cover \
  --asset

segmently content-plan designs export linkedin \
  --project <projectId> \
  --author <authorId> \
  --profile-key carousel_portrait \
  --profile-id <currentProfileId> \
  --output current-design.json
```

Edit `current-design.json`:

- set `profile.profileId` to a new stable ID;
- set `profile.name` and `profile.description`;
- set `profile.setCurrent` to `false`; this is required when the source export
  came from the current profile, because leaving `--set-current` off does not
  override `profile.setCurrent: true` carried inside a transfer manifest;
- replace `visualReferences` with uploaded URLs, names, roles, instructions,
  MIME types, and optional `textBudgets`;
- keep `assetManifest.items[].action` as `keep` when URLs already point to the
  target project CDN.

```bash
segmently content-plan designs apply linkedin \
  --project <projectId> \
  --author <authorId> \
  --profile-key carousel_portrait \
  --profile-id <newProfileId> \
  --file current-design.json \
  --references keep \
  --dry-run

segmently content-plan designs apply linkedin \
  --project <projectId> \
  --author <authorId> \
  --profile-key carousel_portrait \
  --profile-id <newProfileId> \
  --file current-design.json \
  --references keep

segmently content-plan designs list linkedin \
  --project <projectId> \
  --author <authorId> \
  --include-profiles
```

Dry-run checks:

- `action` is `would_create` or `would_update` as expected;
- `referenceCount` matches the manifest;
- `references.block` is `0`;
- `setCurrent` is `false` unless runtime generation should change.

UI verification:

Open `/project/<projectId>/content-plan/platform/<platformId>?author=<authorId>&tab=design`,
click the publication type card, then select the variant. The outer card
preview updates only when the variant is current.

## Make A Design Variant Current

Switch runtime generation with the dedicated activation command; do not
re-import an unchanged profile only to make it current:

```bash
segmently content-plan designs set-current linkedin \
  --project <projectId> \
  --author <authorId> \
  --profile-key carousel_portrait \
  --profile-id <profileId> \
  --dry-run

segmently content-plan designs set-current linkedin \
  --project <projectId> \
  --author <authorId> \
  --profile-key carousel_portrait \
  --profile-id <profileId>

segmently content-plan designs list linkedin \
  --project <projectId> \
  --author <authorId> \
  --include-profiles
```

Prefer a dry-run first because this changes which profile generation uses.
