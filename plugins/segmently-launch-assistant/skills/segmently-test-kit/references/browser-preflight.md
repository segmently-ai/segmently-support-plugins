# Browser Preflight

Run preflight before live SHOW or E2E DO browser work.

## Segmently CLI

Use the public Segmently CLI from PATH:

```bash
segmently --version
segmently auth status
```

If auth is missing, ask the customer to authorize the intended account and run:

```bash
segmently auth login
segmently auth status
```

Do not print token values. Do not ask the customer to paste credentials into the
agent chat.

## Browser Tooling

Use `playwright-bowser` for browser control. If browser tooling is missing, guide
the customer through the plugin README setup and retry the same generated
launch-guide runner after setup succeeds.

## Access Checks

After opening the target URL, verify that the page is not a login page, not a
permission-denied page, and not an access-error page. If access is missing,
treat that as preparation work and do not claim SHOW or DO completion.
