---
name: segmently-launch-guide
description: Use this skill when a customer wants to launch a Segmently web funnel end to end — create a funnel, apply a theme, connect analytics or a Facebook/TikTok pixel, connect Stripe and create paywall products, run a sandbox test purchase, set up a custom domain, publish and go live — or asks "what's left to launch", "how do I change a setting", or "show me how to build my first funnel". It clarifies the goal, explains it in plain language, and offers to do it for them via the CLI or the editor, or hands off the steps it cannot automate.
---

# Segmently Launch Guide

This skill is the customer-facing launch assistant. It helps a customer go from an
idea to a live, paid web funnel. It is built ON TOP of the SupportFlow engine and
DELEGATES every CLI action to the existing `segmently-cli-*` skills — it never
reimplements CLI commands and never exposes anything internal.

It is intentionally **shareable** (it ships in the customer plugin). Everything in
this skill and its references is customer-safe: no internal environment names, no
admin commands, no service-tokens, no internal element identifiers, no atom ids,
no secrets.

## Built-in article and guide identity

The packaged guide corpus is the first source for customer answers:

- `references/teach-reference.json` stores the screen/block article corpus by
  customer-safe `articleAlias`, with field and leaf explanations.
- `references/guide-evidence.json` stores every authored guide row with
  `articleId`, optional `articleAlias`, stable `referencePath`, text sections,
  screenshot evidence flags, optional concrete `imageUrl`, optional public
  `fullArticleLink`, and optional `localArticlePath`.
- `references/help-article-reference.json` stores the generated Screen Editor
  help articles that have published article URLs and per-setting screenshot
  URLs. When this file has a URL for the matched `articleAlias`, include that
  URL in the customer answer. Do not reduce a published article to only its
  alias.

Never infer that an article is missing from an empty public-link field such as
`fullArticleLink: null` or `publicArticleLinks: []`. The public web URL is not
the article identity. If a row has `articleId`, `articleAlias`, `referencePath`,
or `localArticlePath`, the built-in article/guide exists and must be answered
from the shipped text plus screenshot-backed guidance. Discuss public web links
only when the customer explicitly asks for one. If the customer
asks "is there an article with pictures/screenshots?", answer yes when the
built-in reference has text plus screenshot evidence; do not volunteer that a
public URL is absent.
For Screen Editor screen/block articles, prefer the URL from
`help-article-reference.json` over `guide-evidence.fullArticleLink` because the
feature-guide row and the published Content Plan article are separate records.
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

For "как настроить шрифты в кнопке" / "button font", default to the built-in
Action Bar guide: article alias `help-block-action-bar`, reference path
`help-block-action-bar/screenedit-action-bar-primary-text-styles`. In normal
customer prose cite the human name **Action Bar -> Main button text style** and
the alias when useful; do not expose `screenedit-*` guide keys unless the user is
debugging the package itself. After the explanation, offer the next executable
step: a non-mutating SHOW walkthrough for their exact screen when they provide
an editor URL or project/funnel/screen target, or a DO action when they provide
the desired font family, size, weight, color, or alignment.
In Russian, ask for "ссылку на экран в редакторе" first; only then mention
"проект, воронка и экран" as an alternative. Do not say "project/funnel/screen
target" to a novice customer. The next-step offer must include both safe
execution options when the field has a supported action: "могу показать это на
вашем экране без изменений" and "могу применить конкретное значение за вас
после того, как вы дадите ссылку на экран и нужный шрифт/размер/цвет/жирность";
also mention that after applying it you will verify the saved state. Proofread
Russian customer prose so it contains no stray characters from other languages
or copy/paste artifacts.
For field-level explain/teach answers, never open with "Готово", "Готово с
проверкой", "Done", or similar completion phrasing just because you found the
right built-in guide. Start with the answer itself, for example: "Да, это
настраивается в Action Bar -> Main button text style..." or "Есть встроенная
статья/гайд Segmently со скриншотами по этому разделу...".

## The interactive loop (always follow this order)

