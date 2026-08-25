# Exact Runtime Packet Contract

The public CLI preview adapter exports one JSON object:

```json
{
  "packetVersion": 1,
  "agentId": "updateBlockFromLibrary",
  "taskType": "block-update",
  "promptMode": "library-adapt",
  "attempt": 1,
  "provider": "anthropic",
  "model": "project-available-model-id",
  "maxTokens": 64000,
  "promptPaths": [],
  "promptVersions": {},
  "systemPrompt": "exact rendered system prompt",
  "userMessage": "provider-neutral rendered user message",
  "effectiveUserMessage": "exact attempt-1 provider message",
  "renderInput": {},
  "outputSchema": { "name": "submit_block", "schema": {} },
  "resolvedBranch": {},
  "exactInputHash": "sha256:<64 lowercase hex characters>",
  "checksum": "sha256:<64 lowercase hex characters>"
}
```

## Hash

`exactInputHash` is SHA-256 over canonical JSON for the exact attempt-1
provider material:

```json
{
  "attempt": 1,
  "provider": "anthropic",
  "model": "project-available-model-id",
  "maxTokens": 64000,
  "messages": [
    { "role": "system", "content": "exact rendered system prompt" },
    { "role": "user", "content": "exact provider-facing user message" }
  ],
  "outputSchema": {}
}
```

`outputSchema` is included only when it is present in the packet. For Google
text-JSON mode it is omitted, and `effectiveUserMessage` includes the exact
Gemini JSON suffix. Hash `effectiveUserMessage`, never the provider-neutral
`userMessage` and never `renderInput`.

Google's transport omission does not weaken output validation. Run preparation
copies `references/block-screen-output-schema.json` into the run directory as
held-back `validation-schema.json` and records its byte checksum in the run
manifest. The evaluator validates that run's Google response with this pinned
snapshot, which is a mechanically generated, byte-parity-checked copy of the
Builder block-screen runtime schema. The snapshot is never added to the Google
`agent-request.json`. Evaluation requires both the snapshot and its run manifest,
verifies that the manifest binds the exact packet, and fails if the schema byte
checksum differs. It never falls back to a newer packaged schema for a prepared
Google run. Non-Google packets must carry their runtime
`outputSchema`; Google packets must omit it.

`checksum` is SHA-256 over the complete packet except the `checksum` field.

Canonical JSON recursively sorts object keys, preserves array order, omits
undefined values, and uses ordinary JSON scalar encoding. `exactInputHash`
proves the provider call bytes; `checksum` binds those bytes to the held-back
render/debug evidence.

## Provider-facing request

Only these fields are supplied to the fresh agent:

- `systemPrompt`;
- `effectiveUserMessage` as the attempt-1 user message;
- `outputSchema`;
- provider/model/max-token request settings;
- `exactInputHash` and `checksum` as audit identifiers.

`userMessage`, `renderInput`, `resolvedBranch`, `promptPaths`, and
`promptVersions` remain evaluator/debug evidence.
They are not extra instructions and must not be used to augment the model
message.

## Completion provenance

`run-manifest.json` is an immutable preparation receipt and therefore remains
`status=prepared-awaiting-agent`. After deterministic evaluation passes, the
operator writes a separate `completion.json` with
`scripts/record-agent-completion.mjs`. The completion receipt binds the packet
hash, request/raw-output/evaluation checksums, unique fresh-agent task id,
agent-request-only isolation declaration, and non-empty evaluator notes. A
prepared manifest or passing evaluation without this receipt is not accepted
as completed fresh-agent evidence.

## Required branch fields

The `updateBlockFromLibrary` `resolvedBranch` records at least:

- `agentId=updateBlockFromLibrary`;
- `insertionMode=staged|immediate`;
- `sourceScope=project|system`;
- `evidenceMode=strategy-default|selected-only|no-evidence`;
- `neighbours=both|predecessor-only|successor-only|none`;
- `hasVariableConflicts`;
- `hasAssetIntents`;
- `hasTargetTheme`;
- `operatorInstructionPresent`.

Only the resolved branch may render. Alternative evidence or neighbour
branches must be absent from `systemPrompt`, `userMessage`, and `renderInput`.

## Forbidden packet material

- `previewScreens` or any full render-only screen snapshot;
- source `aiAssets`;
- generated media URLs, storage paths, or provider-ready asset prompts;
- unselected evidence;
- raw database paths or records;
- expected answers or evaluator verdicts.

Asset examples may appear only as compact pattern references. Target output
must express semantic `aiMeta.assetIntents`; provider-ready asset prompts are a
later target-context operation.
