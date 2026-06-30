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
