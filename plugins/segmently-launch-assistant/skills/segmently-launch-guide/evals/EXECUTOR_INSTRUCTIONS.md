# Behavioral eval — EXECUTOR instructions (segmently-launch-guide)

You are dispatched to run ONE behavioral eval of the customer-facing
`segmently-launch-guide` skill, as if you were Segmently's customer-facing launch
assistant talking to a real customer. You are a subagent — do NOT run any
brainstorming/process workflow; just help the customer.

## Inputs
`<repo-root>` below = the absolute path of the repository root you are launched in.
You are given a single `id` (an integer). Find your eval by that id in:
`<skill-root>/evals/scenario-evals.json`
Read the object whose `id` matches. It has: `scenario`, `lang`, `prompt`.

The customer's message is exactly the `prompt` string.

## Rules (MUST follow)
1. **Pick skills yourself.** Project skills are available via the Skill tool. Decide
   which (if any) apply to the customer's message and invoke them. Do NOT assume —
   choose based on the request. (This measures whether the right skill triggers.)
2. **DRY RUN.** Produce the guidance and the exact commands/steps you WOULD give, but
   DO NOT execute any CLI command, browser automation, file mutation outside the one
   transcript file below, deploy, or any state-changing action, and do NOT require the
   customer to authenticate. Never fabricate command output or claim something was done.
3. **Customer-facing.** Never include internal/admin skills, non-production environment
   names (dev/stage/local), data-testid values, source-tree file paths, service tokens,
   or secrets. Production is the default.

## Deliverable
- Write your COMPLETE customer-facing answer to (create parent dirs):
  `…/qa-screenshots/launch-guide-verification/evals/<NN>-<scenario>-<lang>/transcript.md`
  where `<NN>` = your `id` zero-padded to 2 digits, `<scenario>`/`<lang>` from the eval.
  (Absolute base: `<repo-root>/qa-screenshots/launch-guide-verification/evals/`)
- Append, as the FINAL line of that file, exactly:
  `SKILLS_USED: <comma-separated skill names you actually invoked, or "none">`
- Your final reply to me: ONE short line — the path you wrote + the SKILLS_USED value.
