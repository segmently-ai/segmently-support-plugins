# UC-11 — Hypothesis card: which metric, then which change
Route: "what to test next", "hypothesis card"; a test's counts with its card → field 10 (SKILL.md § Router) · Eval: P11 · MCP: uc-11, cases-uc-11
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
On `.ue/<slug>.json` (none → `init`). The worked card is ANOTHER scenario: copy its shape, never a
sentence or a figure of it — every number and every list comes from the reader's own runs. Place each
input by `walk.lines`, never by the stage alone.
- **Turn 1 — horizon:** "In how many days do you want to read the result?" None named → this turn prints
  the choice run for its `mde` columns and closes with only that question; their reply still names none →
  30, labelled "default horizon", and every later run at that 30 adds `--horizon-default`. Nothing else
  is asked before the table is shown.
- **Turn 2 — lever and change:** after the table, one question naming only `recommendation.first`: "What
  change would you make to move <lever> (<its stage label>)?" Only when they have no idea for it, the
  next turn asks the same for `runnerUp`; a `realistic: false` lever only as a named big bet. Say nothing
  about whether their change is readable before they give a lift.
- **Turn 3 — believed lift:** "How much do you expect <their change> to move <lever>, as +X %?"

## Calls
- The choice run `ue rank .ue/<slug>.json --horizon 14,21,30` judges `realistic` at its shortest horizon,
  so it only helps choose; the card's table is a fresh `ue rank .ue/<slug>.json --horizon <N>
  --metrics-only` (the metric levers; UC-13: an offer change) — ONE run, JSON, no link with it (asked for
  one: SKILL.md § The loop, step 4).
- The card: the CLI lands the lift (its `snapped` warning gives typed → landed; the card quotes the
  landed lift) and writes the variant at it, `label` and `measuredOn` set — never build or edit it by
  hand; name it in `variants[]` by its `label`: `ue rank .ue/<slug>.json --horizon <N> --metrics-only
  --override <lever>=<lift> --card .ue/<slug>/card-<lever>.json`
- The read (field 10), on the project before any re-base; `--lever` is the card's lever — any rank lever
  but `renewals`: `ue stat read --a <n>/<x> --b <n>/<x> --project-file .ue/<slug>.json --lever <lever>
  --horizon <N> --belief <the card's typed lift>`
- On `significant` only, the same read, every flag kept (`--belief`, `--horizon-default`), plus
  `--rebase`: the CLI writes the re-base (the old base into `variants[]`, the counts into `observed[]`,
  the lever at `read.pB` as printed, `measuredOn`, `updatedAt`) — never a hand edit.

## Answer skeleton
1. The table run: `sentences.traffic`, every `sentences.table` line, a blank line, every
   `sentences.belowTable` line as a `- ` bullet, a blank line, `sentences.pick` (SKILL.md § Blocks the
   CLI renders, the rank table), then its `boundary` whole — learnable rows are THIS run's `realistic`
   column. The choice run: the same, no `sentences.pick`.
2. The one question of Turn 2, naming only its lever — never the pick or a row again (rule 5).
3. The card, ten fields, each with its unit (field 10 too: `cases/uc-13-test-an-offer-change.md` Turn 7):

