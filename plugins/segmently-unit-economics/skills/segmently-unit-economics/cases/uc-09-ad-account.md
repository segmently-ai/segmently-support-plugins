# UC-9 — What your ad account reports
Route: "what Ads Manager shows", a ROAS mismatch (SKILL.md § Router) · Eval: P9 · MCP: uc-9

## Turns
- Which figures the reader reads off the ad account, and its window — what the message carries is not
  asked.
- The reader's own words are never echoed where rule 8 bans them: their "Meta will show" is answered in
  the present tense — "the ad account reports", "the CLI prints".

## Calls
- `npx -y @segmently/cli ue evaluate <file> --explain` — the scenario as it stands (its `valueBasis`).
- The gross variant — a copy with `deductions` emptied, its own run: ROAS on list price is its
  `kpis.roas` (nothing deducted: no second run — the two coincide).
- The first-charge view — a copy with `basis: "first"`, its own run.
- `npx -y @segmently/cli ue link <file> --label '<name>'` — each run the answer shows.

## Answer skeleton
1. The rows of references/fields.md § The ad account's figures that the reader's figures need, each
   with its CLI field, read from the run the row names — the base, the gross variant, the
   `basis: "first"` run. A cost-per-purchase question always takes the CAC per paying customer row
   beside its n/a (`kpis.cacPerPayer`, named per paying customer — payers, never purchase events), and
   a ROAS question takes the net ROAS row. The two windows are named, never reconciled.
2. A free trial on the web: the platform optimises on cards that may never pay — say it.
3. The links: `privacy.sentence` first when `privacy.due`, each under the `ue link` call that minted it.
4. ONE verdict sentence read off the base run, in the present tense (which figure the account's and the
   CLI's differ on).
5. The boundary: `walk.opener`, the base's `walk.lines`, then the lines of § Boundary.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines`,
then:
- whatever the reader read off their ad account — measured: the account, in the reader's words;
- the value basis (`basis`) the scenario carries — assumed;
- not testable soon: the platform's own attribution — this CLI has no view of it, and the two windows
  are named, never reconciled.

## Stops
- Cost per purchase: n/a ("this CLI version does not compute it yet") — never `kpis.requiredValuePerTap`,
  never derived from `purchasesPerMonth`.
