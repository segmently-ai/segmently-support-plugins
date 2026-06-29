---
name: playwright-bowser
description: Customer-safe browser companion for observable Segmently UI walkthroughs and generated E2E execution plans.
---

# Playwright Bowser

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The launch guide returns a `do-e2e` action.
- The user asks to show where something is in the Segmently UI.

## Owns

- Opening a browser session when the user asks to show a UI path or when a supported E2E action must run.
- Executing generated driver scripts returned by `editor-do-runner.mjs`.
- Capturing evidence after navigation or mutation.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- Return the browser URL or screenshot evidence for SHOW requests.
- For DO requests, run the verification object returned by the launch-guide runtime.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
