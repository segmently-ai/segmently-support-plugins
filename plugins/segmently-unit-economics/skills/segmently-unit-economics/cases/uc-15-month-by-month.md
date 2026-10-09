# UC-15 — Month by month: payers, MRR, cash and the months they turn
Route: the months ahead — "we spend $45k a month, growing 5 % — when is cash back?", "when do we hit $100k MRR?", "what does the cash look like over 24 months?", "what growth gets us to $150k MRR by month 12?" (SKILL.md § Router) · Eval: P19 · MCP: none (CLI 1.7.0)
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
1. **Fix the base** — the project file `.ue/<slug>.json`, or the reader's link (`ue parse`); none →
   their funnel numbers first (`cases/uc-03-your-numbers.md`), or `cases/uc-00-launch-card.md`'s
   interview. The month-1 budget is the scenario's `volume`: a budget in the message goes there first
   (SKILL.md § Files), never the book's. A step their funnel does not have is entered at 100 %.
2. **Ask only what the message lacks, one per turn, in this order:** how much the ad budget grows a
   month (`--growth <pct>`; "flat" → 0); how far to look (`--months 12|18|24`; "I don't know" →
   the CLI's 12, said once). An MRR the reader names → `--mrr <usd>` (the month it is reached); with "by
   month N" → `--by <N>` too (what reaches it by then). Never propose a growth, an MRR or a month.
3. **Cost per start rising with the budget** only when the reader says it does, with their own % per
   doubling → `--cost-rises <pct>`; never assumed, never proposed.
4. **Run it once.** A month the run's lines do not name (MRR in month 12 of a 24-month run) → a run
   of its own whose `--months` or `--mrr` makes its lines name it — never a cell of `months[]` you
   read and round yourself.
5. **The close** offers the next step and asks one question: a goal on the unit economics (a ROAS,
   payback, CAC or profit) → `cases/uc-14-reach-a-goal.md`; a change to test →
   `cases/uc-08-test-plan.md` or `cases/uc-13-test-an-offer-change.md`.

## Calls
- `npx -y @segmently/cli ue plan .ue/<slug>.json --growth <pct> --months <12|18|24> [--mrr <usd>]
  [--by <month>] [--cost-rises <pct>]` (a link in double quotes in place of the file) — ONE run per
  question; `label` and `measuredOn` set first; its JSON saved under `.ue/<slug>/runs/`
  (SKILL.md § Files).
- Its `link` carries `dyn=` (none at the defaults) and is minted like `ue link`'s (label, measured,
  round trip, `privacy`) — no `ue link` call for it. It is the base with its months, not a variant:
  the record (SKILL.md § Files) is a `decisions[]` entry, no `variants[]` entry.
- `npx -y @segmently/cli ue evaluate .ue/<slug>.json --explain` — the base's walk for the boundary.

## Answer skeleton
1. The onboarding screen, when this is the session's first answer (SKILL.md § Session start, point 3).
2. `plan.lines` — printed whole, one per line, in order: the growth line, the month cash flow turns
   positive, the low and the month cash is back above zero, MRR and cash at the horizon, the MRR line,
   with `--by` the lines that reach the MRR (each lever alone, with its cash), the chart's caption and
   the run's notes. Every month as the run prints it ("month 8"), never "around month 8".
3. When the run warns `page_shows_gross` (`keys`: `dyn`): one line in the present tense — the page
   opens this scenario without the months, so the month-by-month lines are the CLI's alone. Nothing
   about gross.
4. The privacy sentence when its `privacy.due`, then the `ue plan` run named on the line above its
   link, then the link.
5. The boundary (§ Boundary) — `walk.opener`, the base's `walk.lines`, this run's inputs — after the
   last line that reads a month.
