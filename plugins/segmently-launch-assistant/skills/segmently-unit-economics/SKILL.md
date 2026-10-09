---
name: "segmently-unit-economics"
description: "Offline paywall unit economics on the segmently.ai calculator's math. Use when a subscription or web-to-app builder asks whether a price, paywall, trial, store-vs-web fee stack, downsell or upsell, or ad budget can pay back (ROAS, CAC, payback, break-even), which experiment or metric to test first, how long an A/B test must run or whether its result is real (sample size, MDE), wants a hypothesis card or a growth cycle, brings RevenueCat or ad-account numbers, or pastes a segmently.ai/unit-economics link."
---

# Segmently unit economics

Every number in an answer comes from one `segmently ue` run — the arithmetic of the public
calculator at https://www.segmently.ai/unit-economics, never a formula of yours.

## Contract
I never: forecast your numbers, invent a benchmark, write to RevenueCat or Segmently,
or put a figure you did not give me into a link.

Print it first in a session, verbatim, on a line of its own, no prefix. The skill
prints **scenarios**: every figure is "what follows if these inputs are true",
and never a claim about what happens next.

## Prerequisites
- Node.js 22 or newer. Check: `node --version`.
- `npx -y @segmently/cli ue --version` prints `{ "cli": …, "mathHash": … }` with `cli` 1.7.0 or
  newer. No login, no key, no browser.
- Older — a bare version number, `unknown command 'ue'`, or a `cli` below 1.7.0: run it once as
  `npx -y @segmently/cli@latest ue --version`. Still older: say "this CLI is older than 1.7.0",
  answer nothing with numbers, and stop. Name the likely cause — an older global `@segmently/cli`
  install shadows npx — and the remedy: `npm i -g @segmently/cli@latest`.
- The spelling that passed the check — `npx -y @segmently/cli`, `npx -y @segmently/cli@latest`, or
  `segmently` when a global install is current — is the prefix of EVERY later command of the
  session (a global install: `segmently ue evaluate …`).

## Session start
1. Print the contract. Run the two prerequisite checks once. Report them in words (Node 22+, CLI
   <version>) — never echo the `--version` JSON — and give its `mathHash` its one line. The contract
   comes first, verbatim; the Node/CLI report and the `mathHash` line directly under it, before the
   project/stage block.
2. Look for `.ue/*.json` in the reader's working directory. The first entry that holds routes:
   - The message only asks what a field or a warning means, or how the calculator counts one — no
     numbers of theirs → references/fields.md; no run, no figure.
   - Found → `npx -y @segmently/cli ue evaluate .ue/<slug>.json --explain`, the onboarding screen,
     then the case the message names (§ Router), in the same message.
   - The reader pasted a link → `npx -y @segmently/cli ue parse "<link>"`, then the case their
     question names, else cases/uc-06-why-not-clearing.md.
   - Not found, but the opening message already carries the reader's funnel numbers (a chain or
     its rates, spend and starts, a take) → `init` the plan they named (web unless they named a
     store), edit their numbers in, evaluate, the onboarding screen, then cases/uc-03-your-numbers.md
     in this message; what they did not give stays the book's, labelled book. A price alone is no
     funnel number: the next entry.
   - Not found → the three-question interview of cases/uc-00-launch-card.md, then `ue init`, the
     onboarding screen, and the stage's first case at once. No fourth question before the reader
     has seen a number.
3. **The onboarding screen** (references/stages.md) comes first in every entry that evaluates a
   project file, from that run: the stage — `stage.value` with its `derivedFrom` — every plan on
   the paywall with its price, ROAS on its `valueBasis`, the base link, and the three `offers` as
   printed. The onboarding screen quotes only fields the base evaluate printed: ROAS on the
   `valueBasis` it states. A gross figure of a scenario with deductions is a second run (UC-9's
   gross variant) — never a number no run printed.
4. **A turn ends with at most one question.** A case's ordered inputs are asked one per turn, in
   its order; a turn ends with no question when the case says stop. Inputs the message already
   carries are not asked: the case runs on them in the same message.