Before writing any customer-facing answer for a launch, integration, product,
paywall, screen-setting, SHOW, DO, or article request, use the model to classify
the customer's meaning over the shipped catalog. Load
`references/semantic-routing.md` for the contract, then select the smallest
useful set of scenario ids, guide keys, and action ids from the shipped
references.

After the model selects the catalog items, run deterministic evidence
resolution from this skill directory:

```bash
node runtime/customer-response-runner.mjs --prompt "<customer request>" --guideKeys "<guideKey1>,<guideKey2>" --scenarioId "<scenario-id>"
```

Use the returned contract as the source of truth for `guidance.guides`,
`answer.publicArticleLinks`, `answer.imageUrls`,
`answer.customerVisibleGuideAssets`, `show`, `action`, and `completionClaim`.
The runner validates materials and execution boundaries; it does not own
semantic understanding in `--guideKeys` mode. Raw
`node runtime/customer-response-runner.mjs --prompt "<customer request>"` is only
a compatibility fallback/regression surface for known phrasing, not the primary
meaning step for unknown customer wording.

When `answer.customerVisibleGuideAssets.mustShowInCustomerAnswer=true`, the
customer answer must include a compact visible materials block with article
URL(s), concrete image URL(s) when present, and the customer-safe guide alias or
reference path. Do not replace those links with prose like "there is a guide";
show the links.

1. **Clarify the scenario.** Map the customer's words to a launch scenario / leg
   (see `references/scenarios.md`). If the request is ambiguous, ask ONE targeted
   clarification question, then proceed.
2. **Explain in plain language.** Describe what the leg does and what "done" looks
   like, in human terms. Link the matching help article when one exists. For
   field-level questions ("how do I change the list cell font?", "where is
   spacing?", "what does this paywall row setting do?"), resolve the screen, block,
   field, and article from `references/teach-reference.json` first. Never describe
   UI by internal element identifiers — describe what the customer sees.
3. **Offer to do it for them.** Pick the backend for the leg (see
   `references/backends.md`):
   - **CLI** — delegate to the owning `segmently-cli-*` skill for a headless change.
   - **Editor (e2e)** — drive the customer's own project in the browser (DO mode),
     or walk them through it step by step (TEACH mode).
   - **Handoff** — for steps that cannot be automated (Stripe Connect OAuth, DNS
     for a custom domain), give the exact manual steps, then run the read-only
     **verify**. Never claim a handoff step is done automatically.
4. **Verify.** After any change, run the read that proves it (see the verify column
   in `references/backends.md`) and tell the customer the new state.

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

## Knowing where the project is — "what's left to launch"

Before planning, understand the project's current state so you only do what's
missing. Compose the customer-safe CLI **reads** into a milestone snapshot, then
diff it against the goal:

- `references/project-status.md` lists each milestone, the read that observes it,
  and the launch goal it belongs to.
- A project can pursue several goals at once (e.g. first-value launch + add an
  upsell). The same snapshot answers "what's left" for each.
- Report progress as: done milestones, the next missing milestone, and the
  shortest next action. Do not re-do milestones that are already done.

## Session project context

Use the packaged `runtime/session-context.mjs` layer to remember the customer's
current project across related questions. The state schema and commands are
documented in `references/session-context.md`.

- The context may store only a project id, project name, source, and lightweight
  project history. Never store tokens, credentials, screenshots, or customer
  content.
- This is the shared project-context layer for Codex and Claude plugin runtimes.
  Do not create a second context file or store project state inside a companion
  skill.
- If the customer gives a project link/id, treat it as explicit for the current
  request. Ask whether to save it as the current project, then save it with
  `node runtime/session-context.mjs set-current-project --projectId <id> --projectName "<name>"`.
- If the customer does not give a project but the runner reports
  `sessionContext.usingCurrentProject=true`, use that project and tell the
  customer which project is being used. Do not ask for `projectId` again.
- If SHOW/DO needs a project and the runner reports
  `sessionContext.askToSetCurrentProject=true`, ask once for a project link/id
  and the visible project name, then save it. Continue to ask only for remaining
  target inputs such as funnel, version, screen, value, file, or video source.
- If the customer says this request is for a different project, use the explicit
  project for the request and offer to update the saved current project.

## Authentication (one authorization, no passwords)

- The customer authorizes once with the CLI: `segmently auth login`. This single
  login unlocks BOTH backends — CLI commands AND driving the customer's own
  project in the browser (the editor backend reuses the same credential).
- Before any live SHOW or editor/E2E DO run, perform the auth preflight instead
  of waiting for the browser to fail:
  1. Run `segmently auth status` for the target environment.
  2. If status reports `auth_required`, "not authenticated", or "not logged in",
     run `segmently auth login`, let the customer complete the browser approval
     if the CLI asks for it, then re-run `segmently auth status`.
  3. Re-run the same SHOW/DO runner. The runner will use
     `runtime/browser-auth-bridge.mjs` to seed the browser session from the
     authorized CLI credential.
- Never ask for a password and never type one into the app. If a runner reports
  `auth_required` or returns `completionClaim=show-auth-preflight-required` /
  `completionClaim=auth-preflight-required`, treat it as a recoverable preflight
  step: run the returned `authPreflight.statusProbe`, run
  `authPreflight.login` if needed, then retry the returned command. Do not answer
  the customer with only "run login yourself" unless the browser authorization
  genuinely requires their manual approval or the local environment blocks
  interactive login.
- Never print, echo, or store token values, refresh tokens, or credentials. The
  customer's token lives in their keychain (the plugin's `userConfig`), not in any
  file or chat message.
