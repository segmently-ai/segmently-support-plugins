---
name: "playwright-bowser-core"
description: "Portable browser automation core for public playwright-cli setup, sessions, screenshots, custom code, storage, traces, and videos."
---

# Playwright Bowser Core

Use this skill as the shared browser automation base for Segmently support
plugins. It documents public `playwright-cli` behavior only. It does not contain
Segmently maintainer runbooks, repository routes, local stack assumptions, or
private selectors.

## Preflight

Check Node/npm/npx before browser setup; Playwright CLI and its fallback browser
installer depend on them:

```bash
node --version
npm --version
npx --version
```

Use Node.js 20 LTS or newer. If any command is missing, ask the customer to
install Node.js and reopen the terminal before continuing.

Check the browser tool before any live browser work:

```bash
playwright-cli --help
```

If it is missing and the environment allows installs:

```bash
npm install -g @playwright/cli@latest
playwright-cli install-browser
```

If the browser install command is unavailable, use:

```bash
npx playwright install chromium
```

If Chromium still cannot launch on Linux, use:

```bash
npx playwright install --with-deps chromium
```

## Session Pattern

Use a named persistent session for user-facing walkthroughs:

```bash
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 playwright-cli -s=segmently-show open https://app.segmently.ai --persistent
playwright-cli -s=segmently-show snapshot
playwright-cli -s=segmently-show screenshot --filename=segmently-show.png
```

Use `run-code` for known scripted actions and `snapshot` for discovery. Capture
a screenshot when visual evidence helps the user.

## Safety

- Do not print credentials, cookies, browser storage secrets, or auth files.
- Do not run mutation scripts unless the owning skill supplies an explicit
  action contract and the user confirms the target.
- Report setup or auth blockers as setup blockers, not product failures.
- Close short-lived sessions when the task is complete.

## References

- [Command reference](references/playwright-cli.md)
- [Custom code](references/running-code.md)
- [Storage state](references/storage-state.md)
- [Tracing and video](references/evidence.md)