## Router
| The reader … | Case | Read |
|---|---|---|
| has an idea or a price only: "worth launching?", "what price?" | UC-0 | `cases/uc-00-launch-card.md` |
| "trial or not", "add a free trial" — what the trial does to the economics (a trial OR another change first → UC-10; remove/lose/test → UC-13) | UC-1 | `cases/uc-01-trial-or-not.md` |
| "web checkout vs App Store", "Stripe vs Apple fees" | UC-2 | `cases/uc-02-web-vs-store.md` |
| gives their funnel numbers (spend, starts, rates, take — a price beside them) | UC-3 | `cases/uc-03-your-numbers.md` |
| has or asks about RevenueCat | UC-4 | `cases/uc-04-revenuecat.md` |
| "compare", "what if <an input> is X" (a price, a cost per start), a sweep | UC-5 | `cases/uc-05-compare-or-sweep.md` |
| pastes a segmently.ai/unit-economics link; "why doesn't it clear", "we lose money — where is the gap?" | UC-6 | `cases/uc-06-why-not-clearing.md` |
| downsell, upsell, plan upgrade — what one does to value per tap | UC-7 | `cases/uc-07-downsell-upsell.md` |
| names ONE change: "how long must the test run", "sample size"; a running test: "check it today", "safe to continue?" | UC-8 | `cases/uc-08-test-plan.md` |
| "what Ads Manager shows", a ROAS mismatch, Meta's cost per purchase vs our CAC | UC-9 | `cases/uc-09-ad-account.md` |
| "which experiment first", "which metric to move first", "what to optimise" — a ranking of every lever, no change named or two to choose between ("a trial, or the paywall change first?") | UC-10 | `cases/uc-10-which-experiment-first.md` |
| "what to test next", "hypothesis card" — a metric AND the change that tests it ("which metric/experiment first" with no card asked is UC-10) | UC-11 | `cases/uc-11-hypothesis-card.md` |
| "growth cycle", "where can we grow", "what next after this test", "is this test real?" (→ step 8) | UC-12 | `cases/uc-12-growth-cycle.md` |
| wants to TEST a change to the offer — a price, a trial added/removed/paid, the paywall mix, a downsell or an upsell: "is it worth testing", "how much can conversion drop", "worth an experiment", "at once" | UC-13 | `cases/uc-13-test-an-offer-change.md` |
| names a goal: "an investor wants ROAS 1.5× — what has to change?", a payback month, a CAC — each lever alone | UC-14 | `cases/uc-14-reach-a-goal.md` |
| the months ahead: ad spend growing N % a month, "when is cash back", "when do we hit $100k MRR" | UC-15 | `cases/uc-15-month-by-month.md` |
| asks what a field or a warning means, or how the calculator counts one — no scenario, no numbers of theirs | — | `references/fields.md` (no run, no figure) |

Read what the row names before the first answer; a bullet whose predicate holds decides first:
- A test to plan, no card asked: ONE change named → UC-8
  (a change to the offer → UC-13); none, or two to choose between → UC-10.
