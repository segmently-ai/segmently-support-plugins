# Mode Details — SHOW, DO, TEACH, article-fetch, preflights, Claude Design

Load this file after the mode for the current customer request is chosen. The
orchestrator SKILL.md owns mode selection and the safety boundary; this file
owns the deep per-mode execution details.

## Host interaction tools

Use host-provided interaction tools when they exist; do not replace them with
loose prose for workflows that need state.

- For any multi-step DO flow, use the host todo/task-list tool before executing
  steps. In Codex this may be `update_plan`; in Claude Code this may be
  `TodoWrite`; other hosts may expose a `todo-list` or `task-list` tool. Track
  at least: gather missing inputs, tool/auth preflight, dry-run/plan, execute,
  verify, and report.
- When required customer input is missing and cannot be inferred from the saved
  project context or the current message, use the host ask-user-question tool
  when available. In Codex this may be `request_user_input`; in Claude Code this
  may be `AskUserQuestion`; other hosts may expose `ask-user-question`.
- Ask one concise targeted question for the first blocking input. Prefer an
  editor URL over raw ids when either is acceptable. Do not ask for `projectId`
  again when `sessionContext.usingCurrentProject=true`; tell the customer which
  saved project is being used and ask only for remaining inputs such as funnel,
  version, screen, value, file, video source, or approval.
- If the host does not expose an ask-user-question tool, ask the same single
  targeted question in prose and wait for the answer. If it does not expose a
  todo/task-list tool, keep the checklist internally and still report progress
  step by step.

## Authentication preflight (one authorization, no passwords)

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
  step: run the returned `authPreflight.statusProbe`, run `authPreflight.login`
  if needed, then retry the returned command. Do not answer the customer with
  only "run login yourself" unless the browser authorization genuinely requires
  their manual approval or the local environment blocks interactive login.
- Never print, echo, or store token values, refresh tokens, or credentials. The
  customer's token lives in their keychain (the plugin's `userConfig`), not in
  any file or chat message.
- Production is the customer default. Do not mention non-production
  environments.

## Runtime tool preflight (CLI + browser)

Packaged runners expose a machine-readable `toolPreflight` contract. Use it
before live SHOW, CLI DO, or E2E/browser DO execution. Auth proves the customer
is logged in; `toolPreflight` proves the required local tools are installed.

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

## SHOW — live headed walkthrough

For SHOW requests ("show me", "where do I click", "покажи", "куда нажать"),
load `references/guide-evidence.json` and produce a non-mutating headed-browser
plan through `playwright-bowser` with `segmently-test-kit` when live navigation
is possible. SHOW means the customer can see the browser window and where to
click; a screenshot is only the saved evidence artifact. If the target
project/funnel/screen is missing, answer from the built-in Segmently guide text
and screenshot evidence first, then ask only for the missing target inputs
before opening the browser.

Do not run `runtime/editor-do-runner.mjs`, `runtime/cli-do-runner.mjs`, or
`runtime/e2e-do-runner.mjs` unless the customer explicitly asks you to change
something. Use `runtime/show-runner.mjs` for live SHOW execution:

- Without `--execute` it returns the headed browser package, screenshot
  artifact plan, and `authPreflight`.
- With explicit SHOW approval and target context, `--execute` runs the auth
  preflight/browser auth bridge, opens the browser with
  `playwright-cli open --headed --persistent`, focuses the target control,
  keeps the browser open by default, captures screenshot evidence, writes
  `show-runner-result.json`, and still does not mutate data.
- Use `--closeAfterShow` only for automated cleanup when the customer does not
  need to see the window.
- If `--execute` returns an auth-preflight completion claim, run the returned
  preflight and retry; do not call the SHOW complete until a real authorized
  editor window is visibly open on the target control and the screenshot
  artifact was captured. A screenshot of a login page or "Missing or
  insufficient permissions" page is a failed SHOW, not evidence.