| Field | Prints |
|---|---|
| (1) Horizon and traffic | N, `base.startsPerDay`, the budget. |
| (2) Base | Its evaluate: value per buy-tap net, required, CAC per payer, profit per start, ROAS on its `valueBasis`, payback as `words.payback` prints it, whole, `readiness.line`; its `walk.lines` as the provenance, word for word (every deduction with its value among them); the base link, `privacy.sentence` above its call when its `privacy.due`. |
| (3) Metric | Key: profit per start, its base value as field (2) prints it; nearest: the lever on its population (`populationPerDay`), today's rate, the row's `mde`, its stage label from this fixed map, never asked: `p1` → acquisition; `p2` → activation; `renewals` → retention; the rest → revenue. |
| (4) Guardrails | Every other table row with its `days` AND its `mde` (its `note` when `mde` is null); the override row's `guardrail.watch`, verbatim, and always CAC per payer and payback from the base. |
| (5) Hypothesis | "If <the change>, then <lever> <today> → <landed>, +<landed lift> % (believed); if the lift holds, profit per start $<base> → $<variant> and ROAS <base> → <variant>, +$<gainPerMonth> a month at <volume>.", then the card block whole (SKILL.md § Blocks the CLI renders) — `card.lines` when the card comes inline; from the `--card` run every `card.prepared` line → every `card.snapped` line → the `card.evaluateCommand` run and its KPIs (the card's, never the base's — rule 9) → `card.walkLines` as its provenance (never that evaluate's `walk.lines`) → `card.roasTie` → the privacy sentence → the `card.linkCommand` run and its link. |
| (6) Change | "[your mockup — <their change in their words>]", even when described, then "must move <lever> only;" and the override row's `guardrail.sentence`, verbatim — never a drop or a quotient of your own. |
| (7) Test plan | The override row's `nPerArm`, `days`, `spendRouted`, `mde`, then every `sentences.warnings` line of its run, one per line; one read at the end; `readiness.line` too for `mix`, `trialConv`. |
| (8) Gain if the lift holds | "$<gainPerMonth> a month (`gainPerMonth`); charges per payer are the retention unit.", that sentence whole, never a churn %. |
| (9) Cost | The override row's `bet.sentence`, verbatim, then "Beside it: $<spendRouted> routed over <days> days."; `--cost` / `--odds` only with numbers the reader gave (the growth cycle, `cases/uc-12-growth-cycle.md`, asks for them) — no invented hours, rates, lifts or odds, and no other ratio of gain to cost. |
| (10) Read and close | Field 10's read (Calls) with its placeholders, IN the card before any counts. |

4. The card run's `boundary`, whole; then only the counts question: "What are the counts once each arm
   has reached <nPerArm> — per arm, how many saw it and how many converted?"
5. At the read: `read.lines` whole — its drift line (`context.drift`) and the verdict's sentence are
   lines of it (`underpowered`, `not yet`: `context.more.sentence`, never "did not work"; `significant`:
   `context.realized.sentence` and its warnings — the CLI's own realized-gain run, never a difference of
   profit per start multiplied out by hand).
6. On `significant` only, the `--rebase` read's re-base block (SKILL.md § Blocks the CLI renders); the
   lever at `read.pB` as printed, and every figure about the re-based scenario (a next card's table)
   comes from a run on it.
7. The read's `context.boundary`, whole; `underpowered` → only the counts question at `read.needPerArm`.

## Boundary
Rendered three times — the table's `boundary`, the card's `boundary`, the read's `context.boundary` —
each printed whole where its skeleton row stands; the read's is whole when sent with `--belief` (and, at
a 30 nobody named, `--horizon-default`).

## Stops
- No `realistic` row → "bigger change or more traffic"; a landed lift below the row's `mde` → "within N
  days you can only see a ≥ X % change" — no card.
- A price → `ue stat means` with the reader's σ (`cases/uc-08-test-plan.md`); a trial lever →
  `readiness.line`'s trial days first; `renewals` → a calendar read (its refusal says what to read).
- Re-base needs THIS card's `significant` read; a `mix` read or drop leaves only `context.rebase.lines`.
- A card turn's `ue check` adds `--expect uc-11:card` (SKILL.md § The loop, step 6).

## Worked example

Every input below is invented (the base's label and source note say SYNTHETIC): a process dry run of the
card, not a view of any product. This is ANOTHER scenario than yours — copy its shape, never a sentence
or a figure of it. Every list, every boundary and every figure below is THIS run's at $900 a day: at
another budget which rows are learnable, where a lift lands and every figure change, so rebuild each one
from your own runs.

The base is a web paywall — Monthly with trial $19.99 (24 % of buy-taps, completion 95 %, trial → paid
45 %, 2.9 charges) and Annual $99.99 (12 %, 97 %, 1 charge) — at $900 a day, cost per start $1.10, chain
38 % → 55 % → 32 %, card fee 2.9 % + $0.30, refunds 3 %, disputes 0.4 % at $15.00, 88 % open the app. In
a session it is the project file's scenario; here, get it with:

```bash
npx -y @segmently/cli ue parse "https://www.segmently.ai/unit-economics?v=2&label=SYNTHETIC%20meditation%20app%2C%20web%2C%20US&cps=1.1&p1=38.0&p2=55.0&p3=32.0&vol=900:budget_day&measured=SYNTHETIC%3A%20invented%20for%20a%20process%20dry%20run%2C%202026-09-23&fee=2.90~0.30~card_processor&refunds=3.00&disputes=0.40~15.00&activation=88.0~1&p=Monthly%20with%20trial~19.99~1month~7d-free~24.00~95.0~2.90~45.0&p=Annual~99.99~1year~none~12.00~97.0~1.00~&ref=skill"
```

and save its `scenario` field as `base.json` — and, as the project file, `.ue/synthetic-meditation.json`:

```json
{ "kind": "ue_project", "v": 1, "slug": "synthetic-meditation", "scenario": <that field>, "observed": [], "variants": [], "decisions": [] }
```

**Turn 1 — the horizon.** This reader has no horizon in mind (a reader who names one skips the next run).
ONE run with three horizons, in JSON, to see the `mde` columns:

```bash
npx -y @segmently/cli ue rank base.json --metrics-only --horizon 14,21,30
```

`sentences.traffic`, every `sentences.table` line and every `sentences.belowTable` line — printed whole
(no `sentences.pick`: a choice run only helps choose):

818.18 funnel starts a day (`base.startsPerDay`) at $900 a day

| lever | lift | gain / month | ROAS after | population / day | n per arm | days | spend routed | MDE @ 14 d | MDE @ 21 d | MDE @ 30 d | realistic | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p1 | 0.1053 (assumed lift; typed +10.00 % → landed +10.53 %, snapped) | 2806.36 | 1.08 | 818.18 | 2354 | 5.75 | 5178.8 | 0.0673 | 0.0549 | 0.0459 | true | n/a |
| p2 | 0.1 (assumed lift) | 2666.04 | 1.07 | 310.91 | 1266 | 8.14 | 7329.47 | 0.0764 | 0.0625 | 0.0523 | true | n/a |
| close | 0.0453 (assumed lift; typed +10.00 % → landed +4.53 %, clamped) | 1010.96 | 1.01 | 19.7 | 177 | 17.97 | 16173.25 | n/a | 0.0429 | 0.0377 | false | not at this traffic: within 14 days no change of this rate can be read — test a bigger change, or raise volume |
| p3 | 0.0938 (assumed lift; typed +10.00 % → landed +9.38 %, snapped) | 2499.42 | 1.07 | 171 | 3885 | 45.44 | 40894.74 | 0.1703 | 0.1386 | 0.1157 | false | not at this traffic: within 14 days you can only see a ≥ 17.0% change — test a bigger change, or raise volume |
| bought | 0.1 (assumed lift) | 2666.04 | 1.07 | 54.72 | 3055 | 111.66 | 100493.42 | 0.2868 | 0.2332 | 0.1946 | false | not at this traffic: within 14 days you can only see a ≥ 28.7% change — test a bigger change, or raise volume |
| mix | 0.1 (assumed lift) | 1377.72 | 1.02 | 54.72 | 12004 | 438.74 | 394868.42 | 0.6124 | 0.4906 | 0.4046 | false | shifts picks toward Annual, the product whose share move gains the most; not at this traffic: within 14 days you can only see a ≥ 61.2% change — test a bigger change, or raise volume |
| trialConv | 0.1 (assumed lift) | 858.88 | 1.01 | 12.48 | 1931 | 319.55 | 287595.34 | 0.828 | 0.5221 | 0.3911 | false | trial clock: 10 days (the longest trial on the paywall, 7 days, + 3 for the first charge); not at this traffic: within 14 days you can only see a ≥ 82.8% change — test a bigger change, or raise volume |
| renewals | 0.1 (assumed lift) | 832.37 | 1 | 11.98 | n/a | n/a | n/a | n/a | n/a | n/a | false | calendar: one billing period per read |

- Ranked by gain per day of testing: `p1` and `p2` are learnable inside 14 days in this run's `realistic` column.
- The population a test can use depends on the lever's place in the funnel — 818.18 funnel starts a day for `p1`, 310.91 funnel starts past step 1 a day for `p2`, 171 funnel starts reaching the paywall a day for `p3`, 54.72 buy-taps a day for `bought`, 54.72 buy-taps a day for `mix`, 19.7 buy-taps that pick a paid product a day for `close`, 12.48 trial starters a day for `trialConv` and 11.98 payers a day for `renewals`.
- Within 14 days you can only see a ≥ 17.0% change on `p3`.
- Within 14 days you can only see a ≥ 28.7% change on `bought`.
- Within 14 days you can only see a ≥ 61.2% change on `mix`.
- Within 14 days you can only see a ≥ 82.8% change on `trialConv`.
- Price is not ranked here — a price test needs the variance of revenue per user from your own data.
- rank p1: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.53% — every figure of this row uses the landed lift
- rank p3: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +9.38% — every figure of this row uses the landed lift
- rank close: +10.00% was asked; the calculator's own control stops at its range and the lifted scenario carries +4.53% — every figure of this row uses the landed lift

This run judges `realistic` at its shortest horizon, 14 days, so it only helps choose — none of its rows
goes on the card: `close` reads `false` here and `true` in the 21-day run below.

The base's `walk.lines` are the first 16 lines of the boundary below. Its `boundary` — printed whole
(rule 5: its `realistic` column is a verdict; its horizon line names the horizons offered, none picked
yet), on the project file, as a session runs it:

> These figures are this scenario's arithmetic on the inputs above.
>
> - cost per start $1.10, `p1` 38 %, `p2` 55 % and `p3` 32 % — measured: your project file — SYNTHETIC: invented for a process dry run, 2026-09-23
> - Monthly with trial: $19.99, monthly, a 7-day free trial — measured: your project file (price, cadence, trial)
> - Monthly with trial's take 24 % — measured: your project file (the CLI's init split for these products is 30.1 %, not this)
> - Monthly with trial's charges 2.9 — measured: your project file (the book's monthly count is 2.86)
> - Monthly with trial's completion 95 % — measured: your project file (the book's is 100 %)
> - Monthly with trial's trial conversion 45 % — measured: your project file (the book's is 50 %)
> - Annual: $99.99, yearly, no trial — measured: your project file (price, cadence, trial)
> - Annual's take 12 % — measured: your project file (the CLI's init split for these products is 14 %, not this)
> - Annual's charges 1 (its cadence cap) — assumed: the book
> - Annual's completion 97 % — measured: your project file (the book's is 100 %)
> - $900 a day — measured: your stated budget
> - the fee 2.9 % + $0.30 on the `charged` base — assumed: the book's `card_processor` preset
> - refunds 3 % — measured: your project file
> - disputes 0.4 % at $15.00 each — measured: your project file
> - activation — 88 % open the app, 1 charge from those who do not — measured: your project file
> - the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
> - the +10 % on `p1`, `p2`, `close`, `p3`, `bought`, `mix`, `trialConv` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - the 14-, 21- and 30-day horizons of this choice table — assumed: offered for the choice, none picked yet
> - the 50/50 split of the test this table plans — assumed: the test design
> - `p1` is decidable in 5.75 days and `p2` in 8.14 days at this budget.
> - not testable soon, in this 14-day run: `close` 17.97 days, `p3` 45.44 days, `bought` 111.66 days, `mix` 438.74 days and `trialConv` 319.55 days — past 14 days at this budget, each at its own `days`; `renewals` — a calendar read.

