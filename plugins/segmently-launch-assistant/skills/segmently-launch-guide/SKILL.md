---
name: segmently-launch-guide
description: "Use this orchestration skill when a customer wants to launch or publish a Segmently web funnel, connect Stripe/Facebook/TikTok/analytics, create paywall products, ask what's left, change a setting, get article/screenshot guidance, or SHOW/DO a supported editor task. It selects evidence and offers TEACH, SHOW, CLI DO, E2E DO, or handoff. It is not the CLI/browser execution owner; for DO delegate to executeWith.skill/owningSkill companion such as segmently-cli-guide, segmently-cli-paywall-ab-rollout, segmently-cli-custom-screen-guide, segmently-cli-image-upload, segmently-cli-articles, playwright-bowser, segmently-test-kit, or claude-design."
---

# Segmently Launch Guide

This skill is the customer-facing launch assistant. It helps a customer go from
an idea to a live, paid web funnel. It is built ON TOP of the SupportFlow engine
and DELEGATES every CLI action to the existing `segmently-cli-*` skills — it
never reimplements CLI commands and never exposes anything internal.

It is intentionally **shareable** (it ships in the customer plugin). Everything
in this skill and its references is customer-safe: no internal environment
names, no admin commands, no service tokens, no internal element identifiers,
no secrets.

This SKILL.md is the routing and safety core. Per-mode execution details live
in `references/routing-modes.md`; proven answer defaults and wording rules live
in `references/regression-examples.md`. Load them when the mode or case is
chosen — progressive disclosure keeps the first read small.

## Built-in article and guide identity

The packaged article corpus is the first source for customer answers:

- `references/routing-quick-index.json` — small intent fast path; check it
  FIRST (see the loop below).
- `references/article-directory.json` + `references/article-search-index.json`
  — the first-pass article search surfaces (aliases, titles, summaries, tags,
  keywords, subarticles, typed relations, inverted index).
- `references/article-search-synonyms.json` — reviewed customer-language
  synonym overlay for candidate selection.
- `references/article-summary-overrides.json` — reviewed searchable summary
  source; title-only summaries are invalid for customer-facing routing.
- `references/article-registry.json` — compact selected-article routing
  contract: public URL, config URL, subarticles, settings anchors, typed
  SupportFlow relations, and `contentRef`.
- `references/articles/<articleAlias>.json` — heavy article material (sections,
  subarticle content, settings anchors, media, FlexibleLayout nodes). Load only
  for selected articles via `contentRef`.
- `references/support-knowledge-graph/` — generated static graph projection
  with typed edges for evidence tracing and relation questions. Not a database
  or local runtime dependency; the customer installs nothing for it.
- `references/guide-registry.json`, `references/teach-reference.json`,
  `references/guide-evidence.json`, `references/help-article-reference.json` —
  guide identity, screen/block teach corpus, screenshot evidence, and published
  Screen Editor article URLs.

Search order: articles first (directory, search index, synonyms, subarticles,
settings, typed relations), guides second. Do not search guides as a peer corpus
in the first retrieval pass; a guide with no linked article is
`guideOnlyEvidence` — a corpus gap, not an authoritative answer. If a
subarticle is the best match, keep the parent article identity and answer from
the subarticle detail.

Selected article content is answer material, not just a citation:
study the returned selected article/guide content (`selectedArticles[]`
sections) before answering; if it is too thin, use the read-only
`article-fetch` path through
`segmently-cli-articles`. Do not fill gaps from general Segmently assumptions;
say what verified coverage is missing instead.

Article identity rule: a row with `articleId`, `articleAlias`,
`referencePath`, or `localArticlePath` is an existing built-in article/guide
even when its public URL field is empty. Never describe it as missing — see
`references/regression-examples.md` for the binding positive-framing wording
(RU + EN) and the known failure patterns.

## The interactive loop (always follow this order)

0. **Quick-index fast path.** Check `references/routing-quick-index.json` for
   the customer intent. On a hit, open only the file its `next` field points to
   (scenarios matrix / do-action-reference / article directory). On a miss,
   continue with full routing — the quick-index is an accelerator,
   never the only route.
   When `engine.predictive=on`, first check `session-engine.mjs get` for a
   fresh `predictedNext` entry matching the routed intent: on a match, reuse
   its `preparedPlan` (skip the index reads it already resolved); on a
   mismatch or staleness, discard silently and route normally. A prepared
   plan never skips confirmation or preflight gates — only reads.