## CLI DO and E2E DO runner details

1. Load `runtime/do-action-reference.json` and match the request to one
   `actions[].id` even when project/funnel/screen inputs are still missing. In
   the customer answer, name the likely change in product terms first, then ask
   for the easiest target input (usually the editor URL or screen link; ids are
   acceptable fallbacks).
2. Run `node runtime/editor-do-runner.mjs --action <id> ...` with the known
   inputs.
3. If the runner returns a CLI action, delegate the returned `execution` object
   to `executeWith.skill`. Run
   `node runtime/cli-do-runner.mjs --action <id> ... --execute` only as an
   approved low-level smoke executor after the owning skill/action selection is
   clear and verification is available. Without `--execute`,
   `cli-do-runner.mjs` is a dry-run planner that shows the exact command,
   materialized JSON patch, and verification read. For live-agent verification,
   pass `--resultPath <case-dir>/cli-do-runner-result.json` or rely on
   `SUPPORT_FLOW_LIVE_AGENT_CASE_DIR`; completion is valid only when that JSON
   result has `dryRun=false` and `completionClaim=verified`.
4. If the runner returns an E2E action, use
   `node runtime/e2e-do-runner.mjs --action <id> ...` to get the dry-run
   browser execution package. With explicit customer approval, `--execute`,
   `--baseUrl`, and a verification-ready target such as `--versionId`, the
   runner opens the browser through `playwright-bowser`, runs the returned
   `driverScript`, and then runs the returned `verification` read. Without
   `--execute`, `e2e-do-runner.mjs` is read-only and must not be described as
   completed work. For live-agent verification, pass
   `--resultPath <case-dir>/e2e-do-runner-result.json` or rely on
   `SUPPORT_FLOW_LIVE_AGENT_CASE_DIR`; completion is valid only when that JSON
   result has `dryRun=false` and `completionClaim=verified`.
5. If the runner returns `unsupported` or `handoff`, explain the exact reason
   and use `teachFallback` or the verify read. Never claim the change was
   completed.

## Article-fetch details

If the customer wants the full article ("send the full article", "дай полную
статью", "give me the article link"), first select the target guide/article
semantically, then run
`node runtime/customer-response-runner.mjs --prompt "<customer request>"
--guideKeys "<selected-guide-keys>" --mode article-fetch`.
The runner returns `mode: "article-fetch"` and an `articleFetch` object with
the matched `articleAlias`, `referencePath`, public URL inventory, and a
read-only `segmently-cli-articles` fetch command family. Delegate that fetch to
`segmently-cli-articles` using the matching `articleAlias` (or `articleId` if
no alias exists). Do not infer that the article is missing from an empty
`publicArticleLinks` array. Start with the useful result, such as "Нашёл
встроенную статью..." / "Есть статья..." plus the article URL, text summary,
and concrete image URLs when present.

In `runtime/customer-response-runner.mjs` output, prefer
`answer.builtInArticleReferences[]` and `answer.articleReferenceSummary` over
an empty `publicArticleLinks[]` array. Empty public links mean "not publicly
published in this package", not "no article". Use `referencePath` as the
stable internal article/section locator when debugging the installed package;
in normal customer prose, cite the human guide name and `articleAlias` instead.

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

## Coverage audit (maintainer-leaning)

Coverage audit for text/article/image inventory and screen-setting article
coverage: `scripts/audit-guide-coverage.mjs --json --strict`. Use it when you
need to know which guides have concrete image URLs and which ones still only
have screenshot evidence/bindings. For a human-readable full revision, run
`scripts/audit-guide-coverage.mjs --details --strict`; for machine checks, read
`guideEvidence.coverageRows[]` plus `missingSectionConcreteImageUrls[]`.
Maintainers can make URL backfill a hard release gate with
`--fail-on-missing-images`, `--fail-on-missing-article-links`, or the combined
`--fail-on-url-gaps`; do not use those modes in normal customer answers.
