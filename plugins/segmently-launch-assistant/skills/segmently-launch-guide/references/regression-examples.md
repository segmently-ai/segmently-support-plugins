# Regression Examples and Proven Answer Defaults

Load this file when composing a field-level TEACH answer, an article-identity
answer, or any answer touching the cases below. Every rule here comes from a
real customer-facing regression; treat the wording requirements as binding.

## Article identity — never claim an article is missing

Never infer that an article is missing from an empty public-link field such as
`fullArticleLink: null` or `publicArticleLinks: []`. The public web URL is not
the article identity. If a row has `articleId`, `articleAlias`, `referencePath`,
or `localArticlePath`, the built-in article/guide exists and must be answered
from the shipped text plus screenshot-backed guidance. Discuss public web links
only when the customer explicitly asks for one. If the customer asks "is there
an article with pictures/screenshots?", answer yes when the built-in reference
has text plus screenshot evidence; do not volunteer that a public URL is absent.

For Screen Editor screen/block articles, use the canonical URL from the matching
row in `references/corpus-v2/article-directory.json`. Guide routing and SHOW
evidence are separate concerns and must not override the published Article URL.

Known hard failure pattern: after answering from the correct guide, do not add a
closing note that says or implies the article, guide, or ready reference is
missing. That wording is false for a built-in guide row. The only missing thing
may be a public web URL, and that is not customer-relevant unless the customer
explicitly asks for a public URL.

For a row with `articleId`, `articleAlias`, or `localArticlePath`, do not
describe the article, article URL, or guide as absent or unavailable. Use this
positive framing instead: "The built-in Segmently guide/article is available
with screenshot-backed guidance." Then cite the human guide name and, when a
stable locator helps, the customer-safe `articleAlias` or `referencePath`.
Translate that framing into the customer's language instead of copying it
verbatim. For Russian, say: "Есть встроенная статья/гайд Segmently со
скриншотами по этому разделу." Avoid English phrases like "screenshot-backed
guidance" in customer-facing Russian answers.

## Completion wording bans

Do not start an explain-only, teach-only, SHOW dry-run, CLI DO dry-run, E2E DO
dry-run, or any `completionClaim` other than `verified` /
`show-visible-browser-opened-and-screenshot-captured` answer with "done",
"готово", "готово с разбором", "подготовка завершена", "completed", or any
similar wording that implies a task was completed. Use completion wording only
after a DO runner executed and the verification read passed, or after a SHOW
runner opened a visible headed browser, focused the target control, kept the
browser open for the customer, and captured a screenshot artifact. For dry-runs
and missing-input states, start with "Разобрал запрос" / "I checked the request"
and explicitly say that execution has not started and no data was changed. When
offering to apply a value for the customer, state that the change is not
complete until it is saved and verified through the supported read-back check.

For field-level explain/teach answers, never open with "Готово", "Готово с
проверкой", "Done", or similar completion phrasing just because you found the
right built-in guide. Start with the answer itself, for example: "Да, это
настраивается в Action Bar -> Main button text style..." or "Есть встроенная
статья/гайд Segmently со скриншотами по этому разделу...".

## Button fonts — Action Bar default

For "как настроить шрифты в кнопке" / "button font", default to the built-in
Action Bar guide: article alias `help-block-action-bar`, reference path
`help-block-action-bar/screenedit-action-bar-primary-text-styles` — unless the
customer explicitly names a Paywall purchase button or Flexible Layout button.
That Action Bar guide covers font family, font weight, font size, line height,
text color, and alignment for the main button label.

In normal customer prose cite the human name **Action Bar -> Main button text
style** and the alias when useful; do not expose `screenedit-*` guide keys
unless the user is debugging the package itself. After the explanation, offer
the next executable step: a non-mutating SHOW walkthrough for their exact screen
when they provide an editor URL or project/funnel/screen target, or a DO action
when they provide the desired font family, size, weight, color, or alignment.

In Russian, ask for "ссылку на экран в редакторе" first; only then mention
"проект, воронка и экран" as an alternative. Do not say "project/funnel/screen
target" to a novice customer. The next-step offer must include both safe
execution options when the field has a supported action: "могу показать это на
вашем экране без изменений" and "могу применить конкретное значение за вас
после того, как вы дадите ссылку на экран и нужный шрифт/размер/цвет/жирность";
also mention that after applying it you will verify the saved state. Proofread
Russian customer prose so it contains no stray characters from other languages
or copy/paste artifacts.

## Paywall action selection defaults

If the customer mentions Paywall + title/headline/заголовок, prefer the
dedicated `editor.paywallBody.title.textStyle.*` action over generic
`editor.content.title.textStyle.*`; if they mention Paywall +
subtitle/подзаголовок, prefer `editor.paywallBody.subtitle.textStyle.*`.
If they mention Paywall + footer/футер/bottom/низ, purchase/buy/subscribe
button, auto-renew, restore, terms, or privacy, prefer `editor.paywallFooter.*`
actions over generic Action Bar or Content actions.

