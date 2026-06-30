# Storage State

Use storage state only when the user explicitly wants to preserve or restore a
browser session.

```bash
playwright-cli -s=<name> state-save auth-state.json
playwright-cli -s=<name> state-load auth-state.json
```

Treat storage files as sensitive. Do not print their contents, paste them into
chat, or commit them to a project.

For normal Segmently work, prefer an interactive authenticated session created
by the user or the public Segmently CLI auth flow.
