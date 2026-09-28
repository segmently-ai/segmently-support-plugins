# UC-0 — Is this worth launching, and at what numbers? (idea, pre_launch)
Route: an idea or a price only: "worth launching?", "what price?"; no project, no numbers (SKILL.md § Router) · Eval: P0 · MCP: uc-0, cases-uc-0
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
1. What is sold, price, cadence, trial — or "not decided" → one monthly anchor price.
2. Where payment happens: web checkout, app store, or both.
3. What they already have: nothing, ad numbers, an analytics funnel, RevenueCat, a Segmently funnel.
- Nothing else before the card — everything else is the book's and labelled so; what the message
  carries is not asked. A store asks no program: both are rows (`app_store_small`, `app_store`).

## Calls
- `ue init <slug> --product "<name>~<price>~<cadence>~<trial>" --platform web --have none` (repeat
  `--product`; `--anchor <monthly price>` when undecided; `--platform store|both`) — a trial the reader
  never mentioned: leave the trial segment out (`<name>~<price>~<cadence>`), walked as assumed.
- `ue evaluate <file> --explain` — the base, then one run per variant file `.ue/<slug>/<variant>.json`,
  the base scenario with ONE edit, each row its own run (rule 9):
  - the platform's fee, not stated, so the book's preset — web `deductions.fee = { "pct": 0.029,
    "fixed": 0.30, "preset": "card_processor" }`; store `0.15`/`"app_store_small"`, `0.30`/`"app_store"`;
  - the corridor — the book's P10/P90 corners: pessimistic `chain = { cps 2.5, p1 0.20, p2 0.35,
    p3 0.25 }`, optimistic `{ cps 1.0, p1 0.40, p2 0.65, p3 0.45 }`;
  - the charges bracket — `products[i].paymentsCounted` on its 0.01 grid (SKILL.md § The bracket);
  - the learning budget — `volume = { "amount": <daily budget>, "unit": "budget_day" }` in the base.
- The paywall mix. When the reader named no annual price, the CLI proposes it (the first call: the
  monthly plus the book's annual, at the CLI's split); with an annual price the reader named, the
  second. Evaluate `.ue/<slug>/scratch/.ue/<slug>-mix.json` as the variant; the split is never yours.
  ```bash
  ue init <slug>-mix --anchor <monthly price> --dir .ue/<slug>/scratch
  ue init <slug>-mix --product "<monthly>" --product "Annual~<price>~1year~none" --dir .ue/<slug>/scratch
  ```
- `ue link .ue/<slug>/<variant>.json --label '<name>'` — one per row.

## Answer skeleton
1. The onboarding screen (SKILL.md § Session start, point 3), in the session's first answer.
2. **The card**, one row per run — the mix whenever one plan does not clear (never defer this variant
   to a question). Its columns, on every row (the base, the fee and mix variants, each corridor corner):
   value per tap gross and net, ROAS on its `valueBasis`, CAC per payer, profit per start, payback and
   `readiness.line`; the base's `words.payback` whole under the card. On a fee row, name the base its own
   `feeScheme` printed: with no tax the two bases give the same fee, and you still name the base on every
   row that states a fee. Under the corners: "the book cannot decide this — your first starts will".
3. **What would have to be true:** the base's `words.breakEvens`, printed whole (a variant's under its
   own name), never ranked or reworded; then the charges break-even by SKILL.md § The bracket — both
   bracket points side by side, each its own run; never "≈", never "effectively break-even".
4. **Learning budget:** with a daily budget, both factors and the product, labelled — "6 days × $500 a
   day = $3,000 (your numbers, prepared)", the days from `readiness.line` at that volume; without one,
   the base's `readiness.line` at the book's volume, labelled book. Never multiply the book's volume
   into a dollar learning budget: its operands are not the reader's.
5. **Instrument list:** funnel starts (landing views, not clicks), paywall views, buy-taps, purchases
   per product, charged payers, first app open after payment, refunds, disputes.
   **Decision rule:** run the first test if the central scenario clears net; print the pessimistic
   corner's `profitPerStart` with its `valueBasis` (a CLI figure: "−$2.20 gross") beside the learning
   budget and let the reader judge whether that loss per start is acceptable for the test. If the central
   scenario does not clear, change the paywall first (annual beside the monthly, a paid trial, a higher
   anchor) and show that variant beside the first.
6. **Links — one per row, each with its call:** every card row, corridor corner and both bracket points
   by `ue link` — and print that call on the line directly above the link it produced; `privacy.sentence`
   first when `privacy.due`. A list of links without their `ue link` calls is unfinished.
7. The boundary: `walk.opener`, the base's `walk.lines`, then the lines of § Boundary.
8. The one question, with no daily budget given: "What would you spend a day on the first test?"

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines`,
then what only the session knows — each a bullet of its own, the base's walk carrying none of them:
- the fee row's own `walk.lines` fee line, word for word, naming the book's preset — never "your fee";
- the mix variant's split and its Annual's price, cadence and trial (measured when the reader named them)
  — assumed: the book and the CLI's proposal; the Annual's charges and completion — the mix run's own
  `walk.lines` lines for those two only, word for word — never its Annual price line (it says measured);
