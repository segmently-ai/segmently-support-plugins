# The scenario grammar (v=2)

One scenario = one link = one JSON document (`"v": 2`). `ue parse`, `ue evaluate` and
`ue link` read either door, refuse whole-or-nothing and name the field. Edit the JSON; let
`ue link` write the link — a hand-written link is fine to READ, but hand the reader only what
`ue link` minted (it round-trips every link before printing it).

## Link keys → JSON fields

| Link key | Grammar | JSON field |
|---|---|---|
| `v` | `2` | `v` |
| `label` | text, ≤ 40 characters | `label` |
| `cps` | dollars per funnel start | `chain.cps` |
| `p1` `p2` `p3` | percent (`30.0`) | `chain.p1` `chain.p2` `chain.p3` (fractions, `0.30`) |
| `vol` | `<amount>:<budget_month\|budget_day\|visitors_month\|visitors_day>` | `volume.amount`, `volume.unit` |
| `p` (repeatable, paywall order) | `<name>~<price>~<cadence>~<trial>~<take % of taps>~<completion %>~<charges>~<trialconv %>[~<refund %>]` | `products[i]` with `onPaywall: true` |
| `off` (repeatable) | same, take empty | `products[i]` with `onPaywall: false` |
| `ds` | `<owner>~<target>~<conv %>` | `products[owner].downsell = { product, conv }`, `mechanics.downsell` |
| `us` | `<owner>~<target>~<conv %>` | `products[owner].upsell = { product, conv }`, `mechanics.upsell` |
| `upgrade` | `<owner>~<target>~<conv %>` | `products[owner].upsell = { product, conv, kind: "upgrade" }` |
| `fee` | `<pct %>~<fixed $>~<preset id or empty>` | `deductions.fee = { pct, fixed, preset }` |
| `tax` | `<incl\|excl>~<rate %>` | `deductions.tax = { included, rate }` |
| `refunds` | `<share %>` | `deductions.refunds = { share }` |
| `disputes` | `<share %>~<fee $>` | `deductions.disputes = { share, fee }` |
| `activation` | `<opened %>~<non-opener charges>` | `deductions.activation = { share, nonOpenerChecks }` |
| `fees` (repeatable) | `<name>~<pct %>~<fixed $>` | `deductions.custom[i] = { id, name, pct, fixed }` |
| `basis` | `first` (only when first) | `basis: "first"` (default `"ltv12"`, 12 months of charges) |
| `measured` | text, ≤ 80 characters | `measuredOn` |

- **Cadence in a link:** `once` or `<n><day|week|month|year>` — `1month`, `3month`, `1year`,
  `1week`, `4week`. In JSON: `type: "one_time", billing: null` or
  `type: "subscription", billing: { interval, intervalCount }`.
- **Trial in a link:** `none`, `<days>d-free` (`7d-free`), `<price>-<n><unit>` (`0.99-3day`).
  In JSON: `{ "kind": "none" }`, `{ "kind": "free", "days": 7 }`,
  `{ "kind": "paid", "price": 0.99, "interval": "day", "intervalCount": 3 }`.
- **Products are referenced by NAME** in `ds=` / `us=` / `upgrade=`, so names must be unique.
- **Foreign keys** (`utm_*`, `ref`) survive every rewrite. `ue link` adds `ref=skill` unless
  `--no-ref` is given.
- **Percent formatting** is the CLI's (`30.0`, `2.90~0.30~card_processor`, takes with two
  decimals) — never hand-format a link.

## `touched` — chain provenance

`touched` (optional; default `[]`) lists which of the four CHAIN KNOBS — `cps`, `p1`, `p2`,
`p3`, nothing else — the reader stated themselves, even when the number happens to equal the
book. It is a PROVENANCE flag, not a "changed from default" one: a knob not listed reads as the
book's only while it carries the book's value; a listed knob reads as the reader's even at the
book's value.
Any other key is refused by its own index, naming the four allowed knobs:
`touched[1] must be one of cps, p1, p2, p3`.

## JSON document units

