---
name: segmently-cli-guide
description: Customer-safe Segmently CLI companion for project, funnel, theme, screen, publish, analytics, domain, and verification tasks.
---

# Segmently CLI Guide

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The launch guide returns a `do-cli` action owned by `segmently-cli-guide`.
- A customer asks to inspect, export, patch, publish, or verify a Segmently funnel through the CLI.

## Owns

- Published `segmently` CLI authentication and project targeting.
- Safe command construction for funnel, screen, theme, placement, publish, analytics, and readiness reads.
- Verification reads after launch-guide actions.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- `segmently funnels export` for screen and content changes.
- `segmently publish verify` or placement reads for public launch status.
- Relevant project or analytics read commands for setup state.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