Then only the question, "In how many days do you want to read the result?" The reader picks 21 days.
Nothing else is asked before the table.

**The card's table — a fresh run at 21 days.** The reader gave no lifts yet, so every lever takes the
CLI's default +10 % relative ("assumed lift"). ONE run, in JSON:

```bash
npx -y @segmently/cli ue rank base.json --metrics-only --horizon 21
```

`sentences.traffic`, every `sentences.table` line, every `sentences.belowTable` line and `sentences.pick`
— printed whole, in this order (the CLI renders every cell from that run's own row, rule 9):

818.18 funnel starts a day (`base.startsPerDay`) at $900 a day

| lever | lift | gain / month | ROAS after | population / day | n per arm | days | spend routed | MDE @ 21 d | realistic | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p1 | 0.1053 (assumed lift; typed +10.00 % → landed +10.53 %, snapped) | 2806.36 | 1.08 | 818.18 | 2354 | 5.75 | 5178.8 | 0.0549 | true | n/a |
| p2 | 0.1 (assumed lift) | 2666.04 | 1.07 | 310.91 | 1266 | 8.14 | 7329.47 | 0.0625 | true | n/a |
| close | 0.0453 (assumed lift; typed +10.00 % → landed +4.53 %, clamped) | 1010.96 | 1.01 | 19.7 | 177 | 17.97 | 16173.25 | 0.0429 | true | n/a |
| p3 | 0.0938 (assumed lift; typed +10.00 % → landed +9.38 %, snapped) | 2499.42 | 1.07 | 171 | 3885 | 45.44 | 40894.74 | 0.1386 | false | not at this traffic: within 21 days you can only see a ≥ 13.9% change — test a bigger change, or raise volume |
| bought | 0.1 (assumed lift) | 2666.04 | 1.07 | 54.72 | 3055 | 111.66 | 100493.42 | 0.2332 | false | not at this traffic: within 21 days you can only see a ≥ 23.3% change — test a bigger change, or raise volume |
| mix | 0.1 (assumed lift) | 1377.72 | 1.02 | 54.72 | 12004 | 438.74 | 394868.42 | 0.4906 | false | shifts picks toward Annual, the product whose share move gains the most; not at this traffic: within 21 days you can only see a ≥ 49.1% change — test a bigger change, or raise volume |
| trialConv | 0.1 (assumed lift) | 858.88 | 1.01 | 12.48 | 1931 | 319.55 | 287595.34 | 0.5221 | false | trial clock: 10 days (the longest trial on the paywall, 7 days, + 3 for the first charge); not at this traffic: within 21 days you can only see a ≥ 52.2% change — test a bigger change, or raise volume |
| renewals | 0.1 (assumed lift) | 832.37 | 1 | 11.98 | n/a | n/a | n/a | n/a | false | calendar: one billing period per read |

- Ranked by gain per day of testing: `p1`, `p2` and `close` are learnable inside 21 days in this run's `realistic` column.
- The population a test can use depends on the lever's place in the funnel — 818.18 funnel starts a day for `p1`, 310.91 funnel starts past step 1 a day for `p2`, 171 funnel starts reaching the paywall a day for `p3`, 54.72 buy-taps a day for `bought`, 54.72 buy-taps a day for `mix`, 19.7 buy-taps that pick a paid product a day for `close`, 12.48 trial starters a day for `trialConv` and 11.98 payers a day for `renewals`.
- Within 21 days you can only see a ≥ 13.9% change on `p3`.
- Within 21 days you can only see a ≥ 23.3% change on `bought`.
- Within 21 days you can only see a ≥ 49.1% change on `mix`.
- Within 21 days you can only see a ≥ 52.2% change on `trialConv`.
- Price is not ranked here — a price test needs the variance of revenue per user from your own data.
- rank p1: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.53% — every figure of this row uses the landed lift
- rank p3: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +9.38% — every figure of this row uses the landed lift
- rank close: +10.00% was asked; the calculator's own control stops at its range and the lifted scenario carries +4.53% — every figure of this row uses the landed lift

`p1` is the pick (`recommendation.first`), `p2` the runner-up (`recommendation.runnerUp`).

`base`: `profitPerStart` -0.03, `roas` 0.97 (net — the base evaluate's `valueBasis`), `startsPerDay`
818.18.

A `{{…}}` line stands for lines already shown above; an answer prints the lines, never the marker
(`ue check` flags one).

Its `boundary` — printed whole (the project file's run, as a session runs it):

> These figures are this scenario's arithmetic on the inputs above.
>
> {{walk: base — the 16 lines above}}
> - the +10 % on `p1`, `p2`, `close`, `p3`, `bought`, `mix`, `trialConv` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - the 21-day horizon — measured: your answer
> - the 50/50 split of the test this table plans — assumed: the test design
> - `p1` is decidable in 5.75 days, `p2` in 8.14 days and `close` in 17.97 days at this budget.
> - not testable soon, in this 21-day run: `p3` 45.44 days, `bought` 111.66 days, `mix` 438.74 days and `trialConv` 319.55 days — past 21 days at this budget, each at its own `days`; `renewals` — a calendar read.

**Turn 2 — lever and change.** Then only the question, naming only `recommendation.first`: "What change
would you make to move `p1` (acquisition)?" The reader names the change: the landing's first screen asks
one goal question (sleep / stress / focus) and routes to the matching step 1. Nothing is said about
whether it is readable before a lift is given.

**Turn 3 — believed lift.** The question: "How much do you expect that change to move `p1`, as +X %?" The
reader: +12 %. ONE override run, which also writes the card variant; the CLI lands the lift on the
calculator's grid and writes `.ue/synthetic-meditation/card-p1.json` — its own lifted state for `p1`,
labelled "card p1 +11.84 % (believed)", `measuredOn` "believed lift, not observed, 2026-09-23":

```bash
npx -y @segmently/cli ue rank base.json --metrics-only --horizon 21 --override p1=0.12 --card .ue/synthetic-meditation/card-p1.json
```

The card's lift is the landed one — the row's `lift` 0.118421, above the row's `mde` at 21 days (0.0549),
so the card goes on. The `p1` row, field by field:

| field | value |
|---|---|
| `lever` | p1 |
| `lift` | 0.118421 — believed, landed (`askedLift` 0.12) |
| `gainPerMonth` | 3157.16 |
| `roasAfter` | 1.09 |
| `populationPerDay` | 818.18 |
| `nPerArm` | 1864 |
| `days` | 4.56 |
| `spendRouted` | 4100.8 |
| `mde` @ 21 d | 0.0549 |
| `realistic` | true |
| `note` | n/a |

Its card block goes into field 5 whole (the field-5 label below), its `sentences.warnings` into field 7,
and the row's `guardrail.watch`, `guardrail.sentence` and `bet.sentence` into fields 4, 6 and 9. Its name
in `variants[]` after the answer is its label, "card p1 +11.84 % (believed)".

**The card**, every figure from the runs above:

1. **Horizon and traffic** — 21 days (the reader's); 818.18 funnel starts a day (`base.startsPerDay`);
   $900 a day.
2. **Base** — the project file's own evaluate,
   `npx -y @segmently/cli ue evaluate .ue/synthetic-meditation.json --explain` (`stage` `live_no_data`):
   value per buy-tap $16.03 net against a required $16.45; CAC per payer $75.10; profit per start −$0.03;
   ROAS 0.97 (net, its `valueBasis`); payback as `words.payback` prints it, "Payback: not covered within
   12 months assumes the book's first renewal (monthly 60%) and one steady renewal after it that matches
   your charges count"; `readiness.line`, "paywall mix decidable after 6 days · trial verdict after 33
   days · annual renewals due at month 12, observable from month 13". Its `walk.lines` — printed whole,
   every deduction with its value among them, each take placed by the CLI against its own init split:

   {{walk: base — the 16 lines above}}

   The `ue link` result says `privacy.due` `true` (`carries` `prices`, `chain`, `volume`, `takes`,
   `charges`, `completion`, `trialConv`, `deductions`), so the privacy sentence comes first.
   `privacy.sentence` — printed whole:

   This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

   ```bash
   npx -y @segmently/cli ue link base.json
   ```
   `https://www.segmently.ai/unit-economics?v=2&label=SYNTHETIC%20meditation%20app%2C%20web%2C%20US&cps=1.1&p1=38.0&p2=55.0&p3=32.0&vol=900:budget_day&measured=SYNTHETIC%3A%20invented%20for%20a%20process%20dry%20run%2C%202026-09-23&fee=2.90~0.30~card_processor&refunds=3.00&disputes=0.40~15.00&activation=88.0~1&p=Monthly%20with%20trial~19.99~1month~7d-free~24.00~95.0~2.90~45.0&p=Annual~99.99~1year~none~12.00~97.0~1.00~&ref=skill`

   It returns `roundTrip` `ok` and `warnings` `[]`.
3. **Metric** — key: profit per start, −$0.03. Nearest: `p1` on 818.18 funnel starts a day
   (`populationName`), today 38 %, `mde` 0.0549 at 21 days. Stage: acquisition.
4. **Guardrails** — the table run's other rows: `p2` 8.14 days, `mde` 0.0625; `close` 17.97 days, `mde`
   0.0429; `p3` 45.44 days, `mde` 0.1386; `bought` 111.66 days, `mde` 0.2332; `mix` 438.74 days, `mde`
   0.4906; `trialConv` 319.55 days, `mde` 0.5221; `renewals` a calendar read (calendar: one billing
   period per read). The override row's `guardrail.watch`, verbatim: Watch the steps after `p1` — `p2`,
   `p3`, `bought`, `close`, `trialConv` and `renewals` must not drop while it is tested. CAC per payer
   $75.10 and payback from the base.
5. **Hypothesis** — If the landing's first screen asks one goal question and routes to the matching step
   1, then `p1` 38 % → 42.5 %, +11.84 % (believed; typed +12.00 %, landed +11.84 %); if the lift holds,
   profit per start −$0.03 → $0.10 and ROAS 0.97 → 1.09, +$3,157.16 a month at $900 a day.

   The card block — printed whole (an inline card carries it as `card.lines`): every `card.prepared`
   line, every `card.snapped` line, the `card.evaluateCommand` run and its KPIs, `card.walkLines`,
   `card.roasTie`, the privacy sentence, the `card.linkCommand` run and its link:

   - `chain.p1` 0.38 × 1.12 = 0.4256 — your numbers, prepared
   - `chain.p1` 0.4256 → 0.425

   ```bash
   npx -y @segmently/cli ue evaluate .ue/synthetic-meditation/card-p1.json --explain
   ```

   Its KPIs: value per buy-tap $16.03 net; CAC per payer $67.15; profit per start $0.10; ROAS 1.09 (net, its `valueBasis`).

   - cost per start $1.10, `p2` 55 % and `p3` 32 % — measured: your scenario file
   - `p1` 42.5 % — assumed: your belief — believed lift, not observed (typed +12.00 %, landed +11.84 %)
   - Monthly with trial: $19.99, monthly, a 7-day free trial — measured: your scenario file (price, cadence, trial)
   - Monthly with trial's take 24 % — measured: your scenario file (the CLI's init split for these products is 30.1 %, not this)
   - Monthly with trial's charges 2.9 — measured: your scenario file (the book's monthly count is 2.86)
   - Monthly with trial's completion 95 % — measured: your scenario file (the book's is 100 %)
   - Monthly with trial's trial conversion 45 % — measured: your scenario file (the book's is 50 %)
   - Annual: $99.99, yearly, no trial — measured: your scenario file (price, cadence, trial)
   - Annual's take 12 % — measured: your scenario file (the CLI's init split for these products is 14 %, not this)
   - Annual's charges 1 (its cadence cap) — assumed: the book
   - Annual's completion 97 % — measured: your scenario file (the book's is 100 %)
   - $900 a day — measured: your stated budget
   - the fee 2.9 % + $0.30 on the `charged` base — assumed: the book's `card_processor` preset
   - refunds 3 % — measured: your scenario file
   - disputes 0.4 % at $15.00 each — measured: your scenario file
   - activation — 88 % open the app, 1 charge from those who do not — measured: your scenario file
   - the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book

   The card's ROAS 1.09 equals this run's `roasAfter` for `p1`.

   This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

   ```bash
   npx -y @segmently/cli ue link .ue/synthetic-meditation/card-p1.json
   ```
   `https://www.segmently.ai/unit-economics?v=2&label=card%20p1%20%2B11.84%20%25%20(believed)&cps=1.1&p1=42.5&p2=55.0&p3=32.0&vol=900:budget_day&measured=believed%20lift%2C%20not%20observed%2C%202026-09-23&fee=2.90~0.30~card_processor&refunds=3.00&disputes=0.40~15.00&activation=88.0~1&p=Monthly%20with%20trial~19.99~1month~7d-free~24.00~95.0~2.90~45.0&p=Annual~99.99~1year~none~12.00~97.0~1.00~&ref=skill`

   It returns `roundTrip` `ok` and `warnings` `[]` — the file is already on the grid.
