# UC-13 — Test a change to the offer
Route: "is it worth changing the price / a trial / the paywall mix / a downsell / an upsell", "how much can conversion drop if we remove the trial", "a paid trial instead of a free one", "the trial as a downsell", "test this change" (SKILL.md § Router) · Eval: P13 P14 P15 P16 · MCP: none (CLI 1.5.0)
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
1. **Fix the base** — the project file `.ue/<slug>.json`; what the reader did not give stays the
   book's, labelled book. A variant never overwrites the base: it is a `--lever` spec or a variant
   file (`--variant`).
2. **Name the change** as a `--lever` spec (SKILL.md § The verbs). A downsell or upsell with no
   target named: the CLI proposes one (`edit.proposed`, walked "assumed: the CLI's proposal") — say
   so; the reader may correct the target, its price or its trial in the spec. A variant file the
   reader built → `--variant <file>`.
3. **Run the lever with no belief** — the row's `sentences.structural`: the break-even, the pool a
   day, what the horizon can read; with the base link, the variant link and the variant's
   `sentences.diff`.
4. **Ask once for the reaction** the lever needs, in the reader's words: a trial beside a plan —
   "where will trial starters come from — new buyers, or from <plan> (how many of 10)?"; a price,
   or a trial removed or made paid — "<plan> takes <its take in the walk line> of buy-taps today;
   what share do you expect after the change?" → `take:<that share>`, the reader's own share, never
   a part of today's take you work out; a downsell or an upsell — the acceptance. "I don't know" →
   the break-even is the answer, with the test that reads it; stop there.
5. **With a belief** → `--belief <spec>=<name>:<value>`: the gain, the margin, the test's n per arm
   and days; a card only when the reader asks for one (`--card`; field 5 prints the card block as
   `cases/uc-11-hypothesis-card.md` does).
