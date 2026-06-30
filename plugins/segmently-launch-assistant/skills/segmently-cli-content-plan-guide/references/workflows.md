# Content Plan CLI Workflows

Use this file for end-to-end command chains.

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

Use the `uiUrl` values emitted by `bootstrap plan`, `bootstrap apply`, or
`bootstrap verify` to open the prepared author, strategy Calendar, and specific
post in the web app. A canonical post that is not linked to a publication slot
will not be convenient for reviewers to find from Calendar.

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

segmently content-plan authors set-default <authorId> \
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

For manual repair, export the aspect list, edit it, then replace with dry-run:

```bash
segmently content-plan topics aspects list <topicId> \
  --project <projectId> \
  --author <authorId> \
  > aspects.json

segmently content-plan topics aspects apply <topicId> \
  --project <projectId> \
  --author <authorId> \
  --file aspects.json \
  --dry-run
```

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

segmently content-plan topics apply <generationId> \
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

segmently content-plan research analyse <runId> \
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
  --project <projectId> \
  --output task.json
```

Verify:

```bash
cat task.json

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
  --task <taskId> \
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
segmently content-plan posts apply <generationId> \
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

Current CLI can switch runtime generation by reapplying the profile with
`--set-current`:

```bash
segmently content-plan designs apply linkedin \
  --project <projectId> \
  --author <authorId> \
  --profile-key carousel_portrait \
  --profile-id <profileId> \
  --file design.json \
  --references keep \
  --set-current \
  --dry-run
```

Prefer a dry-run first because this changes which profile generation uses.