6. **Change** — [your mockup — the landing's first screen asks one goal question (sleep / stress / focus)
   and routes to the matching step 1]. It must move `p1` only; `p2` must not fall: −10.59 % there cancels
   the +11.84 % on `p1` ($3,157.16 a month, `gainPerMonth`); within 21 days you can only see a ≥ 6.2%
   change on `p2`, so a drop that cancels the gain is visible in this test.
7. **Test plan** — 1864 per arm, 4.56 days, $4,100.80 routed through the test, `mde` 0.0549 at 21 days;
   one read at the planned end, no daily peeking. The override run's `sentences.warnings` — printed
   whole, one per line, the other levers' default landings included:

   - rank p1: +12.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +11.84% — every figure of this row uses the landed lift
   - rank p3: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +9.38% — every figure of this row uses the landed lift
   - rank close: +10.00% was asked; the calculator's own control stops at its range and the lifted scenario carries +4.53% — every figure of this row uses the landed lift

8. **Gain if the lift holds** — $3,157.16 a month (`gainPerMonth`); charges per payer are the retention
   unit.
9. **Cost** — If the +11.84 % on `p1` holds, it gains $3,157.16 a month (`gainPerMonth`). The odds that
   it holds were not given. The cost to build was not given. Beside it: $4,100.80 routed over 4.56 days.
   This reader gave no cost or odds, so the run took no `--cost` / `--odds` (the growth cycle,
   `cases/uc-12-growth-cycle.md`, asks for them).