Words like "подсказка", "guide", "article", or "статья" in the same prompt are
evidence-request words, not Text Field placeholder intent unless the customer
also says input field / поле ввода / placeholder.

## List/grid typography and media defaults

For list or grid item/cell typography, the answer area is usually
**Options / опции / варианты**, not a generic "right panel" answer.

For "как добавить видео к списку" / "add video to a list", default to the
**Media** section on List screens, not to onboarding-list creation and not to
Options. The built-in guide/article is **Screen Editor: Media** with article
alias `help-block-media`. Explain that it adds one image/video block to the
list screen; if the customer means a separate video inside each individual
list option, ask that as the one clarification because that is a different
layout/customization request.

For "добавить видео в пейвол" / "add video to paywall", default to
**Paywall Media** (article alias `help-block-paywall-media`), specifically
**Show featured media**, **Image or video -> Video**, and
**Upload the featured video**. Do not route this wording to onboarding
creation or generic Media.

## Stripe subscriptions — composite answer

For "как настроить Stripe подписки" / "how to set up Stripe subscriptions",
use the resolver's Stripe subscriptions guide set. The answer must include the
public article URLs for Stripe Connect, Paywall Products, subscription
options, and Paywall Subscriptions when returned, plus concrete screenshot
image URLs for the rows that have them. Explain the split clearly: Stripe
Connect OAuth is a customer handoff; creating subscription products can be
delegated to the Segmently CLI when the customer provides product names,
prices, currency, billing intervals, and trials; attaching/checking plans on a
Paywall screen needs the funnel/screen target and verification.

## Selected-product paywall copy — three supported shapes

For selected-product paywall copy questions such as "when the user selects a
product, update the text from that product", do not answer with only standard
Paywall Subscriptions or only custom WebEmbed. Explain the three supported
shapes:

1. Ordinary Paywall Subscriptions: plan rows are linked to products and their
   plan-card labels, price, and billing period follow each row's linked
   product.
2. WebEmbed/CustomEmbed paywall: the embed that owns the Product Catalog
   should own selection and purchase, then share one aggregate
   `selected_product` variable with sibling embedded sections for labels.
3. Native Flexible Layout: Product Catalog owns selection; Text and Purchase
   Button sections link to it through "Linked to section"; empty Text title
   falls back to the selected product `descriptionLabel`; empty Purchase
   Button label falls back to `purchaseLabel`; the linked Purchase Button buys
   the selected product. Use article aliases
   `help-block-paywall-subscriptions`, `help-block-custom-html`, and
   `help-block-flexible-sections` when the resolver returns them.

For WebEmbed/CustomEmbed or Flexible Layout CLI setup, delegate to
`segmently-cli-custom-screen-guide`. Verification must include label switching
after changing the selected product and
selected-product checkout/payment intent proof.

For Flexible Layout paywalls where the customer asks whether Text
`description` and Purchase Button `purchase` labels can follow the selected
Product Catalog product, use the Flexible Sections article
`help-block-flexible-sections` and the native pattern above. If the customer
asks whether this can be configured via CLI, answer yes but delegate the work
to `segmently-cli-custom-screen-guide` for export/apply/publish/verify instead
of using a generic launch-guide scalar patch. Verification must include
default selected labels, changed selected labels, and selected-product
checkout/payment intent proof.

## Materials block shape (RU)

For any answer based on `answer.customerVisibleGuideAssets`, include a compact
customer-facing materials block. In Russian, use this shape:
"Материалы: гайд `<articleAlias>` / `<referencePath>`; картинка: <imageUrl>;
статья: <fullArticleLink when present>." If there is no public article URL, do
not hide the guide: cite the guide alias/referencePath and show the concrete
image URL. Do not expose `localArticlePath` unless the user is debugging the
package itself.

When the requested change is not currently executable by a shipped headless
action, still offer the closest safe path instead of staying silent: SHOW if
target screen context is missing, or browser/editor DO after the customer
provides the editor screen link plus the required asset/value. State the
limitation plainly and do not claim the change is done.

For Russian field-level answers, make the SHOW/DO offer explicit in plain
language: "Могу показать это на вашем экране без изменений. Если вы уже знаете
нужное значение, могу применить его за вас после ссылки на экран и значения,
затем проверю сохранённое состояние."

## Stripe connection status — mode-specific verification

Stripe project status is mode-specific. Always verify both
`segmently stripe account --mode test <projectId>` and
`segmently stripe account --mode live <projectId>` before saying whether
Stripe is connected. If test/sandbox is connected but live is not connected,
say exactly that: sandbox payments can be prepared/tested, while real live
charges still need live Stripe Connect. Never summarize this as "Stripe is not
connected" unless both modes are disconnected or the customer asked only about
the disconnected mode.
