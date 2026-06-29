# Segmently CLI Custom Screen Guide Runtime Contract

Skill id: `segmently-cli-custom-screen-guide`

This file is part of the portable Segmently Launch Assistant plugin. It documents only customer-runtime behavior. Maintainer workflows, repository paths, hidden commands, and credential handling are intentionally absent from this bundle.

## Delegation Contract

- The launch guide routes a WebEmbed/custom screen task to a specialized CLI surface.
- The user asks to stabilize or apply a supported custom screen artifact.

## Completion Contract

- A mutation is complete only after the matching verification read succeeds.
- A walkthrough is complete only after the user can see the requested UI state or receives a concise text route.
- A handoff remains incomplete until the external account or DNS state is observed by a read-only verify command.
