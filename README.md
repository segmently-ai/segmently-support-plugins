# Segmently Support Plugins

Public read-only marketplace for Segmently customer support plugins.

## Plugins In This Marketplace

- `segmently-launch-assistant`
- `segmently-unit-economics`

<!-- plugin-section:segmently-unit-economics:start -->
## Segmently Unit Economics (standalone plugin)

Only the paywall unit-economics skill, without the launch assistant: the launch card, trial
and fee-stack comparisons, which experiment first, how long a test needs, and the growth
cycle — research before an experiment, the hypothesis card, the read and the re-based numbers.
It computes on your
machine with `segmently ue` — no Segmently account, no login, no browser automation, and
nothing leaves the machine. Prerequisites: Node.js 22+ with npx. That is all — the Segmently CLI
login and Playwright under "Required Tools" below are for the launch assistant only.

### One Prompt Install For Claude Code — Unit Economics Only

Paste this whole block into a fresh Claude Code thread. It sets the machine up and stops
before using the skill: a newly installed plugin is visible only in a NEW session.

```text
Set up the segmently-unit-economics plugin for Claude Code on this machine, then stop and tell me to restart.

Marketplace: segmently-ai/segmently-support-plugins@stable. Plugin: segmently-unit-economics@segmently-support.

Run the steps in order and show me the exact output of every command:
1. node --version — it must print v22 or newer. If it is older or missing, tell me how to get Node.js 22 on this operating system and stop there.
2. npx -y @segmently/cli ue --version — it must print JSON holding "cli" and "mathHash", with "cli" 1.4.0 or newer. If it prints a bare version number, "unknown command 'ue'", or a "cli" below 1.4.0, run npx -y @segmently/cli@latest ue --version instead. If that still does not print a "cli" of 1.4.0 or newer, stop and tell me the command-line tool on this machine is older than 1.4.0.
3. claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user
   claude plugin install segmently-unit-economics@segmently-support --scope user
   If the marketplace is already there, run claude plugin marketplace update segmently-support and then claude plugin update segmently-unit-economics@segmently-support --scope user.
4. claude plugin list — the output must name segmently-unit-economics. If it does not, say so plainly and do not continue.
5. Do not try the skill in this session and do not answer any unit-economics question yourself. Tell me the setup is done, then ask me to open a NEW Claude Code session in the folder where my scenario files should live, and to paste the question below there.

The question for the new session:
"Use the segmently-unit-economics skill. I sell <what> for <price> per <month or year> on <the web, the App Store or Google Play>, my trial is <length, or none>, I pay about <amount> per install or click, and about <number> in 100 people who see the paywall buy. Is that worth launching, and what should I change first?"
```

### One Prompt Install For Codex — Unit Economics Only

Paste this whole block into a fresh Codex thread; it stops the same way.

```text
Set up the segmently-unit-economics plugin for Codex on this machine, then stop and tell me to restart.

Marketplace: segmently-ai/segmently-support-plugins on ref stable. Plugin: segmently-unit-economics@segmently-support.

Run the steps in order and show me the exact output of every command:
1. node --version — it must print v22 or newer. If it is older or missing, tell me how to get Node.js 22 on this operating system and stop there.
2. npx -y @segmently/cli ue --version — it must print JSON holding "cli" and "mathHash", with "cli" 1.4.0 or newer. If it prints a bare version number, "unknown command 'ue'", or a "cli" below 1.4.0, run npx -y @segmently/cli@latest ue --version instead. If that still does not print a "cli" of 1.4.0 or newer, stop and tell me the command-line tool on this machine is older than 1.4.0.
3. codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
   codex plugin add segmently-unit-economics@segmently-support
   If the marketplace is already there, run codex plugin marketplace upgrade segmently-support and then codex plugin add segmently-unit-economics@segmently-support again.
4. List the installed plugins and show me that segmently-unit-economics is among them. If it is not, say so plainly and do not continue.
5. Do not try the skill in this session and do not answer any unit-economics question yourself. Tell me the setup is done, then ask me to open a NEW Codex session in the folder where my scenario files should live, and to paste the question below there.

The question for the new session:
"Use the segmently-unit-economics skill. I sell <what> for <price> per <month or year> on <the web, the App Store or Google Play>, my trial is <length, or none>, I pay about <amount> per install or click, and about <number> in 100 people who see the paywall buy. Is that worth launching, and what should I change first?"
```

