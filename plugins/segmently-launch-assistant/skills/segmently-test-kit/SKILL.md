---
name: segmently-test-kit
description: Customer-safe runtime helper contract used by Segmently Launch Assistant browser SHOW and E2E DO plans.
---

# Segmently Test Kit

Use this skill only as the runtime companion named by Segmently Launch Assistant
SHOW and E2E DO contracts. It is not a general testing framework for the
customer to call directly.

## When To Use

- A `segmently-launch-guide` SHOW result names `segmently-test-kit` as the
  companion for browser navigation, focus, or screenshot evidence.
- A `segmently-launch-guide` E2E DO result names `segmently-test-kit` as the
  companion for a generated browser driver.
- The customer asks why browser setup, auth preflight, or verification is needed
  before a SHOW or E2E DO action can run.

## Runtime Contract

Read `references/runtime-contract.md` before acting on a generated browser
contract. The source of truth for the concrete action remains the JSON returned
by `segmently-launch-guide` runners.

The helper contract is intentionally narrow:

- Use the published `segmently` CLI from PATH for auth and verification reads.
- Use `playwright-bowser` for observable browser control.
- Keep SHOW read-only.
- Run E2E DO only when the launch-guide action contract, required target ids,
  browser auth, and explicit execute approval are all present.
- Never ask the customer for raw tokens, refresh tokens, service credentials, or
  direct database access.
- Never require a Segmently source checkout, project build, maintainer command,
  hidden endpoint, or local-only helper.

## Required Inputs

For SHOW, the generated contract normally needs a project, funnel, screen, and a
browser base URL or editor URL. If session project context is present, do not ask
for the project again; state which saved project is being used and ask only for
the missing target inputs.

For E2E DO, require the action value plus every target id listed in the
launch-guide contract. Do not infer a missing screen, funnel, or version from
nearby prose when the runner says it is still missing.

## Preflight

Follow `references/browser-preflight.md` before live browser work. Missing CLI
auth or browser tooling is a recoverable preparation step, not a final failure.

## Verification

Follow `references/verification-contract.md`. A mutation is complete only after
the generated action executes and the named read-back verification succeeds.
Dry-run output is a plan, not completion.
