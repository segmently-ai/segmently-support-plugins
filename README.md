# Segmently Support Plugins

Public read-only marketplace for Segmently customer support plugins.


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

Use Node.js 20 LTS or newer. Git must be able to read this GitHub marketplace
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
plugin, authenticate Segmently, and verify the installed runtime before you ask
it to operate on a funnel.

```text
Install or update the Segmently Launch Assistant plugin for Codex on this machine.

Use the public marketplace repository segmently-ai/segmently-support-plugins with ref stable
and install plugin segmently-launch-assistant@segmently-support.

Run these steps end to end and report the exact command results:
1. Preflight host tools: node --version, npm --version, npx --version, git --version, codex --version, codex plugin --help.
2. If node/npm/npx/git/codex is missing, start the prerequisite installation flow instead of stopping silently: detect the OS and available package manager, explain the exact install path you will use, ask for one approval if the install changes the machine, then install or guide me through installing the missing prerequisite. For Node/npm/npx, install Node.js 20 LTS or newer; for Git, install Git through the OS package manager or system developer tools; for Codex, install/update the Codex CLI by its current official method. After each install, re-run the matching --version/help check before continuing. If a prerequisite cannot be installed automatically, tell me the exact manual command/link and pause only for that action.
3. Install or update the Segmently CLI and verify it: npm install -g @segmently/cli; segmently --version; segmently auth status.
4. If Segmently auth is missing or expired, run segmently auth login, then re-run segmently auth status and segmently capabilities.
5. Install or update Playwright CLI and browser support: npm install -g @playwright/cli@latest; playwright-cli --help; playwright-cli install-browser. If install-browser is unavailable, run npx playwright install chromium; if Chromium still cannot launch on Linux, run npx playwright install --with-deps chromium.
6. Install or update the Codex plugin: codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable; codex plugin add segmently-launch-assistant@segmently-support. If the marketplace already exists, run codex plugin marketplace upgrade segmently-support, then run codex plugin add segmently-launch-assistant@segmently-support again.
7. If the current directory is the target project repository, persist usage guidance for future agents: read existing AGENTS.md and CLAUDE.md if present; preserve all existing instructions; add or update a "Segmently Launch Assistant" section. For Codex, prefer AGENTS.md and also update CLAUDE.md if it already exists. If a file does not exist, ask before creating it. The section should say: use the installed Segmently Launch Assistant plugin for Segmently launch/support tasks; run host/Segmently CLI/Playwright preflight before SHOW or DO; use segmently auth login instead of asking for tokens; delegate CLI work to the returned owning skill such as segmently-cli-guide or segmently-cli-custom-screen-guide; do not claim a mutation is complete until execution and verification both pass.
8. Start a clean verification from the installed plugin files if Codex exposes their path: run the installed segmently-launch-guide customer-response runner for a simple prompt such as "show me what is left before launch" or at minimum verify the plugin is listed by Codex.
9. Do not claim setup is complete until Segmently CLI auth/capabilities, Playwright CLI help/browser setup, Codex plugin install, and any requested AGENTS.md/CLAUDE.md update are all verified. If a step needs my approval or browser login, ask for that single approval and then continue.
```

## One Prompt Install For Claude Code

Copy this whole prompt into a fresh Claude Code thread. It performs the same
host-tool, Segmently CLI, Playwright, marketplace, plugin, and verification
flow for Claude Code.

```text
Install or update the Segmently Launch Assistant plugin for Claude Code on this machine.

Use the public marketplace repository segmently-ai/segmently-support-plugins@stable
and install plugin segmently-launch-assistant@segmently-support with --scope user.

Run these steps end to end and report the exact command results:
1. Preflight host tools: node --version, npm --version, npx --version, git --version, claude --version, claude plugin --help.
2. If node/npm/npx/git/claude is missing, start the prerequisite installation flow instead of stopping silently: detect the OS and available package manager, explain the exact install path you will use, ask for one approval if the install changes the machine, then install or guide me through installing the missing prerequisite. For Node/npm/npx, install Node.js 20 LTS or newer; for Git, install Git through the OS package manager or system developer tools; for Claude Code, install/update the Claude Code CLI by its current official method. After each install, re-run the matching --version/help check before continuing. If a prerequisite cannot be installed automatically, tell me the exact manual command/link and pause only for that action.
3. Install or update the Segmently CLI and verify it: npm install -g @segmently/cli; segmently --version; segmently auth status.
4. If Segmently auth is missing or expired, run segmently auth login, then re-run segmently auth status and segmently capabilities.
5. Install or update Playwright CLI and browser support: npm install -g @playwright/cli@latest; playwright-cli --help; playwright-cli install-browser. If install-browser is unavailable, run npx playwright install chromium; if Chromium still cannot launch on Linux, run npx playwright install --with-deps chromium.
6. Install or update the Claude Code plugin: claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user; claude plugin install segmently-launch-assistant@segmently-support --scope user. If the marketplace already exists, run claude plugin marketplace update segmently-support, then run claude plugin update segmently-launch-assistant@segmently-support --scope user.
7. If the current directory is the target project repository, persist usage guidance for future agents: read existing CLAUDE.md and AGENTS.md if present; preserve all existing instructions; add or update a "Segmently Launch Assistant" section. For Claude Code, prefer CLAUDE.md and also update AGENTS.md if it already exists. If a file does not exist, ask before creating it. The section should say: use the installed Segmently Launch Assistant plugin for Segmently launch/support tasks; run host/Segmently CLI/Playwright preflight before SHOW or DO; use segmently auth login instead of asking for tokens; delegate CLI work to the returned owning skill such as segmently-cli-guide or segmently-cli-custom-screen-guide; do not claim a mutation is complete until execution and verification both pass.
8. Start a clean verification from the installed plugin files if Claude Code exposes their path: run the installed segmently-launch-guide customer-response runner for a simple prompt such as "show me what is left before launch" or at minimum verify the plugin is listed by Claude Code.
9. Do not claim setup is complete until Segmently CLI auth/capabilities, Playwright CLI help/browser setup, Claude Code plugin install, and any requested AGENTS.md/CLAUDE.md update are all verified. If a step needs my approval or browser login, ask for that single approval and then continue.
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