- What a trial, a downsell or an upsell does to the economics ("part of the users see the same plan with a
  trial" too) → UC-1 / UC-7; removing/losing/testing it → UC-13.
- Counts of a finished test and a card (`.ue/<slug>/card-*.json`, or `ue rank`'s `card`) → UC-11
  field 10; inside a cycle → UC-12 step 8.
- Counts of a finished test and no card → UC-8 § Reading a finished test.
- A link is pasted → `ue parse` it, then the case the question names; none named → UC-6.
- No project, no numbers and no row's question → UC-0's interview.

## The verbs
Each verb prints JSON.
- `ue init <slug> --product "<name>~<price>~<cadence>~<trial>"` (or `--anchor <monthly price>`;
  `--platform web|store|both`, `--have none|ads|analytics|revenuecat|segmently`, `--dir <path>`) →
  `.ue/<slug>.json`, its `stage` and `offers`.
- `ue evaluate <file|link> --explain` → `kpis`, `units`, `deducted`, `waterfall`, `breakEvens`,
  `words`, `readiness`, `walk`, `privacy`, `feeScheme`.
- `ue link <file> --label '<name>'` → the link, round-trip checked, and its `privacy`.
- `ue parse "<link>"` → the scenario (of a project file: the whole project).
- `ue rank <file> --horizon <N> --override <lever>=<lift>` (both optional; `--card <file>`,
  `--cost <lever>=<usd>`, `--odds <lever>=<p>`) → `rows`, `sentences`, `recommendation`,
  `boundary`, `card`. Structural levers (CLI 1.5.0): `--lever <spec>` (repeatable;
  `price:<plan>=<price>`, `trial-add:<plan>=free~<days>`, `trial-remove:<plan>`, `trial-paid:<plan>=<price>~<days>`,
  `mix:<plan>`, `downsell|upsell|upgrade:<owner>~<target>`), `--belief <spec>=<name>:<value>`, `--variant <file>`,
  `--together`; a default run adds the CLI's proposals, `--metrics-only` keeps the metric levers.
- `ue stat size --p <rate> --lift <lift>` → `nPerArm`; `ue stat means --sigma <σ> --delta <difference>`
  → the size for a difference of means;
  `ue stat read --a <n>/<x> --b <n>/<x> --project-file <file> --lever <lever> --horizon <N>` (a card's
  read adds `--belief <the card's typed lift>`; a horizon nobody named, `--horizon-default`) → `read`,
  and with the project flags `context`. A structural `--lever <spec>` reads its threshold (`read.threshold`;
  `--arm <spec>=<n>/<x>` for more arms; a downsell, upsell or upgrade takes `--b` alone).
- `ue stat watch --project-file <file> --lever <lever> --a <n>/<x> --b <n>/<x> --guardrail
  <step>=<n>/<x>,<n>/<x> [--today …]` → `watch.*`, a running test's daily check.
- `ue exp list <project>`, `ue exp start <project> <id> [--date YYYY-MM-DD]`,
  `ue exp close <project> <id> --reason "<text>"` → the project's experiment ledger (`experiments`,
  `sentences.ledger`).
- `ue target <file|link> --goal <kind>=<value>`, `ue plan <file|link> --growth <pct> --months <n>`
  (CLI 1.7.0) → `lines`, `link`, `privacy`; flags: cases/uc-14-reach-a-goal.md, cases/uc-15-month-by-month.md.
- `ue check <answer file> --project-file <file> --runs <dir>` → `pass`, `findings`.

Flags are what `--help` prints; a refusal's `error.fix` shows how the call is spelled — rerun it with
the session's prefix (Prerequisites) and your values (its example numbers are placeholders); a value
only the reader has → ask for it (`references/fields.md § Warnings and refusals`); report the refusal
in one line.

## The loop
1. `ue init` once per project → `.ue/<slug>.json`; read `stage` and `offers`; show the onboarding
   screen (Session start, point 3).
2. Build variants by EDITING the scenario JSON, one thing changed — never by re-implementing a
   formula.
3. `ue evaluate <file|link> --explain` for every variant. One evaluation per variant, and
   every cell of that variant's row is read from ITS OWN output — never from the base's
   (rule 9), with that run's own `clamped` / `snapped` notices reported on that row.
4. `ue link` for every variant, with `--label` and a `measuredOn` set. Hand over ONLY links
   printed by `ue link` — or `ue rank`'s `recommendation.links`, which are round-trip checked the
   same way: in UC-10 both; in UC-11 none with the table and, when the reader asks for one, the
   table run's `recommendation.links.first`, named as the <N>-day run's (an `--override` run's
   links belong to the card). **Print the exact `ue link` call on the line above every
   link it minted, the onboarding screen's base link included** (for `recommendation.links`,
   name the `ue rank` run they came from instead). Never the `link` field of `ue evaluate` /
   `ue init` / `ue rank` (no round-trip check). Print the
   `--version` JSON's `mathHash` once at session start. A `ue target` / `ue plan` run's `link` is
   minted like `ue link`'s: hand it over under that run's call.
5. Answer with the same triple every time: a table (variants × KPIs), a verdict sentence with
   its boundary (§ The boundary), one link per variant. Every row of that table is its OWN
   evaluate run (rule 9) — no cell, `payback` and `readiness.line` included, is carried across rows.
   **The privacy sentence.** Every result that mints a link carries `privacy` (`ue rank`: also
   `recommendation.privacy.first` / `.runnerUp`). When a link's `privacy.due` is true, print
   `privacy.sentence` on its own line above the call of the first such link — once covers every link
   after it in the answer, and an answer is one message: a link printed again in a later answer needs
   the sentence again; repeating it above a later link is allowed — print, verbatim:
   "This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead."
   Print it as its OWN line, whole, starting with a capital "This" — never folded into a lead-in
   clause. The CLI decides `privacy.due` from what the link carries; the stage never decides it, and
   neither do you. `ue check` (step 6) asks for the sentence above every link that carries anything
   off the book — a `privacy.pricesOnly` link whose price the reader called still open, and a
   `recommendation.links` entry lifted by `ue rank`'s default, included — because it cannot hear
   the session. The sentence is always allowed above a link: print it there too. When unsure, print
   the sentence. A link is plain text: offer the JSON file instead.
