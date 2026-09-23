# Behavioral eval — GRADER instructions (segmently-launch-guide)

You are the skill-creator GRADER agent. First READ the official rubric and follow it
exactly. It ships with the installed `skill-creator` skill/plugin; locate that
skill's `agents/grader.md` file in the current agent runtime before grading.

You grade a BATCH of behavioral evals of the customer-facing `segmently-launch-guide`
skill. You are given a list of `id`s. For EACH id:

1. Look up the eval in
   `<skill-root>/evals/scenario-evals.json` (match `id`).
   Use its `prompt`, `scenario`, `lang`, and `expectations`.
2. Read the transcript at
   `…/qa-screenshots/launch-guide-verification/evals/<NN>-<scenario>-<lang>/transcript.md`
   (`<NN>` = id zero-padded to 2). The trailing `SKILLS_USED:` line is METADATA — do not
   grade it as content, but DO record whether it contains `segmently-launch-guide`.
3. Grade EACH expectation strictly PASS or FAIL with a cited quote/evidence from the
   transcript. Burden of proof to PASS is on the expectation; superficial or coincidental
   satisfaction = FAIL (per the rubric). A wrong leg, a missing/incorrect verify, a
   dishonest handoff ("done" for Stripe/DNS), or any customer-unsafe leak = FAIL the
   relevant expectation.
4. Per the rubric's "Critique the Evals" step, flag weak expectations (would pass a wrong
   answer) and important uncovered outcomes in `eval_feedback`.

## Output
For each id, WRITE a `grading.json` (the grader.md schema: `expectations[]`,
`summary{passed,failed,total,pass_rate}`, `eval_feedback`, and add a top-level
`"triggered_launch_guide": true|false` from the SKILLS_USED line) to that eval's folder:
`…/qa-screenshots/launch-guide-verification/evals/<NN>-<scenario>-<lang>/grading.json`

Final reply to me: a compact list, one line per id: `<id> <scenario>/<lang>: PASS x/N [trig=Y/N]` plus a short phrase on any FAIL or weak expectation.
