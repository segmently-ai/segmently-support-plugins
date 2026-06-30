# Semantic Routing Contract

Use this reference when the customer asks a free-form support question and the
right scenario is not obvious from one exact command.

The model owns the meaning step. Deterministic scripts own only evidence,
execution boundaries, and verification.

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

Prefer a small composite set over a single over-generic guide when the customer
intent naturally spans setup phases. Example: "set up Stripe subscriptions"
means Stripe connection, subscription products, and paywall plan display.

If two meanings remain plausible after reading the catalog, ask one targeted
clarification question. Do not force a deterministic fallback just because a
query contains a word like "list", "option", "subscription", or "button".

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