6. The one question of the close (Turn 5).

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines` word
for word, then each input of this run as a line of its own — the growth a month, the months, the MRR
watched (and the month it is aimed at), the cost rising with the budget — "— assumed: your input".
A budget the reader stated that equals the book's $45,000 still walks as "$45,000 a month — assumed:
the book's volume" (`touched` holds chain knobs only): print that line word for word and add no
budget line of your own — every input belongs to exactly one class.
The renewal tail past month 12 stays in the run's own lines; it is never re-worded here.

## Stops
- A scenario month by month: "scenario", never a word for what happens next. The months are what
  follows if these inputs hold.
- "never below zero", "not back within <N> months", "no reading yet" are the answer as printed —
  never a month of your own, never a total or a share of months' figures worked out by hand.
- A growth above the calculator's 30 % comes back `clamped` at 30 %: report it typed → landed, and
  quote the landed run.
- A refusal (`--months` outside 12, 18, 24; `--by` without `--mrr`): its `fix` with the reader's values.
- Over MCP `ue plan` does not exist (CLI 1.7.0): say so and stop.

## Worked example

The seed scenario (cases/README.md), named before the run as a real answer names its base — `label`
"seed at the book's volume" and `measuredOn` "benchmark book, nothing measured" set in `seed.json`;
its month-1 budget is its `volume`, $45,000 a month.

### Turn 1 — the months, one run

> Growing the ad budget 5 % a month over 24 months: when is cash back, and when $100k MRR?

```bash
npx -y @segmently/cli ue plan seed.json --growth 5 --months 24 --mrr 100000
```

The run's `plan.lines` — printed whole:

Monthly growth of the budget: 5.0% · month 24 spends $138,219

Cash flow turns positive: month 4 · the first month that collects more than it spends on ads

Cumulative cash back above zero: month 8 · after a low of −$14,621 in month 3

MRR in month 24: $131,964 · 9,954 active subscribers · 1,954 new payers that month · an annual plan counts a twelfth of its price

Cash by month 24: $149,482 · cumulative, after $2,002,590 of ad spend · before fees, tax, refunds and disputes

MRR: reached in month 19

Cash, month by month: the line is cumulative cash, the bars each month’s cash flow: below zero while new payers have cost more than they have paid so far, above it from month 8; the dashed part is the assumed tail

Month 1 adds 636 payers, the same 636 section 1 counts, at the $70.72 CAC in section 2; every later month adds payers the same way, and they renew like the first

months 13–24 assume the monthly plan keeps renewing at the steady rate its 2.86 charges imply (68.2% a month after the first renewal, the book’s 60%); the annual plan’s year-2 renewal is not counted: the book publishes no year-2 rate, and its card counts 1 charge

a scenario month by month, not a plan: nothing here is measured

The run warns `page_shows_gross` (`keys`: `dyn`): the page opens this scenario without the months, so
the month-by-month lines above are the CLI's alone.

The privacy sentence, because the run's `privacy.due` is true:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`ue plan seed.json --growth 5 --months 24 --mrr 100000` — its `link`:

https://www.segmently.ai/unit-economics?v=2&label=seed%20at%20the%20book's%20volume&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&dyn=5.0~24~100000&ref=skill

The base the months grow from, for the boundary's walk:

```bash
npx -y @segmently/cli ue evaluate seed.json --explain
```

The boundary — that run's `walk.opener` and `walk.lines`, then this run's own inputs — printed whole:

These figures are this scenario's arithmetic on the inputs above.

- cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
- Monthly subscription: $19.99, monthly, no trial — assumed: the book's seed paywall
- Monthly subscription's take 25.5 % — assumed: the CLI's init split
- Monthly subscription's charges 2.86 — assumed: the book
- Monthly subscription's completion 100 % — assumed: the book
- Annual subscription: $119.99, yearly, no trial — assumed: the book's seed paywall
- Annual subscription's take 14.9 % — assumed: the CLI's init split
- Annual subscription's charges 1 (its cadence cap) — assumed: the book
- Annual subscription's completion 100 % — assumed: the book
- $45,000 a month — assumed: the book's volume
- the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
- the budget's growth, 5 % a month — assumed: your input
- the horizon, 24 months — assumed: your input
- the MRR watched, $100,000 — assumed: your input

> Is there a goal on the unit economics behind this — a ROAS, a payback month or a CAC?

### Turn 2 — an MRR by a month, its own run

> What would it take to reach $150k MRR by month 12?

```bash
npx -y @segmently/cli ue plan seed.json --growth 5 --months 24 --mrr 150000 --by 12
```

The run's `plan.lines` — printed whole:

Monthly growth of the budget: 5.0% · month 24 spends $138,219

Cash flow turns positive: month 4 · the first month that collects more than it spends on ads

Cumulative cash back above zero: month 8 · after a low of −$14,621 in month 3

MRR in month 24: $131,964 · 9,954 active subscribers · 1,954 new payers that month · an annual plan counts a twelfth of its price

Cash by month 24: $149,482 · cumulative, after $2,002,590 of ad spend · before fees, tax, refunds and disputes

MRR: month 12 reaches $73,289, not there yet

To reach $150,000 MRR by month 12, on its own:

Monthly growth of the budget: 14.7% · from 5.0% to 14.7% a month · 9.7 points more · cash goes lower first: −$17,845 in month 4, back above zero in month 11

Paywall → tapped Buy: 71.6% · from 35.0% to 71.6% · 36.6 points more · CAC falls to $34.55, and cash stays above zero from month 1

Budget in month 1 (section 1’s volume): $92,102 · from $45,000 to $92,102 a month · $47,102 more · cash goes lower first: −$29,925 in month 3, back above zero in month 8

each line moves one lever and holds the rest; the chart below still draws the scenario as it is set

Cash, month by month: the line is cumulative cash, the bars each month’s cash flow: below zero while new payers have cost more than they have paid so far, above it from month 8; the dashed part is the assumed tail

Month 1 adds 636 payers, the same 636 section 1 counts, at the $70.72 CAC in section 2; every later month adds payers the same way, and they renew like the first

months 13–24 assume the monthly plan keeps renewing at the steady rate its 2.86 charges imply (68.2% a month after the first renewal, the book’s 60%); the annual plan’s year-2 renewal is not counted: the book publishes no year-2 rate, and its card counts 1 charge

a scenario month by month, not a plan: nothing here is measured

The run warns `page_shows_gross` (`keys`: `dyn`): the page opens this scenario without the months, so
the month-by-month lines above are the CLI's alone.

The privacy sentence, because the run's `privacy.due` is true:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`ue plan seed.json --growth 5 --months 24 --mrr 150000 --by 12` — its `link`:

https://www.segmently.ai/unit-economics?v=2&label=seed%20at%20the%20book's%20volume&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&dyn=5.0~24~150000~12&ref=skill

The base the months grow from, for the boundary's walk:

```bash
npx -y @segmently/cli ue evaluate seed.json --explain
```

The boundary — that run's `walk.opener` and `walk.lines`, then this run's own inputs — printed whole:

These figures are this scenario's arithmetic on the inputs above.

- cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
- Monthly subscription: $19.99, monthly, no trial — assumed: the book's seed paywall
- Monthly subscription's take 25.5 % — assumed: the CLI's init split
- Monthly subscription's charges 2.86 — assumed: the book
- Monthly subscription's completion 100 % — assumed: the book
- Annual subscription: $119.99, yearly, no trial — assumed: the book's seed paywall
- Annual subscription's take 14.9 % — assumed: the CLI's init split
- Annual subscription's charges 1 (its cadence cap) — assumed: the book
- Annual subscription's completion 100 % — assumed: the book
- $45,000 a month — assumed: the book's volume
- the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
- the budget's growth, 5 % a month — assumed: your input
- the horizon, 24 months — assumed: your input
- the MRR aimed at, $150,000 by month 12 — assumed: your input

> Which of the three lines would you want to test first?

Each turn is one `ue plan` run: its lines name every month they read, and the answer adds none.
