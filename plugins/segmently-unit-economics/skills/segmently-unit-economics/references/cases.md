# Worked cases — numbers from real CLI runs

Every figure below was produced by `segmently ue` (CLI 1.1.0, `mathHash`
`dfeb1a96e8a535fdcda64123b05f730801365eeb911a0084306650945a12b939`). The command is written
above each table; a variant is the base JSON with the edit named in its row, evaluated with
`npx -y @segmently/cli ue evaluate <variant>.json --explain`. If `--version` prints a
different `mathHash`, re-run the commands instead of quoting these numbers.

These are scenarios on the book's chain (cost per start $1.50, 30 % → 50 % → 35 %), not a
view of any real product.

**The seed scenario** used by UC-1, UC-2 and UC-10 is the calculator's default paywall (Monthly
$19.99 and Annual $119.99 on the paywall, Lite monthly and a one-time add-on aside, $45,000
a month). Get its JSON with:

```bash
npx -y @segmently/cli ue parse "https://www.segmently.ai/unit-economics?v=2&label=&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~"
```

and save its `scenario` field as `seed.json`.

## UC-0 — launch card: $19.99 monthly, web, no data

```bash
npx -y @segmently/cli ue init my-app --product "Monthly~19.99~1month~none" --platform web
npx -y @segmently/cli ue evaluate .ue/my-app.json --explain
```

The init gives the single plan a take of 30 % of buy-taps and 2.86 charges (the book's
monthly count). Required value per tap (`kpis.requiredValuePerTap`): $28.57.

| Scenario (edit vs base) | Value / tap gross | Value / tap net | ROAS | CAC per payer | Profit / start | Payback |
|---|---|---|---|---|---|---|
| A. Monthly $19.99 alone (base) | $17.15 | $17.15 | 0.60 gross | $95.24 | −$0.60 | not covered in 12 months |
| B. A + `deductions.fee = {0.029, 0.30, "card_processor"}` | $17.15 | $16.40 | 0.57 net | $95.24 | −$0.64 | not covered |
| C. A + `deductions.fee = {0.15, 0, "app_store_small"}` | $17.15 | $14.58 | 0.51 net | $95.24 | −$0.73 | not covered |
| D. Monthly + Annual $119.99 (split proposed by the CLI: 25.5 % / 14.9 %) | $32.46 | $32.46 | 1.14 gross | $70.72 | $0.20 | charge 4, month 4 |
| A at the pessimistic corner (`chain` = 2.5 / 0.20 / 0.35 / 0.25) | $17.15 | — | 0.12 | $476.19 | −$2.20 | not covered |
| A at the optimistic corner (`chain` = 1.0 / 0.40 / 0.65 / 0.45) | $17.15 | — | 2.01 | $28.49 | $1.01 | charge 2, month 2 |

Each fee row names its base from its own `feeScheme`: B `charged` (the card preset, on the
amount charged), C `exTax` (the store preset). Row C states a store preset but no tax, and a store scheme's `exTax` base equals the price
when nothing is deducted for tax, so C's fee ($2.57 a tap, `deducted.fee`) is exactly what it
would be on the charged amount. State an inclusive VAT as well and the same 15 % lands on the
smaller ex-tax amount instead — that is the difference UC-2 shows.
Every row above is its own evaluate run, payback and readiness included (rule 9).

Row D came from the CLI's own split:

```bash
npx -y @segmently/cli ue init my-app-mix --product "Monthly~19.99~1month~none" --product "Annual~119.99~1year~none" --dir .ue/my-app/scratch
npx -y @segmently/cli ue evaluate .ue/my-app/scratch/.ue/my-app-mix.json --explain
```

**The links, each under its call.** The base file first gets `measuredOn`
`"benchmark book, nothing measured"`; row B is `.ue/my-app/card-fee.json` and the pessimistic
corner `.ue/my-app/pessimistic.json` — the base scenario with that row's one edit and the same
note. Each link is printed under the call that minted it. Rows C, D and the optimistic corner
are minted the same way. Every figure in these links is the book's or the price of a plan
still being chosen, so no privacy sentence is due.

