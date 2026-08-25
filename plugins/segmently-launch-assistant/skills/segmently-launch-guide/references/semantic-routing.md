# Semantic Routing Contract

Use this reference when the customer asks a free-form support question and the
right scenario is not obvious from one exact command.

The model owns the meaning step. Deterministic scripts own only evidence,
execution boundaries, and verification. Raw prompt routing is debug-only:
use it for regression checks and compatibility probes, not for live customer
meaning selection.

This includes CLI DO. Do not let `segmently-launch-guide` replace
`segmently-cli-guide` or another profile skill as the reasoning layer for a
mutation. The model should select the support intent, guide keys, action id, and
owning skill; the deterministic runner should only validate that selected route
and return safe execution/verification metadata.

## Step 0 — Quick-Index Fast Path

Before loading any large index, check `references/routing-quick-index.json`.
It is a small generated file mapping common customer intents (ru+en) to a
routing decision:

- `scenario` hit → open `references/scenarios.matrix.json` and follow that
  scenario contract (backend, verify, article, evals).
- `action` hit → open `runtime/do-action-reference.json` and resolve the
  `actionId` there.
- `action-family` hit → open `runtime/do-action-reference.json` and pick the
  exact leaf action inside the family (for example
  `editor.content.title.textStyle.*`).
- `articles` hit → open `references/corpus-v2/article-directory.json` for the listed
  aliases and continue with the normal article answer path.

A quick-index hit replaces only the *search* step; the deterministic
resolution step (`customer-response-runner.mjs` with model-selected
`--articleAliases` / `--guideKeys` / `--actionId`) stays mandatory. On any miss
or doubt, fall back to the full semantic step below — the quick-index is an
accelerator, never the only route.

## Agent Semantic Step

Read the customer's wording as a support intent, not as a regex problem. The
customer may use incomplete, mixed, misspelled, or non-product vocabulary.

Choose one or more catalog items from the shipped files:

- `references/corpus-v2/article-directory.json` and
  `references/corpus-v2/article-search-index.json` are the first-pass Article
  surfaces. Search aliases, titles, reviewed summaries, and canonical section
  postings before Guide keys; retrieve at most five candidates.
- `references/corpus-v2/article-section-index.jsonl` supplies bounded canonical
  Article section refs. It contains no Guide-derived customer explanation.
- `references/corpus-v2/article-fallback/<articleAlias>.json` supplies bounded
  offline excerpts only when the selected public config fetch/hash check fails.
- `references/corpus-v2/guide-routing-index.json` maps a model-selected Guide key
  to canonical Article sections without loading SHOW evidence.
- `references/corpus-v2/guide-bindings.json` carries UI anchors, concrete SHOW
  evidence, and action IDs. Load it only for SHOW or an explicit Guide evidence
  lookup; it is not a competing knowledge corpus.
- `references/scenarios.md` for broad launch scenarios and customer phrasing.
- The Article directory is authoritative for public/config URLs and content
  hashes. Guide bindings only add UI placement and screenshot evidence.
- `references/backends.md` and `runtime/do-action-reference.json` for whether a
  selected intent can be TEACH, SHOW, CLI DO, E2E/browser DO, or HANDOFF.
- `references/capability-bindings.json` for the executable surface behind a
  selected action: owning CLI command families, safety level, related
  scenarios, test-kit helper names, and validated replay scenario refs. Use
  `references/test-kit-helper-index.json` to resolve browser helper names and
  `references/e2e-scenario-refs.json` for proven navigation step sequences
  when planning SHOW or browser DO work.

Do not search guides as a peer corpus during the first customer-facing
retrieval pass. Guides are UI placement and evidence rows. Attach at most two
bindings after Article selection for SHOW or an executable DO path. A Guide
without a valid Article section binding is a corpus validation failure, not an
authoritative answer.

After selecting likely articles/guides, study the selected article material
before writing the answer:

- Read `selectedArticles[]` and `answer.sectionRefs` from the runner. They carry
  the canonical Article identity and bounded answer material.
- Use `show.evidence` only to show where a control is. Screenshot presence is
  never proof that a requested change executed.
- If those shipped sections do not contain enough detail for the customer's
  question, run `article-fetch` / `segmently-cli-articles` read-only for the
  selected `articleAlias` or `articleId` and use the hash-verified Article as
  additional answer material.
- Do not fill article gaps from general Segmently assumptions. If the shipped
  selected sections plus read-only Article fetch still do not cover the question, say
  what coverage is missing and ask for the missing context or hand off to the
  relevant Segmently skill.