The document and the link do not share a unit for the same field. Every rate or share in the
JSON — `chain.p1` / `p2` / `p3`, `products[i].takeOfTaps` / `completionRate` / `trialConv`,
`deductions.*.rate` / `.share` / `.pct` (`tax.rate`, `refunds.share`, `disputes.share`,
`activation.share`, `custom[i].pct`) — is a FRACTION, `0…1`; the link writes the SAME field as
a PERCENT, `0…100` (`p1=30.0` in the link is `chain.p1: 0.30` in the JSON). Money
(`chain.cps`, `products[i].price`, every `.fixed` and `.fee`) is dollars in both. A document
written with the link's own number pasted in unconverted — `deductions.fee.pct: 2.9` instead
of `0.029` — is refused, and the refusal names the unit: `deductions.fee.pct must be between 0
and 1 — a fraction in the JSON document (0.029 = 2.9 %); the link writes percent.`

## `ue init` product specs

`--product "<name>~<price>~<cadence>~<trial>"`, repeatable. Cadences:
`once | 1w | 1week | 1m | 1month | 1y | 1year | Nd | Nw | Nm | Ny`. Trials:
`none | 7d | 7d-free | 0.99-3d | 0.99-3day`; the three-part form `<name>~<price>~<cadence>` — the
reader did not state a trial: recorded in `unstatedTrials`, walked as assumed.
`--platform web|store|both` (default web), `--have none|ads|analytics|revenuecat|segmently`,
`--anchor <monthly price>` instead of products, `--dir <path>` for where `.ue/` goes, `--force` to
overwrite. Every other verb reads a `.ue/<slug>.json` project file the same way it reads a plain
scenario JSON, a page link, or `-` for stdin.

## Fee presets (the book)

| Preset id | Numbers | Book entry |
|---|---|---|
| `card_processor` | 2.9 % + $0.30 | published list price |
| `card_processor_billing` | 3.6 % + $0.30 | published list price |
| `merchant_of_record` | 5 % + $0.50 | published list price |
| `app_store_small` | 15 % | editorial — say so |
| `app_store` | 30 % | editorial — say so |

A preset name survives only while the numbers are the preset's; edit a number and the CLI
keeps the numbers and drops the name.
A fee the reader states goes in as `deductions.fee = { "pct": <pct>, "fixed": <fixed> }` with NO `preset` key, even when its numbers equal a preset's — a `preset` walks their own fee "assumed: the book's `<preset>` preset".

Each preset carries its own SCHEME, and the CLI reports the one it used: `ue evaluate`
prints `feeScheme` beside `deducted.fee` (`--explain` too), `null` when no fee is stated.

| Preset id | `feeScheme.base` | On a refund | On a dispute | After a year |
|---|---|---|---|---|
| `card_processor` | `charged` — the tax-inclusive amount | the cut is kept (`retained`) | `chargeback`: the flat `disputes.fee` on top | unchanged |
| `card_processor_billing` | `charged` | `retained` | `chargeback` | unchanged |
| `merchant_of_record` | `charged` | `retained` | `chargeback` | unchanged |
| `app_store_small` | `exTax` — the price NET of tax | the cut comes back (`returned`) | `refund`: no fee of its own | unchanged |
| `app_store` | `exTax` | `returned` | `refund` | `afterYearPct` 0.15 |

So a store row's commission is NOT computed the way a card fee is — name the base that row's
own `feeScheme` reports. Never say the store fee is treated like a card fee.

## What the deployed page reads (DEP-1 live)

The public page reads every key the CLI writes: `fee=` (all four fields, the provider scheme
included), `tax=`, `refunds=`, `disputes=`, `activation=`, `fees=`, `basis=`, `measured=` and
`upgrade=`, beside the chain, the volume, the products and `ds=`/`us=`. Checked on the deployed
page 2026-09-23, one key at a time: each link opened on the figures `ue evaluate` prints for
it. A card fee on the seed opens at $31.25 per tap (gross $32.46); a 30 % store fee on a
scenario with 20 % VAT inside the price opens at the ex-tax figure, $18.93, and the same link
with a `charged` base at its own $17.31; `basis=first` opens on the first-charge figures;
`measured=` fills the page's "Measured on" field; `upgrade=` opens as an upgrade, not an add-on.

So a link this CLI mints raises no `page_shows_gross`, and needs no sentence about the page.
The code stays for a key the CLI writes before the page reads it. When it fires, say the one
consequence its `keys` name:

| The unread keys | What the reader sees on the page |
|---|---|
| any deduction key (`fee`, `tax`, `refunds`, `disputes`, `activation`, `fees`) | "the page opens this scenario gross; the net figures are from the CLI" — the CLI's own message says GROSS in this case, and only in this one |
| any other key | the page ignores that key and opens the rest of the scenario: name the key, and say a figure it changes is the CLI's alone. Nothing about gross — the CLI's message for this case does not say it either |
