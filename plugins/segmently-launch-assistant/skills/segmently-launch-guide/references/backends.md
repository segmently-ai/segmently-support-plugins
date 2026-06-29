# Per-leg backend + verify (customer-safe)

How each leg is executed and how it is verified. CLI work is DELEGATED to the
owning `segmently-cli-*` skill — name the skill and the customer-safe command;
never reimplement it, never paste internal flags. The editor backend drives the
customer's own project after `segmently auth login` (no password).

| Leg | Backend | Owning CLI skill / editor | Verify (read) |
|---|---|---|---|
| Create a funnel | CLI or editor | `segmently-cli-guide` → `funnels create` | `funnels list` |
| Apply a theme | CLI or editor | `segmently-cli-guide` → `themes set-active` | `themes list` (active theme) |
| Add and order screens | CLI or editor | `segmently-cli-guide` → `funnels screens`/`graph` | `funnels export` |
| Configure action buttons | Editor | drive the screen editor | `funnels export` |
| Connect analytics | CLI or editor | `segmently-cli-guide` → `analytics settings apply` | `analytics settings get` |
| Add Facebook / TikTok pixel | CLI or editor | `segmently-cli-guide` → `analytics settings apply` | `analytics settings get` |
| Connect Stripe | Handoff + verify | manual OAuth consent in the app | `stripe account` |
| Create paywall products | CLI or editor | `segmently-cli-paywall-ab-rollout` (test mode) | `stripe products` |
| Attach products to paywall | Editor | drive the paywall screen editor | `funnels export` |
| Configure a web placement | CLI or editor | `segmently-cli-guide` → `web-placements apply` | `web-placements list` |
| Configure attribution / metadata | Editor | drive the placement dialog | `web-placements list` |
| Run a sandbox test purchase | Editor | drive checkout with a test card | `publish verify` |
| Go live on a custom domain | Handoff + verify | manual DNS at the registrar | `domains verify` |
| Publish and go live | CLI or editor | `segmently-cli-guide` → `publish web` | `publish verify` |
| Change any editor setting | Editor | drive the catalog control | `funnels export` |
| Show me how to build (teach) | Editor (teach) | narrate the steps | n/a |

## Handoff honesty
For Stripe Connect and custom domain, the customer must complete a step we cannot
automate (OAuth consent; DNS records). Give the exact manual steps, then run the
verify read and report the real state. Never say "done" for a handoff you did not
and cannot perform.

## Verify honesty
A few legs have no single read that proves them outright — the sandbox test purchase
(a reachable URL does not prove a card was charged) and the attribution / Stripe-
metadata mapping (the placement list confirms the placement exists, not that the
mapping landed). For these, the matrix carries a `verifyNote`: run the read, but
report it as partial and tell the customer what actually proves the leg (complete the
sandbox checkout end to end; confirm the mapping in the placement's configuration).
Never claim "done" from a read that only confirms an adjacent state.

## Stripe mode
Default to sandbox/test mode for paywall products and test purchases unless the
customer explicitly asks for a production billing setup.