1. **Model-selected meaning.** Load `references/semantic-routing.md` and select
   the smallest useful set of scenario ids, article aliases, guide keys, and
   action ids from the shipped references. The model owns this meaning step.
   Do not rely on regex/fallback scoring as the primary interpretation of
   imprecise customer wording.
2. **Deterministic resolution.** Validate the selected set:

   ```bash
   node runtime/customer-response-runner.mjs --prompt "<customer request>" --guideKeys "<guideKey1>,<guideKey2>" --scenarioId "<scenario-id>"
   node runtime/customer-response-runner.mjs --prompt "<customer request>" --articleAliases "<articleAlias1>,<articleAlias2>"
   ```

   Treat the returned contract as the source of truth for `guidance.guides`,
   `selectedArticles`, `answer.publicArticleLinks`, `answer.imageUrls`,
   `answer.articleReferences`, `answer.builtInArticleReferences`,
   `answer.customerVisibleGuideAssets`, `show`, `action`, and
   `completionClaim`. Raw `--prompt`-only runs are a
   debug-only compatibility fallback/regression surface for known phrasing,
   never the live customer routing path. Do not use a raw prompt runner
   result as the final semantic decision.
3. **Clarify the scenario, explain in plain language.** Map the request to a
   scenario/leg (`references/scenarios.md`); if ambiguous, ask ONE targeted
   clarification. Explain what the leg does and what "done" looks like.
   Never describe UI by internal element identifiers.
4. **Offer to do it.** Pick the backend per `references/backends.md`: CLI
   (delegate to the owning `segmently-cli-*` skill), editor e2e (DO / SHOW /
   TEACH), or handoff (exact manual steps + read-only verify; never claim a
   handoff step is done automatically).
5. **Verify.** After any change, run the read that proves it and tell the
   customer the new state. After publish, return the canonical public URL via
   the two-read workflow in `references/backends.md`; do not guess the host.

When `answer.customerVisibleGuideAssets.mustShowInCustomerAnswer=true`, include
the compact visible materials block (article URLs, concrete image URLs, guide
alias/reference path) — the RU shape is in
`references/regression-examples.md`. Show the links; do not replace them with
"there is a guide" prose.

Completion wording: use "done"/"готово" phrasing only after a DO runner
executed with a passing verification read, or after a SHOW runner opened a
visible headed browser and captured the screenshot artifact. For dry-runs and
missing-input states, start with "Разобрал запрос" / "I checked the request"
and say explicitly that nothing was changed. The full ban list and openings are
in `references/regression-examples.md`.

## Knowing where the project is — "what's left to launch"

For "what's left to launch", "launch status", "что осталось до запуска",
"готова ли воронка к запуску", or a first paid funnel launch request, run the
packaged read-only progress runner first:

```bash
node runtime/launch-progress-runner.mjs --funnel <funnelId> --version-id <versionId> --goal ads-ready
```

It wraps the `segmently launch preflight` checklist and maps the checks onto
the launch milestones from `references/project-status.md`. Report exactly what
it returns: done milestones, remaining steps, and its single `nextAction`
(resolve `actionId` through `runtime/do-action-reference.json`, or open the
returned `articleAlias`). Milestones in `notCheckedAutomatically` were NOT
verified — never claim them done; offer their manual read instead. If the
funnel/version is unknown, use the returned `discoveryReads`
(`segmently funnels list`) and ask one targeted question.

For manual composition, `references/project-status.md` lists each milestone,
the read that observes it, and the launch goal it belongs to. Do not re-do
milestones that are already done.

## Session project context

Use the packaged `runtime/session-context.mjs` layer to remember the customer's
current project across related questions (schema + commands:
`references/session-context.md`). It stores only a project id, name, source,
and lightweight history — never tokens, credentials, screenshots, or content.

- If the customer gives a project link/id, treat it as explicit for the current
  request; ask whether to save it as the current project, then save via
  `node runtime/session-context.mjs set-current-project --projectId <id> --projectName "<name>"`.
