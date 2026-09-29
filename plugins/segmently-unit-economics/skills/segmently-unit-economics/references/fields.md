# Fields and warnings — lookups

Read a row when a figure or a warning is in hand; the interface says when. The units rule itself
(every figure labelled with the unit `units` states) is the interface's; these are its tables.

Contents:
- references/fields.md § Reading the output — what each field of `ue evaluate --explain` means.
- references/fields.md § How the mechanics work — a downsell's and an upsell's pools, and when a live mechanic is decidable.
- references/fields.md § The structural row — the fields of a structural `ue rank` row (CLI 1.5.0).
- references/fields.md § The ledger — the `experiments[]` fields and their lifecycle.
- references/fields.md § Warnings and refusals — what you do with each warning code and a refusal.
- The ad account's figures (below) — the rows UC-9 sets beside the ad platform's.

## Reading the output
`units.kpis.<field>` gives each KPI its own unit (`per_tap`, `per_payer`, `per_start`,
`per_day`, `per_month`, `ratio`). `deducted.fee`, `deducted.tax`, `deducted.refunds`,
`deducted.disputes` and `deducted.activation` are **per tap on Buy** — the same unit as
`kpis.valuePerTap` — and the `waterfall` rows are **per payer**, the same unit as "list price
× charges counted". Never call a `deducted.*` figure "per payer", and never divide one by the
payer rate yourself to get there: quote the waterfall row, which already is per payer.
`ue evaluate --format table` prints the same unit in its own column.

**Units in the JSON.** Shares are fractions (`0.30` = 30 %); money is in the scenario's
currency; `chain.cps` is cost per funnel start; `chain.p1/p2/p3` are landing → step 1 →
paywall → buy-tap; `products[i].takeOfTaps` is the product's share of buy-taps;
`products[i].paymentsCounted` is charges per payer over 12 months; `products[i].completionRate`
is buy-tap → paid; `products[i].trialConv` is trial → paid. When the reader's value equals the
book's, add the knob name (`"cps"`, `"p1"`…) to `touched` so it reads as theirs.

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
| `walk` | the boundary: copy `walk.opener` and every `walk.lines` entry word for word — never compose classes from `provenance` |
| `privacy` | `due`: the privacy sentence above this link's call (loop step 5) |
| `words` | the page's own words for the same figures — quote them |

`ue evaluate --format table` (documented in the CLI README) prints the page's words as a
table for a quick look; use JSON for anything you compute a table from.

## How the mechanics work
- A downsell is offered to the owner's decliners: its failed checkouts plus its share of the people who pick
  nothing (`pools[].perTap.downsell` of `ue evaluate`). `conv` is a share of that pool.
- An upsell is offered to the owner's payers (`pools[].perTap.upsell`); an add-on is one payment and never makes a
  payer; an upgrade replaces the plan, is charged now without a trial, credits the base's first charge, and can be
  worth less than the plan (a negative upsell value).
- `readiness.line` names when a live mechanic's acceptance is decidable: 300 in its pool (BB-40).

