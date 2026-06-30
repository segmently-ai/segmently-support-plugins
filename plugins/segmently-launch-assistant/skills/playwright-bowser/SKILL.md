---
name: "playwright-bowser"
description: "Customer-safe Segmently browser companion for SHOW walkthroughs, screenshots, and generated E2E action contracts."
---

# Playwright Bowser

Use this skill when a user asks to show where something is in the Segmently UI,
capture a screenshot, verify visible browser state, or run a browser-backed
action contract produced by Segmently Launch Assistant.

This is the public browser companion shipped in the Segmently support plugin.
It is intentionally smaller than the Segmently internal QA skill with the same
runtime id. It uses `playwright-bowser-core` for browser command syntax and
uses generated launch-guide contracts for Segmently-specific actions.

## Preflight

Before live browser work:

```bash
segmently auth status
playwright-cli --help
```

If Segmently auth is missing, run:

```bash
segmently auth login
```

If browser tooling is missing, follow `playwright-bowser-core` setup.

## SHOW Flow

1. Resolve the user request with `segmently-launch-guide` when the screen or
   setting is ambiguous.
2. Ask for the editor URL or the minimum target ids needed to open the screen.
3. Open a persistent browser session with `playwright-cli`.
4. Navigate to the target without changing values.
5. Capture a screenshot when it helps the user locate the control.
6. Return the current URL, screenshot path, and concise next step.

Use the packaged `show-runner.mjs` contract when Launch Assistant provides one.

## Browser-Backed DO Flow

Only mutate through an explicit generated action contract:

- the owning launch-guide runtime must name the action;
- the user must confirm the project and screen target;
- the contract must include the browser driver and verification read.

Run the packaged `e2e-do-runner.mjs` or the exact browser commands returned by
the contract. A mutation is complete only after the verification read passes.

If auth, tool setup, target ids, or verification are missing, stop and ask for
that missing input. Do not claim completion from a screenshot alone.

## Boundaries

- Do not read a Segmently source repository.
- Do not use maintainer-only route books or local debug fixtures.
- Do not invent UI selectors or click paths.
- Do not print credentials, cookies, browser storage secrets, or token-like
  values.
- Do not perform broad destructive browser actions.

## Related Skills

- `playwright-bowser-core` for portable browser command syntax.
- `segmently-launch-guide` for request resolution and SHOW/DO contracts.
- `segmently-cli-guide` for read-back verification through public Segmently CLI.
