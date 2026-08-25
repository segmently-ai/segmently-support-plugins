# Session Engine (optional)

The session engine is an opt-in latency layer beside the durable session
context: a disposable per-project cache of the last verified launch state,
recently routed intents, and deterministically predicted next steps. Deleting
the cache never changes behavior — it only removes the shortcut.

## Toggles

Stored in `context.json` (`runtime/session-context.mjs`), overridable per run
by the `SEGMENTLY_LAUNCH_ENGINE` env var:

| Toggle | Default | Meaning |
|---|---|---|
| `engine.session` | `on` | Session cache: state snapshot + recent intents + proactive resume offer. |
| `engine.predictive` | `off` | Predictive prefetch: background next-step preparation. Requires `session=on`. |

```bash
node runtime/session-context.mjs get-engine
node runtime/session-context.mjs set-engine --session on --predictive on
SEGMENTLY_LAUNCH_ENGINE=off ...                 # kill-switch for one run
SEGMENTLY_LAUNCH_ENGINE=predictive=on ...       # env-only enable
```

Every `session-engine.mjs` command no-ops with `{ok:true, noop:true}` when the
required toggle is off — callers never need their own guard.

## Cache File

Default path: `$HOME/.segmently/launch-assistant/session-cache.json`
(override: `SEGMENTLY_LAUNCH_SESSION_CACHE_FILE` or `--cacheFile`). Mode
`0600`, JSON, `schemaVersion` 1, sessions keyed by project id (max 10, oldest
evicted). Non-secret routing data only — never tokens, credentials,
screenshots, or customer content.

Per-project session shape:

```json
{
  "stateSnapshot": {
    "goal": "ads-ready",
    "preflightStatus": "blocked",
    "checkedAt": "2026-07-02T12:00:00.000Z",
    "milestones": [{ "id": "webPlacementConfigured", "status": "failed", "inGoal": true }]
  },
  "recentIntents": [{ "kind": "article", "id": "facebook-pixel-capi-setup", "mode": "teach" }],
  "predictedNext": [{
    "candidateId": "scenario:configure-web-placement",
    "kind": "milestone",
    "confidence": "high",
    "why": "Remaining launch milestone ...",
    "preparedPlan": null,
    "preparedAt": null
  }]
}
```

## Commands

```bash
node runtime/session-engine.mjs get                      # snapshot + freshness + fresh predictions
node runtime/session-engine.mjs record-intent --kind article --id <alias> --mode teach
node runtime/session-engine.mjs write-state --stateJson '<json>'   # usually implicit (see below)
node runtime/session-engine.mjs predict [--topK 3] [--save]
node runtime/session-engine.mjs record-prediction --candidateId <id> --planJson '<json>'
node runtime/session-engine.mjs clear [--all]
```

`runtime/launch-progress-runner.mjs` calls `write-state` automatically after
every successful progress read (reported as `sessionEngine.recorded` in its
output), and a fresh snapshot invalidates earlier predictions. Recording
failures never break the primary read.

## Freshness (TTL)

- State snapshot: fresh for 6 hours from `checkedAt`
  (`SEGMENTLY_LAUNCH_STATE_TTL_MS` override). A stale snapshot is excluded
  from predictions and `get`/`predict` return `stateStaleRule`: re-verify with
  `runtime/launch-progress-runner.mjs` before any claim about project state.
- Predictions: fresh for 30 minutes from `predictedAt`
  (`SEGMENTLY_LAUNCH_PREDICT_TTL_MS` override). `get` returns only fresh
  entries; stale ones are silently ignored.

## Deterministic prediction

`predict` is pure traversal over the generated references — no model calls:

1. **High confidence** — the first remaining (`failed`/`warning`, in-goal)
   milestones from a FRESH state snapshot, in launch order, mapped to their
   scenario via `references/scenarios.matrix.json`.
2. **Medium confidence** — explicit reviewed neighbors of the most recent
   routed intent in `references/routing-quick-index.json`. The customer plugin
   intentionally ships no full SupportFlow graph.

Output candidates carry `candidateId`, `kind`, `confidence`, `why`, and the
resolvable ids (`scenarioId` / `articleAlias` / `actionId`).

## Proactivity rule

On session start with `engine.session=on`, a saved current project, and a
FRESH state snapshot that has remaining milestones: OFFER to continue once
("Last time X was left — continue?"), at most one suggestion per session.
Never auto-execute the suggestion; a declined offer is not repeated. If the
snapshot is stale, do not claim any project state — offer to re-run the
progress read instead.

## Speculation safety (predictive prefetch)

Predictions and prepared plans are read-only preparation. They may prefetch
reference lookups and assemble a plan, but execution ALWAYS goes through the
normal flow: customer confirmation, auth/tool preflight, DO runner gates. A
prepared plan never bypasses them, and a prediction miss is discarded
silently — the customer never sees speculation internals.
