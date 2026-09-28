# UC-2 — Web checkout vs store: the same paywall under two fee stacks
Route: "web checkout vs App Store", "Stripe vs Apple fees" (SKILL.md § Router) · Eval: P2 · MCP: uc-2, cases-uc-2
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
One question per turn, in this order (do not skip step 2 — never pick `nonOpenerChecks` yourself):
1. **The store program** — 15 % or 30 %. Asked alone: both programs run meanwhile, each its own row,
   so the first answer already carries numbers.
2. **Activation: ASK for the share AND for `nonOpenerChecks` in the same turn.** Both numbers, or
   neither. If the reader gives only the share, or neither, the activation row is a TWO-dimensional
   sweep over the pair, every point labelled "sweep points, not an estimate" — or it is not shown at
   all. Choosing a `nonOpenerChecks` yourself (1 charge, 0 charges, "a charge from anyone who doesn't
   open") is a picked input and is forbidden, even when you name the choice in prose.
3. **Web refunds and disputes** — their shares and the dispute fee; anything the reader has no number
   for stays "not counted".
- A VAT rate given without saying whether the prices include it: build `included: true` and place it
  in the boundary (§ Boundary) — no extra question.

## Calls
- One variant per stack, by JSON edit. Web: `deductions.fee = { pct, fixed, preset }` — presets
  `card_processor` (2.9 % + $0.30), `card_processor_billing` (3.6 % + $0.30), `merchant_of_record`
  (5 % + $0.50), or the provider statement's pct/fixed with no `preset`; `deductions.tax = { included,
  rate }`, `deductions.refunds = { share }`, `deductions.disputes = { share, fee }`,
  `deductions.activation = { share, nonOpenerChecks }`, `deductions.custom = [{ id, name, pct, fixed }]`.
  Store: the app-store presets `app_store_small` (15 %) and `app_store` (30 %), which are editorial
  book entries — say so — with tax and refunds; no disputes, no activation (chargebacks and installs
  are the store's). Link segment: `fee=<pct>~<fixed>~<preset>` (e.g. `fee=2.90~0.30~card_processor`).
- `npx -y @segmently/cli ue evaluate <stack>.json --explain` — each stack and each sweep point, its
  own run (rule 9).
- `npx -y @segmently/cli ue link <stack>.json --label '<name>'` — each stack and each sweep point (a
  provider statement's numbers are the reader's own).

## Answer skeleton
1. The side-by-side table, every cell from THAT stack's own evaluate run (rule 9): net per tap, net
   ROAS, fee per tap (`deducted.fee` — `units.deducted` is `per_tap`) with its `feeScheme` base,
   payback. `ue evaluate` prints `feeScheme` beside `deducted.fee`: the store presets come back
   `base: "exTax"`; `card_processor`, `card_processor_billing` and `merchant_of_record` come back
   `base: "charged"`. Name the base each row used, from that row's own `feeScheme`. Then the
   `waterfall` rows (per payer, `units.waterfall`) side by side — the per-payer fee is the waterfall's
   own fee row, never `deducted.fee` divided by anything.
2. "The store wins only if …" — the web side's weakest input swept, every point its own run labelled
   "sweep points, not an estimate": the disputes share at the reader's dispute fee, or the activation
   PAIR (`share` AND `nonOpenerChecks`) swept together — the share alone only at the reader's own
   `nonOpenerChecks`. A sweep over the share alone, with a `nonOpenerChecks` you chose, is a picked
   input — not allowed. When the reader has given no dispute fee and not both activation numbers, the
   sweep is the activation pair: a small two-dimensional grid of `share` × `nonOpenerChecks`. Each
   point is a variant with its own evaluate run and its own `ue link`, labelled "sweep points, not an
   estimate", and placed in the boundary as "assumed: a labelled sweep". "Not shown at all" (Turn 2,
   § Stops) removes the activation row from the side-by-side table, never this line. If you still run
   no sweep, say in one line which input it waits for — never that it cannot be run.
3. The links, one per stack and sweep point: `privacy.sentence` first when `privacy.due`, each link
   under the `ue link` call that minted it.
4. The boundary: `walk.opener`, the base's `walk.lines`, then the lines of § Boundary.
5. The one question — the next Turn's, while one is open.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines`,
then each stack's own lines, each a bullet:
- its deduction lines from its own `walk.lines`, word for word (a book preset the reader did not state
  reads "assumed: the book's `<preset>` preset" — the app-store presets are editorial book entries);
- its fee-scheme line, read off that run's `feeScheme` field by field: "<stack>: the fee on the
  <`feeScheme.base`> base (`exTax`: the commission is taken on the price NET of tax; `charged`: on the
  tax-inclusive amount), <`feeScheme.onRefund`: `returned` given back | `retained` kept> on a refund,
  <`feeScheme.onDispute`: `refund` — a dispute treated as a refund with no fee of its own |
  `chargeback` — the flat `disputes.fee` on top>, <`feeScheme.afterYearPct`, when not null, after the
  first year> — <the class of its fee line>". Never say the store fee is treated like a card fee.
