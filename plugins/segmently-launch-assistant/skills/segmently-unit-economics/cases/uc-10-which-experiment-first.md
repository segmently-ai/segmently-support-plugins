# UC-10 — Which experiment first: gain and cost to learn
Route: "which experiment first", "which metric to move first", "what to optimise" — a ranking of every lever, no change named or two to choose between ("a trial, or the paywall change first?") (SKILL.md § Router) · Eval: P10 · MCP: uc-10, cases-uc-10
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
- Nothing is asked before the table: the base is `.ue/<slug>.json` (none → `cases/uc-00-launch-card.md`'s
  interview), the daily budget sits in `volume`, the horizons default to 30 and 90 days. A budget in the
  reader's message goes into `volume` (`{ "amount": <budget>, "unit": "budget_day" }`) with a
  `measuredOn` naming the budget as theirs ("your budget $<budget> a day; the rest from the book")
  before the run (SKILL.md § Files) — never the book's volume.
- A lift the reader states goes in as `--override <lever>=<lift>` (their "+25 % on the paywall" →
  `--override p3=0.25`); none stated → the CLI's default on every lever, labelled "assumed lift". Never
  propose a lift.
- After the table: ONE question, naming only the lever it asks about. "What lift do you expect on
  <lever>, as +X %?" The reader's answer to that question: a lift stated → a second `ue rank` run with
  `--override <lever>=<lift>`, printed as the skeleton; the default kept → no new run — record it, and
  restate no row; a restated row carries the table run's `boundary` whole under it.

## Calls
- `npx -y @segmently/cli ue rank .ue/<slug>.json [--override <lever>=<lift>] [--horizon <N>[,<M>]]` — ONE
  run, JSON.
- Links: `recommendation.links` of that run (the two lifted variants; they carry the base's `label` and
  `measuredOn` — set both in the base before the run). No `ue link` call here.

## Answer skeleton
1. `sentences.traffic`
2. every `sentences.table` line, a blank line, every `sentences.belowTable` line as its own `- ` bullet,
   a blank line, `sentences.pick` (SKILL.md § Blocks the CLI renders, the rank table row) — the
   belowTable lines are `sentences.ranking`, `sentences.population`, each `sentences.realism`,
   `sentences.ceiling`, `sentences.blocked`, `sentences.price`, then every `sentences.warnings` line
3. the privacy sentence (`privacy.sentence` — due for `recommendation.links` whatever
   `recommendation.privacy` says), then `recommendation.links`, each with the lever it lifts
4. `boundary` — whole (SKILL.md § The boundary, rendered)
5. the one question

## Boundary
Rendered: print `boundary` whole, after the pick and the links. Nothing about a row or the pick after it.

## Stops
- `recommendation.first` null → `sentences.pick` says no lever is learnable within the horizon at this
  budget; no link.
- A lever with `lift` 0 (`sentences.ceiling` / `sentences.blocked`) is never attempted with a variant of
  your own; `renewals` is a calendar read with no sample size.
- `price` is not ranked: a price test is `cases/uc-08-test-plan.md`'s means test (σ from the reader's
  data).

## Worked example

Base: the seed scenario, named before the run as a real answer names its base — `label` "seed at the
book's volume" and `measuredOn` "benchmark book, nothing measured" set in `seed.json`, so both
recommended links carry them — 986.84 funnel starts a day (`base.startsPerDay`) at $45,000 a month, from
the run below — every lever at the CLI's default +10 % relative ("assumed lift"), horizons 30 and 90
days. ONE run, in JSON:

```bash
npx -y @segmently/cli ue rank seed.json
```

`sentences.traffic`, every `sentences.table` line, every `sentences.belowTable` line
(`sentences.ranking`, `sentences.population`, each `sentences.realism`, `sentences.ceiling`,
`sentences.blocked`, `sentences.price`, then every `sentences.warnings` line) and `sentences.pick` —
printed whole, in this order:

986.84 funnel starts a day (`base.startsPerDay`) at $45,000 a month

