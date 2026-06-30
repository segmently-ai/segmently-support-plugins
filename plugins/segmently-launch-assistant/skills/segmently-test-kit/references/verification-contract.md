# Verification Contract

Every browser-backed action must end with evidence.

## SHOW Evidence

For SHOW, evidence can be:

- the final browser URL plus a concise route description;
- a screenshot path produced by the browser companion;
- a short statement that the target could not be reached because auth, access,
  or target ids are missing.

SHOW evidence must remain read-only.

## DO Evidence

For E2E DO, completion requires both:

- the generated browser driver ran against the requested target; and
- the generated read-back verification succeeded.

If execution ran but verification failed, report the observed state and keep the
action incomplete. If only a dry-run was produced, describe it as a plan and ask
for the missing execution inputs or approval.

## Customer Message Shape

When reporting results, include:

- what target was used;
- what action was attempted;
- what verification read was run;
- whether the result is complete, blocked, or still waiting for input.
