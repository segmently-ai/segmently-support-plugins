# Content Plan CLI Manifests

Use this file for JSON structures and fields.

## CLI 1.0.0 Validation Boundary

The CLI validates these six manifest-backed surfaces before making any network
request:

1. `content-plan bootstrap apply --file`;
2. `content-plan topics apply --file`;
3. `content-plan topics aspects apply --file`;
4. `content-plan research phase patch --file`;
5. `content-plan posts generate --file`;
6. `content-plan designs apply --file`.

Validation errors identify the JSON path and distinguish unknown fields from
type mismatches. Fix the manifest instead of bypassing validation. For bootstrap
only, `--skip-validation` bypasses the manifest validator but never the platform
catalog preflight.

## Full Bootstrap Manifest

Use this shape with `content-plan bootstrap validate|plan|apply|verify` when a
project needs deterministic Content Plan setup from one file. The current
bootstrap orchestrator applies top-level `author`, `platforms`, `strategy`,
`posts`, `publications`, and `schedules`. Use focused atomic commands for
pillars, themes, topic resources, and AI flows when those are needed outside
the bootstrap file.

```json
{
  "schemaVersion": "segmently.cli.content-plan-bootstrap.v1",
  "author": {
    "authorId": "author_review",
    "basePath": "authors",
    "displayName": "Review Author",
    "defaultLocale": "en-US",
    "positioning": "B2B acquisition operator"
  },
  "platforms": [
    {
      "platformId": "social",
      "displayName": "Social",
      "isActive": true,
      "voice": {
        "tone": "direct and evidence-led",
        "source": "manual",
        "isComplete": true
      }
    }
  ],
  "strategy": {
    "strategyId": "strategy_publish_demo",
    "authorId": "author_review",
    "name": "Publishing Demo Content Plan",
    "dateStart": "2026-06-22",
    "dateEnd": "2026-07-06",
    "targetPlatforms": ["social"],
    "primaryGoal": "Demonstrate social publishing readiness.",
    "sprints": [
      {
        "sprintId": "sprint_publish_demo_1",
        "dateStart": "2026-06-22",
        "dateEnd": "2026-06-28"
      }
    ]
  },
  "posts": [
    {
      "postId": "post_publish_demo_1",
      "authorId": "author_review",
      "strategyId": "strategy_publish_demo",
      "platform": "social",
      "hook": "Publishing demo post",
      "body": "This post proves Segmently can prepare a selected social update from Content Plan and publish it through a connected platform account.",
      "cta": "Review the published post evidence.",
      "sourceUrl": "https://segmently.ai/app-review/social-publishing",
      "status": "generated"
    }
  ],
  "publications": [
    {
      "publicationId": "pub_publish_demo_1",
      "strategyId": "strategy_publish_demo",
      "sprintId": "sprint_publish_demo_1",
      "contentPostId": "post_publish_demo_1",
      "platform": "social",
      "scheduledAt": "2026-06-23T08:00:00.000Z",
      "source": "manual"
    }
  ],
  "schedules": [
    {
      "postId": "post_publish_demo_1",
      "strategyId": "strategy_publish_demo",
      "sprintId": "sprint_publish_demo_1",
      "publicationId": "pub_publish_demo_1",
      "platform": "social",
      "scheduledAt": "2026-06-23T08:00:00.000Z",
      "status": "planned",
      "source": "manual"
    }
  ]
}
```

Validation rules:

- `author.authorId` is required when `author` is present.
- `platforms[].platformId` is required.
- `posts[].postId` and either `posts[].platform` or `posts[].platforms` are
  required.
- `publications[].publicationId`, `platform`, `scheduledAt`, and either
  `contentPostId` or `postId` are required.
- `schedules[].postId`, `platform`, and `scheduledAt` are required.
- Publications and schedules can inherit `strategyId` from top-level
  `strategy.strategyId`.

`bootstrap apply` writes a sibling checkpoint named
`<manifest>.bootstrap-state.json`. It contains the manifest hash and completed
operation keys; it is runtime state, not an input manifest. Preserve it for
resume, use `--state-file <path>` to relocate it, and use `--restart` only to
intentionally ignore it. A checkpoint created for different manifest content
must not be reused.

## Atomic Calendar Prep Manifests

Use these shapes with atomic commands when not using the full bootstrap
orchestrator.

`author.json`:

```json
{
  "authorId": "author_review",
  "displayName": "Review Author",
  "defaultLocale": "en-US",
  "positioning": "B2B acquisition operator"
}
```

`platform.json`:

```json
{
  "platformId": "social",
  "displayName": "Social",
  "isActive": true
}
```

`post.json`:

```json
{
  "postId": "post_publish_demo_1",
  "authorId": "author_review",
  "strategyId": "strategy_publish_demo",
  "platform": "social",
  "hook": "Publishing demo post",
  "body": "This post proves Segmently can prepare a selected social update from Content Plan and publish it through a connected platform account.",
  "cta": "Review the published post evidence.",
  "sourceUrl": "https://segmently.ai/app-review/social-publishing",
  "status": "generated"
}
```

