# UC-8 — Test plan for a change
Route: ONE change: "how long must the test run", "sample size"; counts, no card (SKILL.md § Router) · Eval: P8 · MCP: uc-8, cases-uc-8
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
1. The change and the lever it moves, named as `ue rank` names it: `p1` landing → step 1, `p2` step 1 →
   paywall, `p3` paywall → buy-tap, `close` payment completion, `bought` the paid share of buy-taps,
   `mix` the take of the product whose share move gains the most, `trialConv` trial → paid.
2. The daily budget, filled into the base's `volume` in place (SKILL.md § Files: filling a stated input
   is not re-basing), with its `label` and a `measuredOn` that names the budget as theirs.
3. The believed lift, asked once, after ONE `ue rank` run at the default lift — the question quotes that
   run: "At $<budget> a day, a change of ≥ <the row's `mde` at the shortest horizon> on <lever> is
   readable within <that horizon> days, and the default lift needs <the row's `days`> days — what lift do
   you expect from <the change>?" Their answer → the run with `--override <lever>=<lift>`; "I don't
   know" → the default run stands, its lift labelled "assumed lift"; a landed lift below the row's
   `mde` → say what is readable within the horizon instead of a plan (skeleton row 3).
- What the message already carries is not asked (a lift stated up front skips the default run and the
  question); a lift, a horizon or a σ is never proposed.

## Calls
- `npx -y @segmently/cli ue rank <file>` — the default run, JSON; horizons 30 and 90 days,
  `--horizon <N>` with the reader's own.
- `npx -y @segmently/cli ue rank <file> --override <lever>=<lift>` — the run at the reader's lift.
- `npx -y @segmently/cli ue evaluate <file> --explain` at the same volume — its `readiness.line`.
- `npx -y @segmently/cli ue link <file> --label '<name>'` — the base at the reader's budget; never the
  `link` field of `ue rank` or `ue evaluate`.
- `npx -y @segmently/cli ue stat size --p <rate> --lift <lift>` is only a cross-check for a chain step
  exactly as the scenario carries it, or n alone for a rate no rank lever models (its days: ask, or n/a
  per SKILL.md § Arithmetic and units). A measured rate goes into the scenario first (`chain.p3`, a
  `completionRate`, a `trialConv`) and a rank run on it is quoted — never an n from one run beside days
  from another (rule 9).
