# Segmently Test Kit Runtime Contract

Skill id: `segmently-test-kit`

This file is part of the portable Segmently Launch Assistant plugin. It documents only customer-runtime behavior. Maintainer workflows, repository paths, hidden commands, and credential handling are intentionally absent from this bundle.

## Delegation Contract

- A generated E2E execution object names `segmently-test-kit` as a companion.
- Do not invoke this skill directly for customer prose; it is a runtime helper dependency.

## Completion Contract

- A mutation is complete only after the matching verification read succeeds.
- A walkthrough is complete only after the user can see the requested UI state or receives a concise text route.
- A handoff remains incomplete until the external account or DNS state is observed by a read-only verify command.
