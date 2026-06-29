# Segmently CLI Figma WebEmbed Import Runtime Contract

Skill id: `segmently-cli-figma-webembed-import`

This file is part of the portable Segmently Launch Assistant plugin. It documents only customer-runtime behavior. Maintainer workflows, repository paths, hidden commands, and credential handling are intentionally absent from this bundle.

## Delegation Contract

- The launch guide scenario asks to import a Figma/WebEmbed design into a Segmently screen.
- The customer has supplied assets and wants Segmently-ready custom screen output.

## Completion Contract

- A mutation is complete only after the matching verification read succeeds.
- A walkthrough is complete only after the user can see the requested UI state or receives a concise text route.
- A handoff remains incomplete until the external account or DNS state is observed by a read-only verify command.