6. **Budget and horizon**: a budget the reader states goes into `volume` first
   (`cases/uc-10-which-experiment-first.md`'s rule); several changes → `--together` (2 or 3 arms):
   `sentences.together`, and `recommendation.single` when they do not all read within the horizon.
7. **After the test** → `ue stat read … --lever <spec>` → `holds` / `fails` / `not_enough`;
   `--rebase` on `holds` only. A downsell, upsell or upgrade reads `--b` alone (the control shows no
   such offer).
- The ledger: a card writes a planned experiment (`card.experiment.id`); when the test goes live,
  `ue exp start <project> <id>`; every read is recorded and printed against the plan
  (`context.progress.sentence`); a test stopped without a re-base → `ue exp close <project> <id>
  --reason "<why>"`. "What is planned, running or tested?" → `ue exp list <project>`.

## Calls
- `npx -y @segmently/cli ue rank .ue/<slug>.json --lever <spec> [--belief <spec>=<name>:<value>[,…]]
  [--horizon <N>]` — ONE run per turn; `--variant <file>` in place of `--lever`; `--together` with 2
  or 3 arms; `--card .ue/<slug>/card-<n>.json` with exactly one arm.
- `npx -y @segmently/cli ue stat read [--a <n>/<x>] --b <n>/<x> --project-file .ue/<slug>.json
  --lever <spec> [--arm <spec>=<n>/<x>[,<control n>/<x>]] [--horizon <N>] [--rebase]` — the control
  part only when the arm's decisive metric differs from `--lever`'s; its n equals `--a`'s.
- `npx -y @segmently/cli ue exp list|start|close .ue/<slug>.json …` — the ledger (SKILL.md § The
  verbs).
- Links: each structural row's `links.base` and `links.variant`, minted by the rank run like `ue
  link` (label, measured, round trip, privacy) — no `ue link` call for them.

## Answer skeleton
1. `sentences.ledger`, when the run printed one — above everything else of the run.
2. `sentences.structural`, whole (SKILL.md § Blocks the CLI renders).
3. The privacy sentence when a link's `privacy.due` — then the base link, then each variant link,
   every one under a line naming the `ue rank` run that minted it; under each variant link its
   `sentences.diff` line(s).
4. `sentences.together`, when the run has several arms.
5. `sentences.warnings`, each line on its own line (SKILL.md § Blocks the CLI renders: a rank run
   that prints no table).
6. `boundary`, whole (SKILL.md § The boundary, rendered).
7. The one question of the turn — Turn 4's reaction, or none.

A read (Turn 7) prints `read.lines` whole, then `context.boundary`; a re-base adds its
`context.rebase` block as SKILL.md § Blocks the CLI renders gives it.

## Boundary
Rendered: the rank run's `boundary` whole — its structural lines name each reaction, proposal and
break-even; a read's `context.boundary` whole. Nothing after it about a row or the verdict.

## Stops
- "never clears" / "clears at every point" at the landed end are the answer — never a break-even of
  your own, never "≈".
- A refusal: its `fix` with your values, run again (SKILL.md § The verbs); a value only the reader
  has → ask.
- No belief and no benchmark → no gain: the row's point is its break-even, and no recommendation
  names it.
- Over MCP the structural levers, `--variant`, `--together` and `ue exp` do not exist (CLI 1.5.0):
  say so and stop.

## Worked example

The owner's live case (2026-09-28): Monthly $29 and Annual $99 on the paywall, the book's chain
and volume (`ue init live --product "Monthly~29~1month~none" --product "Annual~99~1year~none"`).
The change: a 7-day free-trial Annual beside the paid one.

### Turn 3 — the lever with no belief

```bash
npx -y @segmently/cli ue rank .ue/live.json --lever trial-add:Annual=free~7
```

The run's `sentences.structural`, `sentences.diff` and `boundary` — printed whole:

`trial_vs_no_trial` (Annual 7d trial beside Annual (a 7-day free trial), taking 18.73 % of buy-taps): pays while the share of trial starters taken from Annual stays ≤ 37 %, at trial → paid 37.4 % → 37.5 % (benchmark: RevenueCat 2026 median for a 7-day trial (BB-32)) (buy-taps, 51.81 a day).

No belief given: within 30 days this traffic can tell payers per buy-tap 6.07 points away from its break-even 40.5 %.

Guardrail — Annual's take may fall to 7.97 % at the break-even.

Guardrail — Annual 7d trial's charges counted: counted at one charge — it cannot fall — a calendar read (RevenueCat → `paymentsCounted`), not a two-arm test.

Assumed: the calculator's proposal for a product joining the paywall — Annual 7d trial's take 18.73 %.

The variant wins if payers per buy-tap holds ≥ 40.5 % (the calculator's break-even) at the planned look.

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`ue rank .ue/live.json --lever trial-add:Annual=free~7` — `links.base`:

https://www.segmently.ai/unit-economics?v=2&label=live&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=the%20owner's%20own%20paywall%2C%202026-09-28&p=Monthly~29~1month~none~25.50~100.0~2.86~&p=Annual~99~1year~none~14.90~100.0~1.00~&ref=skill

`ue rank .ue/live.json --lever trial-add:Annual=free~7` — `links.variant`:

https://www.segmently.ai/unit-economics?v=2&label=Annual%207d%20trial%20beside%20(break-even)&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=the%20owner's%20own%20paywall%2C%202026-09-28%3B%20the%20calculator's%20break-even&p=Monthly~29~1month~none~25.50~100.0~2.86~&p=Annual~99~1year~none~7.97~100.0~1.00~&p=Annual%207d%20trial~99~1year~7d-free~18.73~100.0~1.00~37.5&ref=skill

Annual 7d trial beside (break-even) vs the base: Annual 7d trial beside Annual (a 7-day free trial); Annual's take 14.9 % → 7.97 %; Annual 7d trial takes 18.73 %. Value per tap $35.99 vs $35.90 (+$0.09); profit per start $0.39 vs $0.38 (+$0.01); payers per buy-tap 40.49 % vs 40.4 % (+0.09 points); payback month 3 vs 3 (no change).

The run also warns, each line of `sentences.warnings` whole:

- rank bought: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.15% — every figure of this row uses the landed lift
- rank renewals: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.14% — every figure of this row uses the landed lift

These figures are this scenario's arithmetic on the inputs above.

- cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
- Monthly: $29.00, monthly, no trial — measured: your project file (price, cadence, trial)
- Monthly's take 25.5 % — assumed: the CLI's init split
- Monthly's charges 2.86 — assumed: the book
- Monthly's completion 100 % — assumed: the book
- Annual: $99.00, yearly, no trial — measured: your project file (price, cadence, trial)
- Annual's take 14.9 % — assumed: the CLI's init split
- Annual's charges 1 (its cadence cap) — assumed: the book
- Annual's completion 100 % — assumed: the book
- $45,000 a month — assumed: the book's volume
- the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
- the +10 % on `p1`, `p2`, `p3`, `bought`, `mix` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
- trial-add:Annual=free~7: Annual 7d trial's take 18.73 % — assumed: the calculator's proposal for a product joining the paywall
- trial-add:Annual=free~7: `trial_vs_no_trial` (Annual 7d trial beside Annual (a 7-day free trial), taking 18.73 % of buy-taps): pays while the share of trial starters taken from Annual stays ≤ 37 %, at trial → paid 37.4 % → 37.5 % (benchmark: RevenueCat 2026 median for a 7-day trial (BB-32)) (buy-taps, 51.81 a day).
- the default horizons, 30 and 90 days (`ue rank`'s own) — assumed
- the 50/50 split of the test this table plans — assumed: the test design
- `p1` is decidable in 7.63 days and `p2` in 10.57 days at this budget.
- not testable soon, in this 30-day run: `p3` 40.24 days, `bought` 88.05 days and `mix` 360.21 days — past 30 days at this budget, each at its own `days`; `renewals` — a calendar read.

### Turn 4 — the reaction, asked once

> Where will trial starters come from — new buyers, or from Annual (how many of 10)?

The reader: "About 10 of every 100 buy-taps would pick it, and half of those bought Annual anyway."

### Turn 5 — with the belief

```bash
npx -y @segmently/cli ue rank .ue/live.json --lever trial-add:Annual=free~7 --belief 'trial-add:Annual=free~7=take:0.1,from:Annual:0.5'
```

The run's `sentences.structural`, `sentences.diff` and `boundary` — printed whole:

`trial_vs_no_trial` (Annual 7d trial beside Annual (a 7-day free trial), taking 10 % of buy-taps): pays while trial → paid stays ≥ 50 %, at 50 % from Annual of the trial's takers (your belief) (buy-taps, 51.81 a day).

trial → paid: benchmark 37.4 % → landed 37.5 % on the calculator's grid.

At trial → paid 37.4 % (benchmark: RevenueCat 2026 median for a 7-day trial (BB-32)), it loses $1,949.06 a month; the test needs 12,057 per arm, 475.44 days.

Guardrail — Annual's take may fall to 9.9 % at the break-even.

Guardrail — Annual 7d trial's charges counted: counted at one charge — it cannot fall — a calendar read (RevenueCat → `paymentsCounted`), not a two-arm test.

The variant wins if payers per buy-tap holds ≥ 40.4 % (the calculator's break-even) at the planned look.

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`ue rank .ue/live.json --lever trial-add:Annual=free~7 --belief 'trial-add:Annual=free~7=take:0.1,from:Annual:0.5'` — `links.base`:

https://www.segmently.ai/unit-economics?v=2&label=live&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=the%20owner's%20own%20paywall%2C%202026-09-28&p=Monthly~29~1month~none~25.50~100.0~2.86~&p=Annual~99~1year~none~14.90~100.0~1.00~&ref=skill

`ue rank .ue/live.json --lever trial-add:Annual=free~7 --belief 'trial-add:Annual=free~7=take:0.1,from:Annual:0.5'` — `links.variant`:

https://www.segmently.ai/unit-economics?v=2&label=Annual%207d%20trial%20beside%20(benchmark)&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=the%20owner's%20own%20paywall%2C%202026-09-28%3B%20a%20benchmark&p=Monthly~29~1month~none~25.50~100.0~2.86~&p=Annual~99~1year~none~9.90~100.0~1.00~&p=Annual%207d%20trial~99~1year~7d-free~10.00~100.0~1.00~37.5&ref=skill

Annual 7d trial beside (benchmark) vs the base: Annual 7d trial beside Annual (a 7-day free trial); Annual's take 14.9 % → 9.9 %; Annual 7d trial takes 10 %. Value per tap $34.66 vs $35.90 (−$1.24); profit per start $0.32 vs $0.38 (−$0.06); payers per buy-tap 39.15 % vs 40.4 % (−1.25 points); payback month 4 vs 3.

The run also warns, each line of `sentences.warnings` whole:

- rank bought: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.15% — every figure of this row uses the landed lift
- rank renewals: +10.00% was asked; the calculator's own control puts it on its grid and the lifted scenario carries +10.14% — every figure of this row uses the landed lift

These figures are this scenario's arithmetic on the inputs above.

- cost per start $1.50, `p1` 30 %, `p2` 50 % and `p3` 35 % — assumed: the book
- Monthly: $29.00, monthly, no trial — measured: your project file (price, cadence, trial)
- Monthly's take 25.5 % — assumed: the CLI's init split
- Monthly's charges 2.86 — assumed: the book
- Monthly's completion 100 % — assumed: the book
- Annual: $99.00, yearly, no trial — measured: your project file (price, cadence, trial)
- Annual's take 14.9 % — assumed: the CLI's init split
- Annual's charges 1 (its cadence cap) — assumed: the book
- Annual's completion 100 % — assumed: the book
- $45,000 a month — assumed: the book's volume
- the book's first renewal behind payback (monthly 60 %, from `words.payback`) — assumed: the book
- the +10 % on `p1`, `p2`, `p3`, `bought`, `mix` and `renewals` — assumed: `ue rank`'s default ("assumed lift"), at each lever's landed `lift` in the table.
- trial-add:Annual=free~7: trial → paid 37.4 % — benchmark: RevenueCat 2026 median for a 7-day trial (BB-32)
- trial-add:Annual=free~7: `trial_vs_no_trial` (Annual 7d trial beside Annual (a 7-day free trial), taking 10 % of buy-taps): pays while trial → paid stays ≥ 50 %, at 50 % from Annual of the trial's takers (your belief) (buy-taps, 51.81 a day).
- trial-add:Annual=free~7: trial → paid — not testable soon: 475.44 days at this budget
- the default horizons, 30 and 90 days (`ue rank`'s own) — assumed
- the 50/50 split of the test this table plans — assumed: the test design
- `p1` is decidable in 7.63 days and `p2` in 10.57 days at this budget.
- not testable soon, in this 30-day run: `p3` 40.24 days, `bought` 88.05 days and `mix` 360.21 days — past 30 days at this budget, each at its own `days`; `renewals` — a calendar read.

This excerpt covers Turns 3–5 only: no `--card` run (so no `sentences.ledger`), one arm only (no
`sentences.together`), and no counts have arrived yet, so Turn 7's `read.lines`, `context.boundary`
and `context.rebase` never render here. Each link above prints its privacy sentence because its own
`privacy.due` is true.
