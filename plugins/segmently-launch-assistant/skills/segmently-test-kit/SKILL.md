---
name: segmently-test-kit
description: Portable helper bundle consumed by generated browser runners for Segmently auth, navigation, editor, paywall, placement, and verification flows.
---

# Segmently Test Kit

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- A generated E2E execution object names `segmently-test-kit` as a companion.
- Do not invoke this skill directly for customer prose; it is a runtime helper dependency.

## Owns

- Reusable helper code consumed by generated E2E scripts.
- Stable browser automation primitives used by `playwright-bowser` plans.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- The generated browser runner completes and the launch-guide verification read passes.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
