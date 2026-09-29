# UC-5 — Compare N variants / sweep one knob
Route: "compare", "what if <an input> is X" (a price, a cost per start), a sweep (SKILL.md § Router) · Eval: P5 · MCP: uc-5

## Turns
- The axis or the named edits come with the message: one base, one axis or a list of named edits (cps
  1.50 → 2.20; monthly-first vs annual-first takes; 4-week at $9.99 vs monthly at $19.99; a ladder from
  an anchor; `basis: "first"` vs `"ltv12"`).
- "In steps": the reader's points; none named → the knob's grid step (SKILL.md § The bracket) from the
  base to the end, at most 8 runs, each row labelled.
- Cadence guard: a 4-week or 12-week plan has no book charge count — ask the reader for
  `paymentsCounted` instead of comparing 2.86 monthly charges with 1.

## Calls
- A ladder from an anchor:
  `npx -y @segmently/cli ue init <slug>-ladder --anchor <price> --dir .ue/<slug>/scratch`.
- `npx -y @segmently/cli ue evaluate <variant>.json --explain` — one run per row, the base included,
  each variant the base with ONE edit (rule 9).
- `npx -y @segmently/cli ue link <variant>.json --label '<name>'` — one per row.

## Answer skeleton
1. The table, one row per run: the base value, the variant value and their absolute difference beside
   both, and `readiness.line` whole on every row — all its clauses, as that row's run printed it (a
   clause whose day count moves between rows is never dropped). Every cell of a row comes from that
   row's own run, with its own `clamped` notices, and a sweep point outside a window is labelled with
   its LANDED value (rule 9).
2. Each row's `words.breakEvens`, printed whole under the row's name — cps, p1, p2, p3, each in its own
   unit beside the value it starts from; never one called "closest" across units.
3. The links: `privacy.sentence` first when `privacy.due`, each link under the `ue link` call that
   minted it.
4. The verdict, then the boundary: `walk.opener`, the base's `walk.lines`, then the lines of § Boundary.

## Boundary
Assembled (SKILL.md § The boundary) from the rendered walk: `walk.opener`, the base's `walk.lines`,
then the swept axis — the reader's own question, not evidence: every point on it is assumed unless they
measured it, a line of its own at its landed values ("<the knob> at <points> — assumed: a labelled
sweep"), and the sweep moves ONE input.

## Stops
- A cadence with no book charge count and no `paymentsCounted` from the reader: no row for it yet.
- A point typed outside a control's window comes back `clamped` — typed → landed on its own row.
- To test this change: `cases/uc-13-test-an-offer-change.md`, with the variant file as `--variant`.
