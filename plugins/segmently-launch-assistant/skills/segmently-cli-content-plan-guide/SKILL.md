---
name: segmently-cli-content-plan-guide
description: Customer-safe Segmently CLI companion for Content Plan flows when launch support routes into content planning or publishing tasks.
---

# Segmently CLI Content Plan Guide

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- A launch journey touches content planning, post generation, or Content Plan publishing.
- The customer explicitly asks for Content Plan CLI help.

## Owns

- Content Plan CLI command selection and read-back verification.
- Customer-facing content workflow guidance that stays on public CLI surfaces.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- Content Plan read commands return the expected plan, post, or artifact.
- Generated artifacts are linked through customer-visible URLs or ids.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
