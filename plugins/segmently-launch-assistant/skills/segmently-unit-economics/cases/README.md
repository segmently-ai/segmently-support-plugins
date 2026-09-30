# Worked cases — numbers from real CLI runs

Every figure of the worked cases was produced by `segmently ue` (CLI 1.6.0, `mathHash`
`2348961abb1d54fd916e788bef12158afc63ab8584e51c345725797eaf28a20b`). The command is written
above each table; a variant is the base JSON with the edit named in its row, evaluated with
`npx -y @segmently/cli ue evaluate <variant>.json --explain`. If `--version` prints a
different CLI version or `mathHash`, re-run the commands instead of quoting these numbers.

These are scenarios on the book's chain (cost per start $1.50, 30 % → 50 % → 35 %), not a
view of any real product.

**The seed scenario** used by UC-1, UC-2 and UC-10 is the calculator's default paywall (Monthly
$19.99 and Annual $119.99 on the paywall, Lite monthly and a one-time add-on aside, $45,000
a month). Get its JSON with:

```bash
npx -y @segmently/cli ue parse "https://www.segmently.ai/unit-economics?v=2&label=&cps=1.5&p1=30.0&p2=50.0&p3=35.0&vol=45000:budget_month&p=Monthly%20subscription~19.99~1month~none~25.50~100.0~2.86~&p=Annual%20subscription~119.99~1year~none~14.90~100.0~1.00~&off=Lite%20monthly~4.99~1month~none~~100.0~2.86~&off=One-time%20add-on~29~once~none~~100.0~1.00~"
```

and save its `scenario` field as `seed.json`.

## Catalog

<!-- sizes:begin -->
| UC | Title | File | Procedure lines | File lines |
|---|---|---|---|---|
| UC-0 | Is this worth launching, and at what numbers? (idea, pre_launch) | `cases/uc-00-launch-card.md` | 80 | 217 |
| UC-1 | Should part of the users see the same plan with a trial? | `cases/uc-01-trial-or-not.md` | 77 | 163 |
| UC-2 | Web checkout vs store: the same paywall under two fee stacks | `cases/uc-02-web-vs-store.md` | 77 | 166 |
| UC-3 | Fill the reader's numbers and open the link | `cases/uc-03-your-numbers.md` | 65 | 146 |
| UC-4 | RevenueCat: observed inputs → scenario | `cases/uc-04-revenuecat.md` | 50 | 50 |
| UC-5 | Compare N variants / sweep one knob | `cases/uc-05-compare-or-sweep.md` | 42 | 42 |
| UC-6 | Explain a scenario that does not clear | `cases/uc-06-why-not-clearing.md` | 66 | 66 |
| UC-7 | Downsell / upsell wiring | `cases/uc-07-downsell-upsell.md` | 67 | 67 |
| UC-8 | Test plan for a change | `cases/uc-08-test-plan.md` | 80 | 185 |
| UC-9 | What your ad account reports | `cases/uc-09-ad-account.md` | 40 | 40 |
| UC-10 | Which experiment first: gain and cost to learn | `cases/uc-10-which-experiment-first.md` | 51 | 151 |
| UC-11 | Hypothesis card: which metric, then which change | `cases/uc-11-hypothesis-card.md` | 80 | 481 |
| UC-12 | Growth cycle: from the economics to a measured change, and back | `cases/uc-12-growth-cycle.md` | 80 | 291 |
| UC-13 | Test a change to the offer | `cases/uc-13-test-an-offer-change.md` | 79 | 212 |
<!-- sizes:end -->