### Unit Economics Install By Hand

```bash
claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user
claude plugin install segmently-unit-economics@segmently-support --scope user
```

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
codex plugin add segmently-unit-economics@segmently-support
```

Update in Claude Code: `claude plugin marketplace update segmently-support`, then
`claude plugin update segmently-unit-economics@segmently-support --scope user`. In Codex:
`codex plugin marketplace upgrade segmently-support`, then
`codex plugin add segmently-unit-economics@segmently-support`. Start a new session after either.

What it answers, and the MCP server for hosts without plugins:
[plugins/segmently-unit-economics/README.md](plugins/segmently-unit-economics/README.md).
<!-- plugin-section:segmently-unit-economics:end -->

## Required Tools

The plugin installs Segmently assistant skills and scripts only. It does not
install the host runtime, Git, the agent host CLI, Segmently CLI, Playwright CLI,
or browser binaries.

Install and verify these host prerequisites first:

```bash
node --version
npm --version
npx --version
git --version
```

Use Node.js 22 LTS or newer (the Segmently CLI requires Node 22). Git must be able to read this GitHub marketplace
repository for install and update operations.

For Codex users, verify the Codex CLI and plugin subcommands:

```bash
codex --version
codex plugin --help
```

For Claude Code users, verify the Claude Code CLI and plugin subcommands:

```bash
claude --version
claude plugin --help
```

Install and authenticate the Segmently CLI before asking the assistant to read,
change, publish, or verify project state:

```bash
npm install -g @segmently/cli
segmently --version
segmently auth login
segmently auth status
segmently capabilities
```

Production is the default Segmently CLI target. Do not paste raw tokens into
agent chat. For automation, create scoped service tokens with the Segmently CLI
and store them in your secret manager.

Install Playwright browser automation before asking the assistant to SHOW a UI
path, capture screenshots, or perform browser-backed editor actions:

```bash
npm install -g @playwright/cli@latest
playwright-cli --help
playwright-cli install-browser
```

If `playwright-cli install-browser` is not available in your environment, run
`npx playwright install chromium` and then re-check `playwright-cli --help`.
If Chromium still cannot launch on Linux, run
`npx playwright install --with-deps chromium`.
When `node`, `npm`, `npx`, `segmently`, `playwright-cli`, or the browser
binary is missing, the assistant should run the setup/preflight flow first
instead of pretending SHOW or DO succeeded.

## One Prompt Install For Codex

Copy this whole prompt into a fresh Codex thread. It is intentionally written as
a single task so Codex can prepare the host tools, install the marketplace
plugin, authenticate Segmently, and write local project guidance. Plugin-backed
runtime verification is a separate post-restart prompt because Codex usually
loads newly installed plugins only after a new session starts.

```text
Install or update the Segmently Launch Assistant plugin for Codex for this target project folder.

Use the public marketplace repository segmently-ai/segmently-support-plugins with ref stable
and install plugin segmently-launch-assistant@segmently-support.

Target project folder:
- If I already gave an absolute project path, use that folder.
- Otherwise ask me for the absolute project folder before making file changes.
- Run project-local file edits only inside that folder. Do not write AGENTS.md, CLAUDE.md, or other guidance files globally or in an unrelated checkout.