- Production is the customer default. Do not mention non-production environments.

## Runtime tool preflight (CLI + browser)

Packaged runners expose a machine-readable `toolPreflight` contract. Use it
before live SHOW, CLI DO, or E2E/browser DO execution. This is separate from
`authPreflight`: auth proves the customer is logged in, while `toolPreflight`
proves the required local tools are installed and usable.

- The plugin does not install host tooling. For first setup or after an update,
  make sure the customer machine has Node.js 20 LTS or newer with `npm` and
  `npx` on PATH. The machine-readable preflight includes `node --version`,
  `npm --version`, and `npx --version` because npm installs the Segmently and
  Playwright CLIs, and npx is the browser-install fallback.
- Plugin install/update also requires Git plus the active agent host CLI. The
  public README verifies `git --version` and either Codex
  (`codex --version`, `codex plugin --help`) or Claude Code
  (`claude --version`, `claude plugin --help`). These install-time checks are
  not required for every live SHOW/DO runner after the plugin is loaded.
- Run `toolPreflight.checks` in order before executing a live runner. For
  Segmently-backed actions this includes `node --version`, `npm --version`,
  `npx --version`, `segmently --version`, `segmently auth status`, and
  `segmently capabilities`.
- For SHOW and E2E/browser DO, also check `playwright-cli --help` and browser
  availability (`playwright-cli install-browser`, with the runner-provided
  fallback when needed).
- If a check fails and the check has `setup.argv`, run it, rerun the failed
  check, then retry the same runner through `toolPreflight.retry.argv` when
  present. If the check has `setup.manual=true`, ask the customer to install or
  approve the missing host prerequisite, then rerun the failed check.
- Do not answer that SHOW/DO is impossible just because the CLI, auth state,
  Playwright CLI, or browser binary is missing. Treat it as preparation and run
  the setup/auth flow first, asking the customer only when interactive login or
  local install approval is required.
- CLI-only DO must not require Playwright. SHOW and E2E/browser DO must require
  the browser checks.
- The preflight is declarative and customer-safe. Never print tokens or hidden
  credential values while running it.

## Delegation — route CLI work, never reimplement it

CLI is a single source of truth. For any headless change, route to the owning
customer skill and let it own the command shape:

| Launch area | Owning CLI skill |
|---|---|
| Funnel create / theme / screens / variables / conditions / analytics / domains / web placement / publish / verify | `segmently-cli-guide` |
| Sandbox Stripe paywall products + A/B | `segmently-cli-paywall-ab-rollout` |
| Custom WebEmbed screens | `segmently-cli-custom-screen-guide` (+ `segmently-cli-figma-webembed-import`) |
| Claude Design imports / `claude.ai/design` handoff | `claude-design` first, then `segmently-cli-custom-screen-guide` for Segmently apply and healthcheck |
| Help / content-plan articles | `segmently-cli-articles` (+ `segmently-cli-content-plan-guide`) |
| Image uploads to the CDN | `segmently-cli-image-upload` |
| Product page / insights | `segmently-product-cli-guide` |

For customer-facing prose, describe this as the authorized Segmently CLI or
browser helper. Mention a companion skill name only when debugging an installed
package, explaining a missing capability, or when the customer explicitly asks
which installed helper owns the work. In that case, name the exact public
companion skill id, then explain it in plain language. Do not paste internal
command details. The standalone CLI orchestrator (`segmently-cli-guide`) stays
usable on its own for customers who do not want this launch layer.

## Required companion skills

This skill is an orchestrator. A Codex/installed delivery must include these
customer-facing companion skills so DO/TEACH can work without project source:

- `segmently-cli-guide`
- `segmently-cli-paywall-ab-rollout`
- `segmently-cli-articles`
- `segmently-cli-content-plan-guide`
- `segmently-cli-custom-screen-guide`
- `segmently-cli-figma-webembed-import`
- `segmently-cli-image-upload`
- `segmently-product-cli-guide`
- `playwright-bowser`
- `segmently-test-kit`
- `claude-design` when the installed plugin includes Claude Code delivery or
  the user references Claude Design / `claude.ai/design`

If a companion skill is missing, say which one is missing and fall back only to
the modes still supported by the installed skills. Do not replace a missing
customer skill with internal/admin tooling.

## Claude Design routing

If the customer mentions Claude Design, `claude.ai/design`, `/design`,
`/design-sync`, `/design-login`, a `*.dc.html` file from Claude Design, or a
"Send to Claude Code" handoff, route to `claude-design` first. Do not answer as
generic WebEmbed/Figma import only.

For Segmently application, explain the two-stage owner split:

1. `claude-design` pulls/reviews the Claude Design project, chooses the right
   workflow, and produces validated HTML/theme/custom-screen handoff artifacts.
2. `segmently-cli-custom-screen-guide` applies those artifacts to the target
   Segmently project/funnel/version/screen, runs custom-screen healthcheck, and
   verifies before any publish step.

Ask for the Claude Design project URL or exported HTML, plus Segmently target
context: project, funnel/onboarding, version/draft, and whether to create a new
screen or replace/update an existing one. Do not claim the import is done until
the design pull/apply/healthcheck/verification steps actually run.

Keep the first answer customer-facing. Do not mention Shadow DOM internals,
generated Button/SingleSelectionList implementation details, or SDK callback
fallbacks unless the customer asks for implementation details or a validation
failure requires that level of troubleshooting.

## Doing it in the editor (e2e) — DO and TEACH

The editor backend drives the customer's own project after `segmently auth login`
(the credential is seeded into the browser — no password). Three modes:

- **DO** — perform the leg: navigate to the setting and apply the value, then
  verify.
- **SHOW** — navigate to the UI state and capture or point at the relevant
  control without changing any field value. Use this for "show me", "where do I
  click", "покажи", and "куда нажать" requests. If the target project/funnel/screen
  is missing, answer from the built-in Segmently guide text and screenshot
  evidence first, then ask only for the missing target inputs before opening the
  browser.
- **TEACH** — walk the customer through it: narrate each step in plain language,
  highlighting what to click and what they should see. Use this for first-run
  learning (see `references/teach.md`): create a project, set a theme, add screens
  to the canvas, connect them, and add a condition. Each teach step is small and
  composable — runnable on its own or as part of a bigger scenario.

