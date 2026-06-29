# First-run TEACH tutorial (narrated, composable)

TEACH mode walks the customer through a leg in plain language — narrating each
step, what to click, and what they should see — instead of doing it silently.
Each atom is small and composable: run one on its own ("how do I add a screen?")
or chain them for a full first-run ("show me how to build my first funnel").

Drive the customer's own project (after `segmently auth login`, no password).
Highlight the target and capture a screenshot per step so the customer can follow.
Describe the UI in human terms — never name internal element identifiers.

## Atoms

1. **Create a project / funnel.** From the project area, open the create wizard,
   name the funnel, pick the platform and language. What they should see: the new
   funnel opens on the canvas.
2. **Set a theme.** In the creation wizard (or the canvas theme editor), pick a
   theme card and adjust the main colours/fonts. What they should see: the preview
   updates to the chosen look.
3. **Add screens to the canvas.** Open the template/add panel and place the screens
   the funnel needs (e.g. intro → question → paywall). What they should see: the
   screens appear as nodes on the canvas.
4. **Connect screens.** Drag from a screen's action to the next screen to create a
   transition. What they should see: an edge connecting the two screens.
5. **Add a condition.** On a connection, add a rule so the path changes based on an
   answer or value (e.g. plan = teams → B2B screen). What they should see: the edge
   shows a condition and a fallback path exists.

## Composition
- Standalone: answer "how do I add a screen and connect it?" with atoms 3–4.
- Full first run: chain atoms 1→5 as one guided tutorial.
- Hand off to DO mode anytime: once the customer understands a step, offer to do
  the rest for them.

## After teaching
Point the customer to the matching help article when one exists, and offer the
next leg from `scenarios.md` (e.g. after building, "want me to connect analytics
and publish?").
