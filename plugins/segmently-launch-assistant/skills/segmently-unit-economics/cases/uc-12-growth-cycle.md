# UC-12 — Growth cycle: from the economics to a measured change, and back
Route: "growth cycle", "where can we grow", "what next after this test", "is this test real?" → step 8 (SKILL.md § Router) · Eval: P12 · MCP: uc-12, cases-uc-12
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
On `.ue/<slug>.json` (none → `cases/uc-00-launch-card.md`'s interview and `init` first). One question per
step, only what the message does not already carry:
- Step 1: "Where do your numbers come from — analytics, segmently.ai, RevenueCat, the Facebook Ads MCP,
  or by hand?"
- Step 2: "In how many days do you want to read the result — 7, 14 or 30?" — none named → 30, labelled
  "default horizon", every later run at it with `--horizon-default`.
- Step 4: "What would you change (X), and by how much do you expect it to move <lever> (Y %)?" — never
  proposing either; no change in mind → the same question for `recommendation.runnerUp` next turn; still
  none → stop, naming both levers.
- Step 6: "What would it cost to build (dollars), and what are the odds it holds (0 to 1)?" — "I don't
  know" leaves that flag out, never a default.
- Before step 8: "What are the counts once each arm has reached <nPerArm> — per arm, how many saw it and
  how many converted?"
Steps 3, 7 and 9 ask nothing: each runs in the answer of the step before it.

## Calls
- Step 1 by source: RevenueCat → `cases/uc-04-revenuecat.md`; an ad account →
  `cases/uc-09-ad-account.md`; segmently.ai reports or a Facebook Ads MCP this host has → read them,
  write them into the base as measured (re-basing: the old base into `variants[]` first), `measuredOn`
  naming the source and window; by hand → `cases/uc-03-your-numbers.md` (a fee the reader states goes in
  with no `preset`).
- Step 2: `ue rank .ue/<slug>.json --horizon 7,14,30` (`realistic` judged at 7 days); step 3:
  `ue rank .ue/<slug>.json --horizon <N>`.
- Step 6, each of `--cost` and `--odds` only with the reader's number:
  `ue rank .ue/<slug>.json --horizon <N> --override <lever>=<Y> --card .ue/<slug>/card-<lever>.json
  --cost <lever>=<usd> --odds <lever>=<p>`
- Step 8, field 10's read (any lever the card tested but `renewals`); step 9, the same read, every flag
  kept (`--belief`, `--horizon-default`), plus `--rebase` (the CLI writes the re-base itself):
  `ue stat read --a <n>/<x> --b <n>/<x> --project-file .ue/<slug>.json --lever <lever> --horizon <N>
  --belief <the card's typed lift>`

## Answer skeleton
Each step's part of an answer opens with that step's bold name exactly as written below ("**Step N —
<name>.**", its parenthesis included) — never a shortened name — and prints its row whole. A step's
question closes the part before it — the step before's row, or for step 1 the onboarding turn — and
the reader's reply opens a turn that starts with that step's heading, even when the question already
named the step; the exception is step 2's horizon question, which closes step 2's own row: the reply
opens with step 3. A reader who names a step directly — "is this test real?" — starts at that step;
the steps before it are not re-run. Owner's numbering: there is no step 5.

| Step | Prints (whole) |
|---|---|
| **Step 1 — check the economics (analytics, segmently.ai, RevenueCat, the Facebook Ads MCP, or by hand).** | The answer of `cases/uc-03-your-numbers.md` (or `cases/uc-04-revenuecat.md` / `cases/uc-09-ad-account.md`) — its plausibility line, KPIs, `walk.lines`, the link, its boundary — then step 2 in the same answer. |
| **Step 2 — growth points reachable in 7, 14 and 30 days.** | The rank block — `sentences.traffic`, every `sentences.table` line, every `sentences.belowTable` line as a `- ` bullet, no `sentences.pick` (a choice run only helps choose) — its `boundary`, then step 2's question. |
| **Step 3 — the metric with the most profit that can be verified in time.** | The rank block with `sentences.pick`, then `sentences.mostProfit` (`recommendation.mostProfit`: the learnable row with the largest `gainPerMonth`, never re-ranked), its `boundary`, then step 4's question. |
| **Step 4 — the hypothesis "if I change X, the chosen metric moves by Y %".** | Their X and Y restated with the lever's stage label (`cases/uc-11-hypothesis-card.md`, field 3): "If <X>, then <lever> (<stage>) moves by +<Y> % — your belief."; then step 6's question. |
| **Step 6 — the hypothesis in numbers (profit if it holds, time and traffic, cost to build, odds it holds).** | The card of `cases/uc-11-hypothesis-card.md`, fields (1) to (10) in order, field 5 the card block whole (`card.lines` when inline), every `sentences.warnings` line, field 9 `bet.sentence` then "Beside it: $<spendRouted> routed over <days> days."; then step 7's part, the card run's `boundary`, the counts question. |
| **Step 7 — the metrics to watch (the steps that must not drop; for the nearest step the drop that cancels the whole gain and whether it is visible within the test).** | Right after the card's field 10: the override row's `guardrail.watch` and `guardrail.sentence` again, verbatim (fields 4 and 6 keep them too). |
| **Step 8 — judge only on the planned sample (real / not / not enough people and how many more).** | `read.lines` whole (its drift line and the verdict's sentence are lines of it), then the step's word — `significant` → real; `not yet` → not; `underpowered` → not enough people — and the read's `context.boundary`, with step 6's estimate line (the card run's cost-and-odds boundary line) inserted right after its belief line (§ Boundary); `underpowered` → the counts question at `read.needPerArm`. |
| **Step 9 — update the economics with what was measured (new base, the old one beside it, KPIs recalculated).** | On `significant`: the re-base block (SKILL.md § Blocks the CLI renders) from the same read re-run with the re-base (Calls) — the lever at `read.pB` as printed; its `context.rebase.lines` are the KPIs recalculated — and its link, the read's `context.boundary` closing steps 8 and 9, with step 6's estimate line inserted right after its belief line (§ Boundary), then back to step 2 on the re-based file, in the same answer. |

## Boundary
Every step that prints a figure closes with its case's rendered boundary — steps 2 and 3 their rank run's
`boundary`, step 6 the card run's (after step 7's part; the cost and the odds are its lines, right after
the lever's belief), step 8 the read's `context.boundary`, which carries no cost or odds: step 6's
estimate line goes in right after its belief line. After step 9's re-base the walk is the re-based
base's.

## Stops
- No learnable row at step 3 → "bigger change or more traffic", and the cycle stops here.
- Fewer counts than the planned sample (the card row's `nPerArm` per arm) → "keep the test running to
  <nPerArm> per arm", no read; `underpowered` → the counts question at `read.needPerArm`, no read of a
  smaller sample; `not yet` → `read.lines` (its `context.more.sentence` last) is the whole answer — never
  a planned sample already reached, or one that is n/a.
- Step 9 only on `significant`; a `mix` read or a drop has no realized run (its `context.rebase.lines`
  are the effect).

## Worked example

The story of `cases/uc-11-hypothesis-card.md#Worked example`, every input invented for the dry run — copy
the shape, never a sentence or a figure of it. A walk-through, not an answer: each step's answer still
closes with its own case's boundary, and every link it hands over keeps the privacy sentence above its
call. A step's answer prints its case's whole output; this walk-through abbreviates only where it points
at that worked card. Each heading below is the owner's step name, whole, as each step's part of an answer
opens.

**Step 1 — check the economics (analytics, segmently.ai, RevenueCat, the Facebook Ads MCP, or by hand).**
Printed whole: the answer of `cases/uc-03-your-numbers.md` — its plausibility line (each of the reader's
numbers placed against the book's P10–P90), the KPIs, `walk.lines` word for word, `breakEvens.chain`, the
privacy sentence, the `ue link` call and its link, then its boundary — here on the story's base, whose
KPIs, `walk.lines` and link are field 2 of `cases/uc-11-hypothesis-card.md#Worked example`. Step 2
follows in the same answer.

**Step 2 — growth points reachable in 7, 14 and 30 days.**
Printed whole, as the worked card's Turn-1 choice run: `sentences.traffic`, every `sentences.table` line,
a blank line, every `sentences.belowTable` line as a `- ` bullet — no `sentences.pick`: a choice run only
helps choose — then its `boundary` (its horizon line names the horizons offered), then only the horizon
question. The story's horizons are 14, 21 and 30 days, where step 2 of the growth cycle runs 7, 14
and 30.

**Step 3 — the metric with the most profit that can be verified in time.**
A fresh 21-day run, printed as the worked card's table. Its `sentences.pick` — printed whole:

`p1` is the pick (`recommendation.first`), `p2` the runner-up (`recommendation.runnerUp`).

Then `sentences.mostProfit` — printed whole (`recommendation.mostProfit` `p1`):

`p1` gains the most of the levers learnable inside 21 days: $2,806.36 a month (`gainPerMonth`, at its landed +10.53 %).

Then its `boundary`, printed whole, and only step 4's question: "What would you change (X), and by how
much do you expect it to move `p1` (Y %)?"

**Step 4 — the hypothesis "if I change X, the chosen metric moves by Y %".**
The reader's change and belief, restated with their X and Y and the lever's stage label (field 3 of
`cases/uc-11-hypothesis-card.md`):

If the landing's first screen asks one goal question and routes to the matching step 1, then `p1`
(acquisition) moves by +12 % — your belief.

Then only step 6's question: "What would it cost to build (dollars), and what are the odds it holds (0 to
1)?"

**Step 6 — the hypothesis in numbers (profit if it holds, time and traffic, cost to build, odds it holds).**
The reader's cost and odds, invented for the dry run: $2,400.00 and 0.5. ONE run:

```bash
npx -y @segmently/cli ue rank base.json --horizon 21 --override p1=0.12 --card .ue/synthetic-meditation/card-p1.json --cost p1=2400 --odds p1=0.5
```

The ten-field card of `cases/uc-11-hypothesis-card.md#Worked example`, fields (1) to (10) in order —
field 5 its card block (`card.lines` when the card comes inline), field 7 every `sentences.warnings` line
— is printed whole; this run's card, table and warnings are that worked card's override run's — only
field 9 differs.

Field 9 — the `p1` row's `bet.sentence`, then "Beside it: $<spendRouted> routed over <days> days." —
printed whole:

9. **Cost** — If the +11.84 % on `p1` holds, it gains $3,157.16 a month (`gainPerMonth`). At your odds of
   50 % that it holds, the expected gain is $1,578.58 a month (50 % × $3,157.16). Your build cost of
   $2,400.00 is recovered in 0.76 months of that gain ($2,400.00 ÷ $3,157.16). Beside it: $4,100.80
   routed over 4.56 days.

**Step 7 — the metrics to watch (the steps that must not drop; for the nearest step the drop that cancels the whole gain and whether it is visible within the test).**
`guardrail.watch` and `guardrail.sentence` — printed whole, right after the card's field 10, in the same
answer (fields 4 and 6 keep them too):

Watch the steps after `p1` — `p2`, `p3`, `bought`, `close`, `trialConv` and `renewals` must not drop while it is tested.

`p2` must not fall: −10.59 % there cancels the +11.84 % on `p1` ($3,157.16 a month, `gainPerMonth`); within 21 days you can only see a ≥ 6.2% change on `p2`, so a drop that cancels the gain is visible in this test.

The base's `walk.lines` are the first 16 lines of the boundary below. The card run's `boundary` closes
steps 6 and 7 — printed whole (the estimate line right after the belief), on the project file:

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
> - `p1` +11.84 % (typed +12.00 %) — assumed: your belief, at its landed value.
> - `p1`: your cost to build $2,400.00 and your odds of 50 % that it holds — assumed: your estimate
> - the +10 % on `p2`, `close`, `p3`, `bought`, `mix`, `trialConv` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
> - the 21-day horizon — measured: your answer
> - the 50/50 split — assumed: the test design
> - `p1` is decidable in 4.56 days, `p2` in 8.14 days and `close` in 17.97 days at this budget.
> - not testable soon, in this 21-day run: `p3` 45.44 days, `bought` 111.66 days, `mix` 438.74 days and `trialConv` 319.55 days — past 21 days at this budget, each at its own `days`; `renewals` — a calendar read.

Then only the question: "What are the counts once each arm has reached 1864 — per arm, how many saw it
and how many converted?"

**Step 8 — judge only on the planned sample (real / not / not enough people and how many more).**
Ending B of `cases/uc-11-hypothesis-card.md#Worked example`, at the planned 1864 per arm — field 10's
read with the reader's counts:

```bash
npx -y @segmently/cli ue stat read --a 1864/708 --b 1864/736 --project-file .ue/synthetic-meditation.json --lever p1 --horizon 21 --belief 0.12
```

`read.lines` — printed whole (its drift line, then the verdict's sentence):

`pA` 37.98 %, `pB` 39.48 %, `lift` 0.0395, `diff` 0.015, `ci95` -0.0163 … 0.0463, `z` 0.94, `pValue` 0.3465, `needPerArm` 16509, `verdict` `underpowered`

`p1` scenario 38 % → observed 39.48 % (1.48 points higher)

Not enough people yet: the observed difference needs 16,509 per arm (`read.needPerArm`) and the smaller arm has 1,864 — 14,645 more per arm, 35.8 more days at 818.18 funnel starts a day, split 50/50.

A `{{…}}` line stands for lines already shown above; an answer prints the lines, never the marker
(`ue check` flags one).

Not enough people — `underpowered`: the test keeps running to the new planned sample. The read's
`context.boundary` — printed whole (the read sent with `--belief 0.12`), step 6's estimate line added
right after the belief line — a read has no cost or odds; no realized lift on `underpowered`:

> These figures are this scenario's arithmetic on the inputs above.
>
> {{walk: base — the 16 lines above}}
> - `p1` observed in the test, `read.pB` 39.48 % as printed — measured: prepared from your counts
> - the counts 708/1864 (control) and 736/1864 (new) — measured: your answer
> - `p1` +11.84 % (typed +12.00 %) — assumed: your belief, at its landed value.
> - `p1`: your cost to build $2,400.00 and your odds of 50 % that it holds — assumed: your estimate
> - the 21-day horizon — measured: your answer
> - the 50/50 split — assumed: the test design
> - not testable soon, in the card's 21-day table run: `p3` 45.44 days, `bought` 111.66 days, `mix` 438.74 days and `trialConv` 319.55 days — past 21 days at this budget, each at its own `days`; `renewals` — a calendar read.

Then only the question, at `read.needPerArm`: "What are the counts once each arm has reached 16509 — per
arm, how many saw it and how many converted?"

**Step 9 — update the economics with what was measured (new base, the old one beside it, KPIs recalculated).**
Ending A of `cases/uc-11-hypothesis-card.md#Worked example`, `significant` → real — step 8's word for the
read, said first. Printed whole as that worked card prints its read: `read.lines` (the realized gain and
its warnings among them), the same read plus `--rebase` (the CLI writes the re-base), the re-base block
with `context.rebase.lines` and the re-based link — then the read's `context.boundary`, step 6's estimate
line added right after the belief line. Then back to step 2 on the re-based file, in the same answer: a
new `--horizon 7,14,30` run on it, printed whole as step 2.

**A read of a lever off the chain.** On a fresh copy of the pre-test project,
`.ue/synthetic-meditation-copy.json`, a `close` test's counts, invented for the dry run:

```bash
npx -y @segmently/cli ue stat read --a 1000/957 --b 1000/975 --project-file .ue/synthetic-meditation-copy.json --lever close --horizon 21 --rebase
```

Its subject: `close` (payment completion). Its drift line: `close` (payment completion) scenario
95.67 % → observed 97.50 % (1.83 points higher). Its re-base block's prepared lines — printed whole:

- the realized lift 0.019164 (`read.pB` 0.975 ÷ today 0.956667) through `ue rank`'s own `close` move — prepared from your counts
- Monthly with trial's `completionRate` 0.95 × 1.019164 = 0.968206 — prepared from your counts
- Annual's `completionRate` 0.97 × 1.019164 = 0.988589 — prepared from your counts

Every `context.rebase.lines` entry — printed whole:

- profit per start −$0.03 → −$0.01
- ROAS 0.97 → 0.99 (`valueBasis` net)
- CAC per payer $75.10 → $73.57
- payback not covered within 12 months → not covered within 12 months
- stage `live_no_data` → `live_measured`