Prefer a small composite set over a single over-generic guide when the customer
intent naturally spans setup phases. Example: "set up Stripe subscriptions"
means Stripe connection, subscription products, and paywall plan display.

If two meanings remain plausible after reading the catalog, ask one targeted
clarification question. Do not force a deterministic fallback just because a
query contains a word like "list", "option", "subscription", or "button".

For "do it" / "set this" requests, choose an `actions[].id` from
`runtime/do-action-reference.json` as part of this model step. Prefer the owning
profile skill for the actual workflow:

- `segmently-cli-guide` for ordinary Segmently CLI project/funnel/screen writes;
- `segmently-cli-paywall-ab-rollout` for sandbox paywall products and A/B rollout;
- `segmently-cli-custom-screen-guide` and
  `segmently-cli-figma-webembed-import` for WebEmbed/custom screen work;
- `segmently-cli-image-upload` for CDN/image upload;
- `segmently-cli-articles` for support article reads/updates;
- `playwright-bowser` plus `segmently-test-kit` for browser/editor DO.

If no single action id is clear, ask one clarifying question. Do not use raw
prompt fallback to silently pick one.

## Deterministic Resolution Step

After selecting catalog items, ask the runner to resolve facts:

```bash
node runtime/customer-response-runner.mjs \
  --prompt "<customer request>" \
  --articleAliases "<articleAlias1>,<articleAlias2>" \
  --guideKeys "<guideKey1>,<guideKey2>" \
  --scenarioId "<scenario-id>"
```

Use `--mode show` when the customer asks to be shown where something is, and
`--mode article-fetch` when they ask for the full article. Use `--actionId` only
after the model has selected a real action from `runtime/do-action-reference.json`.
If the semantic match is an article with no guide rows, pass only
`--articleAliases`; the runner will still return `selectedArticles[]`,
Article URLs, config URLs, canonical section refs, and Article-fetch metadata.

Do not use:

```bash
node runtime/customer-response-runner.mjs --prompt "<customer request>"
```

as the live customer routing path. That raw prompt path is a debug-only
compatibility fallback and regression surface for known phrasing. Primary
customer routing is model-selected catalog routing with `--guideKeys` and, for
DO, `--actionId`.

Treat the returned contract as authoritative for:

- `selectedArticles[]`
- `answer.sectionRefs`
- `answer.grounding`
- `guideBindings`
- `action`
- `show`
- `articleFetch`
- `completionClaim`

The runner validates that selected guide keys exist and returns only shipped
customer-safe materials. It does not decide customer meaning in this mode.
If the runner returns `routingPolicy.rawPromptDebugOnly=true`, do not present the
raw prompt result as the final semantic decision. Re-run with model-selected
`--guideKeys` / `--actionId`, or ask one clarifying question if the catalog match
is still unclear.
When it returns a CLI `action.executeWith.skill`, delegate the work to that
owning skill. `runtime/cli-do-runner.mjs` is a dry-run/verification wrapper or
approved low-level smoke executor, not a replacement for the owning CLI skill's
domain reasoning.

## Customer Answer Requirements

When `answer.customerVisibleGuideAssets.mustShowInCustomerAnswer=true`, include
a compact visible materials block. In Russian:

```text
Материалы:
- Статьи: <publicArticleLink>, ...
- Картинки: <imageUrl>, ...
- Разделы: <articleAlias/referencePath>, ...
```

Do not replace actual links with "there is a guide" prose. If a selected guide
has a public article URL, show it. If it has a concrete image URL, show it. If a
guide is text-only, say that this specific guide is text-only and still show its
article URL/reference path.

## Example: Stripe Subscriptions

For "как настроить Stripe подписки?" or similarly imprecise phrasing, select:

- `integrations-stripe-connect-section`
- `stripe-connect-oauth-guidance`
- `paywall-products-list`
- `paywall-product-subscription-options`
- `screen-editor-section-paywall-subscriptions`
- `screenedit-paywall-subscriptions-items`

Then resolve:

```bash
node runtime/customer-response-runner.mjs \
  --prompt "как настроить stripe подписки?" \
  --guideKeys "integrations-stripe-connect-section,stripe-connect-oauth-guidance,paywall-products-list,paywall-product-subscription-options,screen-editor-section-paywall-subscriptions,screenedit-paywall-subscriptions-items" \
  --scenarioId "create-paywall-products"
```

The answer should explain the split:

- Stripe Connect OAuth is a customer handoff.
- Subscription products can be created through the Segmently CLI after product
  names, prices, currency, billing intervals, and trial settings are known.
- Paywall plan display/attachment needs the target funnel/screen and readback
  verification.

Include the returned article links and image URLs.