- assumed: the corridor corners' chains (the book's P10/P90) and the charges sweep points (a labelled
  sweep), at their landed values;
- not testable soon: whether those chain rates hold for this traffic — the `readiness.line` days at
  the volume the run used ("6 days at the book's volume" until the reader gives a daily budget).
Measured: only what the reader stated — the price and cadence, the platform, a trial only when named.
A trial they never mentioned is `walk.lines`' own assumed line (the spec without its trial segment).

## Stops
- A knob in `breakEvens.unreachable`: its `words.breakEvens` line says so in words; no break-even for it.
- Refunds, tax and disputes enter only when the reader gives numbers — until then "not counted".
- The reader's own funnel numbers arrive → `cases/uc-03-your-numbers.md`.

## Worked example

```bash
npx -y @segmently/cli ue init my-app --product "Monthly~19.99~1month" --platform web --have none
npx -y @segmently/cli ue evaluate .ue/my-app.json --explain
```

The reader named no trial, so the spec leaves its trial segment out: the CLI reads it as none and
records it in `unstatedTrials`. The init gives the single plan a take of 30 % of buy-taps and 2.86
charges (the book's monthly count). Required value per tap (`kpis.requiredValuePerTap`): $28.57.

| Scenario (edit vs base) | Value / tap gross | Value / tap net | ROAS | CAC per payer | Profit / start | Payback | Readiness (`readiness.line`) |
|---|---|---|---|---|---|---|---|
| A. Monthly $19.99 alone (base) | $17.15 | $17.15 | 0.60 gross | $95.24 | −$0.60 | not covered within 12 months | paywall mix decidable after 6 days |
| B. A + `deductions.fee = {0.029, 0.30, "card_processor"}` | $17.15 | $16.40 | 0.57 net | $95.24 | −$0.64 | not covered within 12 months | paywall mix decidable after 6 days |
| C. A + `deductions.fee = {0.15, 0, "app_store_small"}` | $17.15 | $14.58 | 0.51 net | $95.24 | −$0.73 | not covered within 12 months | paywall mix decidable after 6 days |
| D. Monthly + Annual $119.99 (the CLI's anchor ladder and split: 25.5 % / 14.9 %) | $32.46 | $32.46 | 1.14 gross | $70.72 | $0.20 | charge 4, month 4 | paywall mix decidable after 6 days · annual renewals due at month 12, observable from month 13 |
| A at the pessimistic corner (`chain` = 2.5 / 0.20 / 0.35 / 0.25) | $17.15 | $17.15 | 0.12 gross | $476.19 | −$2.20 | not covered within 12 months | paywall mix decidable after 29 days |
| A at the optimistic corner (`chain` = 1.0 / 0.40 / 0.65 / 0.45) | $17.15 | $17.15 | 2.01 gross | $28.49 | $1.01 | charge 2, month 2 | paywall mix decidable after 2 days |

Each Payback cell is its own row's `payback` field. Under the card, the base's `words.payback` —
printed whole:

Payback: not covered within 12 months assumes the book's first renewal (monthly 60%) and one steady renewal after it that matches your charges count

Each fee row names its base from its own `feeScheme`: B `charged` (the card preset, on the amount
charged), C `exTax` (the store preset). Row C states a store preset but no tax, and a store scheme's
`exTax` base equals the price when nothing is deducted for tax, so C's fee ($2.57 a tap,
`deducted.fee`) is exactly what it would be on the charged amount. State an inclusive VAT as well and
the same 15 % lands on the smaller ex-tax amount instead — that is the difference the web-vs-store
case shows. Every row above is its own evaluate run, payback and readiness included (rule 9). The
book cannot decide this — your first starts will: the corridor runs from ROAS 0.12 to 2.01.

Row D came from the CLI's own anchor ladder — the reader named no annual price, so the CLI proposes
the pair (Monthly $19.99 and the book's Annual $119.99) and its split:

```bash
npx -y @segmently/cli ue init my-app-mix --anchor 19.99 --dir .ue/my-app/scratch
npx -y @segmently/cli ue evaluate .ue/my-app/scratch/.ue/my-app-mix.json --explain
```

**What would have to be true for A** — its evaluate's `words.breakEvens` — printed whole:

- cost per start ≤ $0.90 (from $1.50)
- `p1` ≥ 49.98 % (from 30 %)
- `p2` ≥ 83.3 % (from 50 %)
- `p3` ≥ 58.31 % (from 35 %)

For D, its own evaluate's `words.breakEvens` — printed whole:

- cost per start ≤ $1.70 (from $1.50)
- `p1` ≥ 26.41 % (from 30 %)
- `p2` ≥ 44.02 % (from 50 %)
- `p3` ≥ 30.81 % (from 35 %)

**Charges per payer for A** (SKILL.md § The bracket, on `products[0].paymentsCounted`, one evaluate run
per point): the last point that does not clear is 4.76 (`profitPerStart` −$0.0013, payback not
covered) and the first that clears is 4.77 (`profitPerStart` +$0.0018, payback charge 12, month 12).
The break-even is 4.77, and its link is labelled with 4.77. A typed 4.7565 comes back `snapped` to
4.76 (the control's 0.01 grid) and prints 4.76's figures: it is the failing point, not the break-even.

**Learning budget** — no daily budget given, so A's `readiness.line` at the book's volume ($45,000 a
month, 986.84 funnel starts a day, `kpis.startsPerDay`), labelled book — printed whole:

"paywall mix decidable after 6 days"

**Instrument list:** funnel starts (landing views, not clicks), paywall views, buy-taps, purchases per
product, charged payers, first app open after payment, refunds, disputes.

**Decision rule:** the central scenario (A) does not clear, so the paywall changes first — row D, the
monthly + annual pair, stands beside A; the pessimistic corner's `profitPerStart`, −$2.20 gross,
stands beside the learning budget for the reader to judge whether that loss per start is acceptable
for the test.

**The links, each under its call.** The base file first gets `measuredOn`
`"benchmark book, nothing measured"`; row B is `.ue/my-app/card-fee.json` and the pessimistic corner
`.ue/my-app/pessimistic.json` — the base scenario with that row's one edit and the same note.
Each link is printed under the call that minted it. Every `ue link` result says `privacy.due` `true`
— the base's and row B's carry only the reader's $19.99 (`pricesOnly` `true`), the pessimistic corner
its chain too — and this reader never said the price is still open, so the privacy sentence comes
first, on its own line, above the first call. `privacy.sentence` — printed whole:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link .ue/my-app.json --label 'Monthly $19.99 web'
```
`https://www.segmently.ai/unit-economics?v=2&label=Monthly%20%2419.99%20web&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly~19.99~1month~none~30.00~100.0~2.86~&ref=skill`

Under it, one line: "`measured_missing` on the init's link → re-minted with measured=benchmark book,
nothing measured" — the base evaluate printed it too, and this one re-mint cures both.

```bash
npx -y @segmently/cli ue link .ue/my-app/card-fee.json --label 'monthly + card fee'
```
`https://www.segmently.ai/unit-economics?v=2&label=monthly%20%2B%20card%20fee&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&fee=2.90~0.30~card_processor&p=Monthly~19.99~1month~none~30.00~100.0~2.86~&ref=skill`

```bash
npx -y @segmently/cli ue link .ue/my-app/pessimistic.json --label 'pessimistic corner'
```
`https://www.segmently.ai/unit-economics?v=2&label=pessimistic%20corner&cps=2.5&p1=20.0&p2=35.0&p3=25.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly~19.99~1month~none~30.00~100.0~2.86~&ref=skill`

All three return `roundTrip` `ok` and `warnings` `[]`. Rows C, D, the optimistic corner and both
charges bracket points (4.76 and 4.77) are minted the same way. Row D's carries that one line under it
too, for the mix `ue init`'s own link. B and C links carry `fee=`, which the page reads: each opens there
on its own row's net figures. Refunds, tax and disputes are "not counted" — they enter only when the
reader gives numbers.

**Verdict with boundary.** At the book's numbers a single monthly plan does not clear and a monthly +
annual pair clears gross; the corridor runs from ROAS 0.12 to 2.01, so the book cannot decide this —
the reader's first starts will.

The boundary: `walk.opener` and the base's `walk.lines` (`ue evaluate .ue/my-app.json --explain`
above) — printed whole, word for word — then the variant rows' own lines (rows B's and C's fee from
their own `walk.lines`, the Annual's charges and completion from the mix run's) and what only the
session knows:

> These figures are this scenario's arithmetic on the inputs above.
>
> - cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
> - Monthly: $19.99, monthly — measured: your project file (price, cadence)
> - Monthly: no trial — assumed: not stated — the CLI's init reads it as none
> - Monthly's take 30 % — assumed: the CLI's init split
> - Monthly's charges 2.86 — assumed: the book
> - Monthly's completion 100 % — assumed: the book
> - $45,000 a month — assumed: the book's volume
> - the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
> - the fee 2.9 % + $0.30 on the `charged` base — assumed: the book's `card_processor` preset
> - the fee 15 % + $0.00 on the `exTax` base — assumed: the book's `app_store_small` preset
> - the Annual's $119.99, yearly, no trial, with the CLI's 25.5 % / 14.9 % split in row D — assumed: the CLI's proposal
> - Annual $119.99's charges 1 (its cadence cap) — assumed: the book
> - Annual $119.99's completion 100 % — assumed: the book
> - the corridor corners' chains (pessimistic $2.50, 20 % → 35 % → 25 %; optimistic $1.00, 40 % → 65 % → 45 % — the book's P10/P90) — assumed
> - the charges sweep points 4.76 and 4.77 (a labelled sweep) — assumed
> - whether those chain rates hold for this traffic — not testable soon: 6 days at the book's volume before the mix is decidable (`readiness.line`: "paywall mix decidable after 6 days")

What would you spend a day on the first test?
