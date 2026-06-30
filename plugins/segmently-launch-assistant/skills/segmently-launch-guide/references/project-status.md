# Project status — milestones and "what's left"

Before doing anything, understand where the project already is so you only do
what's missing. Compose customer-safe CLI **reads** into a milestone snapshot,
then compare it to the goal. All reads are delegated to `segmently-cli-guide`.

## Milestones and the read that observes each

| Milestone | Read | done when |
|---|---|---|
| Funnel created | `funnels list` | at least one funnel exists |
| Theme applied | `themes list` (active theme) — or `funnels get` for a funnel-attached theme | the project has an active theme, or the funnel references a source/project theme |
| Analytics connected | `analytics settings get` | a provider is configured |
| Facebook pixel | `analytics settings get` | a Facebook pixel id is set |
| TikTok pixel | `analytics settings get` | a TikTok pixel id is set |
| Stripe connected | `stripe account --mode test` and `stripe account --mode live` | the requested mode reports connected; sandbox/test connected with live disconnected still means test payments can be prepared while live charges need live Stripe Connect |
| Paywall products created | `stripe products` | at least one product exists |
| Products attached to paywall | `funnels export` | a paywall screen lists products |
| Sandbox purchase verified | test purchase + `publish verify` | a test purchase completed |
| Web placement configured | `web-placements list` | a placement is attached |
| Attribution configured | `web-placements list` | source/metadata mappings exist |
| Custom domain verified | `domains verify` | verification is ready (or default chosen) |
| Published | `publish verify` | the live URL is reachable |
| Launch verified | `publish verify` | the funnel was checked at the chosen depth |

## Goals and "what's left"

A goal is a set of milestones. Common goals:
- **First-value launch** — funnel + theme + screens + publish.
- **Monetized launch** — adds Stripe + paywall products + attach + test purchase.
- **Ads-ready paid launch** — adds analytics + pixels + placement + attribution.
- **Full production launch** — adds custom domain + deeper verification.

A project can pursue several goals at once. For each goal, report:
1. milestones already **done**,
2. the **next missing** milestone,
3. the **shortest next action** to advance it.

Some launch steps are human decisions, not reads (e.g. the product strategy, the
screen blueprint). Those stay "to do" until the customer provides them — say so
honestly rather than implying they are complete.

## Note on persistence
The milestone snapshot is cached per project so progress survives across sessions.
It is derived from reads — never a separate source of truth. Re-read to refresh.