`schedule-batch.json`:

```json
{
  "items": [
    {
      "postId": "post_publish_demo_1",
      "strategyId": "strategy_publish_demo",
      "sprintId": "sprint_publish_demo_1",
      "publicationId": "pub_publish_demo_1",
      "platform": "social",
      "scheduledAt": "2026-06-23T08:00:00.000Z",
      "status": "planned",
      "source": "manual"
    }
  ]
}
```

## Topic Aspects Manifest

`post-breakdown.json` for `topics aspects apply`. An aspect has EXACTLY three
canonical fields — `aspectKey` (stable snake_case id), `aspectLabel`
(required, non-empty; the text the UI shows), `aspectAngle` (optional hook
override). Any other key is rejected before the network call with a
did-you-mean hint (`aspect` → `aspectLabel`, `hookAngle` → `aspectAngle`,
`title` → `aspectLabel`) — never derive field names from UI column headers.
Duplicate `aspectKey` values are rejected (post generation keys master posts
by `topicId::aspectKey`).

```json
[
  {
    "aspectKey": "context",
    "aspectLabel": "Why pre-mortem matters",
    "aspectAngle": "pain-first: the launch that died in week two"
  },
  {
    "aspectKey": "method",
    "aspectLabel": "How to run one in 30 minutes"
  }
]
```

Accepted top-level shapes (all validated pre-network):

- bare array (above);
- `{ "postBreakdown": [ ... ] }`;
- the exact `aspects list` output `{ "projectId", "topicId", "aspects": [ ... ], "aspectCount" }` —
  so `aspects list > aspects.json` round-trips into `apply --file aspects.json` as-is.
- A file containing BOTH `aspects` and `postBreakdown` is an ambiguity error.

`topics aspects add --file` takes ONE aspect object (same three fields;
`aspectKey` optional — the server generates one). `topics aspects patch
<topicId> <aspectKey> --file` takes a partial object with at least one
canonical field. Mutation responses carry `changedFields`; `changedFields: []`
means the stored state was already identical — the server wrote nothing and
the command still succeeded.

## Strategy Draft Inputs

`strategy-planning.json` for `strategies preflight`, `strategies create`, or
`strategies draft create`:

```json
{
  "name": "Activation strategy",
  "dateStart": "2026-07-01",
  "dateEnd": "2026-07-31",
  "targetPlatforms": ["linkedin", "x"],
  "postsPerWeekPerPlatform": {
    "linkedin": 2,
    "x": 3
  },
  "primaryGoal": "leads",
  "contentMixPreset": "80_20",
  "sourceData": {},
  "sourceDataIds": {
    "audienceIds": [],
    "taskIds": []
  }
}
```

`strategy-draft-patch.json`:

```json
{
  "patch": {
    "primaryGoal": "Updated reviewed goal"
  }
}
```

Use the same planning file for preflight and draft creation. Dry-run every draft
create/patch/approve/regenerate operation before launching a real task.

## Pillar Source Reanalysis Input

`pillar-reanalysis.json`:

```json
{
  "currentPillar": {
    "id": "pillar_activation",
    "name": "Activation psychology",
    "summary": "How onboarding creates or loses user momentum.",
    "sourcePostIds": ["post_existing"]
  },
  "newSourcePosts": [
    {
      "postId": "post_new",
      "platformId": "linkedin"
    }
  ],
  "updatePolicy": {
    "mode": "conservative",
    "newlyAddedPostCount": 1,
    "maxNewTheses": 3
  }
}
```

`currentPillar` and at least one `newSourcePosts[].postId` are required. The
command adds the explicit `--author`, optional `--user-id`, and optional model to
the request. Reanalysis returns a task/proposal; it does not make the proposal a
reviewed canonical pillar automatically.

## Creator Profile Manifest

```json
{
  "authorId": "<authorId>",
  "basePath": "authors",
  "pillars": [
    {
      "id": "pillar_activation",
      "title": "Activation",
      "description": "What the creator repeatedly teaches about activation.",
      "status": "active"
    }
  ],
  "platforms": [
    {
      "platformId": "linkedin",
      "templates": [
        {
          "id": "template_framework_post",
          "name": "Framework post",
          "template": {
            "hook": "Short contrarian claim",
            "body": "Framework steps",
            "cta": "Question for comments"
          }
        }
      ]
    }
  ]
}
```

Use `--base-path external_authors` only for tracked creators.

## Design Profile Manifest

Design-profile apply accepts three input shapes:

- Flat editor JSON with `_schema: "segmently-design-system/v1"`.
- Skill composite JSON with `editorImport` and optional `profilePatch`.
- CLI transfer manifest with
  `schemaVersion: "segmently.cli.content-plan-design-profile.v1"`.

Transfer manifest shape:

```json
{
  "schemaVersion": "segmently.cli.content-plan-design-profile.v1",
  "source": {
    "projectId": "<sourceProjectId>",
    "authorId": "<sourceAuthorId>",
    "basePath": "authors",
    "platformId": "linkedin",
    "profileKey": "carousel_portrait",
    "profileId": "<sourceProfileId>"
  },
  "profile": {
    "profileId": "froid_neon_carousel_portrait_v1",
    "name": "Froid neon carousel portrait 4:5",
    "description": "Generated from reviewed reference images.",
    "isComplete": true,
    "setCurrent": false
  },
  "designSystem": {
    "_schema": "segmently-design-system/v1",
    "design_description": "Dark neon LinkedIn carousel system...",
    "palette_primary": "#020416",
    "palette_accent": "#8C4DFF",
    "palette_neutral": ["#020416", "#070A24", "#F7F5FF"],
    "typography_primary_font": "Bold modern grotesk / Inter-like sans",
    "typography_heading_style": "Very large readable headline",
    "typography_body_style": "Short compact explanatory lines",
    "mood_keywords": ["dark", "neon", "AI-native"],
    "illustration_style": "dark neon conceptual illustration",
    "composition_grid": "4:5 mobile carousel grid",
    "composition_spacing": "large safe margins",
    "composition_hierarchy": "cover hook, then one concept per body slide",
    "brand_motifs": ["electric violet glow", "rounded glass cards"],
    "forbidden_visuals": ["no dense paragraph copy"],
    "text_policy_mode": "render_in_model",
    "text_policy_exact_text_required": true
  },
  "visualReferences": [
    {
      "url": "https://api.segmently.ai/assets/projects/<projectId>/cli-assets/.../origin.png",
      "name": "Carousel portrait cover / AI onboarding hook",
      "role": "layout",
      "mimeType": "image/png",
      "instruction": "Use as the opening hook slide...",
      "textBudgets": [
        {
          "slot": "hero_headline",
          "textRole": "title",
          "containerSlot": "main_headline_block",
          "label": "Hero headline",
          "recommendedChars": 34,
          "maxChars": 46,
          "maxLines": 2,
          "notes": "Large lower-half headline. Avoid long unbreakable words."
        }
      ]
    }
  ],
  "assetManifest": {
    "items": [
      {
        "sourceUrl": "https://api.segmently.ai/assets/projects/<projectId>/cli-assets/.../origin.png",
        "sourceEnv": "prod",
        "name": "Carousel portrait cover / AI onboarding hook",
        "role": "layout",
        "action": "keep"
      }
    ]
  },
  "contentHash": "<optionalHash>"
}
```

Rules:

- Source IDs in a transfer manifest are hints. Always pass target `--project`,
  `--author`, `--profile-key`, and `--profile-id` explicitly.
- `profile.setCurrent: false` creates or updates a library variant. Use
  `--set-current` only when runtime generation should switch to that profile.
- CDN upload output must be copied into `visualReferences`; upload by itself is
  invisible in the Design tab.
- `visualReferences[].textBudgets[]` are per controllable text field, not per
  whole image. Decorative pseudo-text should not get a budget unless the
  generator is expected to replace it.

## Full Design-System Package Manifest

Use this shape with `content-plan design-systems apply` when one package owns a
shared visual foundation plus multiple platform profile formats:

```json
{
  "schemaVersion": "segmently.cli.content-plan-design-system-package.v1",
  "source": {
    "env": "prod",
    "projectId": "<sourceProjectId>",
    "authorId": "<sourceAuthorId>",
    "basePath": "authors",
    "platformId": "linkedin",
    "packageId": "<sourcePackageId>"
  },
  "package": {
    "packageId": "activation_system_v1",
    "name": "Activation system",
    "description": "Shared visual foundation with format-specific profiles.",
    "setCurrent": false,
    "targetProfileKeys": [
      "carousel_portrait",
      "single_image_square"
    ],
    "visualFoundation": {
      "designDescription": "Evidence-led editorial system with high-contrast hierarchy.",
      "palette": {
        "background": "#0B1020",
        "text": "#F8FAFC",
        "accent": "#7C3AED"
      }
    }
  },
  "profiles": {
    "carousel_portrait": {
      "designSystem": {
        "_schema": "segmently-design-system/v1"
      },
      "visualReferences": []
    },
    "single_image_square": {
      "designSystem": {
        "_schema": "segmently-design-system/v1"
      },
      "visualReferences": []
    }
  },
  "assetManifest": {
    "items": []
  },
  "contentHash": "<optionalHash>"
}
```

Rules:

- Export with `design-systems export` before editing an existing package.
- Keep `package.setCurrent: false` for transfer/new-variant workflows. Activate
  separately with `design-systems set-current` after apply/readback.
- Pass target `--project`, `--author`, `--package-id`, and platform explicitly;
  source ids are provenance only.
- Use `--references upload` for cross-project copies. Use `keep` only for URLs
  intentionally valid in the target context.
- Dry-run may return an exact `--confirm-target` value for a non-prod-to-prod
  import; do not invent that confirmation.
- Use `design-systems inspect` after apply to verify resolved format/profile
  context without launching AI generation.
