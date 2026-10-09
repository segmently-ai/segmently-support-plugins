# UC-14 — What it takes to reach a goal
Route: names a goal — "an investor wants ROAS 1.5× — what has to change?", "payback by month 6", "what CAC do we need", "$1 profit per start" (SKILL.md § Router) · Eval: P18 · MCP: none (CLI 1.7.0)
Contents: Turns · Calls · Answer skeleton · Boundary · Stops · Worked example

## Turns
1. **Fix the base** — the project file `.ue/<slug>.json`, or the reader's link (`ue parse`); none →
   their funnel numbers first (`cases/uc-03-your-numbers.md`), or `cases/uc-00-launch-card.md`'s
   interview. What they did not give stays the book's, labelled book. A step their funnel does not
   have (no second screen, no separate Buy tap) is entered at 100 % — a skipped step — never left at
   the book's rate.
2. **Name the goal** in the reader's own unit, as ONE `--goal <kind>=<value>`: `roas=<×>` (above 0),
   `payback=<a whole month 1–12>`, `cac=<$ per paying customer>`, `profit=<$ per funnel start>` (a
   negative one reads "lose no more than"). A goal with no number → ask for it, once; still none →
   stop. Never propose a goal.
3. **Run it once.** Every lever comes back, each moved ALONE with every other input held: the answer
   is that run's lines, whole. A second goal, or the same goal changed → a run of its own.
4. **No lever is picked for the reader.** The close offers the next step and asks one question:
   which line to test (a funnel step → `cases/uc-08-test-plan.md`, a price or a trial →
   `cases/uc-13-test-an-offer-change.md`, two or more → `cases/uc-10-which-experiment-first.md`), or
   the months it takes in cash (`cases/uc-15-month-by-month.md`).

## Calls
- `npx -y @segmently/cli ue target .ue/<slug>.json --goal <kind>=<value>` (a link in double quotes in
  place of the file) — ONE run per goal; `label` and `measuredOn` set in the scenario first; its JSON
  saved under `.ue/<slug>/runs/` (SKILL.md § Files).
- Its `link` carries `goal=` and is minted like `ue link`'s (label, measured, round trip, `privacy`)
  — no `ue link` call for it. It is the base with its goal, not a variant: the record (SKILL.md
  § Files) is a `decisions[]` entry, no `variants[]` entry.
- `npx -y @segmently/cli ue evaluate .ue/<slug>.json --explain` — the base's walk for the boundary
  (the base the goal is about, every input the reader stated filled in).

## Answer skeleton
1. The onboarding screen, when this is the session's first answer (SKILL.md § Session start, point 3).
2. `target.lines` — printed whole, one per line, in order: the goal line (where the reader is, how
   many levers reach it), the road to the paywall, the products, then the run's notes. Never a figure
   of your own beside them, never a row re-rounded, re-worded or dropped.
3. When the run warns `page_shows_gross` (`keys`: `goal`): one line in the present tense — the page
   opens this scenario without the goal, so the goal's lines are the CLI's alone. Nothing about gross.
4. The privacy sentence when its `privacy.due`, then the `ue target` run named on the line above its
   link, then the link.
5. The boundary (§ Boundary) — `walk.opener`, the base's `walk.lines`, the goal — after the last line
   that reads the goal.