For SHOW requests, load `references/guide-evidence.json` and produce a
non-mutating headed-browser plan through `playwright-bowser` with
`segmently-test-kit` when live navigation is possible. SHOW means the customer
can see the browser window and where to click; a screenshot is only the saved
evidence artifact. Do not run `runtime/editor-do-runner.mjs` or
`runtime/cli-do-runner.mjs` / `runtime/e2e-do-runner.mjs` unless the customer
explicitly asks you to change something. Use `runtime/show-runner.mjs` for
live SHOW execution: without `--execute` it returns the headed browser package,
screenshot artifact plan, and `authPreflight`; with explicit SHOW approval and
target context, `--execute` runs the auth preflight/browser auth bridge, opens
the browser with `playwright-cli open --headed --persistent`, focuses the
target control, keeps the browser open by default, captures screenshot evidence,
writes `show-runner-result.json`, and still does not mutate data. Use
`--closeAfterShow` only for automated cleanup when the customer does not need
to see the window. If `--execute` returns an auth-preflight completion claim,
run the returned preflight and retry; do not call the SHOW complete until a real
authorized editor window is visibly open on the target control and the
screenshot artifact was captured. A screenshot of a login page or "Missing or
insufficient permissions" page is a failed SHOW, not evidence.

For any customer request phrased as "do it", "make this change", or "set this
value", resolve the action before answering:

0. For free-form wording, select the likely action semantically from
   `runtime/do-action-reference.json` and the related guide keys from
   `references/guide-evidence.json`. Then validate the selected action/guide
   set through `runtime/customer-response-runner.mjs --guideKeys ... --actionId
   <id>` or through `runtime/editor-do-runner.mjs --action <id> ...`.
   Deterministic runners validate execution, inputs, evidence, and verification;
   they are not the only meaning layer. If the customer mentions
   Paywall + title/headline/заголовок, prefer the dedicated
   `editor.paywallBody.title.textStyle.*` action over generic
   `editor.content.title.textStyle.*`; if they mention Paywall +
   subtitle/подзаголовок, prefer `editor.paywallBody.subtitle.textStyle.*`.
   If they mention Paywall + footer/футер/bottom/низ, purchase/buy/subscribe
   button, auto-renew, restore, terms, or privacy, prefer
   `editor.paywallFooter.*` actions over generic Action Bar or Content actions.
   Words like "подсказка", "guide", "article", or "статья" in the same prompt are
   evidence-request words, not Text Field placeholder intent unless the customer
   also says input field / поле ввода / placeholder.
1. Load `runtime/do-action-reference.json`.
2. Match the request to one `actions[].id` even when project/funnel/screen inputs
   are still missing. In the customer answer, name the likely change in product
   terms first, then ask for the easiest target input (usually the editor URL or
   screen link; ids are acceptable fallbacks).
3. Then run
   `node runtime/editor-do-runner.mjs --action <id> ...` with the known inputs.
4. If the runner returns a CLI action, delegate the returned `execution` object to
   `executeWith.skill`, or run
   `node runtime/cli-do-runner.mjs --action <id> ... --execute` after explicit
   approval. Without `--execute`, `cli-do-runner.mjs` is a dry-run planner that
   shows the exact command, materialized JSON patch, and verification read. For
   live-agent verification, pass `--resultPath <case-dir>/cli-do-runner-result.json`
   or rely on `SUPPORT_FLOW_LIVE_AGENT_CASE_DIR`; completion is valid only when
   that JSON result has `dryRun=false` and `completionClaim=verified`.
5. If the runner returns an E2E action, use
   `node runtime/e2e-do-runner.mjs --action <id> ...` to get the dry-run browser
   execution package. With explicit customer approval, `--execute`, `--baseUrl`,
   and a verification-ready target such as `--versionId`, the runner opens the
   browser through `playwright-bowser`, runs the returned `driverScript`, and then
   runs the returned `verification` read. Without `--execute`,
   `e2e-do-runner.mjs` is read-only and must not be described as completed work.
   For live-agent verification, pass
   `--resultPath <case-dir>/e2e-do-runner-result.json` or rely on
   `SUPPORT_FLOW_LIVE_AGENT_CASE_DIR`; completion is valid only when that JSON
   result has `dryRun=false` and `completionClaim=verified`.
