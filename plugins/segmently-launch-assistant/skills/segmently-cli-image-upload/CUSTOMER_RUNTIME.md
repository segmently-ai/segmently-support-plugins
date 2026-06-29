# Segmently CLI Image Upload Runtime Contract

Skill id: `segmently-cli-image-upload`

This file is part of the portable Segmently Launch Assistant plugin. It documents only customer-runtime behavior. Maintainer workflows, repository paths, hidden commands, and credential handling are intentionally absent from this bundle.

## Delegation Contract

- A launch screen/media action needs an image URL and the customer provides a file or image.
- The user asks to host an image for a Segmently screen, article, or media block.

## Completion Contract

- A mutation is complete only after the matching verification read succeeds.
- A walkthrough is complete only after the user can see the requested UI state or receives a concise text route.
- A handoff remains incomplete until the external account or DNS state is observed by a read-only verify command.