Run these steps end to end and report the exact command results:
1. Preflight host tools: node --version, npm --version, npx --version, git --version, codex --version, codex plugin --help.
2. If node/npm/npx/git/codex is missing, start the prerequisite installation flow instead of stopping silently: detect the OS and available package manager, explain the exact install path you will use, ask for one approval if the install changes the machine, then install or guide me through installing the missing prerequisite. For Node/npm/npx, install Node.js 22 LTS or newer; for Git, install Git through the OS package manager or system developer tools; for Codex, install/update the Codex CLI by its current official method. After each install, re-run the matching --version/help check before continuing. If a prerequisite cannot be installed automatically, tell me the exact manual command/link and pause only for that action.
3. Install or update the Segmently CLI and verify it: npm install -g @segmently/cli; segmently --version; segmently auth status.
4. If Segmently auth is missing or expired, run segmently auth login, then re-run segmently auth status and segmently capabilities.
5. Install or update Playwright CLI and browser support: npm install -g @playwright/cli@latest; playwright-cli --help; playwright-cli install-browser. If install-browser is unavailable, run npx playwright install chromium; if Chromium still cannot launch on Linux, run npx playwright install --with-deps chromium.
6. Install or update the Codex plugin: codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable; codex plugin add segmently-launch-assistant@segmently-support. If the marketplace already exists, run codex plugin marketplace upgrade segmently-support, then run codex plugin add segmently-launch-assistant@segmently-support again.
7. In the target project folder, update local project guidance files as a concrete file edit. This is not a same-session plugin verification step. Primary file: AGENTS.md. Secondary file: CLAUDE.md only if it already exists or I explicitly asked to prepare Claude Code guidance too. For each file you update: read the file first; if it already has a "## Segmently Launch Assistant" section, replace only that section from its heading until the next "## " heading or end of file; if it has no such section, append the exact section below at the end; if it has older Segmently Launch Assistant wording without that exact heading, append the exact section below and leave the older text unless you can remove only the stale Segmently block without touching unrelated instructions. If AGENTS.md does not exist, create it in the target project folder only after confirming the folder path. Do not create or edit global AGENTS.md/CLAUDE.md files and do not remove unrelated project instructions. Write this exact section:

## Segmently Launch Assistant

- These rules apply after starting a new Codex session in this project folder, once the installed Segmently Launch Assistant plugin skills are visible.
- Use the installed Segmently Launch Assistant plugin for Segmently launch/support tasks. `segmently-launch-guide` is the single entry point: it routes every Segmently intent through its shipped quick index and returns the TEACH / SHOW / DO / article contract to follow.
- Do not answer Segmently product, CLI, API, editor, paywall, support-flow, or launch questions from general model knowledge.
- Do not invent Segmently commands, APIs, fields, routes, product behavior, docs, or troubleshooting steps.

**Which skill when:**
- Product, how-to, "what is left to launch", settings, integrations, paywall, analytics questions -> `segmently-launch-guide` (articles first, guides second; guides are evidence material, never a routing peer).
- "Do it for me" through the CLI -> the owning skill named by the runner contract (`segmently-cli-guide`, `segmently-cli-custom-screen-guide`, `segmently-cli-image-upload`, `segmently-cli-articles`, `segmently-cli-paywall-ab-rollout`). Never re-implement CLI work inline.
- Paywall unit economics ("is this price worth launching", trial vs no trial, App Store vs web fees, which experiment first, how long a test needs) and the growth cycle ("where can we grow", "what to test next", "is this test real") -> `segmently-unit-economics`: offline `segmently ue`, no Segmently login; every number comes from its own run, and the answer is a scenario, never a forecast.
- Browser SHOW / editor E2E DO -> the packaged runners only. Navigation is assembled from registered routes (`runtime/route-runner.mjs --list` / `--route <routeId>`, or the `--routeId` prefix on the SHOW/E2E runners). The browser is for execution and fixes, not for route discovery. Never quote selector values in replies; describe destinations with the route's customerSafeLabel.
- Design imports and screen prototyping -> `claude-design`; `segmently-test-kit` is an execution companion, never an answer source.
- When the host supports subagents, delegate heavy side work to the shipped agent roles from the skill's `agents/` directory: corpus-search (catalog/graph lookups), tool-preflight (tool/auth checks), browser-show (headed SHOW sessions), next-step-prepper (background prefetch, only when predictive mode is on).