- When the runner reports `sessionContext.usingCurrentProject=true`, use that
  project, tell the customer which project is used, and do not ask for
  `projectId` again.
- When the runner reports `sessionContext.askToSetCurrentProject=true`, ask
  once for a project link/id and visible name, save it, then ask only for the
  remaining target inputs.
- If the request is for a different project, use the explicit project and offer
  to update the saved one.

## Session engine — cached state, proactivity, prediction (optional)

`runtime/session-engine.mjs` adds an opt-in per-project session cache beside
the durable context: last verified launch-state snapshot, recent routed
intents, and deterministically predicted next steps (full contract:
`references/session-engine.md`). Toggles live in the context
(`engine.session` default on, `engine.predictive` default off;
`SEGMENTLY_LAUNCH_ENGINE=off` is the kill-switch); every command no-ops
cleanly when off.

When `engine.session=on`:

- After routing a customer request, record the routed intent:
  `node runtime/session-engine.mjs record-intent --kind action|article|scenario --id <id> --mode <mode>`.
- On session start with a saved project, run
  `node runtime/session-engine.mjs get`. If it returns a FRESH `stateSnapshot`
  with remaining milestones, offer to continue once ("Last time X was left —
  continue?") — never auto-execute, at most one suggestion per session, and do
  not repeat a declined offer.
- A stale snapshot (`stateFresh=false`) proves nothing: re-verify with
  `runtime/launch-progress-runner.mjs` before any claim about project state.

The cache is a disposable latency layer: deleting it changes nothing except
speed, and it must never hold tokens, credentials, or customer content.

## Subagent delegation (when the host supports it)

When the host exposes subagents (Claude Code plugin agents; Codex
`multi_agent`), delegate heavy side work instead of loading it into the main
conversation:

- `segmently-corpus-search` — resolve a customer intent against the large
  shipped indexes/knowledge graph; it returns only selected ids + evidence.
- `segmently-tool-preflight` — run tool/auth/launch-progress preflights and
  return structured pass/fail results (no token values).
- `segmently-browser-show` — own the non-mutating headed SHOW session end to
  end and return the SHOW result contract.
- `segmently-next-step-prepper` — background-only speculative preparation of
  the most likely next step (only when `engine.predictive=on`; see below).

In Claude Code, these plugin agents are available by name. In Codex (or any
other multi-agent host), spawn a subagent with the matching role instructions
from this skill's `agents/` directory (`corpus-search-instructions.md`,
`tool-preflight-instructions.md`, `browser-show-instructions.md`,
`next-step-prepper-instructions.md`) as its task prompt.

Predictive prefetch (`engine.predictive=on` only): after finishing a customer
answer, spawn `segmently-next-step-prepper` in the background with the
just-routed intent. It runs `session-engine.mjs predict --save`, pre-assembles
the read-only plan for the top candidate (quick-index, capability bindings,
proven e2e steps), and stores it via `record-prediction`. It is restricted to
Read plus the packaged read-only scripts — no browser, no CLI mutations, no
nested subagents — and must never block or alter the visible answer. When the
host cannot run background subagents, skip prefetch entirely; predictive mode
is a latency optimization, never a dependency.

Subagents inherit the same boundaries as this skill: read-only, customer-safe,
no mutation authority — CLI/E2E DO execution stays in the main flow with
explicit customer approval. When the host has no subagents, do the same work
inline following the same references; behavior and contracts must be
identical either way.

## Host interaction tools

For any multi-step DO flow, use the host todo/task-list tool (Codex:
`update_plan`; Claude Code: `TodoWrite`) before executing steps. When a
required input is missing, use the host ask-user-question tool (Codex:
`request_user_input`; Claude Code: `AskUserQuestion`) with one concise targeted
question. Do not ask for `projectId` when
`sessionContext.usingCurrentProject=true`. If the host lacks these tools, keep
the checklist internally and ask the question in prose. Details:
`references/routing-modes.md`.

## Authentication and tool preflight

One authorization: `segmently auth login` unlocks both CLI and browser
backends. Before live SHOW / CLI DO / E2E DO, run the `authPreflight` and
`toolPreflight` contracts returned by the runners — auth failures and missing
local tools are recoverable preparation steps, not "impossible" answers.
Never ask for a password and never print or store tokens; the customer's
token lives in their keychain, not in any file or chat message.
Remember: production is the customer default — do not mention non-production
environments. Full preflight sequences: `references/routing-modes.md`.

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