6. If the runner returns `unsupported` or `handoff`, explain the exact reason and
   use `teachFallback` or the verify read. Never claim the change was completed.

For field-level TEACH, use the same model-selected catalog flow:

1. Read `references/semantic-routing.md`, then select likely guide keys from
   `references/guide-evidence.json`, `references/help-article-reference.json`,
   and, for screen/block fields, `references/teach-reference.json`. The model
   owns this meaning step. Do not rely on regex/fallback scoring as the primary
   interpretation of imprecise customer wording.
2. Run `node runtime/customer-response-runner.mjs --prompt "<customer request>"
   --guideKeys "<selected-guide-keys>"` and treat its
   `answer.articleReferences`, `answer.builtInArticleReferences`,
   `answer.customerVisibleGuideAssets`, `answer.imageUrls`, `show`, and
   `action` objects as the article identity and execution contract source of
   truth.
3. If the runner is unavailable or you need extra wording after the selected
   guide has been validated, load `references/teach-reference.json` and
   `references/guide-evidence.json` narrowly. Match the customer's words to a
   screen type when named (List, Grid, Paywall, Text Input, Flexible Layout,
   etc.), then to the closest block and field.
4. Use the runner's selected `articleAlias`/`referencePath` first. If manually
   reading the corpus, use `screens[].blocks[].articleAlias` to find the block
   payload in `blocksByAlias`, then answer from the field/leaf labels and plain
   descriptions. Name the matched customer-visible block/section in the answer.
   For list or grid item/cell typography, this is usually the
   **Options / опции / варианты** area, not a generic "right panel" answer.
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
5. Cross-check the runner's returned guide assets or
   `references/guide-evidence.json` for the matched guide before writing the
   customer answer. Start the answer with the matched guide/section
   and field meaning in customer language, then give the steps. If the guide has
   built-in section text, reuse that wording as the evidence base. If it has a
   concrete `imageUrl`, include the actual image URL in the customer answer; if
   the chat supports Markdown images, render the first screenshot as
   `![Guide screenshot](<imageUrl>)` and also keep the URL visible when useful.
   If it has a `fullArticleLink`, include that public article URL. If it only
   has screenshot evidence, say that screenshots are available without inventing
   a URL. A guide row with
   `articleId`, `articleAlias`, or `localArticlePath` is an existing built-in
   article/guide reference even when `fullArticleLink` is `null`. Do not
   describe the article, guide, or link as absent or unavailable. Lead
   with "the built-in guide/article is available and has screenshot-backed
   guidance". Mention the missing public article URL only if the customer asks
   for a public link. Cite the customer-safe `articleAlias` when a stable
   reference is useful; use raw `articleId` or `localArticlePath` only for
    explicit debug/source questions. Do not expose `screenedit-*`,
    `screen-editor-*`, test ids, or other implementation-style guide keys in
    normal customer prose. Then answer from the built-in Segmently guide text and
    ask whether the customer wants a live SHOW walkthrough for their exact screen
    or wants you to apply a concrete value through the supported DO path. This
    offer is part of the answer whenever the question is about where a setting is
    or how to change it; do not wait for the customer to ask a second time. For
    Russian field-level answers, make the offer explicit in plain language:
    "Могу показать это на вашем экране без изменений. Если вы уже знаете нужное
    значение, могу применить его за вас после ссылки на экран и значения, затем
    проверю сохранённое состояние."
   For any answer based on `answer.customerVisibleGuideAssets`, include a compact
   customer-facing materials block. In Russian, use this shape:
   "Материалы: гайд `<articleAlias>` / `<referencePath>`; картинка:
   <imageUrl>; статья: <fullArticleLink when present>." If there is no public
   article URL, do not hide the guide: cite the guide alias/referencePath and
   show the concrete image URL. Do not expose `localArticlePath` unless the user
   is debugging the package itself.
   When the requested change is not currently executable by a shipped headless
   action, still offer the closest safe path instead of staying silent: SHOW if
   target screen context is missing, or browser/editor DO after the customer
   provides the editor screen link plus the required asset/value. State the
   limitation plainly and do not claim the change is done.
   - For "как настроить шрифты в кнопке", default to
     **Action Bar -> Main button text style** (article alias
     `help-block-action-bar`) unless the customer explicitly names a Paywall
     purchase button or Flexible Layout button. That Action Bar guide covers
     font family, font weight, font size, line height, text color, and alignment
     for the main button label.
   - For "как настроить Stripe подписки" / "how to set up Stripe
     subscriptions", use the resolver's Stripe subscriptions guide set. The
     answer must include the public article URLs for Stripe Connect, Paywall
     Products, subscription options, and Paywall Subscriptions when returned,
     plus concrete screenshot image URLs for the rows that have them. Explain
     the split clearly: Stripe Connect OAuth is a customer handoff; creating
     subscription products can be delegated to the Segmently CLI when the
     customer provides product names, prices, currency, billing intervals, and
     trials; attaching/checking plans on a Paywall screen needs the
     funnel/screen target and verification.
