# playwright-cli Command Reference

`playwright-cli` provides token-efficient browser control for coding agents.

## Common Commands

```bash
playwright-cli open [url]
playwright-cli goto <url>
playwright-cli snapshot
playwright-cli click <ref>
playwright-cli fill <ref> <text>
playwright-cli screenshot --filename=<file>
playwright-cli run-code "<async function>"
playwright-cli close
```

## Sessions

```bash
playwright-cli -s=<name> open https://app.segmently.ai --persistent
playwright-cli -s=<name> snapshot
playwright-cli -s=<name> screenshot --filename=<file>
playwright-cli -s=<name> close
```

Use session names that describe the user task. Persistent sessions preserve
browser state between commands.

## Useful Environment

| Variable | Purpose |
|---|---|
| `PLAYWRIGHT_MCP_VIEWPORT_SIZE` | Browser viewport, for example `1440x900`. |
| `PLAYWRIGHT_MCP_CAPS` | Extra capabilities such as `vision` or `pdf`. |
| `PLAYWRIGHT_MCP_BROWSER` | Browser engine. |
| `PLAYWRIGHT_MCP_OUTPUT_DIR` | Directory for screenshots and traces. |
| `PLAYWRIGHT_MCP_TIMEOUT_ACTION` | Action timeout in milliseconds. |
| `PLAYWRIGHT_MCP_TIMEOUT_NAVIGATION` | Navigation timeout in milliseconds. |