10. **Read and close** — printed here, in the card, before any counts exist: the read with its
    placeholders, per arm `<n>` people who saw it and `<x>` who converted — the reader's own counts, at
    the planned n (1864 per arm) — and the card's typed lift as `--belief`:

    ```bash
    npx -y @segmently/cli ue stat read --a <n>/<x> --b <n>/<x> --project-file .ue/synthetic-meditation.json --lever p1 --horizon 21 --belief 0.12
    ```

    At the read it prints `read.lines`, whole; one read at the planned end.

The card run's `boundary` — printed whole, on the project file:

> These figures are this scenario's arithmetic on the inputs above.
>
> {{walk: base — the 16 lines above}}
> - `p1` +11.84 % (typed +12.00 %) — assumed: your belief, at its landed value.
> - the +10 % on `p2`, `close`, `p3`, `bought`, `mix`, `trialConv` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - the 21-day horizon — measured: your answer
> - the 50/50 split — assumed: the test design
> - `p1` is decidable in 4.56 days, `p2` in 8.14 days and `close` in 17.97 days at this budget.
> - not testable soon, in this 21-day run: `p3` 45.44 days, `bought` 111.66 days, `mix` 438.74 days and `trialConv` 319.55 days — past 21 days at this budget, each at its own `days`; `renewals` — a calendar read.