- `npx -y @segmently/cli ue stat read --a <n>/<x> --b <n>/<x>` — a finished test (per arm: saw it /
  converted, the reader's counts); with a project:
  `ue stat read --a <n>/<x> --b <n>/<x> --project-file <file> --lever <lever> --horizon <N>`
- `ue stat means --sigma <σ> --delta <difference>` — a price or revenue-per-user test: only with the
  reader's σ (revenue per user, from their data) and the difference to detect; never a σ you picked.

## Answer skeleton
1. That lever's row as a field table, one row per field, in this order: `lever`, `lift` (its `liftLabel`;
   `askedLift` typed → landed when they differ), `gainPerMonth`, `roasAfter`, `populationPerDay` (by the
   row's `populationName` — never "visits", "clicks" or "sessions"), `nPerArm`, `days`, `spendRouted`,
   `mde` at each horizon, `realistic`, and last `note`, whole — each as `sentences.table` rounds it. The
   field table's LAST row is `note`, holding the row's `note` whole — print it there AND again, in
   quotation marks, after `days`. A field table that stops at `realistic` is unfinished. `nPerArm` comes
   from the rate and the lift alone; the population every earlier step shrinks is why `days` is long.
2. Report every warning: print each `sentences.warnings` line, one per line — never two joined in one
   sentence — those on rows you do not print included.
3. `realistic: false` with a non-null `days` → "Not testable at this volume in under N days." (N = the
   shortest horizon) in place of a plan, then the row's `days`, its `note` in quotation marks, then —
   only when that horizon's `mde` is non-null — the lever's `sentences.realism` line. Never write "about
   26 %", "a 26 % swing" or "±": the `mde` is the smallest change that can be read.
4. `readiness.line` of the evaluate at the same volume, whole, beside the plan — the calendar days (the
   mix, the trial, annual renewals) the rank run's `boundary` does not carry.
5. **Link — the triple holds here too:** the privacy sentence on its own line (`privacy.sentence`; the
   budget is the reader's: `privacy.due`), the `ue link` call, then the link — "a feasibility read,
   nothing to share" is no exemption. Every cured `measured_missing` is reported once, in one line: a
   `ue link` call's own → "`measured_missing` → re-minted with measured=<note>"; the one `ue init` /
   `ue evaluate` print about their own `link` field (cured by setting `measuredOn`, references/stages.md,
   Onboarding) → "`measured_missing` on the <evaluate's | init's> link → re-minted with measured=<note>".
6. `boundary` of the rank run you print, whole — nothing appended to it.
7. The one question: Turn 3's, after the default run only.

**Reading a finished test:** `read.lines` whole — its fields carry the verdict as the CLI prints it
(`significant`, `not yet` or `underpowered`: an underpowered test is said to be underpowered, with the
size its `read.needPerArm` names), `read.ci95` among them; with a project its drift line and the
verdict's sentence are lines of it, printed once. One read at the planned end: reading daily raises false
positives. Then `context.boundary` whole, last.

## Boundary
Rendered: `boundary` of the rank run you print, whole, nothing appended. A read: `context.boundary` when
`--project-file` and `--lever` were given, else `read.lines` stands alone (no project → no boundary
lines; say which project a later read should name).

## Stops
- A row with null `days` is `realistic: false` too, and gets neither sentence: a lever that cannot move
  (`lift` 0, `gainPerMonth` 0, null `nPerArm`, `days`, `spendRouted` and `mde`) or `renewals`, a calendar
  read with no sample size (`ue stat read` refuses it as `--lever`). Quote its `note`; attempt nothing.
- A price test without σ: say the size needs the variance of revenue per user from their data — no run.

## Worked example

The reader: "How long until we know if a new paywall that lifts buy-taps works? We spend $300
a day." The lever is `p3` (paywall → buy-tap). They named no lift, so `p3` takes `ue rank`'s
default +10 % relative — the "assumed lift", so the run takes no `--override`. Base: a two-plan
project on the book's chain, Monthly $19.99 with a 7-day free trial and Annual $119.99. The
reader's budget goes into the base in place (the "Variant files" rule: filling a stated input is
not re-basing), and its `measuredOn` names the budget as theirs — no date they did not give.

```bash
npx -y @segmently/cli ue init my-app --product "Monthly~19.99~1month~7d-free" --product "Annual~119.99~1year~none" --platform web --have none
# edit .ue/my-app.json in place: scenario.volume { "amount": 300, "unit": "budget_day" },
# label "paywall test $300/d", measuredOn "your budget $300 a day; the rest from the book"
npx -y @segmently/cli ue rank .ue/my-app.json
npx -y @segmently/cli ue evaluate .ue/my-app.json --explain
```

The `p3` row of that ONE rank run, field by field, rounded for reading as `sentences.table` rounds it —
money, days, `roasAfter` and `populationPerDay` to two decimals (trailing zeros dropped as the CLI prints
them: `spendRouted` 59560, `populationPerDay` 30), `nPerArm` whole, `lift` and `mde` to four decimals;
`lift` with its `liftLabel` (and `askedLift` typed → landed when they differ), `populationPerDay` with
the row's `populationName`. The last row is the row's `note`, whole:

| field | value |
|---|---|
| `lever` | p3 |
| `lift` | 0.1 (assumed lift) |
| `gainPerMonth` | 810.86 |
| `roasAfter` | 0.98 |
| `populationPerDay` | 30 — funnel starts reaching the paywall a day |
| `nPerArm` | 2978 |
| `days` | 198.53 |
| `spendRouted` | 59560 |
| `mde` @ 30 d | 0.2606 |
| `mde` @ 90 d | 0.1492 |
| `realistic` | false |
| `note` | not at this traffic: within 30 days you can only see a ≥ 26.1% change — test a bigger change, or raise volume |

The row's sequence — printed whole, in this order:

**Not testable at this volume in under 30 days.** 198.53 days.

"not at this traffic: within 30 days you can only see a ≥ 26.1% change — test a bigger change, or raise volume"

Its `sentences.realism` line — printed whole:

Within 30 days you can only see a ≥ 26.1% change on `p3`.

The run's `sentences.warnings`, one per line, although neither row is printed — printed whole:

- rank bought: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +9.98% — every figure of this row uses the landed lift
- rank renewals: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.14% — every figure of this row uses the landed lift

Beside it, the calendar from the evaluate run at the same $300 a day, `readiness.line` — printed whole:

"paywall mix decidable after 29 days · trial verdict after 105 days · annual renewals due at month 12, observable from month 13".

The `ue link` result says `privacy.due` `true` (`carries` `prices`, `volume` — the budget is the
reader's), so the privacy sentence comes first, on its own line, then the call, then the link.
`privacy.sentence` — printed whole:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link .ue/my-app.json --label 'paywall test $300/d'
```
`https://www.segmently.ai/unit-economics?v=2&label=paywall%20test%20%24300%2Fd&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=300:budget_day&measured=your%20budget%20%24300%20a%20day%3B%20the%20rest%20from%20the%20book&p=Monthly~19.99~1month~7d-free~30.10~100.0~2.86~50.0&p=Annual~119.99~1year~none~14.00~100.0~1.00~&ref=skill`

It returns `roundTrip` `ok` and `warnings` `[]`. The `ue init` run above warned on its own `link` field;
the `measuredOn` set before this mint cured it, so one line under the link reports it once:
"`measured_missing` on the init's link → re-minted with measured=your budget $300 a day; the rest from
the book".

`boundary` — printed whole:

> These figures are this scenario's arithmetic on the inputs above.
>
> - cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
> - Monthly: $19.99, monthly, a 7-day free trial — measured: your project file (price, cadence, trial)
> - Monthly's take 30.1 % — assumed: the CLI's init split
> - Monthly's charges 2.86 — assumed: the book
> - Monthly's completion 100 % — assumed: the book
> - Monthly's trial conversion 50 % — assumed: the book
> - Annual: $119.99, yearly, no trial — measured: your project file (price, cadence, trial)
> - Annual's take 14 % — assumed: the CLI's init split
> - Annual's charges 1 (its cadence cap) — assumed: the book
> - Annual's completion 100 % — assumed: the book
> - $300 a day — measured: your stated budget
> - the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
> - the +10 % on `p1`, `p2`, `p3`, `bought`, `trialConv`, `mix` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - the default horizons, 30 and 90 days (`ue rank`'s own) — assumed
> - the 50/50 split of the test this table plans — assumed: the test design
> - not testable soon, in this 30-day run: `p1` 37.63 days, `p2` 52.17 days, `p3` 198.53 days, `bought` 383.81 days, `trialConv` 1000.35 days and `mix` 1912.76 days — past 30 days at this budget, each at its own `days`; `renewals` — a calendar read.

Then the one question, quoting that run: "At $300 a day, a change of ≥ 0.2606 on `p3` is readable within
30 days, and the default lift needs 198.53 days — what lift do you expect from the new paywall?" "I don't
know" leaves this answer standing, its lift "assumed lift"; a lift → the same run with
`--override p3=<lift>`, its row printed as above.

A finished test's counts are **Reading a finished test**: `ue stat read` with the counts, its
`read.lines` printed whole — `read.ci95` and `read.needPerArm` among its fields, the drift line with a
project — then its `context.boundary`. This reader has no counts yet.
