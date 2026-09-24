# Project state, stages, onboarding, drift

## The project file — `.ue/<slug>.json`

Written by `npx -y @segmently/cli ue init <slug> …` in the reader's project (or under
`--dir <path>`). One file per project, no secrets in it. Every nested document is a format the
calculator already reads: `scenario` is the scenario JSON (`"v": 2`) that `ue evaluate`,
`ue link` and `ue parse` accept, and the project file itself is accepted by them too.

```json
{
  "kind": "ue_project", "v": 1, "slug": "my-app",
  "createdAt": "2026-09-22T10:00:00Z", "updatedAt": "…",
  "stage": { "value": "pre_launch",
             "derivedFrom": ["scenario present", "chain knobs untouched (book)", "no observed inputs"],
             "overriddenBy": null },
  "platform": "web",
  "scenario": { "v": 2, "…": "the base case" },
  "observed": [ { "kind": "observed_inputs", "v": 1, "source": "revenuecat", "window": {}, "…": "…" } ],
  "sources": { "revenuecat": "absent", "segmentlyFunnel": null, "adExport": null },
  "variants": [ { "name": "trial a q55", "case": "UC-1", "question": "…", "scenario": {}, "link": "…", "verdict": "…", "createdAt": "…" } ],
  "decisions": [ { "date": "…", "case": "UC-0", "verdict": "run the first test", "boundary": "book chain; nothing observed" } ],
  "next": ["UC-8", "UC-2"]
}
```

- `variants[]` entries need `name`, `case`, `scenario`, `link`, `createdAt`.
- The RevenueCat connection is the reader's MCP's, never a key in this file.
- A link with the reader's real numbers goes into this file only after the privacy sentence.
- `updatedAt` changes on every write; `createdAt` never does.

## `ue init` — three questions, then the first case runs

One question per turn; stop early when an answer makes the rest moot.

1. What do you sell, at what price and cadence? — or "not decided" → `--anchor <monthly price>`.
2. Where is the payment taken? — web checkout / app store / both → `--platform web|store|both`.
3. What do you already have? — nothing / ad numbers / an analytics funnel / RevenueCat / a
   Segmently funnel → `--have none|ads|analytics|revenuecat|segmently`.

Then `ue init`, print the onboarding screen, and run the stage's first case immediately
(UC-0 for an idea, UC-3 for data).

## Stages — derived, never typed

`ue init` and `ue evaluate .ue/<slug>.json` return `stage` with its evidence (`derivedFrom`).
Read it; never set it by hand. If the reader disagrees, record their reading in
`stage.overriddenBy` and keep the derived one beside it.

| Stage | Signal in the state | Offered first | Also offered |
|---|---|---|---|
| **idea** | no scenario, or a price only (`--anchor`) | UC-0 launch card | UC-5 ladder from the anchor; UC-2 platform choice |
| **pre_launch** | scenario present; chain knobs untouched (book); no observed inputs | UC-0 learning budget + instrument list | UC-2 fee stacks; UC-8 test plan |
| **live_no_data** | chain knobs touched by the reader; no monetization observations | UC-3 fill from the ad export | UC-10 (one `ue rank` run over all eight levers — the chain is theirs; every other input labelled by where it came from, never called the book's without checking); UC-11 hypothesis card; UC-6 explain what does not clear |
| **live_measured** | at least one observed-inputs document | UC-10 with the drift check above it | UC-11 hypothesis card (metric first, then the change, its test plan and the read); UC-1 trial; UC-5 sweeps; UC-7 mechanics; UC-4 refresh |
| **scaling** | measured; net ROAS ≥ 1; payback inside the horizon | UC-9 ad-account view; volume sweep at 2× spend | UC-2 re-check at scale |

The CLI does not derive `scaling` in this version; offer it when an evaluation of a measured
project shows net ROAS ≥ 1 and a payback inside 12 months, and say that is your reading.
A stage never moves backwards silently: losing a source prints "measured inputs are N days
old", not a demotion.

## Onboarding — the first screen

The first message opens with one screen, and the contract is its first line, verbatim
(SKILL.md, "Contract"). When the reader's opening message already names a case, continue into
that case in the same message, after the onboarding screen, with at most one question closing the
turn. The three offers are the `offers` array `ue init`
returned (or the stage table's row), each naming its case so the reader can answer "2".

The base-case `<link>` is never the `link` field `ue init` returned: set `measuredOn` in the
scenario (`"benchmark book, nothing measured"` for a fresh project) and re-mint it with
`npx -y @segmently/cli ue link .ue/<slug>.json --label '<name>'` — single quotes, so the shell
leaves a `$` price alone — then quote that link and handle its warnings.

The base-case link goes on the screen at every stage, on the line under the `ue link` call that
minted it. The stage does not decide privacy; what the link carries does (SKILL.md, the one loop,
step 5). Whenever the link carries a figure the reader stated about their business — the prices
of a paywall they already sell included, at `idea` and `pre_launch` too — print the privacy
sentence on its own line above it: "This link carries your numbers in plain text — browser
history, referrers and analytics can see it. I can give you the JSON file instead." A price read
from the project file is the reader's figure: print the privacy sentence before every link that
carries it — the onboarding screen's base link included — unless the reader said in this session
that the price is still being chosen; never call such a link "the book's numbers". Only a link of
book values alone, plus the price of a product the reader said in this session is still being
chosen, goes on the screen without it. When unsure, print it.

The screen below is a real run's — `ue init my-app --product "Monthly~19.99~1month~7d-free"
--product "Annual~119.99~1year~none" --platform web --have none`, then `ue evaluate
.ue/my-app.json --explain` — on a found project file: its prices are the reader's figures, so
the privacy sentence stands on its own line above the `ue link` call and the link under it.

```
I never: forecast your numbers, invent a benchmark, write to RevenueCat or Segmently,
or put a figure you did not give me into a link.

Project: my-app · stage: pre_launch (scenario present, chain knobs untouched (book), no observed inputs)
Base case: Monthly $19.99 (7-day free trial) · Annual $119.99 · ROAS 0.89 gross

This link carries your numbers in plain text — browser history, referrers and analytics can see it. I can give you the JSON file instead.
npx -y @segmently/cli ue link .ue/my-app.json --label '<name>'
<link>

I can, from here:
  1. Learning budget and what to instrument before the first $1,000 of ads   (UC-0)
  2. Web checkout vs store on this paywall — fees, tax, refunds, disputes    (UC-2)
  3. How long a paywall test needs at your daily budget                      (UC-8)
```

The screen quotes only what the base evaluate printed: every plan on the paywall with its price,
ROAS on the `valueBasis` it states, the stage. The platform is no evaluate field — name it only
when the reader named it, or when `ue init`'s answer in this session or the found project file's
`platform` field carries it; say which ("web, from your project file").

## Drift check (live_measured and later)

When a new observation arrives, compare it with the scenario's inputs and print both values
with their absolute difference beside them — "trial conversion observed 41 % vs scenario
50 % (9 points lower); charges 2.31 observed through period 6 (partial) vs 2.86 (0.55
fewer)" — then offer to re-base: the old base becomes a named
variant in `variants[]`, never overwritten. The new link's `measured=` note records the
window.
