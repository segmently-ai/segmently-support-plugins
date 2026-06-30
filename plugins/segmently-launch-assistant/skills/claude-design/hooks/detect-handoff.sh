#!/bin/sh
# UserPromptSubmit hook — deterministic trigger for Claude Design hand-offs.
#
# Skill auto-triggering is probabilistic and under-fires on instruction-shaped
# hand-off prompts ("Use the claude_design MCP to import this project: …").
# This hook reads the submitted prompt (JSON on stdin) and, when it carries a
# Claude Design hand-off signature, prints a steer that the harness injects as
# context — guaranteeing the claude-design skill is consulted. Non-blocking.

input=$(cat 2>/dev/null)

printf '%s' "$input" | grep -Eqi \
  'api\.anthropic\.com/v1/design/mcp|claude_design[ _-]?mcp|claude\.ai/design/p/|[A-Za-z0-9_-]+\.dc\.html' \
  && printf '%s\n' '[claude-design hook] This is a Claude Design hand-off. Invoke the `claude-design` skill (Skill tool) and follow its Triggering section → workflow 3 (import custom screens) by default. The "claude_design MCP" maps to the built-in DesignSync tool — do NOT register an MCP server. Pull the project by id, then resolve the Segmently target and apply the publish gate.'

exit 0