6. **Check before you send.** Before you send an answer that carries a figure or a link, write it
   to `.ue/<slug>/answer.md` (overwritten for every answer; no project: `.ue/answer.md`, or pipe it to
   `ue check -`) and run `npx -y @segmently/cli ue check .ue/<slug>/answer.md --project-file
   .ue/<slug>.json --runs .ue/<slug>/runs/` (no project: `--project-file` names the scenario file, or
   the link in double quotes, the answer is about; neither: no `--project-file`; `--runs`: § Files).
   Fix every finding at its `line` as its `fix` says and run it again; send only at `pass: true`,
   exactly as checked. A `ue check` refusal names your own path — fix it; never ask the reader.

## Blocks the CLI renders
A block is printed whole, in the order its row gives — never rewritten, re-rounded, reordered or
assembled by hand from its fields; a `null` cell prints n/a. A case names a block; it never
re-lists the block's lines.

| Run | Block | Print |
|---|---|---|
| `ue evaluate --explain` | the walk | `walk.lines` under `walk.opener`, each a bullet, word for word (§ The boundary) |
| | break-evens | `words.breakEvens`, each entry a line of its own, in order (cps, p1, p2, p3) |
| | payback | `words.payback`, whole; a table's payback cell is the `payback` field as `references/fields.md` reads it |
| | readiness | `readiness.line` whole — all its clauses (the mix days AND the trial days), on every row that shows it |
| `ue link`, and every run that mints a link | privacy | `privacy.sentence` on its own line above the link's call when `privacy.due` is true (loop step 5) |
| `ue rank` | the table | `sentences.traffic`; every `sentences.table` line; a blank line; each `sentences.belowTable` line as a `- ` bullet (ranking, population, realism, ceiling, blocked, price, then every warning); a blank line; `sentences.pick` |
| | warnings | a rank run that prints no table: each `sentences.warnings` line on its own line |
| | its boundary | `boundary`: `boundary.opener`, then each of `boundary.lines` as a bullet, in order |
| | structural rows | `sentences.structural` whole — once one line of it is shown, every line |
| | the difference | under each structural variant link, that row's `sentences.diff` line(s), whole |
| | several arms | `sentences.together`, with the table |
| | the ledger | `sentences.ledger` above the run's other blocks, whole |
| `ue rank … --card <file>` | field 5 of the card | every `card.prepared` line → every `card.snapped` line → the `card.evaluateCommand` run and its KPIs → `card.walkLines` → `card.roasTie` → the privacy sentence → the `card.linkCommand` run and its link; an inline card (MCP) carries this block as `card.lines` |
| `ue stat read` | the read | `read.lines`, each on its own line — the nine fields, then `context.drift`, then `context.more.sentence` (not `significant`) or `context.realized.sentence` and its warnings (`significant`) are all lines of it: never print those three a second time — the re-base block's own drift line excepted; on a project with a planned test, `context.progress.sentence` is its last line |
| | its boundary | `context.boundary`: its opener, then each of its lines as a bullet, in order |
| `ue stat watch` | the watch | `watch.lines` (its `lines`), one per line, then `watch.boundary` (opener, lines as bullets) |
| `ue target` | the goal | `target.lines` (its `lines`), one per line, whole, in order |
| `ue plan` | the months | `plan.lines` (its `lines`), one per line, whole, in order |
| `ue stat read … --rebase` | the re-base | every `context.rebase.prepared` line, `context.rebase.snapped`, every `context.rebase.lines` entry, this run's own drift line, the privacy sentence, the `context.rebase.linkCommand` run and its link |

## The boundary
**The boundary sentence — one sanctioned shape, copied, never invented.** Every verdict closes
with a boundary (rule 5). Its shape:

> These figures are this scenario's arithmetic on the inputs above.
> - <each `walk.lines` entry, word for word>
> - <a session input> — measured: <source and window>
> - <a session input> — assumed: <the book's value, the reader's belief, or a labelled sweep>
> - <inputs> — not testable soon: <what it would take> (<N> days at this budget, from `readiness.line`)

**Rendered or assembled.** A `ue rank` answer prints that run's `boundary`, and a read with
`--project-file <file>` and `--lever <lever>` its `context.boundary`, whole (§ Blocks the CLI
renders) — one exception: in a growth cycle the read's `context.boundary` takes step 6's estimate
line right after its belief line (cases/uc-12-growth-cycle.md). An evaluate-only case assembles it:
`walk.opener`, then the base's `walk.lines` word for word — from `ue evaluate --explain` on the base
the verdict is about (every input they stated filled in) — then its case file's § Boundary
placements, then not testable soon. A class with nothing in it is dropped silently — never written
out as "none". Every input the scenario reads belongs to exactly
one class — ONE walk, the same list for every boundary of every case (UC-11's three included):
1. `chain.cps`, `p1`, `p2`, `p3` — `walk.lines`: all four rates, the tested lever's too.
2. Per product: its price, cadence and trial — `walk.lines`.
3. Per product: its take, charges, completion and `trialConv` — `walk.lines` (a take equal to the
   CLI's init split reads "assumed: the CLI's init split" there).
4. `volume` — `walk.lines`.
5. Every deduction, with its value and the fee's `feeScheme` base — `walk.lines`.
6. Every lift and swept value — assumed, at its LANDED value: `sentences.beliefs`,
   `sentences.assumedLift`, a labelled sweep; the book's first renewal behind payback — `walk.lines`.
7. A test's own inputs, in every boundary of a case that plans or reads one: its horizon —
   measured, the reader's answer ("default horizon" when none: assumed); at a horizon-choice run
   (UC-11 Turn 1, UC-12 step 2 and its loop-back — several typed horizons, none picked yet) the
   horizon line is `sentences.horizons`, verbatim; its 50/50 split — assumed: the test design; the
   counts it read — measured, the reader's answer (at a read, `context.boundaryAdds` carries them).
8. Whatever the base carries from an export or RevenueCat — `walk.lines`.

A variant's own edit — a belief, a sweep point, a price the reader is weighing (UC-0's ladder, an
`anchor`) — is a line of its own in the class its case names. An input you inferred rather than
heard is assumed, not measured: a line of its own after the walk lines. A boundary written as a
denial is a rule 8 violation even when it is true: none of "this is not a forecast",
"not a prediction", "not a claim about the future" may appear. Worked example:
cases/uc-00-launch-card.md#Worked example.

## The bracket
The break-even of a knob no CLI field solves — UC-0's charges per payer, UC-1's `trialConv`, UC-6's
swept `paymentsCounted` and `completionRate`, UC-7's `conv` — is bracketed on the knob's own grid
(`paymentsCounted` 0.01; `trialConv`, `completionRate` and a chain rate half a point; a `conv` one
point), ≤ 8 evaluate runs:
1. Run grid points until two ADJACENT ones bracket the target: X misses it (`profitPerStart` < 0,
   or `valuePerTap` below the base's) and the next grid point reaches it.
2. Both are variants: run each, quote the two side by side, and mint each with `ue link` (its
   `label` naming the point, `measuredOn` set).
3. The first clearing point, at its landed value, is the break-even. A clearing point with an
   unrun grid point below it "clears at" — never "the break-even", never "≥"; a point that misses
   is never the break-even, however small the gap: never "≈".
4. An endpoint outside the control's window comes back `clamped`: report it typed → landed, and
   say "never clears" or "clears at every point I tried" at the LANDED endpoint. A fraction is typed
   inside 0…1 — above 1 the CLI refuses the field (`scenario_refused`), so a sweep tops out at 100 %.
5. Eight runs without two adjacent points: print the last miss and the lowest clearing point side
   by side, and call neither the break-even.

## Arithmetic and units
**The only arithmetic you do** (everything else is a CLI field, a question, or n/a):
- *Input preparation* — a product or quotient of numbers the reader stated or that come
  verbatim from their export (`chain.cps` = spend ÷ funnel starts; a learning budget = the
  CLI's readiness days × the reader's daily budget; `paymentsCounted` from observed periods).
  Always show both operands and label the result "your numbers, prepared".
- *Comparison* — the absolute difference of two CLI values exactly as the answer prints them (the
  rounded cells beside it, e.g. $98.35 − $82.17 = $16.18), never the unrounded fields' difference
  rounded — shown next to both values. No percentages, no Δ% grids, and no ratios or multiples of
  your own ("twice", "three times", "1.67×", "a sixth", "x times"). Quoting a figure the page itself
  prints (its ROAS, e.g. `1.14×` in `words`) is quoting, not a ratio.
- *Picking a run* — UC-1's interpolation between the two landed ends picks the next run, never quoted.
- Nothing else: no model formula, take split or loss over a period. A gain per month, sample size,
  days to detect or minimum detectable change — those four are quoted from `ue rank` / `ue stat`
  fields (`gainPerMonth`, `nPerArm`, `days`, `mde`) — and a bet's gain (`bet`), a guardrail's drop
  (`guardrail`) and a read's missing people (`context.more`) are never worked out by hand. For
  anything no CLI field carries: ask the reader, or print n/a with "this CLI version does not
  compute it yet" (the word "yet" is part of it).
- *A CLI field is quoted, not re-derived.* `base.startsPerDay`, `kpis.startsPerDay` and
  `populationPerDay` are cited by name ("1,000 starts a day, `base.startsPerDay`"), never as
  "$1,500 ÷ $1.50", whose second operand is the book's.
- **The precision rule.** Quote every figure at the precision its field printed, and an operand at
  the precision it was computed from (1 ÷ 1.147541, never 1.1475) — never `~`, `≈`, `±`, "about",
  "roughly", "nearly", "almost", "close to", "just under/over", "some", "-ish", "or so", `$45k`.

**Units.** Every figure carries its unit and you label it with it: `units.deducted` is
`per_tap` (every `deducted.*` figure is per tap on Buy), `units.waterfall` is `per_payer`,
`units.kpis.<field>` names each KPI's; read the unit off `units`, never off a field's name; the
field table and the warning table are references/fields.md. Units are not arithmetic either.

## Files
**Variant files.** The base case is `scenario` inside `.ue/<slug>.json`. A variant is a copy of
that scenario document at `.ue/<slug>/<variant>.json` with ONE change, its own `label` (≤ 40 characters)
and its own `measuredOn` (≤ 80 characters: the source and window of the reader's numbers, in words
the reader typed or the case prescribes — never a date they did not type — or
`"benchmark book, nothing measured"` while nothing of theirs but a price is in a scenario you built;
a link the reader pasted gets `"reader-stated, source not given"` (cases/uc-06-why-not-clearing.md);
`ue link` refuses a longer one with `scenario_refused`, field `measuredOn`,
"measuredOn must be a string of at most 80 characters" — shorten it, keeping its source). A value
the reader stated equal to the book's adds its knob to `touched` (references/grammar.md). Corridor
corners and sweep points are variants too, never the project root. Never overwrite the base case:
re-basing — replacing values the reader did not state now, e.g. the book chain by observed data —
moves the old base into `variants[]` first; filling an input the reader just stated (their budget
into `volume`, a `label`, a `measuredOn`) is not re-basing: edit the base in place. Every hand edit
of `.ue/<slug>.json` sets `updatedAt` to the current time (ISO 8601, UTC) and never `createdAt`;
`ue stat read --rebase` does both itself. `experiments[]` is the CLI's ledger (`ue exp`, a card,
every read) — never edited by hand.

**Run files.** Save each run's JSON the answer prints under `.ue/<slug>/runs/` —
`ue rank … > .ue/<slug>/runs/rank-<n>.json` — and create or clear the folder before a new answer (no
project: `.ue/runs/`). A run is printed when the answer prints its table block, a boundary,
`read.lines`, the card's lines or its whole walk — no other block makes a run printed; a run the
answer only takes cells, its `readiness.line`, its break-evens or a borrowed walk line from (a
variant's fee line, field 4 of the card) stays out of the folder. Loop step 6's `--runs` checks that
the answer carries, whole, what it owes of those runs: the walk, the break-evens and the rank table
(each once the answer shows a line of it), the rank run's warnings and boundary, the card's lines
(prepared, snapped, walk), `read.lines`, the read's boundary, its more / realized / drift sentences,
the re-base lines, the privacy sentence above the run's own link, a structural run's own structural
block (once the answer shows a line of it), its diff line for a row whose variant link the answer
hands over, the together plan's lines (with `--together`), the ledger's open-entry lines (with an
open entry), the read's progress sentence, and the watch's lines. No other block is checked —
print it whole all the same. An answer that prints no run runs loop step 6 without `--runs` (the CLI
refuses an empty folder). A `ue target` / `ue plan` run's `lines` are its table block, owed whole
like the watch's lines.

**The record — every answer's last step.** Append to the project file one `decisions[]` entry
`{ date, case, verdict, boundary }` and, per variant you handed a link for — a variant file you
minted, or a `recommendation.links` link (UC-10's two, each named by the lever it lifts) — one
`variants[]` entry `{ name, case, question, scenario, link, verdict, createdAt }`, its `label` as
`name`; a `recommendation.links` variant's `scenario` is the `scenario` field of
`ue parse "<that link>"` — never a `{ lever, lift }` stub. A turn that printed a figure-carrying block
records its decision — a base-only answer (UC-3) too; a turn that only asks records nothing; a turn
that shows only the onboarding screen — its `measuredOn` note included — and then asks or stops
records nothing: that screen is not a figure-carrying block.

## Rules
1. One copy of the math — every number comes from `segmently ue`.
2. Never invent a prior; an unknown is asked for, left as the book's value and labelled benchmark,
   or n/a. An input with no book value that the reader declines to give gets the break-even sweep —
   its points labelled "sweep points, not an estimate" — never one assumed value in the headline.
3. Every link carries label= and measured= (the CLI warns otherwise).
4. Real customer numbers are private: the privacy sentence first whenever `privacy.due` or
   `ue check` asks for it (loop step 5), then the link — or the JSON file instead.
5. The boundary (§ The boundary) comes after the answer's last verdict — any line saying
   significant, underpowered, not yet, realistic, learnable, decidable, clears, profitable, fastest,
   runner-up, `recommendation.first` / `runnerUp` or "Recommendation:", a table's `realistic` column
   included (UC-11's horizon-choice run too). After the boundary, only the question or the next
   step: a line that restates a verdict after it ("`p2` is the most learnable") needs its own
   boundary.
6. When `ue link` warns `page_shows_gross` and its `keys` name a deduction key (`fee`, `tax`,
   `refunds`, `disputes`, `activation`, `fees`), print, word for word, beside the link it concerns:
   "the page opens this scenario gross; the net figures are from the CLI". Any other key: the
   warnings table (references/fields.md § Warnings and refusals). No warning, no sentence: the
   deployed page reads every key that link carries.
7. Read-only towards every external system; files go only under `.ue/` in the reader's project.
8. **Never describe a scenario as a `forecast` or a `prediction` — including in the negative.**
   `ue check` enforces the string list, in any casing, outside the contract line: `forecast`,
   `forecasts`, `forecasting`, `forecasted`, `predict`, `predicts`, `predicted`, `predicting`,
   `prediction`, `predictions`, `will likely`, `will show`, `expect to see`. The list is matched as
   strings, whatever the sentence is about ("the page will show" fails too). Describe the page, the
   CLI and a test in the present tense: "the page shows", "the run prints", "the test reads".
9. **Every row of every table is its own run.** Every cell comes from THAT row's own run — its
   `ue evaluate`, or the one `ue rank` run of a rank table — never carried across from the base or
   a neighbouring row (payback moves with a downsell even when CAC per payer does not); every
   warning that run printed is reported on that row, typed → landed, the row labelled with the
   LANDED value; never call a figure unchanged, flat or the same across rows you did not all run;
   near a control's window, give the reader the window (references/fields.md § Warnings and
   refusals, `clamped`).
10. Every answer that carries a figure or a link passes `ue check` before it is sent (loop step 6).

## References
- cases/README.md — the catalog, the seed scenario and the stamp; one file per case under cases/.
- references/fields.md (fields, warnings, refusals), references/grammar.md (link keys, JSON fields),
  references/stages.md (project file, stages, onboarding, drift).

With this skill loaded, run `segmently ue` as the cases write it — never through its MCP server,
`segmently ue mcp`.

If `references/internal-admin-seams.md` exists beside this file, read it: the admin calculator's
seams and the `pid` link key.