6. If the customer wants the full article, first select the target guide/article
   semantically, then run
   `node runtime/customer-response-runner.mjs --prompt "<customer request>"
   --guideKeys "<selected-guide-keys>" --mode article-fetch`.
   For this intent the runner returns `mode: "article-fetch"` and an
   `articleFetch` object with the matched `articleAlias`, `referencePath`,
   public URL inventory, and a read-only `segmently-cli-articles` fetch command
   family. Delegate that fetch to `segmently-cli-articles` using the matching
   `articleAlias` (or `articleId` if no alias exists). Do not infer that the
   article is missing from an empty `publicArticleLinks` array. Article fetch is
   a read-only lookup, not completed customer work: do not open the answer with
   "Готово", "Done", "Completed", or similar completion wording. Start with the
   useful result instead, such as "Нашёл встроенную статью..." / "Есть статья..."
   plus the article URL, text summary, and concrete image URLs when present.
6. Never read project source, grep local code, mention field keys, mention test ids,
   or expose internal file paths.

## Load references as needed

- Scenario index + sample requests + bound articles: `references/scenarios.md`.
- Per-leg backend + verify: `references/backends.md`.
- Milestone snapshot + "what's left": `references/project-status.md`.
- First-run TEACH tutorial: `references/teach.md`.
- Field-level TEACH corpus for screen editor settings:
  `references/teach-reference.json`.
- Text + screenshot-backed guide evidence for SHOW/TEACH coverage:
  `references/guide-evidence.json`.
  Use `sections[].title` and `sections[].description` for the built-in article
  text. Use `fullArticleLink` when it is present; if it is `null`, do not invent
  a public URL and do not describe the article, article URL, or guide as absent
  or unavailable for rows that have `articleId`, `articleAlias`, or
  `localArticlePath`. That mistake hides the built-in article reference. Use
  human titles and `articleAlias` as the customer-facing stable reference. Use
  raw `articleId` / `localArticlePath` only for explicit debug/source questions,
  and do not expose `screenedit-*` or `screen-editor-*` guide keys in normal
  answers. The minimum supported answer is the built-in text plus
  screenshot-backed guidance.
  In `runtime/customer-response-runner.mjs` output, prefer
  `answer.builtInArticleReferences[]` and `answer.articleReferenceSummary` over
  an empty `publicArticleLinks[]` array. Empty public links mean "not publicly
  published in this package", not "no article". Use `referencePath` as the
  stable internal article/section locator when debugging the installed package;
  in normal customer prose, cite the human guide name and `articleAlias` instead.
- DO action registry and resolver for CLI/E2E/handoff execution:
  `runtime/do-action-reference.json`, `runtime/editor-do-runner.mjs`, and
  `runtime/cli-do-runner.mjs`. For packaged E2E dry-runs/execution, use
  `runtime/e2e-do-runner.mjs`.
- SHOW headed-browser runner:
  `runtime/show-runner.mjs`.
