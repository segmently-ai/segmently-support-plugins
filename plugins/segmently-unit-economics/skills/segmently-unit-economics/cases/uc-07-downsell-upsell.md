# UC-7 — Downsell / upsell wiring
Route: downsell, upsell, plan upgrade — what one does to value per tap (SKILL.md § Router) · Eval: P7 · MCP: uc-7

## Turns
1. Upgrade or add-on: a plan upgrade (monthly → annual REPLACES the plan) or an add-on beside it. Ask
   which one it is — counting an upgrade as an add-on overstates it. The reader cannot say → both, each
   its own evaluate run, row and link, the verdict for each, the upgrade row named as the one that
   does not overstate.
2. The conversion — ask once (the book's own conversions: 15 % for a downsell, 10 % for an upsell or
   upgrade — never say the book has none; a stated value equal to it is "assumed: your belief (equal to
   the book's)" in the boundary, § Boundary); declined → the break-even `conv` by the bracket, its points
   labelled "sweep points, not an estimate" — never one assumed value in the headline.
- A target the reader names by price only ("a Lite plan at $4.99") is the book's Lite: monthly
  (`1month`), no trial, completion 100 %, charges 2.86 — the seed's `Lite monthly`, `onPaywall: false`.
  Build it at once at the reader's price; never ask for its cadence, trial, charges or completion.
  Ask only for a cadence the book has no charge count for (4-week, 12-week).
- One mechanic stated whole, another only named: run the whole one at once, in this message; the ONE
  question closing the turn is about the open one (Turn 1's, then Turn 2's).

## Calls
- JSON: `products[owner].downsell = { "product": "<target name>", "conv": 0.15 }` and
  `mechanics.downsell = true`; upsell the same under `upsell` / `mechanics.upsell`; an upgrade is
  `upsell = { product, conv, kind: "upgrade" }`. Targets are referenced by NAME, names must be unique;
  a target usually sits off the paywall (`onPaywall: false`). Link: `ds=<owner>~<target>~<conv %>`,
  `us=…` for an add-on, `upgrade=` for an upgrade — the public page reads `upgrade=` and opens it as an
  upgrade, on the figures the CLI prints.
- `npx -y @segmently/cli ue evaluate <file> --explain` — without the mechanic and with it, and per
  sweep point; every row its OWN run (rule 9).
- The break-even `conv` — SKILL.md § The bracket, on `conv` (floor 1 %; caps 60 % for a downsell and
  50 % for an upsell — a clamped end reported typed → landed).
- `npx -y @segmently/cli ue link <file> --label '<name>'` — every row and both bracket points.

## Answer skeleton
1. The table: value per tap with and without the mechanic, the absolute difference beside both; every
   row — "downsell alone", "downsell + upgrade", each sweep point — is its OWN evaluate run, and its
   `payback` is read from that run: a downsell moves payback even where it leaves CAC per payer
   untouched.
2. The break-even `conv` (SKILL.md § The bracket): the first point whose own run clears, beside the
   last that did not, both at their landed values.
3. The links: `privacy.sentence` first when `privacy.due`, each link under the `ue link` call that
   minted it.
4. The verdict — for each row when the reader could not say upgrade or add-on — then the boundary:
   `walk.opener`, the base's `walk.lines`, then the lines of § Boundary.
5. The one question, while Turn 1's or Turn 2's is open.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines`
(without the mechanic), then the mechanic's own lines, each a bullet:
- its target's lines from the with-run's `walk.lines`, word for word — its offer and its charges (a
  target has no completion line: the math does not read it); a target built from a price alone adds
  "<target>'s cadence, trial and charges — assumed: the book's Lite";
- a target price the reader stated, a line of its own printed in place of the with-run's offer line
  — one input, one class: "<target>: $<price> — assumed: your belief" (named with a cadence:
  "<target>: $<price>, <the cadence and trial they named> — assumed: your belief") —
  "assumed: your belief (equal to the book's)" when it equals the seed's;
- its conversion, a line of its own printed in place of the with-run's conversion line (which walks a
  value equal to the book's "assumed: the book" and any other "measured: … (the book's is …)") — one
  input, one class: "<owner>'s <mechanic> to <target> converts <x> % — assumed: your belief" — "assumed:
  your belief (equal to the book's)" when it equals the book's 15 % / 10 %;
- swept points and both bracket points — assumed: a labelled sweep, at their landed values;
- not testable soon: the mechanic's real take — it needs the `readiness.line` days of buy-taps.

## Stops
- A `conv` typed below 1 % lands on 1 %, above its cap on the cap: typed → landed, on its own row.
- A target cadence with no book charge count and no `paymentsCounted` from the reader: no row for it yet.
