# Segmently CLI Paywall Rollout Runtime Contract

Skill id: `segmently-cli-paywall-ab-rollout`

This file is part of the portable Segmently Launch Assistant plugin. It documents only customer-runtime behavior. Maintainer workflows, repository paths, hidden commands, and credential handling are intentionally absent from this bundle.

## Delegation Contract

- The launch guide needs a paywall product or a paid onboarding offer before publishing.
- The customer asks for a sandbox/test paywall product or rollout demonstration.

## Completion Contract

- A mutation is complete only after the matching verification read succeeds.
- A walkthrough is complete only after the user can see the requested UI state or receives a concise text route.
- A handoff remains incomplete until the external account or DNS state is observed by a read-only verify command.
