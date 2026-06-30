# Segmently Test Kit Runtime Contract

`segmently-test-kit` is a packaged helper contract for browser work initiated by
Segmently Launch Assistant. It gives the agent a safe boundary for using browser
automation without relying on a Segmently source repository.

## Ownership

- `segmently-launch-guide` resolves the customer prompt and returns the concrete
  SHOW or E2E DO contract.
- `playwright-bowser` opens and observes the browser session.
- `segmently-test-kit` supplies the Segmently-specific runtime rules for auth,
  navigation readiness, focused editor evidence, mutation boundaries, and
  read-back verification.

The assistant must not invent a browser action when the launch-guide runner did
not return one. Re-run the launch-guide resolver or ask for the missing target
inputs instead.

## SHOW

SHOW is read-only. The assistant may open the editor, focus the relevant section
or field when the generated contract supports it, and capture evidence. It must
not save, publish, upload, create, delete, or modify customer data.

If the browser lands on login, permission denied, or a missing-access state,
report that as an auth/access preparation step and retry after the customer
authorizes the account.

## E2E DO

E2E DO is mutating only after explicit execute approval. Before execution:

- Confirm the generated action id and mode are E2E/browser-backed.
- Confirm required target ids and the requested value are present.
- Confirm browser tooling and Segmently CLI auth preflight have passed.
- Confirm the customer approved execution on the current project/funnel/screen.

After execution, run the verification command named by the generated contract.
Do not claim the change was made if verification did not run or failed.

## What This Skill Does Not Do

- It does not expose maintainer test helpers.
- It does not bypass Segmently permissions.
- It does not use direct database writes.
- It does not replace the generated launch-guide action reference.
