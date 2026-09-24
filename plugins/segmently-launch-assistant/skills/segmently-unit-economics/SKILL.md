---
name: "segmently-unit-economics"
description: "Paywall unit economics for subscription and web-to-app builders — launch card, trial and fee-stack comparisons, \"which experiment first\" — computed offline by `segmently ue` (no account, nothing leaves the machine) with one public-page link per scenario. Use when a user asks whether a price, paywall, trial, store-vs-web choice or ad budget can work, or pastes a segmently.ai/unit-economics link."
---

# Segmently unit economics

Every number in an answer comes from one CLI run of `segmently ue`, the same arithmetic the
public calculator at https://www.segmently.ai/unit-economics runs. This skill never
re-implements a formula; it elicits inputs, builds consistent variants, runs the CLI, and
explains the difference in words.

## Prerequisites (that is the whole list)
- Node.js 22 or newer. Check: `node --version`.
- `npx -y @segmently/cli ue --version` prints `{ "cli": …, "mathHash": … }` with `cli` 1.2.0 or
  newer. No login, no key, no browser.
- Older — a bare version number, `unknown command 'ue'`, or a `cli` below 1.2.0: run it once as
  `npx -y @segmently/cli@latest ue --version`. Still older: say "this CLI is older than 1.2.0",
  answer nothing with numbers, and stop. Name the likely cause — an older global `@segmently/cli`
  install shadows npx — and the remedy: `npm i -g @segmently/cli@latest`.
- The spelling that passed the check — `npx -y @segmently/cli`, `npx -y @segmently/cli@latest`, or
  `segmently` when a global install is current — is the prefix of EVERY later command of the
  session.

Every command below is written `npx -y @segmently/cli ue …`: run it with the prefix that passed
(with a current global install, `segmently ue evaluate …` is the same command).
Verbs and flags are exactly what `npx -y @segmently/cli ue <verb> --help` prints; when in doubt,
run `--help`, never guess.

## Contract (print it in the first message of a session, verbatim)
I never: forecast your numbers, invent a benchmark, write to RevenueCat or Segmently,
or put a figure you did not give me into a link.

The skill prints **scenarios**: every figure is "what follows if these inputs are true",
and never a claim about what happens next.

## Session start
1. Print the contract. Run the two prerequisite checks once. Report them in words (Node 22+, CLI
   <version>) — never echo the `--version` JSON — and give its `mathHash` its one line.
2. Look for `.ue/*.json` in the reader's working directory.
   - Found → `npx -y @segmently/cli ue evaluate .ue/<slug>.json --explain`, then print the
     onboarding screen (references/stages.md) for the `stage` it returns. When the opening message
     already names a case, continue into it in the same message, after the onboarding screen, with
     at most one question closing the turn.
   - Not found, but the opening message already carries the reader's numbers (a chain, a
     price, a take) → UC-3 at once: `init` the plan they named (web unless they named a store),
     edit their numbers in, evaluate, and give the UC-3 answer in this message; what they did not
     give stays the book's, labelled book, and at most one question closes the turn.
   - Not found → the three-question interview (UC-0 "Inputs"), then `ue init`, then the
     onboarding screen, then run the stage's first case at once. No fourth question before
     the reader has seen a number.
   - The reader pasted a link → `npx -y @segmently/cli ue parse "<link>"` and go to UC-6 (or
     the case their question names).
3. The onboarding screen quotes only fields the base evaluate printed: ROAS on the `valueBasis`
   it states. A gross figure of a scenario with deductions is a second run (UC-9's gross
   variant) — never a number no run printed.

## The one loop
1. `ue init` once per project → `.ue/<slug>.json`; read `stage` and `offers`; show the onboarding screen (references/stages.md).
2. Build variants by EDITING the scenario JSON (same chain, same products, one thing changed) — never by re-implementing a formula.
3. `ue evaluate <file|link> --explain` for every variant. One evaluation per variant, and
   every cell of that variant's row is read from ITS OWN output — never from the base's
   (rule 9), with that run's own `clamped` / `snapped` notices reported on that row.
4. `ue link` for every variant, with `--label` and a `measuredOn` set. Hand over ONLY links
   printed by `ue link` — or `ue rank`'s `recommendation.links`, which are round-trip checked the
   same way: in UC-10 both; in UC-11 none with the table and, when the reader asks for one, the
   table run's `recommendation.links.first`, named as the <N>-day run's (an `--override` run's
   links belong to the card). **Print the exact `ue link` call on the line above every
   link it minted, the onboarding screen's base link included** (for `recommendation.links`,
   name the `ue rank` run they came from instead). Never the `link`
   field of `ue evaluate` / `ue init` / `ue rank` (those skip the round-trip check and the
   `label_missing` / `measured_missing` warnings). A link that does not round-trip is never
   handed over (the CLI refuses it). Print the `--version` JSON's `mathHash` once at session
   start, in one line, so the reader can match it against references/cases.md.
