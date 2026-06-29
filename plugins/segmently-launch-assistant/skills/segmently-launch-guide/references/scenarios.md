# Launch scenarios (customer-safe index)

The end-to-end goal is **launch a paid web funnel**: create it, make it look right,
make it measurable, make it sell, and put it live. Each leg below runs on its own
or as part of the whole journey. The machine-readable source is
`scenarios.matrix.json`; this page is the human view.

For each leg: clarify → explain in plain language → offer to do it (CLI / editor /
handoff) → verify. Never expose test ids, atom ids, or internal commands.

## Project setup
- **Create a funnel** — start a new onboarding. "done" = the funnel exists.
- **Apply a theme** — choose the look (colours, fonts) before editing screens.
- **Connect analytics** — start tracking onboarding and payment behavior.
- **Add a Facebook pixel** / **Add a TikTok pixel** — ad-platform tracking.
- **Connect Stripe** — authorize payments (handoff: the Stripe consent is
  user-initiated; we verify after).
- **Create paywall products** — define the plans/prices the paywall sells
  (sandbox/test mode by default).

## Build the funnel
- **Add and order screens** — lay out the screen sequence.
- **Configure screen action buttons** — set the primary button text/behavior.
- **Attach products to a paywall screen** — show the right plans on the paywall.
- **Change any editor setting** — any field on any screen (colour, spacing, text…).
  Explained with the per-screen help articles (e.g. Title, Subtitle, Paywall).

## Route traffic and attribution
- **Configure a web placement** — make the funnel reachable on the web with the
  right entry rules.
- **Configure attribution and Stripe metadata** — keep email, UTM, and click ids
  for analytics and checkout.

## Publish and verify
- **Run a sandbox test purchase** — prove checkout works end to end with a test card.
- **Go live on a custom domain** — handoff: add DNS records (or use the default
  domain); we verify after.
- **Publish and go live** — produce the live URL.

## Learn (first run)
- **Show me how to build my first funnel** — a guided, narrated walkthrough:
  create a project, set a theme, add screens to the canvas, connect them, and add a
  condition. See `teach.md`. Each step is small and composable.

## Clarification rule
When a request maps to more than one leg (e.g. "set up the paywall" could mean
create products, attach products, or style the paywall), ask ONE question to pick
the leg, then proceed. Do not guess silently when the legs have different effects.