- a value you set or swept (the activation pair without both of the reader's numbers, a sweep point)
  — assumed: a labelled sweep; a bare VAT rate — "VAT inside your list prices — assumed: you gave the
  rate, not whether it is included";
- not testable soon: buyers who would have bought in the store anyway, and attribution (ad platforms
  see web purchases, most store ones they do not) — neither is modelled here at all.

## Stops
- A deduction the reader has no number for stays "not counted" — never $0, never a number of yours.
- The activation pair half given: the two-dimensional sweep, or no activation row (Turn 2).

## Worked example

Base: the seed scenario, named before its evaluate — `label` "seed at the book's volume" and
`measuredOn` "benchmark book, nothing measured" set in `seed.json`, so its evaluate (the Gross row)
prints no warning. Every row sets `deductions.tax = { "included": true, "rate": 0.2 }` except
"gross" — this reader said "20 % VAT" and not whether the prices include it.

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
| Web: `fee {0.029, 0.30, card_processor}` | $25.84 | 0.90 | $1.20 | not covered within 12 months | `charged` |
| Web + `activation {0.80, 1}` (the reader's answers) | $24.35 | 0.85 | $1.20 | not covered within 12 months | `charged` |
| Store: `fee {0.15, 0, app_store_small}` | $22.99 | 0.80 | $4.06 | not covered within 12 months | `exTax` |
| Store: `fee {0.30, 0, app_store}` | $18.93 | 0.66 | $8.11 | not covered within 12 months | `exTax`, `afterYearPct` 0.15 |

The `waterfall` rows per payer, each from its own run — list × charges $80.34 every time:

| Row | provider fee | tax | reaches the account |
|---|---|---|---|
| Web card | −$2.98 (2.9 % of the $80.34 CHARGED + $0.30 a charge) | −$13.39 | $63.97 |
| Web card + activation | −$2.98 | −$13.39 | $60.26 (non-openers' lost charges −$3.70) |
| Store 15 % | −$10.04 (15 % of the $66.95 EX-TAX) | −$13.39 | $56.91 |
| Store 30 % | −$20.08 (30 % of the $66.95 EX-TAX) | −$13.39 | $46.86 |

**The store wins only if …** — the web side's weakest input is activation, and the reader's own
1 charge from non-openers is kept; the share is swept on runs of its own, "sweep points, not an
estimate": at 70 % opening the web stack nets $23.60 a tap, at 60 % it nets $22.85, beside the
15 % store's $22.99. The 15 % store wins at 60 % and loses at 70 % — the points between were not
run, so 60 % is where it wins, not a break-even; the 30 % store ($18.93) wins at neither point.

The web link: `measuredOn` "your VAT 20 %; the rest from the book"; its `ue link` result says
`privacy.due` `true` (`carries` `deductions` — the VAT is the reader's), so the privacy sentence
comes first, on its own line. `privacy.sentence` — printed whole:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link web.json --label 'web card'
```
`https://www.segmently.ai/unit-economics?v=2&label=web%20card&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=your%20VAT%2020%20%25%3B%20the%20rest%20from%20the%20book&fee=2.90~0.30~card_processor&tax=incl~20.0&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&ref=skill`

It returns `roundTrip` `ok` and `warnings` `[]`; every other stack and both sweep points are minted
the same way.

The boundary: `walk.opener` and the seed's `walk.lines` — printed whole, word for word — then each
stack's own deduction lines from its own `walk.lines`, its fee-scheme line from its own `feeScheme`,
and the session's lines:

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
> - the fee 2.9 % + $0.30 on the `charged` base — assumed: the book's `card_processor` preset
> - web card: the fee on the `charged` base (the tax-inclusive amount), kept on a refund, a dispute charged the flat `disputes.fee` on top — assumed: the book's `card_processor` preset
> - tax 20 % inside the price — measured: your scenario file
> - VAT inside your list prices — assumed: you gave the rate, not whether it is included
> - activation — 80 % open the app, 1 charge from those who do not — measured: your scenario file
> - the activation share swept at 70 % and 60 %, 1 charge from those who do not — assumed: a labelled sweep
> - the fee 15 % + $0.00 on the `exTax` base — assumed: the book's `app_store_small` preset
> - store 15 %: the fee on the `exTax` base (the commission is taken on the price net of tax), given back on a refund, a dispute treated as a refund with no fee of its own — assumed: the book's `app_store_small` preset (an editorial book entry)
> - the fee 30 % + $0.00 on the `exTax` base, 15 % after the first year — assumed: the book's `app_store` preset
> - store 30 %: the fee on the `exTax` base (the commission is taken on the price net of tax), given back on a refund, a dispute treated as a refund with no fee of its own, 15 % after the first year — assumed: the book's `app_store` preset (an editorial book entry)
> - buyers who would have bought in the store anyway, and attribution (ad platforms see web purchases, most store ones they do not) — not testable soon: neither is modelled here at all

Then the one question, Turn 1's: "Which store program are you on — 15 % or 30 %?"
