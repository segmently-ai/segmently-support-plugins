---
name: segmently-cli-figma-webembed-import
description: Customer-safe Segmently CLI companion for turning approved design assets into Segmently WebEmbed/custom screen inputs.
---

# Segmently CLI Figma WebEmbed Import

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The launch guide scenario asks to import a Figma/WebEmbed design into a Segmently screen.
- The customer has supplied assets and wants Segmently-ready custom screen output.

## Owns

- Guided import workflow once the user provides approved design/source assets.
- Media stabilization and handoff into supported Segmently custom-screen CLI operations.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- The generated artifact has stable HTTPS media references.
- `segmently funnels export` shows the applied WebEmbed/custom screen payload after apply.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
