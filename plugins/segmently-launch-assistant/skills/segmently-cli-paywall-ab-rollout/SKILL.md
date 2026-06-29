---
name: segmently-cli-paywall-ab-rollout
description: Customer-safe Segmently CLI companion for creating sandbox Stripe paywall products, attaching offers, and verifying paid onboarding rollout state.
---

# Segmently CLI Paywall Rollout

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The launch guide needs a paywall product or a paid onboarding offer before publishing.
- The customer asks for a sandbox/test paywall product or rollout demonstration.

## Owns

- Paywall product creation or reuse through the published Segmently CLI.
- Sandbox Stripe paywall setup when the user asks for a safe test offer.
- Read-back verification of products and funnel paywall configuration.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- `segmently stripe products` contains the expected product.
- `segmently funnels export` contains the expected paywall product marker.
- Runtime purchase verification only after the user explicitly asks for a browser purchase test.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
