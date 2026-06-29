---
name: segmently-product-cli-guide
description: Customer-safe Segmently Product CLI companion for product-page flows that a launch journey may need to inspect or update.
---

# Segmently Product CLI Guide

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The support-flow route touches product-page surfaces or product records.
- The customer asks for Product Page CLI help while preparing launch content.

## Owns

- Product Page CLI task selection and verification.
- Customer-facing reads and updates for product surfaces connected to launch flows.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- Product CLI reads show the expected product/page state.
- Any update is followed by a read-back command.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