Then only the question: "What are the counts once each arm has reached 1864 — per arm, how many saw it
and how many converted?"

**The read — the reader's counts arrive.** Two synthetic endings at the planned n (1864 per arm), each
field 10's read with the counts filled in, on the project file before any re-base:

```bash
npx -y @segmently/cli ue stat read --a 1864/708 --b 1864/772 --project-file .ue/synthetic-meditation.json --lever p1 --horizon 21 --belief 0.12
npx -y @segmently/cli ue stat read --a 1864/708 --b 1864/736 --project-file .ue/synthetic-meditation.json --lever p1 --horizon 21 --belief 0.12
```

Ending B, `read.lines` — printed whole (its drift line, `context.drift`, then `context.more.sentence`):

`pA` 37.98 %, `pB` 39.48 %, `lift` 0.0395, `diff` 0.015, `ci95` -0.0163 … 0.0463, `z` 0.94, `pValue` 0.3465, `needPerArm` 16509, `verdict` `underpowered`

`p1` scenario 38 % → observed 39.48 % (1.48 points higher)

Not enough people yet: the observed difference needs 16,509 per arm (`read.needPerArm`) and the smaller arm has 1,864 — 14,645 more per arm, 35.8 more days at 818.18 funnel starts a day, split 50/50.

`underpowered` — recorded, never "did not work"; no realized-gain run and no re-base.

