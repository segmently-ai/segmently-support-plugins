# Workflow 1 — Drive Claude Design well

The goal here is to get a **good, reusable** design out of Claude Design with the fewest wasted
turns, in a form that's ready for the Segmently import workflows. Claude Design is conversational
and remote (`claude.ai/design` or Claude Desktop), so most of this is a playbook you give the user
or follow alongside them — not something a subagent can automate.

## Why context-first beats prompt-first

Claude Design generates against whatever context it has. With no design system it invents one, and
you spend later turns fighting drift. With tokens, type, spacing, and components loaded up front,
the first draft already sits inside your brand — so iteration becomes *refinement* instead of
*correction*. Front-loading context is the single highest-leverage habit.

## Intake checklist (answer before opening the canvas)

1. **Surface & goal** — onboarding screens? a paywall? a pitch deck? Name the concrete artifact.
2. **Audience / tone** — Claude Design asks clarifying questions (audience, duration, narrative for
   decks). Answer them; the output quality tracks directly with these answers.
3. **Design system source** — where do brand tokens/components come from (GitHub repo, design file,
   or codebase)? For Segmently, that's your Theme V2 tokens + your design-system components. If the
   Claude Design project has no system yet, run **Workflow 2** first to push one.
4. **Visual references** — gather screenshots, competitor products, wireframes, inspiration to
   attach. Upload these early so Claude infers layout/style instead of guessing.

## Steps

1. **Create/open the project** so it inherits the org's design system. Attach the system (GitHub /
   design files / codebase) and the reference materials from intake.
2. **Stabilize the brief in normal chat first.** Work out the requirements, copy, and structure in a
   regular Claude conversation; move to Claude Design only once the brief is stable. This avoids
   burning canvas turns on requirement discovery.
3. **Generate the first draft**, then **test the flow** before editing anything.
4. **Refine surgically.** Prefer **inline comments** on the exact element/region and **direct canvas
   edits** over broad "make it better" chat prompts — targeted feedback is easier for Claude to
   apply and far less likely to regress unrelated parts. Reserve chat for genuinely structural
   changes.
5. **Don't regenerate from scratch.** Save versions; duplicate a good output as a **template** for
   the next screen. Regeneration throws away the refinements you already paid for.
6. **Export / hand off** (next section).

## Known limitations & workarounds (from the article)

- **Inline comments may not persist** reliably → if a comment is lost, **paste the feedback directly
  into the chat** as the workaround.
- **Large codebases can lag** the canvas → keep the imported system lean; push only the components
  you need (Workflow 2 is incremental by design).
- **Multi-person editing is basic** → coordinate edits; don't rely on concurrent collaboration.
- **Usage**: Claude Design counts toward the **shared** usage limits (same pool as chat + Claude
  Code) — there's no separate allowance, so batch related work into focused sessions.

## Export → which Segmently workflow

The Export button offers `.zip`, PDF, PPTX, Canva, standalone HTML, "Handoff to Claude Code", and
integrations (Adobe, Gamma, Vercel). For Segmently:

| You exported… | Feed it to |
|---|---|
| **Standalone HTML** of onboarding screens | Workflow 3 → WebEmbed custom screens ([import-custom-screens.md](import-custom-screens.md)) |
| **Design tokens / a styleguide screenshot** | Workflow 4 → native Theme V2 ([import-native-theme.md](import-native-theme.md)) |
| A full component library (code) | Workflow 2 push (round-trip) or hand off to Claude Code directly |

## Handoff notes format

When handing a Claude Design result to engineering (or to workflow 3/4), capture:
`design source URL`, `target Segmently project/onboarding`, `which screens`, `the export format
used`, and `any tokens that were normalized/approximated` — so the import step has provenance and
the user knows what was lossy.