```bash
npx -y @segmently/cli ue link .ue/my-app.json --label 'Monthly $19.99 web'
```
`https://www.segmently.ai/unit-economics?v=2&label=Monthly%20%2419.99%20web&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly~19.99~1month~none~30.00~100.0~2.86~&ref=skill`

```bash
npx -y @segmently/cli ue link .ue/my-app/card-fee.json --label 'monthly + card fee'
```
`https://www.segmently.ai/unit-economics?v=2&label=monthly%20%2B%20card%20fee&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&fee=2.90~0.30~card_processor&p=Monthly~19.99~1month~none~30.00~100.0~2.86~&ref=skill`

```bash
npx -y @segmently/cli ue link .ue/my-app/pessimistic.json --label 'pessimistic corner'
```
`https://www.segmently.ai/unit-economics?v=2&label=pessimistic%20corner&cps=2.5&p1=20.0&p2=35.0&p3=25.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly~19.99~1month~none~30.00~100.0~2.86~&ref=skill`

All three return `roundTrip` `ok` and `warnings` `[]`.

**What would have to be true for A** (`breakEvens.chain`): cost per start ≤ $0.90, or
p1 ≥ 50.0 %, or p2 ≥ 83.3 %, or p3 ≥ 58.3 %. For D: cps ≤ $1.70, or p1 ≥ 26.4 %, or
p2 ≥ 44.0 %, or p3 ≥ 30.8 %.

