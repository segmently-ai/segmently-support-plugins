# UC-6 — Explain a scenario that does not clear
Route: pastes a segmently.ai/unit-economics link; "why doesn't it clear", "we lose money — where is the gap?" (SKILL.md § Router) · Eval: P6 · MCP: uc-6

## Turns
- None required: the pasted link (or the project) is the base. An input the reader states is filled
  in before the runs; nothing else is asked before the answer.

## Calls
- `npx -y @segmently/cli ue parse "<link>"` → `npx -y @segmently/cli ue evaluate "<link>" --explain` —
  the link itself while the reader states no change, so its `walk.lines` name "your link". No project:
  the variants go under `.ue/<slug>/` (a slug naming the reader's link), each a copy of `ue parse`'s
  `scenario` with ONE change.
- `npx -y @segmently/cli ue evaluate <variant>.json --explain` — each located cause (each product alone
  on the paywall; with and without each mechanic) and each bracket point, its own run (rule 9).
- The bracket per swept product knob (SKILL.md § The bracket): `paymentsCounted` (0.01) and
  `completionRate` (half a point) — always, even with one product, nothing deducted and no mechanic;
  a value worked out by hand is only where it starts, never a cell.
- `npx -y @segmently/cli ue link <file> --label '<name>'` — the reader's link re-minted from `ue parse`'s
  `scenario` with its `label` and a `measuredOn` set: the source the reader named; none named:
  "reader-stated, source not given" — also when every value on the link equals the book's
  ("benchmark book, nothing measured", SKILL.md § Files, is for a scenario the skill built, never for
  a link the reader pasted) — and both bracket points of every sweep.

## Answer skeleton
1. The gap: the two CLI values side by side (`requiredValuePerTap`, `valuePerTap`) and their absolute
   difference.
2. Where it sits: by product (each alone on the paywall), by deduction (the `waterfall` rows), by
   mechanic (with and without) — each from its own run. When all three come back empty (one product,
   nothing deducted, no mechanic), say only that; never conclude the gap is in the chain alone — the
   product's own knobs move value per tap too, and the sweeps are their runs.
3. The link's `words.breakEvens`, printed whole — the chain rows' `today` and `break-even` cells are its
   values. A rate listed in `breakEvens.unreachable` is not ranked at all — its line states it in words.
4. **Rank fixes by distance to break-even**, a table with exactly these columns:
   `lever | today | break-even | distance | measurable / belief`.
   - `today` and `break-even` are the two CLI values, side by side, in their own units; a swept knob's
     row names both bracket points, its `break-even` cell the first clearing point at its landed value.
   - `distance` is the ABSOLUTE difference in the lever's own unit — the difference of the two values
     exactly as printed in the `today` and `break-even` cells: "cps $1.50 → ≤ $0.90, $0.60 lower";
     "p3 35.0 % → ≥ 58.3 %, 23.3 points higher". A "% relative", "Δ %" or "×" column is a ratio you
     computed: never print one, and never rank by one.
   - Group the rows by unit — $ (cps) first, then points (p1, p2, p3 together), then each swept knob in
     its own unit (charges, then completion points) — and inside each group order by absolute
     distance, smallest first, whatever order `breakEvens.chain` prints them in; never call one lever
     "closest" or "the easiest" across units — each distance stands in its own unit.
   - `measurable / belief` is a required column, one word per row — a lever the reader can instrument
     and measure today (`cps`, `paymentsCounted`, `completionRate`, the chain rates their analytics
     already counts) vs one that is a belief until tested (a take, a chain step they do not
     instrument). A row with no verdict in that column is an unfinished table.
5. The links: `privacy.sentence` first when `privacy.due`; the reader's link re-minted and both bracket
   points of every sweep, each under the `ue link` call that minted it. The evaluate's own
   `measured_missing`, cured by that re-mint, is reported once: "`measured_missing` on the evaluate's
   link → re-minted with measured=<note>".
6. The verdict, then the boundary: `walk.opener`, the link's own `walk.lines`, then § Boundary's lines.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the link's own `walk.lines`
(`ue evaluate "<link>" --explain`; a pasted link carries no source note unless `measured=` is on it),
then:
- each sweep a rank row names, a line of its own at the landed values of both bracket runs: "the <knob>
  sweep points <last miss> and <first clearing> — assumed: a labelled sweep";
- not testable soon: each `belief` row of the rank table, until the reader instruments it.

## Stops
- A rate in `breakEvens.unreachable` is not ranked; its break-even above 100 % is never a target.
- A goal past clearing (an investor's ROAS, a payback month, a CAC) → `cases/uc-14-reach-a-goal.md`
  on this base: the break-evens here are that run's reading for a ROAS of 1.00×.
- A swept endpoint that comes back `clamped` is reported typed → landed on its row (rule 9).
