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

## Agent Semantic Step

Read the customer's wording as a support intent, not as a regex problem. The
customer may use incomplete, mixed, misspelled, or non-product vocabulary.

Choose one or more catalog items from the shipped files:

- `references/scenarios.md` for broad launch scenarios and customer phrasing.
- `references/guide-evidence.json` for guide keys, article aliases, article
  URLs, section text, screenshot coverage, and concrete image URLs.
- `references/help-article-reference.json` for Screen Editor article URLs,
  section anchors, and setting-level screenshots.
- `references/backends.md` and `runtime/do-action-reference.json` for whether a
  selected intent can be TEACH, SHOW, CLI DO, E2E/browser DO, or HANDOFF.

After selecting likely articles/guides, study the selected article material
before writing the answer:

- First read the returned shipped guide sections (`answer.instructions[]`,
  `guidance.guides[].textSections`, `articleReferences`, image URLs, and section
  anchors). These sections are answer material, not just citations.
- If those shipped sections do not contain enough detail for the customer's
  question, run `article-fetch` / `segmently-cli-articles` read-only for the
  selected `articleAlias` or `articleId` and use the fetched article sections as
  additional answer material.
- Do not fill article gaps from general Segmently assumptions. If the shipped
  sections plus read-only article fetch still do not cover the question, say
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
  --guideKeys "<guideKey1>,<guideKey2>" \
  --scenarioId "<scenario-id>"
```

Use `--mode show` when the customer asks to be shown where something is, and
`--mode article-fetch` when they ask for the full article. Use `--actionId` only
after the model has selected a real action from `runtime/do-action-reference.json`.

Do not use:

```bash
node runtime/customer-response-runner.mjs --prompt "<customer request>"
```

as the live customer routing path. That raw prompt path is a debug-only
compatibility fallback and regression surface for known phrasing. Primary
customer routing is model-selected catalog routing with `--guideKeys` and, for
DO, `--actionId`.

Treat the returned contract as authoritative for:

- `answer.publicArticleLinks`
- `answer.imageUrls`
- `answer.customerVisibleGuideAssets`
- `answer.showDoOptions`
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
