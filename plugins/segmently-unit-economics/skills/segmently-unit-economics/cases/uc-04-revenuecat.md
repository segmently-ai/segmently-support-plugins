# UC-4 — RevenueCat: observed inputs → scenario
Route: has or asks about RevenueCat (SKILL.md § Router) · Eval: P4 · MCP: uc-4, revenuecat
The procedure is below: Turns, Calls, Answer skeleton, Boundary, Stops.

## Turns
1. **Connect** — skipped when RevenueCat read tools are present in this session: it runs on the
   READER's own RevenueCat MCP connection, never a key through this skill (not connected: § Stops).
2. **Match** — the reader matches RevenueCat products to paywall products by name.

## Calls
- Read tools only: `get-overview-metrics`, `get-revenue-metric`, `get-chart-data`,
  `get-chart-options-schema`, `get-benchmarks`, `list-experiments`, `get-experiment`,
  `get-experiment-results`. Never `create-`, `start-` or `publish-` tools. Never cost per start or
  chain rates from RevenueCat.
- The pulls, with maturity rules: `trial_conversion_rate` by product → `products[i].trialConv`
  (cohorts older than trial days + 3); `subscription_retention` → `paymentsCounted` = 1 + the sum of
  the observed retained periods (input preparation: list the periods and the sum, labelled "your
  numbers, prepared"; partial, no extrapolation); `refund_rate` → `deductions.refunds` (basis: all
  transactions — label it); revenue types → tax share and fee share (input preparation: show both
  revenue figures; label "as RevenueCat reports proceeds").
- Append an observed-inputs document to `observed[]` (`{ "kind": "observed_inputs", "v": 1, "source":
  "revenuecat", "window": … }`), apply the values to the scenario, set
  `measuredOn = "RevenueCat <window>"` (SKILL.md § Files: re-basing moves the old base into
  `variants[]` first).
- `npx -y @segmently/cli ue evaluate .ue/<slug>.json --explain` (the stage becomes `live_measured`),
  then `npx -y @segmently/cli ue link <file> --label '<name>'` on the updated project.

## Answer skeleton
1. The pulls, each with its window, and every prepared figure with both operands, labelled "your
   numbers, prepared" (a partial retention sum says partial).
2. The `observed[]` document appended and `measuredOn = "RevenueCat <window>"` set.
3. The evaluate: `stage` `live_measured`, the KPIs, then the drift check (references/stages.md) — each
   observed value beside the scenario's input, with the absolute difference.
4. The link: `privacy.sentence` first when `privacy.due`, the `ue link` call, then the link.
5. The boundary: `walk.opener`, the re-based base's `walk.lines`, then the line of § Boundary.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the re-based base's
`walk.lines` — whatever the base now carries from RevenueCat walks there, with its window — then not
testable soon: what RevenueCat has not observed yet (retained periods past the window, trial cohorts
younger than trial days + 3).

## Stops
- **Not connected** (no RevenueCat read tool is available in this session): print
  `claude mcp add --transport http revenuecat https://mcp.revenuecat.ai/mcp` as THE step to run to
  connect it, ask for no key, and change nothing in the scenario's inputs; the one write is the
  onboarding base link's `measuredOn` (references/stages.md), said in one line; nothing is recorded —
  SKILL.md § Files. Stop there until the reader has connected it.
- A RevenueCat tool that writes (`create-`, `start-`, `publish-`) is never called.