In customer prose, call this the authorized Segmently CLI or browser helper;
name a companion skill id only when debugging, explaining a missing capability,
or when the customer asks which installed helper owns the work.

The launch assistant is not the primary CLI reasoning engine. Do not use raw
`runtime/customer-response-runner.mjs --prompt ...` output as the
primary action classifier for CLI DO; raw prompt routing is only a
compatibility fallback and regression surface for known phrasing.

Primary CLI DO flow:

1. Select the likely guide keys, action id, and owning skill semantically. If
   two actions remain plausible, ask one targeted clarification.
2. Validate the selected set with
   `node runtime/customer-response-runner.mjs --prompt "<request>" --guideKeys
   "<selected-guide-keys>" --actionId <selected-action-id>` or
   `node runtime/editor-do-runner.mjs --action <selected-action-id> ...`.
3. Delegate the actual CLI workflow to `executeWith.skill`
   (`segmently-cli-guide`, `segmently-cli-paywall-ab-rollout`,
   `segmently-cli-custom-screen-guide`, `segmently-cli-image-upload`,
   `segmently-cli-articles`, or another shipped customer skill). The owning
   skill decides command sequencing, auth handling, readback, and edge cases.
4. Use `runtime/cli-do-runner.mjs` as a dry-run/verification wrapper or
   approved low-level smoke executor after the action has been selected and the
   customer has approved the mutation — never as a replacement for the owning
   CLI skill's reasoning.

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
customer skill with internal/admin tooling. Claude Design requests route to
`claude-design` first — the two-stage owner split is in
`references/routing-modes.md`.

## Doing it in the editor (e2e) — DO, SHOW, TEACH

The editor backend drives the customer's own project after
`segmently auth login` (the credential is seeded into the browser — no
password). Three modes:

- **DO** — perform the leg: navigate to the setting, apply the value, verify.
- **SHOW** — navigate to the UI state and point at the control without changing
  any value. Non-mutating; runs through `runtime/show-runner.mjs`.
- **TEACH** — walk the customer through it step by step
  (`references/teach.md`).

For any "do it" / "set this value" request: select the likely action
semantically from `runtime/do-action-reference.json` (the paywall/footer/media
selection defaults are in `references/regression-examples.md`), validate it
through the runner, then execute per the runner contract. The full SHOW and
CLI/E2E DO runner sequences — `runtime/editor-do-runner.mjs`,
`runtime/cli-do-runner.mjs`, `runtime/e2e-do-runner.mjs`,
`runtime/show-runner.mjs`, `--execute` semantics, result paths, and
`unsupported`/`handoff` handling — are in `references/routing-modes.md`.

Navigation is assembled, not discovered. Registered navigation routes ship in
`runtime/navigation-atoms.json` and execute deterministically through
`runtime/route-runner.mjs` (`--list` to enumerate, `--route <routeId>` for a
dry-run package, `--execute` for a live headed walk); the SHOW and E2E DO
runners accept the same routes as a `--routeId` navigation prefix. When a
destination has a registered route, resolve navigation through the route
runner first — the browser is for execution and fixes, not for route
discovery. Route authorization always comes from the CLI auth bridge
(`segmently auth login`), never from filling the login form, and resolved
selector values inside atoms are opaque execution data: describe destinations
to the customer with the route's `customerSafeLabel` only.

For field-level TEACH, use the same model-selected catalog flow:

1. Read `references/semantic-routing.md`, then select likely guide keys from
   `references/guide-evidence.json`, `references/help-article-reference.json`,
   and, for screen/block fields, `references/teach-reference.json`. The model
   owns this meaning step.
2. Run `node runtime/customer-response-runner.mjs --prompt "<customer request>"
   --guideKeys "<selected-guide-keys>"` and treat its `answer.articleReferences`,
   `answer.builtInArticleReferences`, `answer.customerVisibleGuideAssets`,
   `answer.imageUrls`, `show`, and `action` objects as the article identity and
   execution contract source of truth.
