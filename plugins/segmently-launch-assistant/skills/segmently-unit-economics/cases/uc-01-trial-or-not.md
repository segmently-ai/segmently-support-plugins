# UC-1 — Should part of the users see the same plan with a trial?
Route: "trial or not", "add a free trial" — what the trial does to the economics (a trial OR another change first → UC-10) (SKILL.md § Router) · Eval: P1 · MCP: uc-1, cases-uc-1
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
1. The trial — free or paid, and its length — skipped when the reader named it.
2. The trial product's share of buy-taps once both are shown — ONE question that states the plan's
   default in the same sentence: "What share of buy-taps do you expect <plan> with trial to take once
   both are shown? I keep <plan> at <its take as the CLI printed it> unless you give its own." Never a
   second question mark for the plan's take.
- Trial → paid `q` is not a question: run the reader's `q` if they gave one, else the book's 0.5 or
  the RevenueCat 2026 median for the trial's length (≤ 4 d 25.5 %, 5–9 d 37.4 %, 17–32 d 42.5 %, book
  entry BB-32), labelled "benchmark: RevenueCat 2026 median, a vendor's app-store peer set", and say
  the reader can replace it with their own.
- **No trial take, no invented one.** If the reader has no take for the trial product, do not supply
  one and never move points from one product's take to another (that is a take split, model
  arithmetic). Keep the plan's take as the CLI prints it, and either ask again (one question) or show
  a labelled sweep of the trial's take — "sweep points, not an estimate" — never one assumed value in
  the headline.

## Calls
- The variant, by JSON edit: copy the plan to a new product (unique `name`, e.g. "Monthly with
  trial", new `id`), `trial = { "kind": "free", "days": 7 }`, `onPaywall: true`, `takeOfTaps` = the
  reader's number, `trialConv = q`; the plan's `takeOfTaps` = the reader's number (or unchanged). Put
  the new product NEXT TO the plan it copies, ahead of any `onPaywall: false` products — a minted link
  lists the paywall's products first, and `ue link` refuses one that does not round-trip
  (`link_round_trip_failed`). Completion and charges inherit the plan's unless the reader gives the
  trial's own.
- `npx -y @segmently/cli ue evaluate <variant>.json --explain` — one per `q` the reader wants to see
  and per sweep point, the base included; every sweep point is its own run and its own row (rule 9).
- The break-even `q` — SKILL.md § The bracket, on the trial product's `trialConv` (half a point; its
  window runs **2 % – 95 %**): first the window's two ends, typed 0.01 and 1.0 — each comes back
  `clamped`, reported "typed 1 % → landed 2 %" and "typed 100 % → landed 95 %" — and they count toward
  its ≤ 8 runs; next the grid point nearest the value interpolated between the two LANDED ends'
  `valuePerTap` (`valuePerTap` is linear in `trialConv`; that value only picks the run and is never
  quoted), then its neighbours until two adjacent points bracket the base's `valuePerTap` (its steps 1–3;
  step 5 still applies if they don't).
