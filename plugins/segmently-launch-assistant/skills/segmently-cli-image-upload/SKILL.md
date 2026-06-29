---
name: segmently-cli-image-upload
description: Customer-safe Segmently CLI companion for uploading customer-provided images to Segmently CDN and returning reusable HTTPS asset URLs.
---

# Segmently CLI Image Upload

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- A launch screen/media action needs an image URL and the customer provides a file or image.
- The user asks to host an image for a Segmently screen, article, or media block.

## Owns

- Image upload through the published Segmently CLI.
- Image size preflight and customer-safe CDN URL reporting.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- Upload output includes an HTTPS original URL and smaller derivative when available.
- The returned URL is the one used in the follow-up screen or article operation.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
