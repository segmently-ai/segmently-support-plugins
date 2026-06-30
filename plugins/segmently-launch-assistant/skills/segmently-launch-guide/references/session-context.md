# Session Context

Segmently Launch Assistant may keep a small customer-local context file so the
agent does not ask for the project id on every request.

## State File

Default path:

```text
$HOME/.segmently/launch-assistant/context.json
```

Overrides:

- `SEGMENTLY_LAUNCH_CONTEXT_FILE=/absolute/path/context.json`

The state file is outside the plugin cache because plugin cache directories are
replaceable during updates.

## Stored Data

Only non-secret routing context is allowed:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-29T00:00:00.000Z",
  "currentProject": {
    "id": "project_id",
    "name": "Project name",
    "source": "user",
    "updatedAt": "2026-06-29T00:00:00.000Z"
  },
  "projects": [
    {
      "id": "project_id",
      "name": "Project name",
      "source": "user",
      "updatedAt": "2026-06-29T00:00:00.000Z",
      "lastUsedAt": "2026-06-29T00:00:00.000Z"
    }
  ]
}
```

Never store tokens, refresh tokens, passwords, service credentials, screenshots,
or customer content in this file.

## Shared Runtime Contract

This file is the shared project-context layer for Codex and Claude plugin
runtimes. Companion skills must not create their own current-project JSON files
or cache project state inside the plugin directory.

Project resolution order:

1. Use an explicit project link/id from the current request.
2. Otherwise use `currentProject` from this context file.
3. Otherwise ask once for a project link/id and visible project name, then save
   it here before continuing.

Future session fields, such as current funnel/version/screen, must be added by
schema-versioned changes to `runtime/session-context.mjs`. Keep the file
non-secret and safe to delete.

## Runtime Commands

Read context:

```bash
node runtime/session-context.mjs get
```

Set current project after the customer confirms the project:

```bash
node runtime/session-context.mjs set-current-project --projectId <projectId> --projectName "<Project name>"
```

Clear current project:

```bash
node runtime/session-context.mjs clear-current-project
```

Resolve the effective project for a runner:

```bash
node runtime/session-context.mjs resolve-project
```

## Agent Behavior

- If the customer provides a project link/id, use that explicit project for the
  current request. Offer to save it as the current project.
- If no project is provided but the context has `currentProject`, use it and say
  which project is being used.
- If a SHOW/DO request needs a project and there is no current project, ask once
  for a project link/id and project name, then save it.
- Do not ask for `projectId` again in the same workflow when the runner reports
  `sessionContext.usingCurrentProject=true`.
- A stored project does not replace missing funnel, version, screen, value, file,
  or asset inputs. Ask only for the remaining missing inputs.