| lever | lift | gain / month | ROAS after | population / day | n per arm | days | spend routed | MDE @ 30 d | MDE @ 90 d | realistic | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p1 | 0.1 (assumed lift) | 5112.01 | 1.25 | 986.84 | 3763 | 7.63 | 11289 | 0.0501 | 0.0288 | true | n/a |
| p2 | 0.1 (assumed lift) | 5112.01 | 1.25 | 296.05 | 1565 | 10.57 | 15650 | 0.0594 | 0.0343 | true | n/a |
| p3 | 0.1 (assumed lift) | 5112.01 | 1.25 | 148.03 | 2978 | 40.24 | 59560 | 0.116 | 0.0666 | false | not at this traffic: within 30 days you can only see a ≥ 11.6% change — test a bigger change, or raise volume |
| bought | 0.1015 (assumed lift; typed +10.00 % → landed +10.15 %, snapped) | 5175.93 | 1.25 | 51.81 | 2281 | 88.05 | 130342.86 | 0.1745 | 0.1004 | false | not at this traffic: within 30 days you can only see a ≥ 17.4% change — test a bigger change, or raise volume |
| mix | 0.1 (assumed lift) | 1474.2 | 1.17 | 51.81 | 9331 | 360.21 | 533200 | 0.363 | 0.204 | false | shifts picks toward Annual subscription, the product whose share move gains the most; not at this traffic: within 30 days you can only see a ≥ 36.3% change — test a bigger change, or raise volume |
| close | 0 | 0 | 1.14 | 20.93 | n/a | n/a | n/a | n/a | n/a | false | at its ceiling: payment completion is already 100.0% and the calculator's own control stops there |
| trialConv | 0 | 0 | 1.14 | 0 | n/a | n/a | n/a | n/a | n/a | false | no product on the paywall has a trial |
| renewals | 0.1014 (assumed lift; typed +10.00 % → landed +10.14 %, snapped) | 2328.26 | 1.19 | 20.93 | n/a | n/a | n/a | n/a | n/a | false | calendar: one billing period per read |

- Ranked by gain per day of testing: `p1` and `p2` are learnable inside 30 days in this run's `realistic` column.
- The population a test can use depends on the lever's place in the funnel — 986.84 funnel starts a day for `p1`, 296.05 funnel starts past step 1 a day for `p2`, 148.03 funnel starts reaching the paywall a day for `p3`, 51.81 buy-taps a day for `bought`, 51.81 buy-taps a day for `mix`, 20.93 buy-taps that pick a paid product a day for `close`, 0 trial starters a day for `trialConv` and 20.93 payers a day for `renewals`.
- Within 30 days you can only see a ≥ 11.6% change on `p3`.
- Within 30 days you can only see a ≥ 17.4% change on `bought`.
- Within 30 days you can only see a ≥ 36.3% change on `mix`.
- `close`: at ceiling — no lift to test (at its ceiling: payment completion is already 100.0% and the calculator's own control stops there).
- `trialConv`: no product on the paywall has a trial.
- Price is not ranked here — a price test needs the variance of revenue per user from your own data.
- rank bought: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.15% — every figure of this row uses the landed lift
- rank renewals: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.14% — every figure of this row uses the landed lift

`p1` is the pick (`recommendation.first`), `p2` the runner-up (`recommendation.runnerUp`).

`base`: `profitPerStart` 0.20, `roas` 1.14; `recommendation.links` — the two lifted variants,
round-trip checked.

Both recommended links carry the base's `label=` and `measured=` — set in the base before the run,
so no `label_missing` / `measured_missing` is left to handle. Here `recommendation.privacy`
says `due` `false` for both — the lift is `ue rank`'s default, not the reader's number — but
each carries a lifted rate off the book (`p1` 33 % in `first`), so `ue check` asks for the
sentence; it is always allowed. `privacy.sentence` — printed whole:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`recommendation.links.first` of `npx -y @segmently/cli ue rank seed.json` (`p1` lifted):
`https://www.segmently.ai/unit-economics?v=2&label=seed%20at%20the%20book's%20volume&cps=1.5&p1=33.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&ref=skill`

`recommendation.links.runnerUp` of the same run (`p2` lifted):
`https://www.segmently.ai/unit-economics?v=2&label=seed%20at%20the%20book's%20volume&cps=1.5&p1=30.0&p2=55.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&ref=skill`

`boundary` — printed whole (the price sentence is already under the table):

> These figures are this scenario's arithmetic on the inputs above.
>
> - cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
> - Monthly subscription: $19.99, monthly, no trial — assumed: the book's seed paywall
> - Monthly subscription's take 25.5 % — assumed: the CLI's init split
> - Monthly subscription's charges 2.86 — assumed: the book
> - Monthly subscription's completion 100 % — assumed: the book
> - Annual subscription: $119.99, yearly, no trial — assumed: the book's seed paywall
> - Annual subscription's take 14.9 % — assumed: the CLI's init split
> - Annual subscription's charges 1 (its cadence cap) — assumed: the book
> - Annual subscription's completion 100 % — assumed: the book
> - $45,000 a month — assumed: the book's volume
> - the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
> - the +10 % on `p1`, `p2`, `p3`, `bought`, `mix` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - the default horizons, 30 and 90 days (`ue rank`'s own) — assumed
> - the 50/50 split of the test this table plans — assumed: the test design
> - `p1` is decidable in 7.63 days and `p2` in 10.57 days at this budget.
> - not testable soon, in this 30-day run: `p3` 40.24 days, `bought` 88.05 days and `mix` 360.21 days — past 30 days at this budget, each at its own `days`; `renewals` — a calendar read.