**Evidence and sections:**
- For customer answers, select article aliases, guide keys, and action ids from the installed shipped catalogs first; use runtime runners only to validate evidence and execution boundaries.
- The article and guide catalogs are compact directories: load heavy sections only for the selected items through their `contentRef` files (`references/articles/<alias>.json`, `references/guides/<guideKey>.json`). Never blanket-load whole catalogs into context.
- Read selected article/guide sections before answering. If selected snippets are too thin, run the read-only article-fetch path and use the fetched article/config sections as answer material.
- Answer only through installed Segmently skills/references/runners, selected article content, public Segmently CLI output, and verified Segmently or Playwright output.

**Session state and proactivity:**
- The current project lives in the non-secret session context (`runtime/session-context.mjs`). Use the saved project automatically, say which saved project you are using, and still ask for missing funnel/version/screen/value inputs.
- The session engine is ON by default: record routed intents (`runtime/session-engine.mjs record-intent`) and check `runtime/session-engine.mjs get` at session start. When a FRESH launch-state snapshot exists, offer AT MOST ONE proactive resume suggestion per session; never auto-execute it; a declined suggestion is not repeated.
- A stale snapshot is not evidence: re-verify with the launch-progress runner before relying on it.
- Predictive next-step prefetch is opt-in (`runtime/session-engine.mjs set-engine --predictive on`). Background preparation is read-only and a prepared plan never skips confirmation or preflight gates. `SEGMENTLY_LAUNCH_ENGINE=off` is the kill-switch for the whole engine.

**Execution safety:**
- Run host, Segmently CLI, and Playwright preflight before SHOW or DO work.
- Use segmently auth login instead of asking for tokens; browser sessions authenticate through the CLI auth bridge, never by filling the login form.
- Delegate CLI-specific work to the returned owning skill, such as segmently-cli-guide or segmently-cli-custom-screen-guide.
- Do not claim a mutation is complete until execution and verification both pass.
- If plugin skills are not visible in the current session, stop and ask me to restart/open a new session in this project folder. Do not answer Segmently product questions from plugin cache files or general model knowledge.

8. Do not try to verify Segmently product answers through the plugin in this same session, and do not inspect plugin cache files as a substitute for using the loaded plugin. Newly installed plugins usually require a new Codex session before skills are available.
9. Finish by telling me setup is installed and local project guidance is written, then ask me to close this Codex session, open a new Codex session in the same target project folder, and run this post-restart verification prompt:

Post-restart verification prompt:
"Verify the Segmently Launch Assistant plugin in this project. First read the local AGENTS.md Segmently Launch Assistant section. Use only installed Segmently Launch Assistant plugin skills, shipped references, selected article content, Segmently CLI output, and Playwright CLI output for Segmently answers. Confirm the plugin skills are visible in this new session (segmently-launch-guide and segmently-unit-economics among them), run Segmently CLI auth/capabilities checks, run Playwright CLI help/browser readiness checks, then answer this simple plugin-backed prompt: 'Show me what is left before launch.' After that, initialize my working state: ask me for my Segmently project id and name and save them with the packaged session-context runtime (set-current-project), confirm the session engine defaults with the packaged session-engine get command, and ask whether I want proactive next-step prefetch; if I say yes, enable it with the packaged session-engine set-engine --predictive on command. If plugin skills are not visible, say the session/plugin load failed and do not answer from general model knowledge or by reading plugin cache files directly."

10. Do not claim runtime verification is complete in the install session. The correct install-session completion state is: host prerequisites checked or installed, Segmently CLI auth/capabilities checked, Playwright CLI/browser support checked, Codex plugin installed or updated, and local target-project AGENTS.md/CLAUDE.md guidance updated. If a step needs my approval or browser login, ask for that single approval and then continue.
```

## One Prompt Install For Claude Code

Copy this whole prompt into a fresh Claude Code thread. It performs the same
host-tool, Segmently CLI, Playwright, marketplace, plugin, and local project
guidance flow for Claude Code. Plugin-backed runtime verification is a separate
post-restart prompt because Claude Code usually loads newly installed plugins
only after a new session starts.

```text
Install or update the Segmently Launch Assistant plugin for Claude Code for this target project folder.