Ending A, `read.lines` — printed whole (`significant`: after the drift line come
`context.realized.sentence` and each of its warnings):

`pA` 37.98 %, `pB` 41.42 %, `lift` 0.0904, `diff` 0.0343, `ci95` 0.0029 … 0.0657, `z` 2.14, `pValue` 0.0322, `needPerArm` 3187, `verdict` `significant`

`p1` scenario 38 % → observed 41.42 % (3.42 points higher)

Realized gain $2,455.57 a month (`gainPerMonth` of the realized-gain run, at its landed +9.21 %); its `roasAfter` 1.06 is the re-based ROAS.

- rank p1: +8.99% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +9.21% — every figure of this row uses the landed lift
- rank p3: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +9.38% — every figure of this row uses the landed lift
- rank close: +10.00% was asked; the calculator's own control stops at its range and the lifted scenario carries +4.53% — every figure of this row uses the landed lift

Then the re-base: the same read command plus `--rebase` — the CLI writes it into the project file,
nothing is edited by hand:

```bash
npx -y @segmently/cli ue stat read --a 1864/708 --b 1864/772 --project-file .ue/synthetic-meditation.json --lever p1 --horizon 21 --belief 0.12 --rebase
```

It wrote `.ue/synthetic-meditation.json`: the old base is the last `variants[]` entry, "base before the
p1 A/B read"; `measuredOn` "p1 A/B read: 1864/708 vs 1864/772" (the old note does not fit beside it in 80
characters); `updatedAt` set; `observed[]` ends with:

```json
{"kind":"observed_inputs","v":1,"source":"ab_test","lever":"p1","counts":{"control":"1864/708","variant":"1864/772"},"window":{}}
```

The re-base block — printed whole:

- `chain.p1` 0.38 → 0.414163 (`read.pB` as printed) — prepared from your counts
- `chain.p1` 0.414163 → 0.415

- profit per start −$0.03 → $0.07
- ROAS 0.97 → 1.06 (`valueBasis` net)
- CAC per payer $75.10 → $68.77
- payback not covered within 12 months → charge 1, month 5
- stage `live_no_data` → `live_measured`

`p1` scenario 38 % → observed 41.42 % (3.42 points higher)

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link .ue/synthetic-meditation.json
```
`https://www.segmently.ai/unit-economics?v=2&label=SYNTHETIC%20meditation%20app%2C%20web%2C%20US&cps=1.1&p1=41.5&p2=55.0&p3=32.0&vol=900:budget_day&measured=p1%20A%2FB%20read%3A%201864%2F708%20vs%201864%2F772&fee=2.90~0.30~card_processor&refunds=3.00&disputes=0.40~15.00&activation=88.0~1&p=Monthly%20with%20trial~19.99~1month~7d-free~24.00~95.0~2.90~45.0&p=Annual~99.99~1year~none~12.00~97.0~1.00~&ref=skill`

It returns `roundTrip` `ok` and one warning, `snapped` — chain.p1 0.41416309012875535 → 0.415. The drift
line quotes `read.pB` exactly as the read printed it — not the landed grid value and not the gap between
the two arms; the re-based scenario carries the landed 41.5 % (`snapped`). A next card starts from a new
`ue rank` on the re-based file.

The read's `context.boundary` — printed whole (the read sent with `--belief 0.12`, the card's typed lift;
every input invented for the dry run):

> These figures are this scenario's arithmetic on the inputs above.
>
> {{walk: base — the 16 lines above}}
> - `p1` after the re-base, `read.pB` 41.42 % as printed — measured: prepared from your counts
> - the counts 708/1864 (control) and 772/1864 (new) — measured: your answer
> - the realized-gain run's lift on `p1` 0.089903 — measured: prepared from your counts
> - the realized-gain run's landing on `p1`: typed +8.99 % → landed +9.21 % (`snapped`) — measured: prepared from your counts
> - the +10 % on `p2`, `close`, `p3`, `bought`, `mix`, `trialConv` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - `p1` +11.84 % (typed +12.00 %) — assumed: your belief, at its landed value.
> - the 21-day horizon — measured: your answer
> - the 50/50 split — assumed: the test design
> - not testable soon, in the card's 21-day table run: `p3` 45.44 days, `bought` 111.66 days, `mix` 438.74 days and `trialConv` 319.55 days — past 21 days at this budget, each at its own `days`; `renewals` — a calendar read.