**Charges per payer for A** (sweeping `products[0].paymentsCounted`, one evaluate run per
point): the last point that does not clear is 4.76 (`profitPerStart` −$0.0013, payback not
covered) and the first that clears is 4.77 (`profitPerStart` +$0.0018, payback charge 12,
month 12). The break-even is 4.77, and its link is labelled with 4.77. A typed 4.7565 comes
back `snapped` to 4.76 (the control's 0.01 grid) and prints 4.76's figures: it is the failing
point, not the break-even.

**Readiness at the book's volume** ($45,000 a month, 987 starts a day): "paywall mix
decidable after 6 days".

**Verdict with boundary.** At the book's numbers a single monthly plan does not clear and a
monthly + annual pair clears gross; the corridor runs from ROAS 0.12 to 2.01, so the book
cannot decide this — the reader's first starts will.

> These figures are this scenario's arithmetic on the inputs above. The price $19.99 and the
> monthly cadence — measured: the reader's own answer. Cost per start $1.50, the chain 30 % →
> 50 % → 35 %, charges per payer 2.86, completion 100 %, no trial (none was mentioned), the
> Annual's $119.99 with the CLI's 25.5 % / 14.9 % split in row D, and the book's $45,000 a
> month — assumed: the benchmark book and the CLI's proposal, nothing observed. Whether those
> chain rates hold for this traffic — not testable soon: 6 days at the book's volume before
> the mix is decidable (`readiness.line`).

Refunds, tax and disputes are "not counted" — they enter only when the reader gives numbers.
B and C links carry `fee=`, which the page reads: each opens there on its own row's net
figures.

## UC-1 — a 7-day free trial on the same monthly plan

Base: the seed scenario (Monthly $19.99 take 25.5 %, 2.86 charges; Annual $119.99 take
14.9 %; value per tap $32.46, CAC per payer $70.72).

The takes are the READER's answers, never computed or supplied by the skill. Two example
answers a reader might give (the numbers below are theirs in this example — a reader who
has no trial take gets a question or a labelled sweep, never one of these numbers):
(a) "with both shown, Monthly keeps 15.3 % of buy-taps and Monthly with trial takes 13.2 %";
(b) "Monthly keeps its 25.5 % (as the CLI prints it) and the trial adds 6 %". Each variant:
new product "Monthly with trial" (same price and cadence, `trial = {kind:"free", days:7}`,
`takeOfTaps` and `trialConv` as stated), the Monthly's `takeOfTaps` as stated.

```bash
npx -y @segmently/cli ue evaluate seed.json --explain
npx -y @segmently/cli ue evaluate trial-a-q55.json --explain
```

| Variant | Value / tap | vs today $32.46 | CAC per payer | vs today $70.72 |
|---|---|---|---|---|
| (a) q 0.30 | $28.89 | −$3.57 | $83.64 | +$12.92 |
| (a) q 0.55 | $30.78 | −$1.68 | $76.27 | +$5.55 |
| (a) q 0.80 | $32.66 | +$0.20 | $70.10 | −$0.62 |
| (b) q 0.30 | $33.49 | +$1.03 | $67.70 | −$3.02 |
| (b) q 0.55 | $34.34 | +$1.88 | $65.38 | −$5.34 |
| (b) q 0.80 | $35.20 | +$2.74 | $63.21 | −$7.51 |

Break-even `q` (sweeping `trialConv` with evaluate until value per tap reaches $32.46, one
evaluate run per point, on the control's 0.5-point grid): (a) 0.77 does not clear ($32.44, $0.02
below today's $32.46) and 0.775 is the first point that does ($32.47, $0.02 above), so (a)'s
break-even is 0.775; (b) none needed — above today at every trial conversion
the control takes, down to its 2 % floor ($32.53 at 2 %), because in (b) the trial's takers
are all new buyers by the reader's own answer. The window is **2 % – 95 %** at both ends:
`trialConv` 1.0 comes back `products[i].trialConv was clamped to 95.0%` and 0.01 comes back
`clamped to 2.0%` — report each "typed 100 % → landed 95 %" / "typed 1 % → landed 2 %", and
state a "never breaks even" or a "clears at every point I tried" at the LANDED endpoint.

Readiness, read from EVERY variant (it is not the base's to carry): (a) "paywall mix
decidable after 6 days · trial verdict after 54 days · annual renewals due at month 12,
observable from month 13"; (b) the same line with "trial verdict after 107 days" — the day
count moves with the trial product's take. The (a) q 0.55 link carries the reader's takes
and trial conversion, so the privacy sentence comes first, on its own line:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`https://www.segmently.ai/unit-economics?v=2&label=trial%20a%20q55&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&p=Monthly%20subscription~19.99~1month~none~15.30~100.0~2.86~&p=Monthly%20with%20trial~19.99~1month~7d-free~13.20~100.0~2.86~55.0&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&ref=skill`
(a real answer adds `measured=` via `measuredOn`).

Verdict with boundary: whether the trial pays depends on how many of its takers would have
bought the plan anyway — that is the reader's belief (answer a vs b), not something the book
or the CLI knows; the test that settles it needs the trial verdict's 54–107 days.

## UC-2 — the same paywall on the web and in the store, VAT 20 % inside the price

Base: the seed scenario. Every row sets `deductions.tax = { "included": true, "rate": 0.2 }`
except "gross".

```bash
npx -y @segmently/cli ue evaluate web.json --explain
npx -y @segmently/cli ue link web.json --label 'web card'
```

Refunds and disputes are "not counted" in every row: this reader gave no numbers for them.
The activation row uses an example reader's two answers (share 0.80 and 1 charge from
non-openers). BOTH numbers came from that reader. When only one of them exists, the row is a
two-dimensional sweep over the pair, labelled "sweep points, not an estimate", or it is not
shown at all — a `nonOpenerChecks` the skill chose is a picked input, never allowed.

Each row is its OWN evaluate run — every cell below, `payback` included, comes from that
run's output (rule 9). `feeScheme` is the field that row's run printed beside its
`deducted.fee`.

| Stack (deductions) | Net / tap | ROAS net | Fee / tap | Payback | `feeScheme.base` |
|---|---|---|---|---|---|
| Gross (nothing counted) | $32.46 | 1.14 gross | — | charge 4, month 4 | `null` (no fee stated) |
| Web: `fee {0.029, 0.30, card_processor}` | $25.84 | 0.90 | $1.20 | not covered | `charged` |
| Web + `activation {0.80, 1}` (the reader's answers) | $24.35 | 0.85 | $1.20 | not covered | `charged` |
| Store: `fee {0.15, 0, app_store_small}` | $22.99 | 0.80 | $4.06 | not covered | `exTax` |
| Store: `fee {0.30, 0, app_store}` | $18.93 | 0.66 | $8.11 | not covered | `exTax`, `afterYearPct` 0.15 |

Waterfalls per payer, each from its own run — list × charges $80.34 every time:

| Row | provider fee | tax | reaches the account |
|---|---|---|---|
| Web card | −$2.98 (2.9 % of the $80.34 CHARGED + $0.30 a charge) | −$13.39 | $63.97 |
| Web card + activation | −$2.98 | −$13.39 | $60.26 (non-openers' lost charges −$3.70) |
| Store 15 % | −$10.04 (15 % of the $66.95 EX-TAX) | −$13.39 | $56.91 |
| Store 30 % | −$20.08 (30 % of the $66.95 EX-TAX) | −$13.39 | $46.86 |

**Boundary.** The store presets take their commission on the price NET of tax
(`feeScheme.base` `exTax`), give it back on a refund and treat a dispute as a refund with no
fee of its own; `app_store` also carries `afterYearPct` 0.15. The card presets take theirs on
the tax-inclusive amount and keep it through a refund. Name the base each row used, from that
row's own `feeScheme` — never say the store fee is treated like a card fee. The store presets
are editorial book entries. Not modelled: buyers who would have bought in the store anyway,
and attribution differences. Every link here carries deduction keys, and the public page reads
all of them, `fee=`'s scheme included: each link opens there on its own row's net figures.

## UC-3 — the reader's chain and one monthly plan, everything else the book's

The reader: "cps 2.1, p1 28 %, p2 44 %, p3 31 %, monthly 14.99 take 22 %". They did not give
charges, completion or volume — ask for them one per turn, or say each stays the book's.

```bash
npx -y @segmently/cli ue init my-app --product 'Monthly~14.99~1month~none' --platform web
# edit .ue/my-app.json: chain {2.1, 0.28, 0.44, 0.31}, touched [cps, p1, p2, p3],
# products[0].takeOfTaps 0.22, measuredOn "reader-stated, source not given"
npx -y @segmently/cli ue evaluate .ue/my-app.json --explain
npx -y @segmently/cli ue link .ue/my-app.json --label 'my numbers'
```

| Input | Value | Provenance |
|---|---|---|
| cost per start | $2.10 | yours (`provenance.chain.cps` = reader) |
| p1 / p2 / p3 | 28 % / 44 % / 31 % | yours (reader) |
| Monthly price, take of buy-taps | $14.99, 22 % | yours |
| charges per payer | 2.86 | book (monthly) — not given |
| buy-tap → paid | 100 % | book — not given |
| volume | $45,000 a month | book — not given |

| KPI | Value | Reads |
|---|---|---|
| value per tap | $9.43 | your chain, price and take on the book's charges and completion |
| required value per tap | $54.99 | your chain |
| CAC per payer | $249.93 | your chain and take on the book's completion |
| profit per start | −$1.74 | your chain on the book's charges and completion |
| ROAS | 0.17 gross | your chain on the book's charges and completion |
| payback | not covered in 12 months | as above |

`breakEvens.chain`: cost per start ≤ $0.36; p1, p2 and p3 are all in `breakEvens.unreachable`
(their break-evens are above 100 %), so no conversion rate at a single step clears this
scenario on its own. Stage `live_no_data`; readiness at the book's volume: "paywall mix
decidable after 12 days". The link carries the reader's numbers, so the privacy sentence
comes first, printed whole on its own line. It raises no `page_shows_gross`: the page reads
`measured=` and shows the note in its "Measured on" field.

## UC-8 — test plan: a paywall change at $300 a day

The reader: "How long until we know if a new paywall that lifts buy-taps works? We spend $300
a day." The lever is `p3` (paywall → buy-tap). They named no lift, so `p3` takes `ue rank`'s
default +10 % relative — the "assumed lift". Base: a two-plan project on the book's chain,
Monthly $19.99 with a 7-day free trial and Annual $119.99.

```bash
npx -y @segmently/cli ue init my-app --product "Monthly~19.99~1month~7d-free" --product "Annual~119.99~1year~none" --platform web --have none
# edit .ue/my-app.json: scenario.measuredOn "benchmark book, nothing measured"
# the variant at the reader's budget, .ue/my-app/paywall-test-300.json: that scenario with
# volume { "amount": 300, "unit": "budget_day" }, label "paywall test $300/d",
# measuredOn "reader-stated daily ad spend, 2026-09-23"
npx -y @segmently/cli ue rank .ue/my-app/paywall-test-300.json --override p3=0.10
npx -y @segmently/cli ue evaluate .ue/my-app/paywall-test-300.json --explain
```

The `p3` row of that ONE rank run, field by field, rounded as the CLI's table view rounds it
(`roasAfter` and `populationPerDay`, which that view omits, to two decimals). The last row is
the row's `note`, whole:

| field | value |
|---|---|
| `lever` | p3 |
| `lift` | 0.1 — assumed lift |
| `gainPerMonth` | 810.86 |
| `roasAfter` | 0.98 |
| `populationPerDay` | 30 |
| `nPerArm` | 2978 |
| `days` | 198.53 |
| `spendRouted` | 59560 |
| `mde` @ 30 d | 0.2606 |
| `mde` @ 90 d | 0.1492 |
| `realistic` | false |
| `note` | not at this traffic: within 30 days you can only see a ≥ 26.1% change — test a bigger change, or raise volume |

Then, in this order: **Not testable at this volume in under 30 days.** 198.53 days.
"not at this traffic: within 30 days you can only see a ≥ 26.1% change — test a bigger change, or raise volume"
Within 30 days you can only see a ≥ 26.1 % change.

The run's one warning, in one line, although its row is not printed: `bought` — typed +10 %,
landed +9.98 %, the take control's grid.

Beside it, the calendar from the evaluate run at the same $300 a day (`readiness.line`):
"paywall mix decidable after 29 days · trial verdict after 105 days · annual renewals due at month 12, observable from month 13".

The variant carries the reader's budget, so the privacy sentence comes first, on its own line,
then the call, then the link:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link .ue/my-app/paywall-test-300.json --label 'paywall test $300/d'
```
`https://www.segmently.ai/unit-economics?v=2&label=paywall%20test%20%24300%2Fd&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=300:budget_day&measured=reader-stated%20daily%20ad%20spend%2C%202026-09-23&p=Monthly~19.99~1month~7d-free~30.10~100.0~2.86~50.0&p=Annual~119.99~1year~none~14.00~100.0~1.00~&ref=skill`

It returns `roundTrip` `ok` and `warnings` `[]`.

> These figures are this scenario's arithmetic on the inputs above. Your $300 a day —
> measured: your stated budget. The prices, Monthly $19.99 with a 7-day free trial and Annual
> $119.99 — measured: your project file. Cost per start $1.50, the chain 30 % → 50 % → 35 %,
> the CLI's init split (30.1 % / 14.0 % of buy-taps), charges per payer 2.86 and 1, completion
> 100 %, trial conversion 50 % and the +10 % lift on `p3` — assumed: the benchmark book, the
> CLI's split and `ue rank`'s default lift. Whether the new paywall moves `p3` at all — not
> testable soon: 198.53 days at this budget (`days`), with the paywall mix decidable after 29
> days (`readiness.line`).

## UC-10 — which experiment first: the seed at the book's volume

Base: the seed scenario at $45,000 a month (986.84 starts a day, `base.startsPerDay`),
every lever at the CLI's default +10 % relative ("assumed lift"), horizons 30 and 90 days.
ONE run, in JSON; every cell below is that run's own row (rule 9), rounded for reading only,
as the CLI's table view rounds it (a `null` prints n/a):

```bash
npx -y @segmently/cli ue rank seed.json
```

| lever | lift | gain / month | ROAS after | population / day | n per arm | days | spend routed | MDE @ 30 d | MDE @ 90 d | realistic | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p1 | 0.1 | 5112.01 | 1.25 | 986.84 | 3763 | 7.63 | 11289 | 0.0501 | 0.0288 | true | n/a |
| p2 | 0.1 | 5112.01 | 1.25 | 296.05 | 1565 | 10.57 | 15650 | 0.0594 | 0.0343 | true | n/a |
| p3 | 0.1 | 5112.01 | 1.25 | 148.03 | 2978 | 40.24 | 59560 | 0.116 | 0.0666 | false | not at this traffic: within 30 days you can only see a ≥ 11.6% change — test a bigger change, or raise volume |
| bought | 0.1015 | 5175.93 | 1.25 | 51.81 | 2281 | 88.05 | 130342.86 | 0.1745 | 0.1004 | false | not at this traffic: within 30 days you can only see a ≥ 17.4% change — test a bigger change, or raise volume |
| mix | 0.1 | 1474.2 | 1.17 | 51.81 | 9331 | 360.21 | 533200 | 0.363 | 0.204 | false | shifts picks toward Annual subscription, the product whose share move gains the most; not at this traffic: within 30 days you can only see a ≥ 36.3% change — test a bigger change, or raise volume |
| close | 0 | 0 | 1.14 | 20.93 | n/a | n/a | n/a | n/a | n/a | false | at its ceiling: payment completion is already 100.0% and the calculator's own control stops there |
| trialConv | 0 | 0 | 1.14 | 0 | n/a | n/a | n/a | n/a | n/a | false | no product on the paywall has a trial |
| renewals | 0.1 | 2296.15 | 1.19 | 20.93 | n/a | n/a | n/a | n/a | n/a | false | calendar: one billing period per read |

The same run's `warnings` (printed on stderr as well):

```text
warning: The link carries no label= — a scenario without a name is a number without a source (rule 4).
warning: The link carries no measured= — a scenario without a source note is a number without provenance (rule 4).
warning: rank bought: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.15% — every figure of this row uses the landed lift
```

`base`: `profitPerStart` 0.20, `roas` 1.14. `recommendation.first` `p1`,
`recommendation.runnerUp` `p2`, and `recommendation.links` — the two lifted
variants, round-trip checked.

Reading it, every figure quoted from the run:

- Ranked by gain per day of testing, learnable rows first: only `p1` and `p2`
  are learnable inside 30 days (7.63 days and 10.57 days), so they are
  `recommendation.first` and `runnerUp`.
- `p1`, `p2` and `p3` each carry $5,112.01 a month for the same +10 %; the
  population a test can use shrinks at every step — 986.84 funnel starts, 296.05 people
  past step 1 and 148.03 paywall viewers a day — so `p3` needs 40.24 days, and
  within 30 days only a ≥ 11.6 % change is readable there.
- `bought` was `snapped`: typed +10 % → landed +10.15 %, the take control's 0.1-point grid; its row uses the landed lift.
  `mix` shifts picks toward the Annual — the product whose share move gains the most — and
  needs 360.21 days.
- `close` is at its ceiling — its note says "at its ceiling", so it is "at ceiling — no lift to
  test"; `trialConv` is not at a ceiling — its note gives its own reason, no trial product on
  the paywall; `renewals` is a calendar read. None of the three has a sample size.
- Price is not ranked here — a price test needs the variance of revenue per user from your own data.
- The seed carries no `label` and no `measuredOn`, hence `label_missing` / `measured_missing`
  and an empty `label=` in the recommended links. A real answer sets both in the base file
  before it runs `ue rank`, and prints the privacy sentence before those links when the budget
  or any other figure in them is the reader's.