6. The one question of the close (Turn 4).

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines` word
for word, then the goal as a line of its own — "the goal, <the goal line's own wording> — assumed:
your goal" (a goal is the reader's target, never a measured figure). A class with nothing in it is
dropped.

## Stops
- A line that reads "unreachable on its own" has no target: never a figure for it — not a rate above
  100 % worked out by hand, not "the closest" — and never another lever's figure moved onto it.
- A requirement past a calculator control prints with the run's own note ("below the calculator's
  $0.10 floor") — never moved into the window, never called unreachable.
- "does not move …" and "no free trial on this paywall" are answers too: print them as the run does.
- Several levers at once is no line of this run: never add two lines' moves together.
- A refusal of `--goal`: its `fix` with the reader's value (SKILL.md § The verbs).
- Over MCP `ue target` does not exist (CLI 1.7.0): say so and stop.

## Worked example

The seed scenario (cases/README.md), named before the run as a real answer names its base — `label`
"seed at the book's volume" and `measuredOn` "benchmark book, nothing measured" set in `seed.json`.

### Turn 1 — the goal, one run

> An investor wants ROAS 1.5× — what has to change?

```bash
npx -y @segmently/cli ue target seed.json --goal roas=1.5
```

The run's `target.lines` — printed whole:

Goal: ROAS of at least 1.50× · you are at 1.14×, not there yet · every lever below reaches 1.50× on its own

On the road to the paywall:

Cost per start: $1.14 · from $1.50 to $1.14 · $0.36 less per start

First → second screen: 39.6% · from 30.0% to 39.6% · 9.6 points more

Second screen → paywall: 66.0% · from 50.0% to 66.0% · 16.0 points more

Paywall → tapped Buy: 46.2% · from 35.0% to 46.2% · 11.2 points more

Tapped Buy → bought: 53.3% · from 40.4% to 53.3% · 12.9 points more

section 1’s cards print this same reading for a ROAS of 1.00×: their break-even

In the products:

Price of Monthly subscription: $34.25 · from $19.99 to $34.25 · $14.26 more

Charges counted on Monthly subscription: 4.90 · from 2.86 to 4.90 · 2.04 more charges per payer in 12 months

Price of Annual subscription: $189.79 · from $119.99 to $189.79 · $69.80 more

Charges counted on Annual subscription: 1.58 · from 1.00 to 1.58 · 58 of every 100 annual payers renewing at month 12

Trial → paid: no free trial on this paywall

a price line keeps today’s split of purchases; a real price change moves it, and this page does not model how

The run warns `page_shows_gross` (`keys`: `goal`): the page opens this scenario without the goal, so
the goal's lines above are the CLI's alone.

The privacy sentence, because the run's `privacy.due` is true:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`ue target seed.json --goal roas=1.5` — its `link`:

https://www.segmently.ai/unit-economics?v=2&label=seed%20at%20the%20book's%20volume&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&goal=roas~1.50&ref=skill

The base the goal is about, for the boundary's walk:

```bash
npx -y @segmently/cli ue evaluate seed.json --explain
```

The boundary — that run's `walk.opener` and `walk.lines`, then the goal — printed whole:

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
- the goal, ROAS of at least 1.50× — assumed: your goal

> Which line would you test first — or shall I lay out the months it takes, in cash?

### Turn 2 — a second goal, its own run

> And if the investor asks for 4×?

```bash
npx -y @segmently/cli ue target seed.json --goal roas=4
```

The run's `target.lines` — printed whole:

Goal: ROAS of at least 4.00× · you are at 1.14×, not there yet · 3 of 9 levers reach 4.00× on their own: the cost per start and the two prices. No rate and no renewal count does

On the road to the paywall:

Cost per start: $0.43 · from $1.50 to $0.43 · $1.07 less per start

First → second screen: unreachable on its own: you are at 30.0%, and no rate would make it

Second screen → paywall: unreachable on its own: you are at 50.0%, and no rate would make it

Paywall → tapped Buy: unreachable on its own: you are at 35.0%, and no rate would make it

Tapped Buy → bought: unreachable on its own: you are at 40.4%, and no rate would make it

section 1’s cards print this same reading for a ROAS of 1.00×: their break-even

In the products:

Price of Monthly subscription: $132.19 · from $19.99 to $132.19 · $112.20 more

Charges counted on Monthly subscription: unreachable on its own: you are at 2.86, and a monthly plan has 12 charges in 12 months

Price of Annual subscription: $669.17 · from $119.99 to $669.17 · $549.18 more

Charges counted on Annual subscription: unreachable on its own: you are at 1.00, and an annual plan counts 2 charges at most

Trial → paid: no free trial on this paywall

a price line keeps today’s split of purchases; a real price change moves it, and this page does not model how

The run warns `page_shows_gross` (`keys`: `goal`): the page opens this scenario without the goal, so
the goal's lines above are the CLI's alone.

The privacy sentence, because the run's `privacy.due` is true:

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.

`ue target seed.json --goal roas=4` — its `link`:

https://www.segmently.ai/unit-economics?v=2&label=seed%20at%20the%20book's%20volume&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&measured=benchmark%20book%2C%20nothing%20measured&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~&goal=roas~4.00&ref=skill

The base the goal is about, for the boundary's walk:

```bash
npx -y @segmently/cli ue evaluate seed.json --explain
```

The boundary — that run's `walk.opener` and `walk.lines`, then the goal — printed whole:

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
- the goal, ROAS of at least 4.00× — assumed: your goal

> Which of the lines that reach 4.00× would you test first?

Each turn is one `ue target` run: every line moves one lever alone, the rest held — the run picks no
lever, and neither does the answer.
