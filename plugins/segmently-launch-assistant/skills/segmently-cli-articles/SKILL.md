---
name: segmently-cli-articles
description: Customer-safe Segmently CLI companion for reading published help/article content and attaching article media when a launch answer needs deeper guidance.
---

# Segmently CLI Articles

This bundled skill is the customer-runtime companion shipped with Segmently Launch Assistant. It is generated at package time so installed Codex plugins do not inherit repository-oriented maintainer runbooks.

## Use

- The launch guide has a `fullArticleLink` or article id and the user asks for the full article.
- The user asks to attach customer-provided media to article content.

## Owns

- Published article reads when shipped guide snippets are not enough.
- Customer article/media operations that use public CLI surfaces.
- Article URL and image URL verification when the data exists.

## Runtime Rules

- Prefer the published `segmently` CLI on PATH for CLI work.
- Use the customer authenticated session; if auth is missing, ask the customer to run `segmently auth login` for the intended account.
- Production is the default target unless the customer explicitly chooses another Segmently environment.
- Never ask for raw tokens, refresh tokens, service credentials, or direct database access.
- Do not require a repository checkout, build step, source-tree command, or maintainer-only helper.
- Return the action result and then run the verification read named by the launch-guide action contract.

## Verification

- Article read output contains the requested title or alias.
- Media operations return concrete HTTPS image URLs.

Additional customer-runtime notes are in `CUSTOMER_RUNTIME.md`.