Use the public marketplace repository segmently-ai/segmently-support-plugins@stable
and install plugin segmently-launch-assistant@segmently-support with --scope user.

Target project folder:
- If I already gave an absolute project path, use that folder.
- Otherwise ask me for the absolute project folder before making file changes.
- Run project-local file edits only inside that folder. Do not write CLAUDE.md, AGENTS.md, or other guidance files globally or in an unrelated checkout.

Run these steps end to end and report the exact command results:
1. Preflight host tools: node --version, npm --version, npx --version, git --version, claude --version, claude plugin --help.
2. If node/npm/npx/git/claude is missing, start the prerequisite installation flow instead of stopping silently: detect the OS and available package manager, explain the exact install path you will use, ask for one approval if the install changes the machine, then install or guide me through installing the missing prerequisite. For Node/npm/npx, install Node.js 22 LTS or newer; for Git, install Git through the OS package manager or system developer tools; for Claude Code, install/update the Claude Code CLI by its current official method. After each install, re-run the matching --version/help check before continuing. If a prerequisite cannot be installed automatically, tell me the exact manual command/link and pause only for that action.
3. Install or update the Segmently CLI and verify it: npm install -g @segmently/cli; segmently --version; segmently auth status.
4. If Segmently auth is missing or expired, run segmently auth login, then re-run segmently auth status and segmently capabilities.
5. Install or update Playwright CLI and browser support: npm install -g @playwright/cli@latest; playwright-cli --help; playwright-cli install-browser. If install-browser is unavailable, run npx playwright install chromium; if Chromium still cannot launch on Linux, run npx playwright install --with-deps chromium.
6. Install or update the Claude Code plugin: claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user; claude plugin install segmently-launch-assistant@segmently-support --scope user. If the marketplace already exists, run claude plugin marketplace update segmently-support, then run claude plugin update segmently-launch-assistant@segmently-support --scope user.
7. In the target project folder, update local project guidance files as a concrete file edit. This is not a same-session plugin verification step. Primary file: CLAUDE.md. Secondary file: AGENTS.md only if it already exists or I explicitly asked to prepare Codex guidance too. For each file you update: read the file first; if it already has a "## Segmently Launch Assistant" section, replace only that section from its heading until the next "## " heading or end of file; if it has no such section, append the exact section below at the end; if it has older Segmently Launch Assistant wording without that exact heading, append the exact section below and leave the older text unless you can remove only the stale Segmently block without touching unrelated instructions. If CLAUDE.md does not exist, create it in the target project folder only after confirming the folder path. Do not create or edit global CLAUDE.md/AGENTS.md files and do not remove unrelated project instructions. Write this exact section:

## Segmently Launch Assistant

- These rules apply after starting a new Claude Code session in this project folder, once the installed Segmently Launch Assistant plugin skills are visible.
- Use the installed Segmently Launch Assistant plugin for Segmently launch/support tasks. `segmently-launch-guide` is the single entry point: it routes every Segmently intent through its shipped quick index and returns the TEACH / SHOW / DO / article contract to follow.
- Do not answer Segmently product, CLI, API, editor, paywall, support-flow, or launch questions from general model knowledge.
- Do not invent Segmently commands, APIs, fields, routes, product behavior, docs, or troubleshooting steps.

