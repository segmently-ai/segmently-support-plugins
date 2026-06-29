# Segmently CLI Guide Runtime Contract

Skill id: `segmently-cli-guide`

This file is part of the portable Segmently Launch Assistant plugin. It documents only customer-runtime behavior. Maintainer workflows, repository paths, hidden commands, and credential handling are intentionally absent from this bundle.

## Delegation Contract

- The launch guide returns a `do-cli` action owned by `segmently-cli-guide`.
- A customer asks to inspect, export, patch, publish, or verify a Segmently funnel through the CLI.

## Completion Contract

- A mutation is complete only after the matching verification read succeeds.
- A walkthrough is complete only after the user can see the requested UI state or receives a concise text route.
- A handoff remains incomplete until the external account or DNS state is observed by a read-only verify command.