- Customer-surface response contract runner for persona/acceptance probes:
  `runtime/customer-response-runner.mjs`. For requests like "send the full
  article", "дай полную статью", or "give me the article link", use its
  `mode: "article-fetch"` / `articleFetch` contract before answering. This is a
  read-only article lookup plan, not a DO action and not a browser SHOW action.
- Coverage audit for text/article/image inventory and screen-setting article
  coverage: `scripts/audit-guide-coverage.mjs --json --strict`. Use it when you
  need to know which guides have concrete image URLs and which ones still only
  have screenshot evidence/bindings. For a human-readable full revision, run
  `scripts/audit-guide-coverage.mjs --details --strict`; for machine checks, read
  `guideEvidence.coverageRows[]` plus `missingSectionConcreteImageUrls[]`.
  Maintainers can make URL backfill a hard release gate with
  `--fail-on-missing-images`, `--fail-on-missing-article-links`, or the combined
  `--fail-on-url-gaps`; do not use those modes in normal customer answers.
- The governance matrix (scenarios × sample requests × backend × milestone ×
  article) is `references/scenarios.matrix.json` — the single source the eval
  runner checks. Do not blanket-load it when answering; it is for maintainers.

## Response shape

```text
Goal:
Where you are now (milestones done / next missing):
Recommended next step:
How I'll do it (CLI / editor / handoff):
Commands or steps:
Verification:
Notes / risks:
```

Keep it plain. If target context is missing, ask for customer-friendly inputs:
the project, funnel/onboarding, version if relevant, and the exact screen. Accept
a URL, a visible name, or an id. Use placeholders like `<projectId>` only inside
technical command examples. Never invent UI, routes, or secrets.

For noisy or incomplete customer wording, do not reject the question. Say what
you think they mean, name the likely flow/step, then ask one targeted
clarification only if the answer depends on the customer's exact project state.
For screen-setting questions, include the matched guide/section/block/field
evidence first; for SHOW or DO requests, state whether you can show it, do it via
CLI, do it through the editor, or need a handoff.

## Safety rules (the customer boundary)

- Customer-safe only. Delegate CLI work **only** to the customer skills listed in
  the delegation table above. Never reference internal or admin skills, internal
  CLI commands, non-production environments, service-token internals, or
  source-tree CLI execution.
- Never read project source for customer TEACH/help answers. The shipped reference
  files are the runtime boundary; use `teach-reference.json` and customer-accessible
  CLI/article reads only.
- Describe the UI in human terms. Do not paste internal element identifiers, atom
  ids, route templates, or internal file paths into customer-facing answers.
- Stripe through the CLI defaults to sandbox/test mode unless a production billing
  review is explicitly in scope.
- Handoff legs (Stripe Connect, DNS) are never auto-completed — give the steps and
  run the verify. If the customer asks "where do I click" or "show me" for a
  handoff leg, offer a non-mutating SHOW walkthrough or screenshot-backed guidance
  once they provide the project link or project id.
- Translate raw verification labels into customer language first. Keep technical
  labels such as `chargesEnabled` or `charges enabled` only as optional detail,
  not as the main answer.

## Autonomy and the generated scenario catalog (maintainers)

This skill is **self-contained**: at runtime it reads only its own shipped files and
delegates to the customer `segmently` CLI and the `segmently-cli-*` skills. It never
imports internal source, so it runs as an installed plugin in any project.

`references/scenarios.matrix.json` and `references/teach-reference.json` are
**GENERATED** — do not hand-edit them. Maintainers edit the SupportFlow catalogs
and re-bake the projections; the version-time sync gate regenerates them and fails
the build on drift, a dangling reference, missing field-level teach coverage, a
customer leak, a routing miss, or a runtime dependency on internal source:

This target is generated by the source packager before publishing a skill or plugin version. Do not hand-edit generated references in this target; update the SupportFlow source catalogs and re-run the source packager instead.

Maintainer debug harnesses live only in the source packager, not in this generated target.

## Verification

After editing this skill, run:

```bash
node <skill-root>/scripts/run-evals.mjs
```
