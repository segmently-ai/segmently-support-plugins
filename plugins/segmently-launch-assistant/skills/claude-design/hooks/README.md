# Optional hook — deterministic Claude Design hand-off triggering

Skill auto-triggering is **probabilistic** and under-fires on instruction-shaped hand-off prompts
("Use the claude_design MCP to import this project: …") — measured ~1–2 / 5 even with a tuned
description, because the model reads the prompt as a self-contained instruction and decides it can
act without consulting a skill. No description wording reliably wins that.

To make the `claude-design` skill fire **deterministically** on a Claude Design hand-off, wire
`detect-handoff.sh` as a `UserPromptSubmit` hook. It reads the submitted prompt (JSON on stdin) and,
when it matches a hand-off signature — `api.anthropic.com/v1/design/mcp`, `claude_design mcp`,
`claude.ai/design/p/`, or a `*.dc.html` file — prints a one-line steer that the harness injects as
context. It is silent and non-blocking on every other prompt.

## Enable (requires your approval — it changes agent startup config)

Merge into `.claude/settings.json` (into any existing `hooks` object):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "sh \"<skill-root>/hooks/detect-handoff.sh\"" }
        ]
      }
    ]
  }
}
```

Restart Claude Code afterwards. Verify:

```bash
printf '%s' '{"prompt":"… claude.ai/design/p/x?file=Y.dc.html"}' \
  | sh <skill-root>/hooks/detect-handoff.sh   # prints the steer
printf '%s' '{"prompt":"fix a failing test"}' \
  | sh <skill-root>/hooks/detect-handoff.sh   # prints nothing
```

> The skill **cannot** add this for you: registering a hook modifies agent-behavior config and is
> blocked by the auto-mode self-modification guard pending explicit user approval. Add the snippet
> yourself, or ask the operator to add it and approve the change.