- The break-even `q` is due in every UC-1 answer that prints a table, the swept-take branch included:
  bracket it on each printed take point (the window's ends first), or on one named point, saying which.
- `npx -y @segmently/cli ue link <variant>.json --label '<name>'` — every row and both bracket points.

## Answer skeleton
1. The table: value per tap and CAC per payer, today and each variant, with the absolute difference
   beside both values; every row its own run. Caution: a free trial delays the first charge, and CAC
   per payer rises when trial takers do not convert.
2. The break-even `q` (SKILL.md § The bracket, steps 3–4 — at a landed end, "clears at every point I
   tried" or "never clears"): the first point whose own run reaches the base's value per tap, beside the
   last point that did not — on the swept-take branch, per printed take point or on one named point (say
   which).
3. `readiness.line`, whole, from EVERY variant you print: the trial-verdict day count moves with the
   trial product's take — never carry one variant's line across the other rows, and never call it
   invariant without evaluating the rows you assert it for (rule 9).
4. The links: `privacy.sentence` first when `privacy.due`, each link under the `ue link` call that
   minted it.
5. The verdict, then the boundary: `walk.opener`, the base's `walk.lines`, then the lines of § Boundary.
6. The one question, while the trial product's take is still missing: Turn 2's (on the ask-again path
   only).

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines`,
then the variant's own inputs, each a line of its own:
- both takes — assumed: the reader's belief until the mix is counted;
- the trial product (price, cadence, its trial) — measured: the reader's answer;
- the trial product's charges and completion — assumed: inherited from <plan> (the book's) unless the
  reader gave its own; quote the variant run's own `walk.lines` entries for them, word for word;
- `trialConv` — the reader's (measured), else the book's 0.5 or the labelled RevenueCat median
  (assumed); swept points and both bracket points — assumed: a labelled sweep, at their landed values;
- not testable soon: trial-converter retention — unknown until observed
  (`cases/uc-04-revenuecat.md`); the trial verdict itself needs the `readiness.line` days.

## Stops
- No trial take from the reader: no invented one — ask again, or the labelled sweep (Turns).
- The takes pass 100 %: the CLI warns `takes_normalized` — ask again, do not rescale.
- A clamped end is quoted at its landed value from then on, in every later sentence about it.

## Worked example

Base: the seed scenario, named before its evaluate — `label` "seed at the book's volume" and
`measuredOn` "benchmark book, nothing measured" set in `seed.json`, so its evaluate prints no warning
(Monthly $19.99 take 25.5 %, 2.86 charges; Annual $119.99 take 14.9 %; value per tap $32.46, CAC per
payer $70.72).

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

**Break-even `q`** (SKILL.md § The bracket, on `trialConv`, one evaluate run per point, the
control's 0.5-point grid). The window's ends first: `trialConv` 1.0 comes back
`products[1].trialConv was clamped to 95.0%` and 0.01 comes back `clamped to 2.0%` — reported
"typed 100 % → landed 95 %" and "typed 1 % → landed 2 %". (a) lands at $26.78 at 2 % and $33.80 at
95 %, so the next run is the grid point interpolated between those landed ends — 0.775, which reaches
today ($32.47, $0.01 above today's $32.46) — then its neighbour 0.77, which does not ($32.44, $0.02
below): four runs, and (a)'s break-even is 0.775. (b) already reaches today at the landed 2 % ($32.53):
it clears at every point I tried, down to 2 %, the lowest the calculator takes — in (b) the trial's
takers are all new buyers by the reader's own answer.

The readiness of every variant — it is not the base's to carry, and the trial-verdict day count moves
with the trial product's take. Each variant's `readiness.line` — printed whole:

- (a) paywall mix decidable after 6 days · trial verdict after 54 days · annual renewals due at month 12, observable from month 13
- (b) paywall mix decidable after 6 days · trial verdict after 107 days · annual renewals due at month 12, observable from month 13

The (a) q 0.55 variant gets the `measuredOn` note "reader-stated takes, this session; trial
conversion swept"; its `ue link` result says `privacy.due` `true` (`carries` `prices`, `takes`,
`trialConv`), so the privacy sentence comes first, on its own line. `privacy.sentence` — printed
whole:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

```bash
npx -y @segmently/cli ue link trial-a-q55.json --label 'trial a q55'
```
`https://www.segmently.ai/unit-economics?v=2&label=trial%20a%20q55&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=reader-stated%20takes%2C%20this%20session%3B%20trial%20conversion%20swept&p=Monthly%20subscription~19.99~1month~none~15.30~100.0~2.86~&p=Monthly%20with%20trial~19.99~1month~7d-free~13.20~100.0~2.86~55.0&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&ref=skill`

Every other row and both (a) bracket points are minted the same way.

Verdict with boundary: whether the trial pays depends on how many of its takers would have
bought the plan anyway — that is the reader's belief (answer a vs b), not something the book
or the CLI knows; the test that settles it needs the trial verdict's 54–107 days.

The boundary: `walk.opener` and the seed's `walk.lines` — printed whole, word for word — then the
variant's own inputs (the trial product's charges and completion from the (a) q 0.55 run's own
`walk.lines`, word for word):

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
> - (a) Monthly subscription keeps 15.3 % and Monthly with trial takes 13.2 % of buy-taps; (b) Monthly subscription keeps its 25.5 % and the trial adds 6 % — assumed: the reader's belief until the mix is counted
> - Monthly with trial: $19.99, monthly, a 7-day free trial — measured: the reader's answer
> - Monthly with trial's charges 2.86 — assumed: the book
> - Monthly with trial's completion 100 % — assumed: the book
> - trial → paid 30 %, 55 % and 80 %, and the (a) bracket points 77 % and 77.5 % — assumed: a labelled sweep (the book's is 50 %)
> - trial-converter retention — not testable soon: unknown until observed (RevenueCat); the trial verdict itself needs 54 days in (a) and 107 days in (b) (`readiness.line`)
