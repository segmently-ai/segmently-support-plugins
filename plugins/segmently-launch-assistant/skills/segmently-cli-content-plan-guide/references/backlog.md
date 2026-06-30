# Content Plan CLI Backlog

These are candidate CLI improvements for making Content Plan operations easier.
Use this file only when planning product or CLI work.

## Discovery

- `content-plan designs discover <platformId> --project <projectId>
  --author <authorId>`: return the platform's CLI-backed design profile sets,
  current profile IDs, all variants, reference counts, missing requested keys,
  and Design tab URLs. This should be the source-of-truth discovery surface for
  design-system-from-reference workflows.

## Design Profile Operations

- `content-plan designs references apply <platformId> ... --images ...`: upload
  images, create visual reference rows, dry-run, and create/update a profile
  variant in one workflow.
- `content-plan designs adapt <platformId> ... --source <file>`: take one
  creative/design-system source plus a CLI-discovered target profile set and
  emit per-profile design manifests. The command should not depend on any
  skill-local hardcoded format table.
- `content-plan designs apply-all <platformId> ... --file <package.json>`:
  apply a package of per-profile manifests with a single dry-run summary and a
  single apply step after review.
- `content-plan designs apply ... --no-set-current`: explicit negative override
  for transfer manifests exported from current profiles. Today operators must
  edit `profile.setCurrent=false` in the manifest before applying a new variant.

## Topics And Social Planning

- Implemented: `content-plan authors get|apply|set-default|onboard`,
  `content-plan platforms list|get|apply`, `content-plan platforms voice
  get|apply`, `content-plan strategies get|apply|preflight|create`,
  `content-plan strategies draft create|patch|approve|regenerate`,
  `content-plan strategies sprints generate-topics`, `content-plan cadence
  get|apply`, `content-plan publications list|get|apply|patch|delete`,
  `content-plan posts create|schedule-batch`, and
  `content-plan bootstrap validate|plan|apply|verify` cover the deterministic
  empty-project and reviewer-demo bootstrap path.
- Implemented: `content-plan topics drafts list` and
  `content-plan topics apply <generationId>` cover the generated-topic review
  flow. Remaining gap: bulk upsert a list of arbitrary topic manifests with
  create/update/delete operations and a single dry-run diff.
- Implemented: `content-plan topics generate` launches backlog topic generation
  from manual text and/or URL source context. By default URLs are passed as
  source metadata without scraping; `--research-mode run_fresh|hybrid` opts into
  fresh research using the same URLs as constrained sources.
- Implemented: `content-plan topics resources import-url <topicId>` stores an
  HTTPS URL as a link resource with optional title/content/reliability fields.
  Remaining gap: fetch and summarize remote page content into the resource.
- JSON Schema manifests for topic patches, `postBreakdown[]`, research phase
  patches, and `posts generate --file` requests.

## Post And Asset Editing

- Implemented helpers that used to be gaps:
  `content-plan posts apply <generationId>`, `content-plan posts refine
  <postId>`, `content-plan posts assets brief get <postId>`,
  `content-plan posts assets preview <postId>`,
  `content-plan posts assets slots regenerate-prompt <postId> <slotKey>`,
  `content-plan posts assets slots batch-generate`, and
  `content-plan posts assets slots experiments reject|delete`.
- Implemented: `content-plan posts drafts apply-one <draftPostId>` and
  `content-plan posts drafts reject <draftPostId>` apply or reject one reviewed
  generated draft into canonical Content Plan storage from the CLI.
  Generation-level `content-plan posts apply <generationId>` also exists.
- `content-plan posts regenerate-text` / `content-plan posts regenerate-post
  <postId>`: implement true full writer rerun for an existing post when only
  the post ID is known. The current `posts assets regenerate-text` command
  bridges to the backend `/regenerate-post` endpoint, but that endpoint returns
  a clear conflict when stored `generationPlanContext` is missing. The final
  naming should separate copy-only refine from full writer+brief+asset reruns.
- `content-plan posts assets slots regenerate-prompt` currently regenerates a
  slot `promptTemplate` through project-scoped AI keys using the post brief and
  current slot as context. A deeper future version can call the exact
  storyboarding/card-visual pipeline stage for one carousel slide.
- JSON Schema manifests for post asset planning, brief regeneration, slot
  prompt patches, slot generation requests, and batch slot generation.
