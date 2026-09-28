# UC-3 — Fill the reader's numbers and open the link
Route: gives their funnel numbers (spend, starts, rates, take — a price beside them) (SKILL.md § Router) · Eval: P3 · MCP: uc-3, cases-uc-3
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
- **A take the reader states** is that product's `takeOfTaps` (22 % → 0.22) — take = `takeOfTaps`,
  never asked, never a fee: fill it and run at once, in this message. A fee is only one the reader
  states as a fee — their processor's percentage and fixed part (Calls).
- **Missing inputs:** a chain and a price are not the whole scenario. Ask, one per turn, for what the
  reader did not give — charges per payer (`paymentsCounted`), buy-tap → paid (`completionRate`),
  volume (daily or monthly budget) — or say plainly that each stays the book's value (monthly 2.86
  charges, completion 100 %, $45,000 a month) and label it book.
- **Sources, in order of trust:** the reader's answers; an ad export (`chain.cps` = spend ÷ funnel
  starts, input preparation: print "$<spend> ÷ <starts> starts = $<cps> (your numbers, prepared)" —
  ask for starts or landing views, never clicks); product analytics (`chain.p1/p2/p3`, takes);
  RevenueCat (`cases/uc-04-revenuecat.md`); a payment provider statement (fee pct/fixed, disputes).

## Calls
- No project yet: `ue init <slug> --product "<name>~<price>~<cadence>" --platform web` —
  `--platform store` when they named a store; add the `~<trial>` segment only for a trial the reader
  stated (`~none` for "no trial"): an unstated trial stays out, is recorded in `unstatedTrials`, and
  walks as "<name>: no trial — assumed: not stated — the CLI's init reads it as none" — then the JSON
  edits in `.ue/<slug>.json`'s `scenario`.
- **JSON edits:** `chain.*`, `volume`, `products[i].price / takeOfTaps / completionRate /
  paymentsCounted / trialConv`, only the deductions the reader has numbers for, `label`, `measuredOn =
  "<source>, <window>"` as the reader named them — when they named neither, `"reader-stated, source not
  given"`, never a date or a source they did not type — `touched`. A fee the reader states (their
  processor's percentage and fixed part) goes in as `deductions.fee = { "pct": <pct>, "fixed": <fixed> }`
  with NO `preset` key — even when the numbers equal a book preset (2.9 % + $0.30). A `preset` makes
  `walk.lines` read the reader's own fee "assumed: the book's `<preset>` preset" and the link write
  `~<preset>`; the preset is only for a fee the reader did not state (UC-0's fee variant).
- **Units in the JSON:** rates and shares are fractions (0.029 = 2.9 %) — the link writes percent;
  `touched` lists only the chain knobs (`cps`, `p1`, `p2`, `p3`) you set equal to the book.
- `npx -y @segmently/cli ue evaluate .ue/<slug>.json --explain` (the project file: only an evaluate of a
  project prints `stage`), then `npx -y @segmently/cli ue link .ue/<slug>.json --label '<name>'`.

## Answer skeleton
1. The onboarding screen from this evaluate, when this is the session's first answer (SKILL.md
   § Session start, point 3): `stage.value` with its `derivedFrom`, every plan with its price, ROAS on
   its `valueBasis`, the base link, the three `offers` as printed.
2. The plausibility line, before the KPIs: each number the reader gave placed against the book —
   chain P10–P90 (cps $1.00–2.50, p1 20–40 %, p2 35–65 %, p3 25–45 %), trial → paid by length, charges
   (monthly 2.86 / weekly 5.36 / annual 1), dispute lines 0.75 % and 1.5 % — and where it sits: "95 % of
   buy-taps completing payment is above anything in the book — measured or assumed?"
3. The KPIs, each with its value and its unit (`units.kpis`), no provenance column: `walk.lines` is the
   provenance. Never write "your numbers" on a KPI that depends on a book input. Under the table,
   `words.payback`, whole.
4. `walk.lines`, printed whole, one row each — every input with its class and source.
5. `words.breakEvens`, printed whole (an unreachable rate says so in words).
6. ONE verdict sentence read off this run.
7. The link: the onboarding screen's base link when this answer printed one (it is this scenario's);
   else `privacy.sentence` first when `privacy.due`, the `ue link` call, then the link.
8. The boundary: `walk.opener`, the same `walk.lines`, then the line of § Boundary.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the same `walk.lines`, then
anything neither the reader nor the book can settle — not testable soon, with the `readiness.line`
days at the volume the run used.

