# Segmently Unit Economics (Claude Code / Codex plugin)

One skill: paywall unit economics, computed on your machine by `segmently ue`.
No Segmently account, no network, no browser automation.

Prerequisites: Node.js 22+ with npx. That is all.

```bash
claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user
claude plugin install segmently-unit-economics@segmently-support --scope user
```

```bash
codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
codex plugin add segmently-unit-economics@segmently-support
```

Then ask: "Is a $19.99 monthly worth launching on the web?" — the skill answers with a
table, a verdict with its boundary, and a link that opens the scenario on
https://www.segmently.ai/unit-economics. It prints a scenario, never a forecast.

## One prompt install for Claude Code

Paste this whole block into a fresh Claude Code thread. It sets the machine up and stops
before using the skill: a newly installed plugin is visible only in a NEW session.

```text
Set up the segmently-unit-economics plugin for Claude Code on this machine, then stop and tell me to restart.

Marketplace: segmently-ai/segmently-support-plugins@stable. Plugin: segmently-unit-economics@segmently-support.

Run the steps in order and show me the exact output of every command:
1. node --version — it must print v22 or newer. If it is older or missing, tell me how to get Node.js 22 on this operating system and stop there.
2. npx -y @segmently/cli ue --version — it must print JSON holding "cli" and "mathHash". If it prints a bare version number, or "unknown command 'ue'", run npx -y @segmently/cli@latest ue --version instead. If that still does not print the JSON, stop and tell me the command-line tool on this machine has no ue verb yet.
3. claude plugin marketplace add segmently-ai/segmently-support-plugins@stable --scope user
   claude plugin install segmently-unit-economics@segmently-support --scope user
   If the marketplace is already there, run claude plugin marketplace update segmently-support and then claude plugin update segmently-unit-economics@segmently-support --scope user.
4. claude plugin list — the output must name segmently-unit-economics. If it does not, say so plainly and do not continue.
5. Do not try the skill in this session and do not answer any unit-economics question yourself. Tell me the setup is done, then ask me to open a NEW Claude Code session in the folder where my scenario files should live, and to paste the question below there.

The question for the new session:
"Use the segmently-unit-economics skill. I sell <what> for <price> per <month or year> on <the web, the App Store or Google Play>, my trial is <length, or none>, I pay about <amount> per install or click, and about <number> in 100 people who see the paywall buy. Is that worth launching, and what should I change first?"
```

## One prompt install for Codex

```text
Set up the segmently-unit-economics plugin for Codex on this machine, then stop and tell me to restart.

Marketplace: segmently-ai/segmently-support-plugins on ref stable. Plugin: segmently-unit-economics@segmently-support.

Run the steps in order and show me the exact output of every command:
1. node --version — it must print v22 or newer. If it is older or missing, tell me how to get Node.js 22 on this operating system and stop there.
2. npx -y @segmently/cli ue --version — it must print JSON holding "cli" and "mathHash". If it prints a bare version number, or "unknown command 'ue'", run npx -y @segmently/cli@latest ue --version instead. If that still does not print the JSON, stop and tell me the command-line tool on this machine has no ue verb yet.
3. codex plugin marketplace add segmently-ai/segmently-support-plugins --ref stable
   codex plugin add segmently-unit-economics@segmently-support
   If the marketplace is already there, run codex plugin marketplace upgrade segmently-support and then codex plugin add segmently-unit-economics@segmently-support again.
4. List the installed plugins and show me that segmently-unit-economics is among them. If it is not, say so plainly and do not continue.
5. Do not try the skill in this session and do not answer any unit-economics question yourself. Tell me the setup is done, then ask me to open a NEW Codex session in the folder where my scenario files should live, and to paste the question below there.

The question for the new session:
"Use the segmently-unit-economics skill. I sell <what> for <price> per <month or year> on <the web, the App Store or Google Play>, my trial is <length, or none>, I pay about <amount> per install or click, and about <number> in 100 people who see the paywall buy. Is that worth launching, and what should I change first?"
```

## What it answers

Ask in plain words; the skill asks three questions at most, then shows numbers.

- "Is a $19.99 monthly worth launching on the web?" — the launch card: what one buyer is
  worth, what one visitor is worth, how many months to make the money back.
- "Does a 7-day free trial pay for itself here?" — trial against no trial, same chain,
  one thing changed, with the point where the answer flips.
- "The App Store takes 30% — should I sell on my own page instead?" — the same offer
  through both fee stacks, side by side.
- "Which experiment should I run first?" — every lever ranked: the money per month if the
  change works, the days to learn it at your traffic, and whether the change is even
  visible inside a month.
- "How long until we know?" — the sample size and the calendar days a test needs at your
  budget, or a plain "not testable at this volume" with the smallest change you could see.
- "What should we test next, and what does the card say?" — the hypothesis card: the metric
  first (ranked at the horizon you name), then your change and the lift you believe in, the
  test plan, and after the test the read and the re-based numbers. Your hours stay yours.
- Paste any https://www.segmently.ai/unit-economics link back and it reads the scenario out of the link.

Only `ue init` and the skill's variant files write anything: plain JSON under `.ue/` in your
working folder, so a scenario survives the session; every other run only reads. Every answer
carries the link that opens the same numbers in the browser calculator, and says out loud
what it had to round, clamp or leave out.

## MCP

The same six handlers (evaluate, link, parse, init, rank, stat) also run as MCP tools
over stdio, for a host that already has `npx` but not this plugin:

```bash
claude mcp add ue -- npx -y @segmently/cli ue mcp
codex mcp add ue -- npx -y @segmently/cli ue mcp
```

Claude Desktop and Cursor: the same command under `mcpServers` in their MCP
configuration file.

claude.ai in the browser and ChatGPT need a remote server — not offered here; this
server speaks stdio only, spawned as a local process by the host above.