**Which skill when:**
- Product, how-to, "what is left to launch", settings, integrations, paywall, analytics questions -> `segmently-launch-guide` (articles first, guides second; guides are evidence material, never a routing peer).
- "Do it for me" through the CLI -> the owning skill named by the runner contract (`segmently-cli-guide`, `segmently-cli-custom-screen-guide`, `segmently-cli-image-upload`, `segmently-cli-articles`, `segmently-cli-paywall-ab-rollout`). Never re-implement CLI work inline.
- Paywall unit economics ("is this price worth launching", trial vs no trial, App Store vs web fees, which experiment first, how long a test needs) and the growth cycle ("where can we grow", "what to test next", "is this test real") -> `segmently-unit-economics`: offline `segmently ue`, no Segmently login; every number comes from its own run, and the answer is a scenario, never a forecast.
- Browser SHOW / editor E2E DO -> the packaged runners only. Navigation is assembled from registered routes (`runtime/route-runner.mjs --list` / `--route <routeId>`, or the `--routeId` prefix on the SHOW/E2E runners). The browser is for execution and fixes, not for route discovery. Never quote selector values in replies; describe destinations with the route's customerSafeLabel.
- Design imports and screen prototyping -> `claude-design`; `segmently-test-kit` is an execution companion, never an answer source.
- Prefer the bundled plugin subagents for heavy side work when available: `segmently-corpus-search` (catalog/graph lookups), `segmently-tool-preflight` (tool/auth checks), `segmently-browser-show` (headed SHOW sessions), `segmently-next-step-prepper` (background prefetch, only when predictive mode is on).

**Evidence and sections:**
- For customer answers, select article aliases, guide keys, and action ids from the installed shipped catalogs first; use runtime runners only to validate evidence and execution boundaries.
- The article and guide catalogs are compact directories: load heavy sections only for the selected items through their `contentRef` files (`references/articles/<alias>.json`, `references/guides/<guideKey>.json`). Never blanket-load whole catalogs into context.
- Read selected article/guide sections before answering. If selected snippets are too thin, run the read-only article-fetch path and use the fetched article/config sections as answer material.
- Answer only through installed Segmently skills/references/runners, selected article content, public Segmently CLI output, and verified Segmently or Playwright output.

**Session state and proactivity:**
- The current project lives in the non-secret session context (`runtime/session-context.mjs`). Use the saved project automatically, say which saved project you are using, and still ask for missing funnel/version/screen/value inputs.
- The session engine is ON by default: record routed intents (`runtime/session-engine.mjs record-intent`) and check `runtime/session-engine.mjs get` at session start. When a FRESH launch-state snapshot exists, offer AT MOST ONE proactive resume suggestion per session; never auto-execute it; a declined suggestion is not repeated.
- A stale snapshot is not evidence: re-verify with the launch-progress runner before relying on it.
- Predictive next-step prefetch is opt-in (`runtime/session-engine.mjs set-engine --predictive on`). Background preparation is read-only and a prepared plan never skips confirmation or preflight gates. `SEGMENTLY_LAUNCH_ENGINE=off` is the kill-switch for the whole engine.

**Execution safety:**
- Run host, Segmently CLI, and Playwright preflight before SHOW or DO work.
- Use segmently auth login instead of asking for tokens; browser sessions authenticate through the CLI auth bridge, never by filling the login form.
- Delegate CLI-specific work to the returned owning skill, such as segmently-cli-guide or segmently-cli-custom-screen-guide.
- Do not claim a mutation is complete until execution and verification both pass.
- If plugin skills are not visible in the current session, stop and ask me to restart/open a new session in this project folder. Do not answer Segmently product questions from plugin cache files or general model knowledge.

8. Do not try to verify Segmently product answers through the plugin in this same session, and do not inspect plugin cache files as a substitute for using the loaded plugin. Newly installed plugins usually require a new Claude Code session before skills are available.
9. Finish by telling me setup is installed and local project guidance is written, then ask me to close this Claude Code session, open a new Claude Code session in the same target project folder, and run this post-restart verification prompt:

Post-restart verification prompt:
"Verify the Segmently Launch Assistant plugin in this project. First read the local CLAUDE.md Segmently Launch Assistant section. Use only installed Segmently Launch Assistant plugin skills, shipped references, selected article content, Segmently CLI output, and Playwright CLI output for Segmently answers. Confirm the plugin skills are visible in this new session (segmently-launch-guide and segmently-unit-economics among them), run Segmently CLI auth/capabilities checks, run Playwright CLI help/browser readiness checks, then answer this simple plugin-backed prompt: 'Show me what is left before launch.' After that, initialize my working state: ask me for my Segmently project id and name and save them with the packaged session-context runtime (set-current-project), confirm the session engine defaults with the packaged session-engine get command, and ask whether I want proactive next-step prefetch; if I say yes, enable it with the packaged session-engine set-engine --predictive on command. If plugin skills are not visible, say the session/plugin load failed and do not answer from general model knowledge or by reading plugin cache files directly."

10. Do not claim runtime verification is complete in the install session. The correct install-session completion state is: host prerequisites checked or installed, Segmently CLI auth/capabilities checked, Playwright CLI/browser support checked, Claude Code plugin installed or updated, and local target-project CLAUDE.md/AGENTS.md guidance updated. If a step needs my approval or browser login, ask for that single approval and then continue.
```

## Current Project Context

The assistant can remember one current Segmently project in a non-secret local
state file so follow-up questions do not need the project id every time. The
agent should tell you which saved project it is using and still ask for missing
funnel, version, screen, value, file, or video inputs.

Manual context commands from this marketplace checkout:

```bash
node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-context.mjs get
node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-context.mjs set-current-project --projectId <projectId> --projectName "<Project name>"
node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-context.mjs clear-current-project
SEGMENTLY_LAUNCH_CONTEXT_FILE=/absolute/path/context.json node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-context.mjs get
```

The context file must never contain tokens, passwords, screenshots, customer
content, or service credentials.

## Session Engine And Proactive Mode

On top of the current-project context, the assistant keeps a small TTL-gated
per-project session cache (launch-state snapshots ~6h, predicted next steps
~30m) so it can pick up where you left off. With the default settings
(`engine.session=on`, `engine.predictive=off`) the assistant may offer at
most one proactive "continue where you stopped" suggestion per session — it
never auto-executes anything, and a stale snapshot always triggers a fresh
launch-progress re-verify first.

Settings that give the most value:

1. Save your project once (`set-current-project` above) — every later
   question can skip the project id.
2. Opt in to predictive next-step prefetch if you want the assistant to
   pre-assemble the likely next step in the background between your messages.
   Preparation is read-only; execution still requires your confirmation and
   the preflight gates.

```bash
node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-engine.mjs get
node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-engine.mjs set-engine --predictive on
node plugins/segmently-launch-assistant/skills/segmently-launch-guide/runtime/session-engine.mjs clear
SEGMENTLY_LAUNCH_ENGINE=off  # environment kill-switch for the whole engine
```

The session cache stores only non-secret whitelisted fields (project id, goal,
milestone statuses, routed intent ids, prepared read-only plans). Clear it any
time with the `clear` command.

## Codex Install

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
codex plugin add segmently-launch-assistant@segmently-support
```

## Codex Update

```bash
codex plugin marketplace upgrade segmently-support
codex plugin add segmently-launch-assistant@segmently-support
```

Start a new Codex thread after reinstalling so updated plugin skills are loaded.

## Codex Pin A Release

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref v0.1.0-codex.<hash>
codex plugin add segmently-launch-assistant@segmently-support
```

## Claude Code Install

```bash
claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user
claude plugin install segmently-launch-assistant@segmently-support --scope user
```

## Claude Code Update

```bash
claude plugin marketplace update segmently-support
claude plugin update segmently-launch-assistant@segmently-support --scope user
```

Start a new Claude Code thread after updating so refreshed plugin skills are loaded.

## Claude Code Pin A Release

```bash
claude plugin marketplace add segmently-ai/segmently-support-plugins@v0.1.0-codex.<hash> --scope user
claude plugin install segmently-launch-assistant@segmently-support --scope user
```

This repository is generated from Segmently SupportFlow source. Do not edit generated plugin files by hand.
