# Running Custom Playwright Code

Use `run-code` for scripted checks or generated action drivers.

```bash
playwright-cli -s=<name> run-code "async page => {
  await page.waitForLoadState('networkidle');
  return { url: page.url(), title: await page.title() };
}"
```

## Rules

- Keep scripts narrow and task-specific.
- Prefer visible labels and generated action contracts over guessed selectors.
- Return structured JSON when another skill or runner will verify the result.
- Use explicit timeouts for waits that may fail.
- Never log credentials, cookies, browser storage secrets, or token-like values.

## Evidence Example

```bash
playwright-cli -s=<name> run-code "async page => {
  await page.waitForLoadState('networkidle');
  return { url: page.url(), ready: true };
}"
playwright-cli -s=<name> screenshot --filename=segmently-evidence.png
```