## Stops
- A take is never read as a fee, and the reader is never asked which field it is.
- Clicks are never funnel starts: ask for starts or landing views.
- No funnel numbers, only a price → `cases/uc-00-launch-card.md`.

## Worked example

The reader: "cps 2.1, p1 28 %, p2 44 %, p3 31 %, monthly 14.99 take 22 %". No project yet and the
message carries their funnel numbers, so this case runs at once; they did not give charges,
completion or volume — each stays the book's, labelled book.

```bash
npx -y @segmently/cli ue init my-app --product 'Monthly~14.99~1month' --platform web
# edit .ue/my-app.json: chain {2.1, 0.28, 0.44, 0.31}, touched [cps, p1, p2, p3],
# products[0].takeOfTaps 0.22, measuredOn "reader-stated, source not given"
npx -y @segmently/cli ue evaluate .ue/my-app.json --explain
```

The onboarding screen comes from that evaluate: stage `live_no_data` (scenario present, chain knobs
touched by the reader (cps, p1, p2, p3), no observed inputs), Monthly $14.99, ROAS 0.17 gross, the
three `offers` as printed; its base link is the one below.

**Plausibility:** cost per start $2.10 sits inside the book's $1.00–2.50; `p1` 28 %, `p2` 44 % and
`p3` 31 % sit inside their bands (20–40 %, 35–65 %, 25–45 %).

| KPI | Value |
|---|---|
| value per tap | $9.43 per tap |
| required value per tap | $54.99 per tap |
| CAC per payer | $249.93 per payer |
| profit per start | −$1.74 per start |
| ROAS | 0.17 gross (12-month basis) |
| payback | not covered within 12 months |

The payback row is the `payback` field. Under the table, `words.payback` — printed whole:

Payback: not covered within 12 months assumes the book's first renewal (monthly 60%) and one steady renewal after it that matches your charges count

The inputs — the evaluate's `walk.lines` — printed whole, one row each:

- cost per start $2.10, `p1` 28 %, `p2` 44 % and `p3` 31 % — measured: your project file — reader-stated, source not given
- Monthly: $14.99, monthly — measured: your project file (price, cadence)
- Monthly: no trial — assumed: not stated — the CLI's init reads it as none
- Monthly's take 22 % — measured: your project file (the CLI's init split for these products is 30 %, not this)
- Monthly's charges 2.86 — assumed: the book
- Monthly's completion 100 % — assumed: the book
- $45,000 a month — assumed: the book's volume
- the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book

`words.breakEvens` — printed whole:

- cost per start ≤ $0.36 (from $2.10)
- `p1` — no conversion rate at that step clears this scenario on its own (from 28 %)
- `p2` — no conversion rate at that step clears this scenario on its own (from 44 %)
- `p3` — no conversion rate at that step clears this scenario on its own (from 31 %)

At these numbers the scenario does not clear: −$1.74 per start, ROAS 0.17 gross.

The `ue link` result says `privacy.due` `true` (`carries` `prices`, `chain`, `takes`), so the privacy
sentence comes first, on its own line. It raises no `page_shows_gross`: the page reads `measured=` and
shows the note in its "Measured on" field. `privacy.sentence` — printed whole:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link .ue/my-app.json --label 'my numbers'
```
`https://www.segmently.ai/unit-economics?v=2&label=my%20numbers&cps=2.1&p1=28.0&p2=44.0&p3=31.0&vol=45000:budget_month&measured=reader-stated%2C%20source%20not%20given&p=Monthly~14.99~1month~none~22.00~100.0~2.86~&ref=skill`

Under it, one line: "`measured_missing` on the init's link → re-minted with measured=reader-stated,
source not given" — the evaluate ran after `measuredOn` was set and printed none.

The boundary: `walk.opener` and the same `walk.lines` — printed whole — then what neither the reader
nor the book settles:

> These figures are this scenario's arithmetic on the inputs above.
>
> - cost per start $2.10, `p1` 28 %, `p2` 44 % and `p3` 31 % — measured: your project file — reader-stated, source not given
> - Monthly: $14.99, monthly — measured: your project file (price, cadence)
> - Monthly: no trial — assumed: not stated — the CLI's init reads it as none
> - Monthly's take 22 % — measured: your project file (the CLI's init split for these products is 30 %, not this)
> - Monthly's charges 2.86 — assumed: the book
> - Monthly's completion 100 % — assumed: the book
> - $45,000 a month — assumed: the book's volume
> - the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
> - the mix of this paywall — not testable soon: the book's volume needs 12 days before it is decidable (`readiness.line`: "paywall mix decidable after 12 days")