5. Answer with the same triple every time: a table (variants × KPIs), a verdict sentence with
   its boundary, one link per variant. Every row of that table is its OWN evaluate run
   (rule 9) — no cell, `payback` and `readiness.line` included, is carried across rows.
   **The privacy sentence.** Before the first link that carries ANY figure the reader gave you
   about their own business, print, verbatim:
   "This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead."
   Print it as its OWN line, whole, starting with a capital "This" — never folded into a
   lead-in clause that lower-cases it ("Privacy note, before the link below: this link
   carries…" is a paraphrase, not the sentence). A label on the line above it is fine.
   Then hand over the link, or the JSON file if they prefer. The trigger is mechanical — the
   sentence is due when the link carries any of:
   - a daily or monthly budget they stated (`vol=`), or a cost per start (`cps=`);
   - a conversion, take, completion, charges or trial-conversion belief of theirs, or a
     downsell / upsell / upgrade conversion they stated;
   - a fee, tax/VAT rate, refund or dispute share they stated or read off their statement;
   - the prices of a paywall they already sell;
   - anything in `observed[]`, a `reader` knob in `provenance`, or any figure from their ad
     export, analytics, RevenueCat or a statement.

   Exempt, and only these: values that are the book's alone (benchmark chain, the CLI's own
   `init` split and defaults, a preset fee picked from the book's list) and the price of a
   product the reader said in this session is still being chosen (nothing sold yet). A price read
   from the project file is the reader's figure: print the privacy sentence before every link that
   carries it — the onboarding screen's base link included — unless the reader said in this
   session that the price is still being chosen; never call such a link "the book's numbers".
   The stage never decides it; what
   the link carries does: the prices of a paywall the reader already sells are due at every
   stage, `idea` and `pre_launch` included — a reader who says their paywall sells, or who has
   RevenueCat or live traffic, is selling, whatever stage the CLI derived. When unsure, print
   the sentence.

**The boundary sentence — one sanctioned shape, copied, never invented.** Every verdict
closes with a boundary (rule 5), and it is written from THIS template, filling each clause
with the inputs of the scenario you just printed:

> These figures are this scenario's arithmetic on the inputs above.
> <inputs> — measured: <source and window>.
> <inputs> — assumed: <the book's value, the reader's belief, or a labelled sweep>.
> <inputs> — not testable soon: <what it would take> (<N> days at this budget, from `readiness.line`).

Three evidence classes, in that order. A class with nothing in it is dropped silently — never
written out as "none". Every input the scenario reads belongs to exactly one class, and each
case below says which of its own inputs land where.

Before printing, walk the scenario's inputs in this order and place each one — ONE walk,
the same list for every boundary of every case (UC-11's three included); it may be printed
one input per line, each with its class and why:
1. `chain.cps`, `p1`, `p2`, `p3` — by the evaluate's `provenance.chain`: `reader` is
   measured — "your project file", followed by the source and window the scenario's `measuredOn`
   carries when it has one ("measured: your project file — <measuredOn>"); `benchmark` is assumed
   (the book). All four are named in every boundary — the tested lever's rate too, even where its
   lift is walked under item 6; in a read's boundary, name its rate before the test and, after a
   re-base, the re-based `read.pB` (measured: prepared from your counts).
2. Per product: its price, cadence and trial (kind and days) — the reader's answer or
   "measured: your project file" (a price the reader did not state in this session came from
   the project file), at every stage, `pre_launch` included; only a price the reader is weighing
   in this session (UC-0's ladder, an `anchor`) is assumed.
3. Per product: its take, charges, completion and `trialConv` — assumed at the book's value
   (completion 100 %, trial conversion 50 %, charges 2.86 monthly, 5.36 weekly and 1 annual —
   the annual's is its cadence cap) or at the CLI's init split (below); measured ("your project
   file") only at any other value.
4. `volume` is placed like every other input: a budget the reader stated is measured; the
   book's $45,000 a month is assumed, and is named in the assumed clause even when the
   not-testable clause repeats it as "at the book's volume". A stated budget reads "your stated
   budget".
5. Every deduction the scenario carries, each with its value — the fee on its `feeScheme`
   base, tax, refunds, disputes, activation: measured when the reader stated it, read it off a
   statement, or the project file carries it without a preset; a book `preset` (`card_processor`,
   `app_store`…) the reader did not state is assumed: the book's preset.
6. Every lift and swept value — assumed: the reader's belief at its LANDED value (after a snap
   the typed value is never quoted alone), the "assumed lift", a labelled sweep; and the book's
   first renewal behind payback when the base's `words.payback` names one, at its value (monthly
   60 %) — in every boundary, even one whose table prints no payback.
   At a read, the belief it tested stays, at its landed value — "assumed: your belief, now
   read"; the realized-gain run's own lift (`read.pB ÷ today − 1`, typed → landed) is
   "measured: prepared from your counts"; that run's default +10 % on every other lever stays
   "assumed lift".
7. A test's own inputs, in every boundary of a case that plans or reads one: its horizon —
   measured, the reader's answer ("default horizon" when none: assumed); its 50/50 split —
   assumed: the test design; the counts it read — measured, the reader's answer.
8. Whatever the base carries from an export or RevenueCat — measured, with its source and
   window.

An input you inferred rather than heard ("no trial, because none was mentioned") is assumed,
not measured. A variant's own inputs (the CLI's split, a ladder price) are named in the class
of the variant that carries them.

**The CLI's init split.** No output marks a take as the split `ue init` proposed, so check it
before placing a take: run once
`npx -y @segmently/cli ue init <slug>-split --product "<name>~<price>~<cadence>~<trial>" --dir .ue/<slug>/scratch`
with one `--product` per paywall product of the scenario (cadence `1month`, `1year`…; trial
`none`, `<days>d` for a free one, `<price>-<days>d` for a paid one) and compare the
`takeOfTaps` it writes to `.ue/<slug>/scratch/.ue/<slug>-split.json`: a take equal to it is
"assumed: the CLI's init split", never "your project file"; only a different take is measured.
Its own `label_missing` / `measured_missing` warnings concern a link that is never handed over;
say in one line that the scratch run warned about its own unused link, and do not re-mint it.

Worked example (UC-0, a pre-launch web funnel, nothing measured yet):

> These figures are this scenario's arithmetic on the inputs above. Your price $19.99 and
> your monthly cadence — measured: your own answer. Cost per start $1.50, landing → step 1
> 30 %, step 1 → paywall 50 %, paywall → buy-tap 35 %, no trial (none was mentioned), the
> book's first renewal behind payback (monthly 60 %), charges per payer 2.86, completion
> 100 % and the book's $45,000 a month — assumed: the benchmark book, nothing of yours yet. The
> plan's take, 30 % of buy-taps — assumed: the CLI's init split. Whether those chain rates
> hold for your traffic — not testable soon: it takes 6 days at the book's volume before the
> mix is decidable.

A scenario with more products or a trial names each product's take, trial (kind and days)
and trial conversion the same way.

Write what the numbers ARE. A boundary written as a denial is a rule 8 violation even when
it is true, and it tells the reader nothing about which of their inputs is evidence: none of
"this is not a forecast", "not a prediction", "not a claim about the future" may appear.
Name the classes and stop.

**The only arithmetic you do** (everything else is a CLI field, a question, or n/a):
- *Input preparation* — a product or quotient of numbers the reader stated or that come
  verbatim from their export (`chain.cps` = spend ÷ funnel starts; a learning budget = the
  CLI's readiness days × the reader's daily budget; `paymentsCounted` from observed periods).
  Always show both operands and label the result "your numbers, prepared".
- *Comparison* — the absolute difference of two CLI-printed values, shown next to both
  values. No percentages, no Δ% grids, and no ratios or multiples of your own ("twice",
  "three times", "1.67×", "a sixth", "x times") — absolute differences only. Quoting a
  figure the page itself prints (its ROAS, e.g. `1.14×` in `words`) is quoting, not a ratio.
- Never a model formula or a derived KPI: no take splits, no loss over a period, and never a
  gain per month, sample size, days to detect or minimum detectable change derived by hand —
  those four are quoted from `ue rank` / `ue stat` fields (`gainPerMonth`, `nPerArm`, `days`,
  `mde`; UC-8, UC-10). For anything no CLI field carries: ask the reader, or print n/a with
  "this CLI version does not compute it yet" (the word "yet" is part of it).
- *A CLI field is quoted, not re-derived.* `base.startsPerDay`, `kpis.startsPerDay` and
  `populationPerDay` are printed by the run — cite them by name ("1,000 starts a day,
  `base.startsPerDay`"), never as "$1,500 ÷ $1.50", whose second operand is the book's.
- *Units are not arithmetic either.* Label every figure with the unit its own field states in
  `units` — a `deducted.*` amount is per tap on Buy, a `waterfall` row is per payer, CAC is
  per payer, `profitPerStart` is per start. Converting between them (dividing a per-tap
  deduction by the payer rate, multiplying a per-payer row back) is a model formula: quote the
  field that already carries the unit you need.

**Variant files.** The base case is `scenario` inside `.ue/<slug>.json`. A variant is a copy of
that scenario document written to `.ue/<slug>/<variant>.json` with ONE change, its own `label`
(≤ 40 characters, e.g. `"monthly + annual"`) and its own `measuredOn` note (≤ 80
characters: the source and window of the reader's numbers, or
`"benchmark book, nothing measured"`; `ue link` refuses a longer one with `scenario_refused`,
field `measuredOn`, "measuredOn must be a string of at most 80 characters" — shorten the
note, keeping its source). After every case's answer — UC-10's included, whose two
`recommendation.links` are its variants, each named by the lever it lifts — append
`{ name, case, question, scenario, link, verdict, createdAt }` to `variants[]` and the
verdict to `decisions[]` of the project file. Never overwrite the base case: re-basing moves
the old base into `variants[]` first. Filling an input the reader just stated into the base
(their budget into `volume`, a `label`, a `measuredOn`) is not re-basing. Edit the base in
place, as UC-3 and UC-10 do. Re-basing means replacing values the reader did not state now
(for example, swapping the book chain for observed data). Corridor corners and sweep points
are variants too: `.ue/<slug>/<variant>.json`, never the project root.

A variant file exists to be EVALUATED: every cell of that variant's row — `payback` included
— is read from THAT variant's own `ue evaluate --explain` output. Never carry a cell across
from the base row because "that knob shouldn't move it": payback moves with a downsell even
when CAC per payer does not (rule 9).

**Units in the JSON.** Shares are fractions (`0.30` = 30 %); money is in the scenario's
currency; `chain.cps` is cost per funnel start; `chain.p1/p2/p3` are landing → step 1 →
paywall → buy-tap; `products[i].takeOfTaps` is the product's share of buy-taps;
`products[i].paymentsCounted` is charges per payer over 12 months; `products[i].completionRate`
is buy-tap → paid; `products[i].trialConv` is trial → paid. When the reader's value equals the
book's, add the knob name (`"cps"`, `"p1"`…) to `touched` so it reads as theirs.

## Reading the output
**Every figure carries its unit, and you label it with that unit.** The evaluate result
states them in `units`: `units.deducted` is `per_tap`, `units.waterfall` is `per_payer`, and
`units.kpis.<field>` gives each KPI its own (`per_tap`, `per_payer`, `per_start`, `per_day`,
`per_month`, `ratio`). So `deducted.fee`, `deducted.tax`, `deducted.refunds`,
`deducted.disputes` and `deducted.activation` are **per tap on Buy** — the same unit as
`kpis.valuePerTap` — and the `waterfall` rows are **per payer**, the same unit as "list price
× charges counted". Never call a `deducted.*` figure "per payer", and never divide one by the
payer rate yourself to get there: quote the waterfall row, which already is per payer. Read
the unit off `units`, never off the field's name or your memory of it. `ue evaluate --format
table` prints the same unit in its own column.

| Field of `ue evaluate --explain` | Say it as |
|---|---|
| `units` | what every figure is measured per — `deducted` (`per_tap`), `waterfall` (`per_payer`), and one entry per KPI. It is the label you quote a figure with |
| `deducted.fee` / `.tax` / `.refunds` / `.disputes` / `.activation` | what each deduction takes **per tap on Buy** (`units.deducted`). The per-payer figure for the same money is that deduction's own `waterfall` row — the two differ by the payer rate and are never interchangeable |
| `kpis.valuePerTap` / `kpis.valuePerTapNet` | value per tap on Buy, gross / net |
| `kpis.requiredValuePerTap` | what a tap on Buy must be worth for the scenario to clear — numerically the ad cost of one tap on Buy. It is NEVER cost per purchase (a tap on Buy is not a purchase event) |
| `kpis.roas`, `kpis.profitPerStart` | read the NET value once `netBasis` is true, gross otherwise — say which (`valueBasis`) |
| `kpis.cacPerPayer` | CAC per paying customer (payers, never buyers or trial starts) |
| `payback` | `{ charge, month }`, or `null` = not covered within 12 months |
| `breakEvens.chain` | the cps / p1 / p2 / p3 at which the scenario clears |
| `breakEvens.unreachable` | the rates (p1 / p2 / p3) whose break-even is above 100 % — say "no conversion rate at that step clears this scenario on its own", never quote the > 100 % figure as a target |
| `readiness.line` | how many days until the mix (and a trial) is decidable at this volume |
| `waterfall` | list → fee → tax → refunds → disputes → activation → net, **per payer** (`units.waterfall`); "not counted" is never $0 |
| `feeScheme` | how the stated fee was actually taken — `base` (`exTax` = on the price net of tax, `charged` = on the amount charged), `onRefund`, `onDispute`, `afterYearPct`; `null` when no fee is stated. Name the base beside `deducted.fee` on every row that states a fee |
| `provenance` | which chain knobs are `benchmark` and which are `reader` |
| `words` | the page's own words for the same figures — quote them |

`ue evaluate --format table` (documented in the CLI README) prints the page's words as a
table for a quick look; use JSON for anything you compute a table from.

## Warnings and refusals
Every verb returns `warnings[]` (and evaluate/parse `clampNotices[]`). Handle each, never drop one:

| Code | What you do |
|---|---|
| `page_shows_gross` | The page does not read a key this link carries. The deployed page reads every key `ue link` writes — `fee=` with its scheme, `tax=`, `refunds=`, `disputes=`, `activation=`, `fees=`, `basis=`, `measured=` and `upgrade=` (checked on the deployed page 2026-09-23) — so a link this CLI mints raises it only for a key the page does not read yet. No `page_shows_gross`, no sentence: never add a gross or ignored-key sentence to a link that did not raise it. When it fires, read `keys`. A deduction key among them (`fee`, `tax`, `refunds`, `disputes`, `activation`, `fees`) — the CLI's message then says "GROSS": print rule 6's sentence. Any other key: say, in the present tense, that the page ignores that key and opens the rest of the scenario, name the key, and say that a figure it changes is the CLI's alone — nothing about gross (the CLI's own message for this case does not say GROSS either). Never "the page will show …": `will show` is on rule 8's string list, and the ban covers sentences about the page, the CLI or a test exactly as it covers sentences about a figure. |
| `label_missing` | Re-mint with `npx -y @segmently/cli ue link <file> --label '<name>'` (or set `label`). Single quotes: in double quotes the shell expands `$19.99` to `9.99`. |
| `measured_missing` | Set `measuredOn` in the variant file (source + window) and re-mint. |
| `takes_normalized` | The paywall takes added up past 100 % and were scaled: name each product's before → after, ask the reader for their split of buy-taps. |
| `clamped` (and every `clampNotices` line) | The value was outside the control's window and moved: report typed value and landed value on THAT row; ask whether the typed one is measured. In a sweep, the clamped row is labelled with the LANDED value and every later sentence about it quotes the landed one (trial conversion runs 2 – 95 %: a row typed 100 % lands on 95 %, a row typed 1 % lands on 2 %), and any "never breaks even" **or** "clears at every point I tried" is stated at the landed endpoint ("not even at 95 %, the highest the calculator takes"; "down to 2 %, the lowest it takes"). The windows are in rule 9. |
| `snapped` | Loading the scenario put a value on the calculator's own grid — its slider step (cps 1.23456 → 1.25; the chain rates, `trialConv` and `completionRate` to half a point, 0.4256 → 0.425) or its precision (`paymentsCounted` 4.765 → 4.76, the takes to four decimals); every figure, and the minted link, uses the landed value. Name each key typed → landed; label the row with the landed value and quote it from then on. That covers the scenario's input only: an observation (`read.pB`, an observed rate) is quoted exactly as its run printed it, never at a landed value. |
| `link_rounded` | The link cannot carry a value or name exactly, so the page opens it rounded or rewritten. Say which key and that the page shows the link's value; the CLI figures use the unrounded one. |
| `unknown_key` | Name the ignored keys; if one looks like a typo of a grammar key (references/grammar.md), ask. |

A refusal is stderr `{ "error": { "code", "message", "field" } }` and exit code 1. Read
`field`, quote `message`, and ask the reader for that ONE value. Never guess a replacement,
never retry with an invented number. `link_round_trip_failed` means no link is handed over.

## Cases (procedures)
Each case: the question, the inputs to ask (one at a time), the JSON edits, the CLI calls,
what to print. Worked numbers from real CLI runs: references/cases.md.

### UC-0 — Is this worth launching, and at what numbers? (idea, pre_launch)
- **Inputs, one per turn:** (1) what is sold, price, cadence, trial — or "not decided" → one
  monthly anchor price; (2) where payment happens: web checkout, app store, or both;
  (3) what they already have: nothing, ad numbers, an analytics funnel, RevenueCat, a
  Segmently funnel. Nothing else — everything else is the book's and labelled so.
- **Init:** `npx -y @segmently/cli ue init <slug> --product "<name>~<price>~<cadence>~<trial>" --platform web --have none`
  (repeat `--product`; `--anchor <monthly price>` instead when undecided; `--platform store|both`).
- **Launch card:** one evaluate run per card row and per corridor corner; every cell of a row
  (payback and readiness included) is read from that row's own run (rule 9). The card's
  columns, on every row (the base, the fee variant, the mix variant, each corridor corner):
  value per tap gross and net, ROAS on its `valueBasis`, CAC per payer, profit per start,
  payback and `readiness.line`. Evaluate the base; then the platform's fee as a variant:
  web `deductions.fee = { "pct": 0.029, "fixed": 0.30, "preset": "card_processor" }`;
  store `deductions.fee = { "pct": 0.15, "fixed": 0, "preset": "app_store_small" }` or `0.30` /
  `"app_store"` (ask which program). On that row, name the base its own `feeScheme` printed:
  `charged` for the card preset (taken on the amount charged, kept through a refund), `exTax`
  for a store preset (taken on the price net of tax, given back on a refund). With no tax
  stated, the two bases give the same fee, and you still name the base on every row that
  states a fee. Refunds, tax, disputes only when the reader gives numbers.
- **What would have to be true:** one line per knob from `breakEvens.chain` ("cost per start ≤
  $X, or p3 ≥ Y %"), each beside the book's value it starts from, in the order cps, p1, p2, p3,
  then charges per payer — never ranked, and never described by a percentage change or a ratio
  you computed; a knob in `breakEvens.unreachable` reads "no conversion rate at that step clears
  this scenario on its own". For charges per payer, bisect
  `products[i].paymentsCounted` on its 0.01 grid (≤ 8 evaluate runs) until two ADJACENT grid
  points bracket zero: X prints `profitPerStart` < 0 and X + 0.01 prints ≥ 0. Quote the first
  point whose OWN run prints `profitPerStart` ≥ 0, at its landed value — X + 0.01, the
  break-even — print the last point that did not clear and the first that did, side by side,
  and label its link with that value. A clearing point with an unrun grid point below it (5.00
  when 4.99 was never run) is "clears at", never "the break-even" and never "≥". A point whose
  `profitPerStart` is below 0 is not the break-even, however small the loss: never "≈", never
  "effectively break-even". If 8 runs end without two adjacent points, print the last failing
  and the lowest clearing point side by side and call neither the break-even.
- **Paywall mix:** if one plan does not clear, show the pair beside it in the same message —
  never defer this variant to a question. When the reader named no annual price, the CLI
  proposes it: `npx -y @segmently/cli ue init <slug>-mix --anchor <monthly price> --dir .ue/<slug>/scratch`
  (the anchor ladder: the monthly plus the book's annual, at the CLI's split); with an annual
  price the reader named,
  `npx -y @segmently/cli ue init <slug>-mix --product "<monthly>" --product "Annual~<price>~1year~none" --dir .ue/<slug>/scratch`.
  Evaluate `.ue/<slug>/scratch/.ue/<slug>-mix.json` as the variant. The split is the CLI's,
  never yours; the Annual's price and the split are assumed: the book and the CLI's proposal
  (a price the reader named stays measured).
- **Corridor:** the chain at the book's P10/P90 corners — pessimistic `chain = { cps 2.5, p1 0.20,
  p2 0.35, p3 0.25 }`, optimistic `{ cps 1.0, p1 0.40, p2 0.65, p3 0.45 }`. Sentence: "the book
  cannot decide this — your first starts will".
- **Links — one per row, each with its call:** every card row, corridor corner and sweep point
  is a variant file under `.ue/<slug>/`; mint each with
  `npx -y @segmently/cli ue link .ue/<slug>/<variant>.json --label '<name>'` and print that
  call on the line directly above the link it produced. A list of links without their
  `ue link` calls is unfinished. The onboarding screen's base link is minted and shown the
  same way.
- **Learning budget:** set `volume = { "amount": <daily budget>, "unit": "budget_day" }`, read
  `readiness.line`; print both factors and the product, labelled — e.g. "6 days × $500 a day
  = $3,000 (your numbers, prepared)". If the reader has given no daily budget, print the
  `readiness.line` at the book's volume, labelled book, and make the daily budget the one
  question that closes the turn ("What would you spend a day on the first test?"). Never
  multiply the book's volume into a dollar learning budget: its operands are not the reader's.
- **Instrument list:** funnel starts (landing views, not clicks), paywall views, buy-taps,
  purchases per product, charged payers, first app open after payment, refunds, disputes.
- **Decision rule:** run the first test if the central scenario clears net; print the
  pessimistic corner's `profitPerStart` (a CLI figure) beside the learning budget and let the
  reader judge whether that loss per start is acceptable for the test. If the central
  scenario does not clear, change the paywall first (annual beside the monthly, a paid trial,
  a higher anchor) and show that variant beside the first.
- **Boundary:** write it from the template. Measured here: only what the reader stated — the
  price and cadence they named, the platform, and a trial only when they named one. A trial
  they never mentioned (the `none` passed to `ue init`) is assumed: "no trial (none was
  mentioned)". Assumed: `chain.cps/p1/p2/p3`, `paymentsCounted`, `completionRate`, the `init`
  take split, a book fee preset with its `feeScheme` base, the mix variant's split and its
  Annual price (measured when the reader named it), the corridor corners' chains (the book's
  P10/P90), the charges sweep points (a labelled sweep), the book's first renewal behind every
  payback the card prints (from `words.payback`), and `volume` — editorial book values, with no
  category and no geo prior. Not testable soon: whether those chain rates hold for this traffic —
  the `readiness.line` days at the volume the run used ("6 days at the book's volume" until the
  reader gives a daily budget).

### UC-1 — Should part of the users see the same plan with a trial?
- **Inputs, one per turn, in this order:** (1) the trial (free or paid, length), skipped when
  the reader named it; (2) the trial product's share of buy-taps once both are shown — ONE
  question that states the plan's default in the same sentence: "What share of buy-taps do you
  expect <plan> with trial to take once both are shown? I keep <plan> at <its take as the CLI
  printed it> unless you give its own." Never a second question mark for the plan's take.
  (3) trial → paid `q` is not a question: run the reader's `q` if they gave one, else the
  book's 0.5 or the RevenueCat 2026 median for the trial's length (≤ 4 d 25.5 %, 5–9 d 37.4 %,
  17–32 d 42.5 %, book entry BB-32), labelled "benchmark: RevenueCat 2026 median, a vendor's
  app-store peer set", and say the reader can replace it with their own.
- **No trial take, no invented one.** If the reader has no take for the trial product, do not
  supply one and never move points from one product's take to another (that is a take split,
  model arithmetic). Keep the plan's take as the CLI prints it, and either ask again (one
  question) or show a labelled sweep of the trial's take — "sweep points, not an estimate" —
  never one assumed value in the headline.
- **JSON edits:** copy the plan to a new product (unique `name`, e.g. "Monthly with trial",
  new `id`), `trial = { "kind": "free", "days": 7 }`, `onPaywall: true`, `takeOfTaps` = the
  reader's number, `trialConv = q`; the plan's `takeOfTaps` = the reader's number (or
  unchanged). Put the new product NEXT TO the plan it copies, ahead of any `onPaywall: false`
  products — a minted link lists the paywall's products first, and `ue link` refuses one that
  does not round-trip (`link_round_trip_failed`). Completion and charges inherit the plan's
  unless the reader gives the trial's own.
  If the takes pass 100 %, the CLI warns `takes_normalized` — ask again, do not rescale.
- **Calls:** evaluate one variant per `q` the reader wants to see; find the break-even `q` by
  sweeping `trialConv` with evaluate until `valuePerTap` reaches the base's. Quote it the way
  UC-0 quotes the charges break-even: the first point whose own run reaches the base's value
  per tap, printed beside the last point that did not (`trialConv` moves on the control's
  0.5-point grid) — never "≈". Every sweep point
  is its own evaluate run and its own row (rule 9). `trialConv`'s window runs **2 % – 95 %**.
  A sweep endpoint typed outside it comes back `clamped` — report it typed → landed ("typed
  100 % → landed 95 %", "typed 1 % → landed 2 %"), quote only the landed value from then on,
  and state any "never breaks even" **or** "clears at every point I tried" at the landed
  endpoint, never at the typed one. The same holds for a downsell / upsell conversion, whose
  floor is 1 %. Link per loop step 5.
- **Print:** value per tap and CAC per payer, today and each variant, with the absolute
  difference beside both values; the break-even `q`; the `readiness.line` ("trial verdict
  after N days"). Read `readiness.line` from EVERY variant you print. The trial-verdict day
  count moves with the trial product's take; never carry one variant's readiness line across
  the other rows, and never assert that a CLI line is invariant without evaluating the rows
  you are asserting it for (rule 9). Caution: a free trial delays the first charge, and CAC
  per payer rises when trial takers do not convert.
- **Boundary:** write it from the template. Measured: the paywall's prices and the trial's
  length. Assumed: both takes (the reader's belief until the mix is counted), `trialConv`
  (theirs, the book's 0.5, or the labelled RevenueCat median), and the plan's take held
  unchanged. Not testable soon: trial-converter retention — unknown until observed (UC-4);
  the trial verdict itself needs the `readiness.line` days.

### UC-2 — Web checkout vs store: the same paywall under two fee stacks
- **Steps, in this order** (do not skip step 2 — never pick `nonOpenerChecks` yourself):
  1. Ask which store program the reader is on: 15 % or 30 %.
  2. **Activation: ASK for the share AND for `nonOpenerChecks` in the same turn.** Both
     numbers, or neither. If the reader gives only the share, or neither, the activation row
     is a TWO-dimensional sweep over the pair, every point labelled "sweep points, not an
     estimate" — or it is not shown at all. Choosing a `nonOpenerChecks` yourself (1 charge,
     0 charges, "a charge from anyone who doesn't open") is a picked input and is forbidden,
     even when you name the choice in prose.
  3. Ask for the web refunds and disputes shares; anything they have no number for stays
     "not counted".
  4. Build one variant per stack, evaluate each, link each.
- **Inputs:** web stack — fee preset or pct/fixed from the provider's statement, tax
  included/excluded and rate, refunds share, disputes share and fee, the activation PAIR
  (`share` and `nonOpenerChecks`, per step 2), custom fees; store stack — 15 % or 30 %, tax
  rate, refunds. A deduction the reader has no number for stays "not counted".
- **JSON edits (one variant per stack):**
  `deductions.fee = { pct, fixed, preset }` — presets `card_processor` (2.9 % + $0.30),
  `card_processor_billing` (3.6 % + $0.30), `merchant_of_record` (5 % + $0.50), and the
  app-store presets `app_store_small` (15 %) and `app_store` (30 %), which are editorial book
  entries — say so. Link segment: `fee=<pct>~<fixed>~<preset>` (e.g. `fee=2.90~0.30~card_processor`).
  `deductions.tax = { included, rate }`, `deductions.refunds = { share }`,
  `deductions.disputes = { share, fee }`, `deductions.activation = { share, nonOpenerChecks }`,
  `deductions.custom = [{ id, name, pct, fixed }]`. Store side: no disputes, no activation
  (chargebacks and installs are the store's).
- **Calls:** evaluate each stack with `--explain`; link each per loop step 5 (a provider
  statement's numbers are the reader's own).
- **Print:** net per tap, net ROAS, fee per tap (`deducted.fee` — `units.deducted` is
  `per_tap`; the per-payer fee is the waterfall's own fee row, never `deducted.fee` divided by
  anything), payback, the waterfall rows (per payer, `units.waterfall`)
  side by side — each read from THAT stack's own evaluate run (rule 9) — then the break-even
  sentence "the store wins only if …" found by sweeping the web side's weakest input: the
  disputes share, or the activation PAIR (`share` AND `nonOpenerChecks`) swept together as
  labelled sweep points. A sweep over the share alone, with a `nonOpenerChecks` you chose, is
  a picked input — not allowed.
- **Each stack's fee is taken under its own scheme, and the CLI says which.** `ue evaluate`
  prints `feeScheme` beside `deducted.fee` (`--explain` too): the `app_store` and
  `app_store_small` presets come back `base: "exTax"` — the commission is taken on the price
  NET of tax, given back on a refund, and a dispute is treated as a refund with no fee of its
  own (`app_store` also carries `afterYearPct: 0.15`, the rate past a year of paid service).
  `card_processor`, `card_processor_billing` and `merchant_of_record` come back
  `base: "charged"` — on the tax-inclusive amount, kept through a refund, a dispute costs the
  flat `disputes.fee`. Name the base each row used, from that row's own `feeScheme`. Never say
  the store fee is treated like a card fee.
- **Boundary:** write it from the template. Measured: whatever came off the provider's
  statement (fee pct/fixed, disputes, refunds) and the tax rate the reader stated. Assumed:
  the app-store presets (editorial book entries), the activation pair unless the reader gave
  both numbers, and the chain. Not testable soon: buyers who would have bought in the store
  anyway, and attribution (ad platforms see web purchases, most store ones they do not) —
  neither is modelled here at all. The public page reads `fee=` with its scheme (checked on
  the deployed page 2026-09-23), so each stack's link opens there on the same net figures its
  own run printed, the store base included.

### UC-3 — Fill the reader's numbers and open the link
- **Sources, in order of trust:** the reader's answers; an ad export (`chain.cps` = spend ÷
  funnel starts, input preparation: print "$<spend> ÷ <starts> starts = $<cps> (your numbers,
  prepared)" — ask for starts or landing views, never clicks); product analytics
  (`chain.p1/p2/p3`, takes); RevenueCat (UC-4); a payment provider statement (fee pct/fixed,
  disputes).
- **Missing inputs:** a chain and a price are not the whole scenario. Ask, one per turn, for
  what the reader did not give — charges per payer (`paymentsCounted`), buy-tap → paid
  (`completionRate`), volume (daily or monthly budget) — or say plainly that each stays the
  book's value (monthly 2.86 charges, completion 100 %, $45,000 a month) and label it book.
- **Plausibility, before evaluating:** place each number against the book (chain P10–P90:
  cps $1.00–2.50, p1 20–40 %, p2 35–65 %, p3 25–45 %; trial → paid by length; monthly 2.86 /
  weekly 5.36 / annual 1 charges; dispute lines 0.75 % and 1.5 %) and say where it sits:
  "95 % of buy-taps completing payment is above anything in the book — measured or assumed?"
- **JSON edits:** `chain.*`, `volume`, `products[i].price / takeOfTaps / completionRate /
  paymentsCounted / trialConv`, only the deductions the reader has numbers for, `label`,
  `measuredOn = "<source>, <window>"` as the reader named them — when they named neither,
  `"reader-stated, source not given"`, never a date or a source they did not type — `touched`.
- **Calls:** `ue evaluate <file> --explain`, then `ue link <file>`.
- **Print:** KPIs, then an input table whose provenance column names EVERY input, one row
  each: chain knobs from `provenance.chain` (`reader` / `benchmark`); `products[].checks`,
  `close`, `take`, `trialConv` and `volume` are "book" unless the reader gave them. A KPI is
  "your numbers" only when every input it reads is the reader's; otherwise say "your chain on
  the book's charges / completion / volume". Never write "your numbers" on a KPI that depends
  on a book input. Then `breakEvens.chain` (with `breakEvens.unreachable` in words), then the
  link per loop step 5 (privacy sentence first). Worked example: references/cases.md UC-3.
- **Boundary:** write it from the template, and read the classes straight off the input
  table — every row marked `reader` is measured (name its source and window), every row
  marked book is assumed, and anything neither the reader nor the book can settle is not
  testable soon (`readiness.line` days).

### UC-4 — RevenueCat: observed inputs → scenario
See "RevenueCat (UC-4)" below.

### UC-5 — Compare N variants / sweep one knob
- One base, one axis or a list of named edits (cps 1.50 → 2.20; monthly-first vs
  annual-first takes; 4-week at $9.99 vs monthly at $19.99; a ladder from an anchor via
  `ue init <slug>-ladder --anchor <price> --dir .ue/<slug>/scratch`; `basis: "first"` vs `"ltv12"`).
- Evaluate each; table with the base value, the variant value and their absolute difference
  beside both; link per row (loop step 5); the `breakEvens.chain` entries as UC-0 lists them
  (cps, p1, p2, p3, each in its own unit beside today's value) — never one called "closest"
  across units (UC-6). Every cell of a row comes from that row's own run, with its own
  `clamped` notices, and a sweep point outside a window is labelled with its LANDED value
  (rule 9).
- Cadence guard: a 4-week or 12-week plan has no book charge count — ask the reader for
  `paymentsCounted` instead of comparing 2.86 monthly charges with 1.
- **Boundary:** write it from the template. The swept axis is the reader's own question, not
  evidence: every point on it is assumed unless they measured it. Say which of the base's
  inputs are measured and which are the book's, and that the sweep moves ONE of them.

### UC-6 — Explain a scenario that does not clear
- `ue parse "<link>"` → `ue evaluate "<link>" --explain`.
- Show the gap as the two CLI values side by side (`requiredValuePerTap`, `valuePerTap`) and
  their absolute difference; locate it by product (evaluate with each product alone on the
  paywall), by deduction (the waterfall rows), by mechanic (evaluate with and without it).
- **Rank fixes by distance to break-even**, and print the rank as a table with exactly these
  columns: `lever | today | break-even | distance | measurable / belief`. A row fed by a sweep
  (`paymentsCounted`, `completionRate`) is that sweep's own runs, each a variant: bisect the
  knob on its grid (`paymentsCounted` 0.01, `completionRate` half a point; ≤ 8 evaluate runs)
  until two ADJACENT grid points bracket zero — X prints `profitPerStart` < 0 and the next grid
  point prints ≥ 0 — and name both runs on the row; the `break-even` cell is the first clearing
  point at its landed value, as UC-0's charges sweep. A clearing point with an unrun grid point
  below it is "clears at", never "≥" and never "the break-even"; a value worked out by hand is
  only where the bisection starts, never a cell. A swept endpoint that clamped is reported
  typed → landed on its row (rule 9).
  - `today` and `break-even` are the two CLI values, side by side, in their own units.
  - `distance` is the ABSOLUTE difference between them, in the lever's own unit — "cps $1.50
    → ≤ $0.90, $0.60 lower"; "p3 35.0 % → ≥ 58.3 %, 23.3 points higher". A "% relative",
    "Δ %" or "×" column is a ratio you computed: never print one, and never rank by one. Group
    the rows by unit — $ (cps) first, then points (p1, p2, p3 together), then each swept knob in
    its own unit (charges, then completion points) — and inside each group order by absolute
    distance, smallest first, whatever order `breakEvens.chain` prints them in; never call one
    lever "closest" or "the easiest" across units — each distance stands in its own unit and the
    reader compares them.
  - `measurable / belief` is a required column, one word per row — a lever the reader can
    instrument and measure today (`cps`, `paymentsCounted`, `completionRate`, the chain rates
    their analytics already counts) vs one that is a belief until tested (a take, a chain
    step they do not instrument). A row with no verdict in that column is an unfinished table.
  - Levers: `breakEvens.chain` plus swept product knobs (`paymentsCounted`,
    `completionRate`). A rate listed in `breakEvens.unreachable` is not ranked at all — it is
    stated in words as "no conversion rate at that step clears this scenario on its own".
- **Boundary:** write it from the template. Measured: only what the pasted link's own
  `provenance` marks `reader`. Assumed: everything the link inherited from the book — say
  that a pasted link carries no source note unless `measured=` is on it. Not testable soon:
  each `belief` row of the rank table, until the reader instruments it.

### UC-7 — Downsell / upsell wiring
- JSON: `products[owner].downsell = { "product": "<target name>", "conv": 0.15 }` and
  `mechanics.downsell = true`; upsell the same under `upsell` / `mechanics.upsell`. Targets
  are referenced by NAME, names must be unique; a target usually sits off the paywall
  (`onPaywall: false`). Link: `ds=<owner>~<target>~<conv %>`, `us=…`.
- A target the reader names by price only ("a Lite plan at $4.99") is the book's Lite: monthly
  (`1month`), no trial, completion 100 %, charges 2.86 — the seed's `Lite monthly`,
  `onPaywall: false`. Build it at once at the reader's price; never ask for its cadence, trial,
  charges or completion, and name them in the boundary's assumed class as "the book's Lite".
  Ask only for a cadence the book has no charge count for (4-week, 12-week — UC-5's guard).
- A plan upgrade (monthly → annual REPLACES the plan) is `upsell = { product, conv, kind:
  "upgrade" }`, link `upgrade=`; an add-on keeps `us=`. Ask which one it is — counting an
  upgrade as an add-on overstates it. The public page reads `upgrade=` and opens it as an
  upgrade, on the figures the CLI prints.
- Print value per tap with and without the mechanic (two evaluations) and the absolute
  difference beside both; its break-even `conv` by sweeping, quoted like UC-0's break-even (the
  first point whose own run clears, the last that did not beside it); links per loop step 5. Every row
  — "downsell alone", "downsell + upgrade", each sweep point — is its OWN evaluate run, and
  its `payback` is read from that run (rule 9): a downsell moves payback even where it leaves
  CAC per payer untouched. A `conv` typed below 1 % lands on 1 %; the caps are 60 % for a
  downsell and 50 % for an upsell — report a clamped endpoint typed → landed.
- A conversion the reader does not know (and there is no book value or CLI default): ask
  once; if they decline, state the break-even `conv` found by sweeping and show the swept
  points labelled "sweep points, not an estimate" — never one assumed value in the headline.
- **Boundary:** write it from the template. Measured: the prices and which plans exist.
  Assumed: every downsell / upsell / upgrade conversion the reader stated as a belief, plus
  the target plan's own cadence, charges and completion when they came from the book. Not
  testable soon: the mechanic's real take — it needs the `readiness.line` days of buy-taps.

### UC-8 — Test plan for a change
- **Inputs:** the change and the lever it moves, the reader's daily budget in `volume`, and
  the relative lift they want to detect — theirs, or `ue rank`'s default +10 % labelled
  "assumed lift". Levers, as `ue rank` names them: `p1` landing → step 1, `p2` step 1 →
  paywall, `p3` paywall → buy-tap, `close` payment completion, `bought` the paid share of
  buy-taps, `mix` the take of the product whose share move gains the most, `trialConv`
  trial → paid.
- **Calls:** `npx -y @segmently/cli ue rank <file> --override <lever>=<lift>`, once, in JSON
  (the horizons default to 30 and 90 days; add `--horizon` with the reader's own when they
  name one), then print THAT lever's row as a field table, one row per field, in this order:
  `lever`, `lift`, `gainPerMonth`, `roasAfter`, `populationPerDay`, `nPerArm`, `days`,
  `spendRouted`, `mde` at each horizon, `realistic`, and last `note`, whole — every figure below
  is a field of it, never derived by hand. Report every warning of the rank run, each warning on a line of its own — never two
  joined in one sentence — including those on rows you do not print ("`bought`: typed +10 % →
  landed +9.98 %, the take control's grid").
  - `populationPerDay` — the people per day a test of this lever can use at its own step,
    named as UC-10 names it (funnel starts for `p1`, funnel starts reaching the paywall for
    `p3`, buy-taps for `bought`), never "visits", "clicks" or "sessions". Say in words that every
    step of the funnel before the lever shrinks it.
  - `nPerArm` — sample size per arm, from that row. A rate the reader measured is first
    written into the scenario (input construction: `chain.p3`, a `completionRate`, a
    `trialConv`), and the row of a rank run on that scenario is quoted — never an n from one
    run beside days from another (rule 9). `npx -y @segmently/cli ue stat size --p <rate> --lift <lift>`
    is only a cross-check for a chain step exactly as the scenario carries it (the two verbs
    agree only when p is the scenario's own rate and nothing was clamped or snapped), or it
    gives n alone for a rate no rank lever models — its days are then no CLI field: ask the
    reader for them, or print them n/a per the arithmetic rule. `nPerArm` is set by the lever's
    current rate and the lift alone — never explain it by the population; the population that
    every step before the lever shrinks is why `days` (and `spendRouted`) is long, not why
    `nPerArm` is large.
  - `days` — calendar days at this budget (the trial clock included for `trialConv`), and
    `spendRouted` — the ad spend that runs through the test over those days. Quote both to
    two decimals (198.53, never "about 199"), every figure rounded as UC-10's table rounds it.
  - `realistic: false` with a non-null `days` → print, word for word, "Not testable at this
    volume in under N days." (N = the shortest horizon) in place of a plan. Then print the
    row's `days` (198.53), then its `note` whole, in quotation marks. Then, only when that
    horizon's `mde` is non-null, the realism sentence "within N days you can only see a ≥ X %
    change", with X the row's `mde` at the CLI's precision — one decimal, exactly as the
    `note` prints it (≥ 26.1 %). Never write "about 26 %", "a 26 % swing" or "±": a lift is
    one-directional, and the `mde` is the smallest change that can be read. The field table's
    LAST row is `note`, holding the row's `note` whole — print it there AND again, in quotation
    marks, after `days`. A field table that stops at `realistic` is unfinished. Worked case:
    references/cases.md UC-8.
  - A row with null `days` is `realistic: false` too, and gets neither sentence: a lever that
    cannot move (`lift` 0, `gainPerMonth` 0, null `nPerArm`, `days`, `spendRouted` and `mde`)
    or `renewals`, a calendar read. Quote its `note` and attempt nothing.
- **Calendar:** the `readiness.line` of `ue evaluate` at the same volume still describes
  the mix, the trial and annual renewals (mix after 300 buy-taps; trial after 300 trial
  starts + trial days + 3; annual renewals from month 13) — print it beside the plan, from
  its own run.
- **Link — the triple holds here too:** the scenario at the reader's budget (its `volume`
  changed) is a variant. Set `label` and `measuredOn`, mint it with
  `npx -y @segmently/cli ue link <file>` (never the `link` field of `ue rank` or
  `ue evaluate`), print the privacy sentence on its own line first (the budget is the
  reader's), then the link. "It is a feasibility read, nothing to share" is not an
  exemption: loop step 5 applies every time.
- **Reading a finished test:** `npx -y @segmently/cli ue stat read --a <n>/<x> --b <n>/<x>`
  (per arm: people who saw it / people who converted — the reader's own counts) →
  `read.verdict` and `read.ci95`, the 95 % interval on the difference of the two rates. Say
  the verdict as the CLI prints it: `significant`, `not yet`, or `underpowered` — an
  underpowered test is said to be underpowered, with `read.needPerArm`, the per-arm size its
  observed difference would need.
  One read at the planned end: reading the test daily raises false positives.
- **A price or revenue-per-user test** is a difference of means, not of two proportions:
  `npx -y @segmently/cli ue stat means --sigma <σ> --delta <difference>` only when the reader
  gives σ (the standard deviation of revenue per user, from their own data) and the
  difference they want to detect. Without σ, say the size needs the variance of revenue per
  user from their data — never a σ you picked.
- **Boundary:** write it from the template, placing EVERY input the scenario reads (the
  walk), not only the ones the reader stated. Measured: the reader's budget ("your stated
  budget"), each product's price, cadence and trial ("measured: your project file" when not
  stated this session), and any counts they gave `ue stat read`. Assumed: the chain
  (`provenance.chain` benchmark), each product's take (the CLI's init split when it equals it),
  charges per payer, completion and trial conversion at the book's values, and the lift at its
  landed value (theirs or the "assumed lift"). Not testable soon: the change itself — the row's
  `days` at this budget, the `readiness.line` days beside them, and a smaller change takes
  longer. Worked boundary: references/cases.md UC-8.

### UC-9 — What your ad account reports
- The reader's own words are never echoed where rule 8 bans them: their "Meta will show" is
  answered in the present tense — "the ad account reports", "the CLI prints".
- Translate: the ad platform reports cost per purchase event (per buyer, per trial start)
  and ROAS on list price; the scenario's CAC is per paying customer and its ROAS is net
  once deductions are counted. Give the CLI's numbers side by side from one evaluation.
- **Field map** (one evaluation; a second only for the gross variant below):

  | The ad platform's figure | This CLI version |
  |---|---|
  | cost per purchase (spend per purchase event: buyers + trial starts) | n/a — "this CLI version does not compute it yet". It is NOT `kpis.requiredValuePerTap` (that is the cost of one tap on Buy, and a tap on Buy is not a purchase) and never derived by you from `purchasesPerMonth` |
  | ROAS on list price | the gross figure: `kpis.roas` with `valueBasis` `gross`. When the scenario has deductions, evaluate a copy with `deductions` emptied (a second CLI run, labelled "gross variant") and quote its `kpis.roas` |
  | (the two are not the same window) | `kpis.roas` is computed on the value basis the scenario states — by default `basis: "ltv12"`, TWELVE MONTHS of charges per payer. An ad platform reports over ITS attribution window (7-day click / 1-day view, or whatever the account is set to), which is days, not a year. Say which is which before putting the two side by side. The comparable-to-a-first-charge view is `basis: "first"` (UC-5's axis): evaluate a copy with `basis` set to `"first"` and quote THAT `kpis.roas` as the first-charge figure |
  | — (the platform has no such line) | net ROAS = `kpis.roas` with `valueBasis` `net`. When nothing is deducted the two coincide — say so, do not invent a net figure |
  | — | CAC per paying customer = `kpis.cacPerPayer` (payers, not purchase events) |

- Free trial on the web: the platform optimises on cards that may never pay — say it.
- **Boundary:** write it from the template. Measured: the prices and whatever the reader
  read off their ad account. Assumed: the chain, the charges per payer and the value basis
  (`basis`) the scenario carries. Not testable soon: the platform's own attribution — this
  CLI has no view of it, and the two windows are named, never reconciled.

### UC-10 — Which experiment first: gain and cost to learn
- **Inputs:** the base (measured ideally, book otherwise — labelled), the daily budget in
  `volume`, a horizon (30 days, with 90 as the second column — the CLI's default), and a
  relative lift per lever — the reader's, passed as `--override <lever>=<lift>` ("the new
  paywall can do +25 %" is `--override p3=0.25`); every lever they give none for takes the
  CLI's default +10 % relative, labelled "assumed lift". Building that lifted INPUT is input
  construction, not a comparison: a lift is a number you hand to `ue rank` before it runs,
  so the "no ratios, no multiples" rule does not touch it. What the rule does forbid is
  comparing two RESULTS with a ratio — `gainPerMonth` is already the CLI's absolute
  difference against the base.
- **Call — ONE run on the base:** `npx -y @segmently/cli ue rank .ue/<slug>.json --override <lever>=<lift>`
  (repeat `--override` per lever the reader gave a lift for; none → the default everywhere).
  Run it once, in JSON (no `--format table`). The table view omits `roasAfter` and
  `populationPerDay`, so printing both views takes two runs. Build the answer's table from
  the JSON run alone. It evaluates one lifted scenario per lever — `p1`, `p2`, `p3`, `close`
  (payment completion), `bought` (the paid share of buy-taps), `mix` (the take of the
  product whose share move gains the most), `trialConv`, `renewals` (charges counted) — and
  prints `base`, one row per lever,
  `recommendation` and `warnings`. `price` is not ranked: a price test moves revenue per
  user, which is UC-8's means test and needs σ from the reader's data. **Say so in every
  UC-10 answer, in one sentence under the table:** "Price is not ranked here — a price test
  needs the variance of revenue per user from your own data." The boundary's
  not-testable-soon class ends with the same clause.
- **The table is the rows, every cell from this rank output itself** (rule 9 — never a
  figure from another run, never one you derived): lever | lift | gain / month
  (`gainPerMonth`) | ROAS after (`roasAfter`) | population / day (`populationPerDay`) | n per
  arm (`nPerArm`) | days | spend routed (`spendRouted`) | minimum detectable change at each
  horizon (`mde`) | realistic | note — each figure rounded for reading only: money, days,
  `roasAfter` and `populationPerDay` to two decimals, `nPerArm` whole, `lift` and `mde` to four
  decimals of the fraction (0.1152 is an 11.52 % change) — never coarser (the one-decimal
  percent belongs only to the realism sentence and the row's `note`); a `null` cell prints
  "n/a", and the row's `note` says why. Above the table, state the base's traffic from the run, by
  name — "<N> funnel starts a day (`base.startsPerDay`) at <budget>" — never as budget ÷ cps; the
  population sentence then shrinks it lever by lever.
- **The four learning figures — print ALL FOUR, every time, even when the reader asked for
  none of them:** gain per month, sample size per arm, days to detect, and minimum detectable
  change — `gainPerMonth`, `nPerArm`, `days` and `mde` of each row. The population at a
  lever's funnel position shrinks at every step (`populationPerDay`, named per lever: funnel
  starts for `p1`, funnel starts past step 1 for `p2`, funnel starts reaching the paywall for
  `p3`, buy-taps for `bought`
  and `mix`, the buy-taps that pick a paid product for `close`, trial starters for `trialConv`,
  payers for `renewals`) — say it in words with these names, each at its row's two-decimal value.
- **Landed lift.** Each row's `lift` is the LANDED relative lift. When `warnings` carries a
  `snapped` or `clamped` entry whose `keys` name a lever, report it typed → landed on that
  row (the seed's `bought`: typed +10 % → landed +10.15 %, the take control's 0.1-point
  grid) and label the row with the landed value (rule 9).
- **Levers that cannot move** come back with `lift` 0, `gainPerMonth` 0, null `nPerArm`,
  `days`, `spendRouted` and `mde`, and a `note`. Say "at ceiling — no lift to test" ONLY
  when the note says "at its ceiling" (`close` at 100 % completion); otherwise quote the
  note's own reason ("no product on the paywall has a trial") — never attempted with a
  variant of your own. `renewals` is a calendar
  read ("calendar: one billing period per read"): its gain is printed, its test has no
  sample size.
- **Order and recommendation.** The order of the table IS the CLI's order of `rows` —
  learnable within the shortest horizon first, each group ranked by gain per day of testing,
  rows without days last. Say "ranked by gain per day of testing"; never re-rank, and never
  add a gain-per-day column, a ratio or a multiple of your own ("twice", "three times").
  Name `recommendation.first` and `recommendation.runnerUp` and hand over their
  `recommendation.links` (the two lifted variants; they carry the base's `label` and
  `measuredOn` — set both in the base before the run — so say which lever each one lifts;
  privacy sentence first, loop step 5).
  The CLI recommends only a realistic row that gains (`gainPerMonth` > 0). When `first` is
  null, no lever that gains is learnable within the horizon at this budget — say that.
- **Realism sentence** for every row with `realistic: false` and a non-null `mde`: "within
  N days you can only see a ≥ X % change", N the shortest horizon and X that row's `mde` for
  it at the CLI's precision — one decimal, exactly as the row's `note` prints it.
- **Boundary:** write it from the template. Measured: the reader's budget ("your stated
  budget"), prices already in the project file ("measured: your project file" — never "your
  own paywall" for a price the reader did not state this session), and whatever the base
  carries from an export or RevenueCat. Assumed: every lift — the
  reader's belief, or the "assumed lift" — and every book input the base still holds; the
  gain column is this scenario's arithmetic for the lift the reader assumed, and that lift
  stays an assumption until a test measures it; walk item 7 applies to every UC-10 table: the
  horizons ("default horizon", the CLI's 30 and 90, unless the reader named one) and the 50/50
  split behind every `nPerArm`, `days` and `mde`. Not testable soon: which lever moves first —
  name EVERY row that has `days`, with its `days` at this budget, the learnable ones included
  ("`p1` is decidable in <days> days"); say each row past the horizon as "not testable at this
  volume in under N days"; then the price clause: a price test needs the variance of revenue
  per user from the reader's data.

### UC-11 — Hypothesis card: which metric, then which change
- **When:** "what to test next", "hypothesis card". The worked card is ANOTHER scenario: copy its shape,
  never a sentence or a figure of it — every number and every list comes from the reader's own runs.
- **Precondition:** `.ue/<slug>.json` (none → `init`). Place each input by the walk, never by the
  stage alone; run the init-split check first — an equal take is "assumed: the CLI's init split".
- **Turn 1 — horizon:** "In how many days do you want to read the result?" No horizon named → ONE
  `ue rank .ue/<slug>.json --horizon 14,21,30` run for its `mde` columns; still no pick → 30,
  labelled "default horizon". Nothing else is asked before the table is shown. That run judges
  `realistic` at its shortest horizon, so the card's table is a fresh `--horizon <N>` run.
- **The table:** `ue rank .ue/<slug>.json --horizon <N>` — ONE run, in JSON, no `--format table` (the
  table view is a second run). It follows EVERY rule of UC-10's table: all four learning figures, the
  population that shrinks at every step said in words, "ranked by gain per day of testing", every default
  +10 % row labelled "assumed lift", each realism sentence printed UNDER the table as a sentence of its
  own (a `note` cell does not count), and "Price is not ranked here — a price test needs the variance of
  revenue per user from your own data." Which rows are learnable is read from THIS run's `realistic`
  column, never from the worked card. No link goes with the table; asked for one, loop step 4 says which.
- **Turn 2 — lever and change:** the change for `recommendation.first` (`runnerUp` with no idea for it);
  a `realistic: false` lever only as a named big bet. Say nothing about whether their change is readable
  before they give a lift. **Turn 3 — believed lift:** `ue rank .ue/<slug>.json --horizon <N> --override
  <lever>=<lift>` — the CLI lands it; its `snapped` warning gives typed → landed, and the card quotes the
  landed lift. Report every warning the run prints, each on a line of its own, the other levers' default
  landings included; so for every rank run. **Stops:** no `realistic` row → "bigger change or more
  traffic"; a landed lift below the row's `mde` → "within N days you can only see a ≥ X % change"; a
  price → `ue stat means` with the reader's σ; a trial lever → `readiness.line`'s trial days first.
- **The variant** `.ue/<slug>/card-<lever>.json` moves what the row moved, × (1 + the typed lift), both
  operands shown, labelled "your numbers, prepared" — `p1`–`p3`: that `chain.pN`; `close`: each paywall
  `completionRate` (at most 1); `trialConv`: each trial `trialConv`; `renewals`: each renewing
  `paymentsCounted`; `bought`: each paywall `takeOfTaps`; `mix`: never by hand (a take split) — `ue
  parse` the run's `recommendation.links` entry, none → no variant. Its `label` and `variants[]` name
  carry the LANDED lift, never the typed one; `measuredOn` "believed lift, not observed, <date>". The
  card's KPIs are the variant's own `ue evaluate … --explain`, never the base's (rule 9). For `chain.pN`
  its ROAS equals the override row's `roasAfter` — say so, and never quote the two apart; if they
  differ, set the knob to today × (1 + the row's `lift`) and re-evaluate. For `bought` and `mix` the
  card's lifted ROAS and gain are the rank run's `roasAfter` and `gainPerMonth`. Mint it with `ue link`,
  never one that warns `link_round_trip_failed`, the privacy sentence first (rule 4).
- **The card, ten fields in order, each figure with its unit:** (1) Horizon and traffic — N,
  `base.startsPerDay`, the budget. (2) Base — its evaluate: value per buy-tap net, required, CAC per
  payer, profit per start, ROAS on its `valueBasis`, payback as `words.payback` prints it, whole,
  `readiness.line`; the provenance table from its `provenance`, a take equal to the init split reading
  "assumed: the CLI's init split" there too; every deduction the base carries, each with its value — the
  fee on its `feeScheme` base, then refunds, tax, disputes, activation when present; the base link. (3)
  Metric — key: profit per start; nearest: the lever on its population (`populationPerDay`), today's
  rate, the row's `mde`, its stage label from this fixed map, never asked: `p1` → acquisition; `p2` →
  activation; `renewals` → retention; the rest → revenue. (4) Guardrails — every other table row with its
  `days` AND its `mde` (its `note` when `mde` is null); the next step by name (`p1` → `p2` → `p3` →
  `bought`), and always CAC per payer and payback from the base. (5) Hypothesis — "If <the change>, then
  <lever> <today> → <landed>, +<landed lift> % (believed); if the lift holds, profit per start and ROAS
  <base> → <variant>, +$<gainPerMonth> a month at <volume>.", then its link. (6) Change — "[your mockup —
  <their change in their words>]", even when described, then "must move <lever> only; <the next step>
  must not fall — +<lift> % here is cancelled by −<drop> % there", the drop prepared with its operands.
  (7) Test plan — the override row's `nPerArm`, `days`, `spendRouted`, `mde`; one read at the end;
  `readiness.line` too for `mix`, `trialConv`. (8) Gain if the lift holds — `gainPerMonth`; charges per
  payer as the retention unit, never a churn %. (9) Cost — "[hours × rate]", by `spendRouted`, `days`. No
  ratio of gain to cost, no "covered in N months"; fields 6 and 9 stay the reader's — no invented hours,
  rates or lifts. (10) Read and close — `ue stat read --a <n>/<x> --b <n>/<x>` with its placeholders, IN
  the card before any counts; at the read, every `read` field as printed — `pA`, `pB`, `lift`, `diff`,
  `ci95`, `z`, `pValue`, `needPerArm`, `verdict`. `underpowered` carries `read.needPerArm` and is never
  "did not work"; `not yet` → keep to the planned n or record it.
- **On `significant` only, BEFORE the re-base:** the realized gain is the `gainPerMonth` of `ue rank
  .ue/<slug>.json --horizon <N> --override <lever>=<read.pB ÷ today − 1>` (six decimals; its `roasAfter`
  = the re-based ROAS; all its warnings reported) — never a difference of profit per start multiplied by
  starts by hand. Then re-base: the old base into `variants[]`, the counts as observed inputs, the lever
  at `read.pB` as printed. Print the re-based evaluate's profit per start, ROAS, CAC per payer, payback
  and `stage` (the project's evaluate, counts in `observed[]`: `live_measured`), each base → re-based;
  the drift line "`<lever>` scenario <today> % → observed <`read.pB`, two decimals> % (<difference>
  points higher or lower)" — the observation as `ue stat read` printed it, never the landed value, never
  `read.diff`; then "the re-based scenario carries the landed <X> % (`snapped`)"; its link. Every figure
  about the re-based scenario (its KPIs, a next card's table) comes from a run on it.
- **Boundary — with every verdict** (the table, the card, the read), the SAME walk (items 1–8) in all
  three — the horizon, the 50/50 split and the counts included. The read's opens with the card's walk
  lines, word for word (the lever's pre-test rate too), then re-based `read.pB`, counts, realized lift.
  Not testable soon: every row whose `days` is past N, at its own `days` — past it even when its `mde` is
  null — and `renewals`, a calendar read. That list is rebuilt in EVERY boundary from the reader's own
  table — the read's from the card's `--horizon <N>` run, named as that run's ("in the card's <N>-day
  table run: `<lever>` <days> days") — never "this run"; one from the worked card is another run's.

## RevenueCat (UC-4)
Uses the READER's own RevenueCat MCP connection (`claude mcp add --transport http revenuecat https://mcp.revenuecat.ai/mcp`). Read tools only. Never cost per start or chain rates from RevenueCat. Never a key through this skill.
1. **Not connected** (no RevenueCat read tool is available in this session): print
   `claude mcp add --transport http revenuecat https://mcp.revenuecat.ai/mcp` as THE step to
   run to connect it, ask for no key, and change nothing in the scenario (you may log the
   decision in `decisions[]`). Stop there until the reader has connected it.
   **Connected:** call only read tools (`get-overview-metrics`, `get-revenue-metric`,
   `get-chart-data`, `get-chart-options-schema`, `get-benchmarks`, `list-experiments`,
   `get-experiment`, `get-experiment-results`). Never `create-`, `start-` or `publish-` tools.
2. Ask the reader to match RevenueCat products to paywall products by name.
3. Pull with maturity rules: `trial_conversion_rate` by product → `products[i].trialConv`
   (cohorts older than trial days + 3); `subscription_retention` → `paymentsCounted` = 1 + the
   sum of the observed retained periods (input preparation: list the periods and the sum,
   labelled "your numbers, prepared"; partial, no extrapolation); `refund_rate` →
   `deductions.refunds` (basis: all transactions — label it); revenue types → tax share and
   fee share (input preparation: show both revenue figures; label "as RevenueCat reports
   proceeds").
4. Append an observed-inputs document to `observed[]` (`{ "kind": "observed_inputs", "v": 1,
   "source": "revenuecat", "window": … }`), apply the values to the scenario, set
   `measuredOn = "RevenueCat <window>"`, evaluate (the stage becomes `live_measured`), print
   the drift check (references/stages.md), then the link per loop step 5.

## Rules
1. One copy of the math — every number comes from `segmently ue`.
2. Never invent a prior; an unknown is asked for, left as the book's value and labelled benchmark, or n/a. When an input has no book value and the reader declines to give one, the sanctioned move is the break-even sweep — its points labelled "sweep points, not an estimate" — never one assumed value in the headline.
3. Every link carries label= and measured= (the CLI warns otherwise).
4. Real customer numbers are private: a link is plain text — offer JSON for anything that should not sit in a URL. Order: the privacy sentence first, then the link (or the JSON instead, if the reader prefers).
5. Print the boundary with the verdict, from the sanctioned template above (measured / assumed / not testable soon), never as a denial.
6. When `ue link` warns `page_shows_gross` and its `keys` name a deduction key (`fee`, `tax`, `refunds`, `disputes`, `activation`, `fees`), print, word for word, beside the link it concerns: "the page opens this scenario gross; the net figures are from the CLI". Any other unread key: follow the warnings table (the page ignores that key; nothing about gross). No warning, no sentence: the deployed page reads every key this CLI writes, so a net link opens there on the CLI's own net figures.
7. Read-only towards every external system. The only files written are `.ue/` in the reader's project.
8. **Never describe a scenario as a `forecast` or a `prediction` — including in the
   negative.** These strings appear nowhere in an answer, in any casing, outside the
   contract line itself: `forecast`, `forecasts`, `forecasting`, `forecasted`, `predict`, `predicts`,
   `predicted`, `predicting`, `prediction`, `predictions`, `will likely`, `will show`,
   `expect to see`. The list is matched as strings, whatever the sentence is about:
   "the page will show", "the test will show" and "you can expect to see" all fail.
   Describe the page, the CLI and a test in the present tense: "the page shows",
   "the page opens", "the run prints", "the test reads". Plainly: do not write
   "this is not a forecast" or "not a prediction" —
   write the sanctioned boundary above instead. Say "in this scenario", "the CLI prints",
   "what follows if these inputs are true". Rule 5's boundary has exactly one approved
   shape; a denial is not one of them.
9. **Every row of every table is its own run.** A comparison or a sweep is N evaluations, not
   one evaluation and N rewrites of the prose. Four parts, all mechanical:
   - **Every cell comes from THAT row's own `ue evaluate` run** — `payback`,
     `readiness.line`, CAC per payer, ROAS, a break-even, the waterfall, all of it. Never
     carry a field across from the base row or from a neighbouring row because "that knob
     shouldn't move it": payback moves with a downsell even when CAC per payer does not, and
     the trial verdict's day count moves with the trial product's take. A `ue rank` table
     (UC-10) is one rank run that evaluates every lever's row itself: every cell comes from
     that run's own row, never mixed with a figure from an evaluate run or another rank run.
   - **Every warning that run printed is reported on that row**, typed → landed: `clamped`,
     `snapped`, `takes_normalized`, `link_rounded`, `unknown_key`. A row whose input was
     clamped is labelled with the LANDED value, never the typed one — a row typed 1 % trial
     conversion is the 2 % row, and every sentence about it says 2 %.
   - **Never say a figure is unchanged, flat or the same across rows unless you ran every row
     and can show them.** "The other levels change only the sweep point, not this line" is a
     claim about rows you did not evaluate.
   - **Give the reader the window when a sweep approaches one** (the CLI's own control
     windows, the same ones a clamp lands on): `trialConv` 2 – 95 %; a downsell `conv`
     1 – 60 % and an upsell `conv` 1 – 50 %; `completionRate` 30 – 100 %; `chain.p1/p2/p3`
     2 – 95 %; `chain.cps` $0.10 – $8.00; `paymentsCounted` 1 up to the product's own cadence
     cap (52 at most); a fee 0 – 30 % and $0 – $5 fixed; tax 0 – 30 %; refunds 0 – 30 %;
     disputes 0 – 5 % with a $0 – $50 fee. State any "never clears" or "clears everywhere I
     tried" at the LANDED endpoint of the window, never at the typed one.

## References
- references/grammar.md — the link grammar and the JSON fields behind each key.
- references/cases.md — worked numbers (UC-0 card, UC-1 grid, UC-2 table, UC-3 fill, UC-8 test plan, UC-10 rank table, UC-11 hypothesis card) with the commands.
- references/stages.md — the project file, stages, onboarding screen, drift check.

## Without the skill
When this skill is loaded, run `segmently ue` exactly as the cases above write it —
never through the MCP tools below.

The CLI behind this skill also runs as an MCP server, the same six handlers
(`evaluate`, `link`, `parse`, `init`, `rank`, `stat`) plus a seventh, `ue_guide`, as
seven tools — for a host with no room for this skill's context. An MCP-only host
gets this method from the server itself: its `instructions` (the contract and the
session rules) and `ue_guide` (this method, topic by topic, rendered from this
skill at build time). Four prompts open on the right topic. Install:

```bash
claude mcp add ue -- npx -y @segmently/cli ue mcp
codex mcp add ue -- npx -y @segmently/cli ue mcp
```

Claude Desktop and Cursor: the same command under `mcpServers` in their MCP
configuration.

claude.ai in the browser and ChatGPT need a remote server — not offered here; this
server speaks stdio only, spawned as a local process by the host above.

## In the Segmently monorepo only
If `references/internal-admin-seams.md` exists beside this file you are inside the Segmently
source repository — read it for the admin calculator's served seams and the `pid` link key.
