---
name: segmently-cli-custom-screen-guide
description: Customer-safe Segmently CLI companion for supported custom screen, WebEmbed, and CDN asset stabilization workflows.
---

# Segmently CLI Custom Screen Guide

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The launch guide routes a WebEmbed/custom screen task to a specialized CLI surface.
- The user asks to stabilize or apply a supported custom screen artifact.

## Owns

- Custom screen and WebEmbed CLI actions that have public command contracts.
- Safe handoff to specialized custom-screen operations instead of generic document writes.
- Verification of generated screen artifacts and stable media URLs.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- `segmently funnels export` includes the expected custom screen marker.
- Published screen assets resolve to HTTPS URLs.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