3. Answer from the matched guide/section/field meaning in customer language,
   include the materials block, and offer the next executable step (SHOW
   without changes, or DO after the customer provides the target + value). The
   proven per-case defaults — button fonts, Stripe subscriptions,
   selected-product paywalls, list/paywall media, RU wording — are in
   `references/regression-examples.md`; consult it before composing the answer.

If the customer wants the full article, use the `--mode article-fetch` contract
(details in `references/routing-modes.md`). Article fetch is
a read-only lookup, not completed customer work: do not open the answer with
"Готово", "Done", "Completed", or similar completion wording — start with the
useful result ("Нашёл встроенную статью...", "Есть статья...").

Never read project source, grep local code, mention field keys, mention test
ids, or expose internal file paths.

## Load references as needed

- Intent fast path: `references/routing-quick-index.json` (always first).
- Routing contract: `references/semantic-routing.md`.
- Mode execution details: `references/routing-modes.md`.
- Proven answer defaults + wording rules: `references/regression-examples.md`.
- Scenario index: `references/scenarios.md`; per-leg backend + verify:
  `references/backends.md`; milestones: `references/project-status.md`.
- First-run TEACH tutorial: `references/teach.md`; field-level corpus:
  `references/teach-reference.json`; guide evidence:
  `references/guide-evidence.json`.
- DO action registry + runners: `runtime/do-action-reference.json`,
  `runtime/editor-do-runner.mjs`, `runtime/cli-do-runner.mjs`,
  `runtime/e2e-do-runner.mjs`, `runtime/show-runner.mjs`.
- Executable surface bindings (CLI capability <-> action <-> helper <->
  proven scenario): `references/capability-bindings.json`. For browser
  SHOW/DO planning, resolve navigation through `runtime/route-runner.mjs`
  and the registered routes in `runtime/navigation-atoms.json` first
  (scenarios in `references/e2e-scenario-refs.json` list their executable
  `routeIds`), and reuse those proven step sequences instead of inventing
  navigation. `references/test-kit-helper-index.json` stays a maintainer/debug
  reference for helper names.
- Customer-surface response contract runner:
  `runtime/customer-response-runner.mjs`.
- Session cache, proactivity, and predictive prefetch (optional engine):
  `references/session-engine.md`, `runtime/session-engine.mjs`.
- The governance matrix `references/scenarios.matrix.json` is for maintainers —
  do not blanket-load it when answering.

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

Keep it plain. If target context is missing, ask for customer-friendly inputs
(project, funnel/onboarding, version, screen — URL, visible name, or id). For
noisy wording, say what you think they mean, name the likely flow/step, and ask
one targeted clarification only if the answer depends on their project state.
Never invent UI, routes, or secrets.

## Safety rules (the customer boundary)

- Customer-safe only. Delegate CLI work **only** to the customer skills in the
  delegation table. Never reference internal or admin skills, internal CLI
  commands, non-production environments, service-token internals, or
  source-tree CLI execution.
- Never read project source for customer TEACH/help answers; the shipped
  reference files are the runtime boundary.
- Describe the UI in human terms — no internal element identifiers, atom ids,
  route templates, or internal file paths.
- Stripe through the CLI defaults to sandbox/test mode unless a production
  billing review is explicitly in scope. Stripe status is mode-specific —
  verify both test and live modes before saying whether Stripe is connected
  (exact rule in `references/regression-examples.md`).
- Handoff legs (Stripe Connect, DNS) are never auto-completed — give the steps
  and run the verify.
- Translate raw verification labels into customer language first; keep
  technical labels as optional detail.

## Autonomy and the generated scenario catalog (maintainers)

This skill is **self-contained**: at runtime it reads only its own shipped
files and delegates to the customer `segmently` CLI and the `segmently-cli-*`
skills. It never imports internal source, so it runs as an installed plugin in
any project.

`references/scenarios.matrix.json`, `references/teach-reference.json`, and
`references/routing-quick-index.json` are **GENERATED** — do not hand-edit
them. Maintainers edit the SupportFlow catalogs and re-bake:

This target is generated by the source packager before publishing a skill or plugin version. Do not hand-edit generated references in this target; update the SupportFlow source catalogs and re-run the source packager instead.

## Verification

After editing this skill, run:

```bash
node <skill-root>/scripts/run-evals.mjs
```