## The structural row
`kind: 'structural'`, `axis` (the admin's name), `edit` (`proposed`: the parts that are the CLI's proposal),
`response` (the reaction, its break-even on its own grid and its side, `never` / `everyPoint`, what it holds fixed,
the pool a day, the trial clock), `guardrail2` (a second reaction's allowed move; charges counted are a calendar read),
`thresholdTest` (the decisive metric, n per arm, days, `mde` in points), `variantAt` (belief, benchmark, break-even,
or the best / worst end tried), `links` (base and variant), `delta` (both runs' own figures). The table prints its MDE
cells in points ("1.23 pts"), never a relative lift.

## The ledger
`experiments[]`: `{ id, lever, kind, axis, status, card, plan, createdAt, startedAt, reads, closedAt, reason }`. Planned
(a card), running (`ue exp start`, or the first read), read (a decided verdict), re-based (`--rebase`), closed
(`ue exp close`). `ue rank` never recommends a planned, running or read lever; a re-based or closed one may come back.
A test with no `ue exp start` counts its days from its first read.

## Warnings and refusals
Every verb returns `warnings[]` (and evaluate/parse `clampNotices[]`). Handle each, never drop one:

| Code | What you do |
|---|---|
| `page_shows_gross` | The page does not read a key this link carries. The deployed page reads every key `ue link` writes — `fee=` with its scheme, `tax=`, `refunds=`, `disputes=`, `activation=`, `fees=`, `basis=`, `measured=` and `upgrade=` (checked on the deployed page 2026-09-23) — so a link this CLI mints raises it only for a key the page does not read yet. No `page_shows_gross`, no sentence: never add a gross or ignored-key sentence to a link that did not raise it. When it fires, read `keys`. A deduction key among them (`fee`, `tax`, `refunds`, `disputes`, `activation`, `fees`) — the CLI's message then says "GROSS": print rule 6's sentence. Any other key: say, in the present tense, that the page ignores that key and opens the rest of the scenario, name the key, and say that a figure it changes is the CLI's alone — nothing about gross (the CLI's own message for this case does not say GROSS either). Never "the page will show …": `will show` is on rule 8's string list, and the ban covers sentences about the page, the CLI or a test exactly as it covers sentences about a figure. |
| `label_missing` | Re-mint with `npx -y @segmently/cli ue link <file> --label '<name>'` (or set `label`). Single quotes: in double quotes the shell expands `$19.99` to `9.99`. |
| `measured_missing` | Set `measuredOn` (source + window) in the variant file — for a found project's onboarding base link, in its `scenario` — and re-mint. Then report it once, in one line: a `ue link` call's own → "`measured_missing` → re-minted with measured=<note>"; `ue init` / `ue evaluate`'s own link → "`measured_missing` on the <evaluate's | init's> link → re-minted with measured=<note>". |
| `takes_normalized` | The paywall takes added up past 100 % and were scaled: name each product's before → after, ask the reader for their split of buy-taps. |
| `clamped` (and every `clampNotices` line) | The value was outside the control's window and moved: report typed value and landed value on THAT row; ask whether the typed one is measured. In a sweep, the clamped row is labelled with the LANDED value and every later sentence about it quotes the landed one (trial conversion runs 2 – 95 %: a row typed 100 % lands on 95 %, a row typed 1 % lands on 2 %), and any "never clears" **or** "clears at every point I tried" is stated at the landed endpoint ("not even at 95 %, the highest the calculator takes"; "down to 2 %, the lowest it takes"). The windows (the CLI's own controls): `trialConv` 2 – 95 %; a downsell `conv` 1 – 60 % and an upsell `conv` 1 – 50 %; `completionRate` 30 – 100 %; `chain.p1/p2/p3` 2 – 95 %; `chain.cps` $0.10 – $8.00; `paymentsCounted` 1 up to the product's own cadence cap (52 at most); a fee 0 – 30 % and $0 – $5 fixed; tax 0 – 30 %; refunds 0 – 30 %; disputes 0 – 5 % with a $0 – $50 fee. Give the reader the window when a sweep approaches one. |
| `snapped` | Loading the scenario put a value on the calculator's own grid — its slider step (cps 1.23456 → 1.25; the chain rates, `trialConv` and `completionRate` to half a point, 0.4256 → 0.425) or its precision (`paymentsCounted` 4.765 → 4.76, the takes to four decimals); every figure, and the minted link, uses the landed value. Name each key typed → landed; label the row with the landed value and quote it from then on. That covers the scenario's input only: an observation (`read.pB`, an observed rate) is quoted exactly as its run printed it, never at a landed value. |
| `link_rounded` | The link cannot carry a value or name exactly, so the page opens it rounded or rewritten. Say which key and that the page shows the link's value; the CLI figures use the unrounded one. |
| `unknown_key` | Name the ignored keys; if one looks like a typo of a grammar key (references/grammar.md), ask. |

A refusal is stderr `{ "error": { "code", "message", "field", "fix" } }` and exit code 1. Read
`field` and quote `message`. A value only the reader has: ask the reader for that ONE value. A call
or a field you wrote: `fix` shows how the call is spelled — rerun it with the session's prefix
(Prerequisites) and your values (its example numbers are placeholders) and report the refusal in one
line.
Never guess a replacement, never retry with an invented number. `link_round_trip_failed` means no
link is handed over.

## The ad account's figures

UC-9 prints the rows the reader's figures need — the CAC per paying customer row with every
cost-per-purchase n/a, the net ROAS row with every ROAS:

| The ad platform's figure | This CLI version |
|---|---|
| cost per purchase (spend per purchase event: buyers + trial starts) | n/a — "this CLI version does not compute it yet". It is NOT `kpis.requiredValuePerTap` (that is the cost of one tap on Buy, and a tap on Buy is not a purchase) and never derived by you from `purchasesPerMonth` |
| ROAS on list price | the gross figure: `kpis.roas` with `valueBasis` `gross`. When the scenario has deductions, evaluate a copy with `deductions` emptied (a second CLI run, labelled "gross variant") and quote its `kpis.roas` |
| (the two are not the same window) | `kpis.roas` is computed on the value basis the scenario states — by default `basis: "ltv12"`, TWELVE MONTHS of charges per payer. An ad platform reports over ITS attribution window (7-day click / 1-day view, or whatever the account is set to), which is days, not a year. Say which is which before putting the two side by side. The comparable-to-a-first-charge view is `basis: "first"` (UC-5's axis): evaluate a copy with `basis` set to `"first"` and quote THAT `kpis.roas` as the first-charge figure |
| — (the platform has no such line) | net ROAS = `kpis.roas` with `valueBasis` `net`. When nothing is deducted the two coincide — say so, do not invent a net figure |
| — | CAC per paying customer = `kpis.cacPerPayer` (payers, not purchase events) |
