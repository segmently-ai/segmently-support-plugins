#!/usr/bin/env node
/**
 * build-evals.mjs — derive the skill-creator BEHAVIORAL eval set + the triggering
 * eval set from the single source of truth (references/scenarios.matrix.json).
 *
 * Outputs (regenerated, never hand-edited):
 *   evals/scenario-evals.json  — skill-creator schema {skill_name, evals:[{id,prompt,expected_output,expectations[]}]}
 *                                 one eval per scenario × language. `expectations` are DISCRIMINATING:
 *                                 correct leg + correct backend/delegate + correct verify + honesty + no-leak.
 *   evals/triggering.json      — [{query, should_trigger}] for skill-creator scripts/run_eval.py
 *                                 (all ru+en phrasings = should_trigger:true, plus negative controls).
 *
 * This file is part of the repeatable regression record: re-run to regenerate evals
 * after the matrix changes. It does NOT touch evals/evals.json (the static corpus guard).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');
const matrix = JSON.parse(readFileSync(join(skillRoot, 'references/scenarios.matrix.json'), 'utf8'));

// Per-scenario behavioral metadata derived from references/backends.md + project-status.md + SKILL.md.
// delegate/command come from the backends.md delegation table; handoff/teach are the special legs.
const META = {
  'create-funnel':           { leg: 'create a new funnel / onboarding',                       delegate: 'segmently-cli-guide', command: 'funnels create' },
  'set-theme':               { leg: 'apply or choose a theme for the funnel',                  delegate: 'segmently-cli-guide', command: 'themes set-active' },
  'add-screens':             { leg: 'add and order screens on the canvas',                     delegate: 'segmently-cli-guide', command: 'funnels screens / graph' },
  'configure-actions':       { leg: 'configure a screen action button (e.g. the continue button)', editorOnly: true },
  'connect-analytics':       { leg: 'connect analytics / tracking',                            delegate: 'segmently-cli-guide', command: 'analytics settings apply' },
  'add-fb-pixel':            { leg: 'add a Facebook / Meta pixel',                             delegate: 'segmently-cli-guide', command: 'analytics settings apply' },
  'add-tiktok-pixel':        { leg: 'add a TikTok pixel',                                      delegate: 'segmently-cli-guide', command: 'analytics settings apply' },
  'connect-stripe':          { leg: 'connect Stripe',                                          handoff: 'manual Stripe Connect OAuth consent in the app' },
  'create-paywall-products': { leg: 'create paywall products / plans',                         delegate: 'segmently-cli-paywall-ab-rollout', command: 'paywall products (sandbox/test mode)', note: 'defaults to sandbox/test mode unless production billing is explicitly requested' },
  'attach-products':         { leg: 'attach products to a paywall screen',                     editorOnly: true },
  'test-purchase':           { leg: 'run a sandbox test purchase',                             editorOnly: true, note: 'uses a Stripe test card in sandbox mode' },
  'configure-web-placement': { leg: 'configure a web placement',                              delegate: 'segmently-cli-guide', command: 'web-placements apply' },
  'configure-attribution':   { leg: 'configure attribution / Stripe metadata mapping',        editorOnly: true },
  'add-custom-domain':       { leg: 'go live on a custom domain',                              handoff: 'manual DNS records at the customer’s registrar' },
  'publish':                 { leg: 'publish and go live',                                     delegate: 'segmently-cli-guide', command: 'publish web' },
  'change-setting':          { leg: 'change an editor setting',                                editorOnly: true },
  'teach-first-run':         { leg: 'learn how to build a first funnel',                       teach: true },
};

const NO_LEAK =
  'Customer-safe per the skill\'s safety contract: the answer leaks nothing internal — no internal/admin ' +
  'skills or commands (e.g. segmently-cli-admin-guide, SEGMENTLY_CLI_INTERNAL), no non-production ' +
  'environment names (dev/stage/local/loopback), no data-testid values, no source-tree CLI paths, and ' +
  'no tokens/secrets/refresh-tokens. Production is the default. NOTE: naming a customer-facing delegation ' +
  'skill (segmently-cli-guide, segmently-cli-paywall-ab-rollout, etc.) is permitted by the skill spec ' +
  'and is NOT a leak — only internal/admin skills are forbidden.';

function expectationsFor(scenario, lang) {
  const m = META[scenario.id];
  const out = [];

  // 1. Correct leg / routing.
  out.push(`Correctly identifies the request as: ${m.leg} (the "${scenario.id}" leg).`);

  // 2. Correct backend / delegation.
  if (m.delegate) {
    out.push(
      'Offers a CLI path using the customer-facing `segmently` command for this leg ' +
      `(e.g. \`segmently ${m.command}\`) and also offers doing it in the editor on the customer's own ` +
      'project; it does NOT paste internal flags or reimplement the command internals.',
    );
  } else if (m.editorOnly) {
    out.push(
      'Offers to do it in the editor — drive the customer\'s own project (DO mode) or walk them ' +
      'through it (TEACH mode) — and describes the UI in human terms, not by internal identifiers.',
    );
  } else if (m.handoff) {
    out.push(
      `Treats it as a HANDOFF: gives the exact manual steps the customer must complete (${m.handoff}) ` +
      'and explicitly does NOT claim the step was performed automatically or say it is "done".',
    );
  } else if (m.teach) {
    out.push(
      'Responds in TEACH mode: narrates each step in plain language (what to click and what they ' +
      'should see) instead of silently performing it.',
    );
    out.push(
      'Covers the composable first-run atoms: create a project/funnel, set a theme, add screens to ' +
      'the canvas, connect screens, and add a condition.',
    );
  }

  // 3. Verify read (when the leg has one).
  if (scenario.verify) {
    out.push(
      `After the change, names the read-only verification "${scenario.verify}" (or describes the ` +
      'equivalent read) to confirm the new state for the customer.',
    );
  }

  // 4. Optional note (mode/safety).
  if (m.note) out.push(`Notes that this ${m.note}.`);

  // 5. Loop shape (non-teach legs follow clarify->explain->offer->verify).
  if (!m.teach) {
    out.push('Follows the launch loop shape: clarify the goal → explain in plain language → offer to do it (CLI/editor/handoff) → verify.');
  }

  // 6. No-leak (always).
  out.push(NO_LEAK);

  // 7. RU comprehension.
  if (lang === 'ru') {
    out.push('Maps the Russian-language request to the correct leg and answers helpfully, without failing to understand it or asking the customer to switch languages.');
  }

  return out;
}

const evals = [];
const triggering = [];
let id = 1;
for (const scenario of matrix.scenarios) {
  for (const lang of ['en', 'ru']) {
    const phrasings = scenario.sampleQueries[lang] || [];
    if (phrasings.length === 0) continue;
    const prompt = phrasings[0];
    evals.push({
      id: id++,
      scenario: scenario.id,
      lang,
      prompt,
      expected_output:
        `A customer-safe launch-guide answer for the "${scenario.id}" leg (${META[scenario.id].leg}) ` +
        `in response to a ${lang.toUpperCase()} request, ` +
        (META[scenario.id].teach
          ? 'narrating the first-run steps in plain language (TEACH mode).'
          : 'following clarify→explain→offer→verify.'),
      expectations: expectationsFor(scenario, lang),
    });
    // Triggering: EVERY phrasing should pull the skill in a clean (customer) env.
    for (const q of phrasings) triggering.push({ query: q, should_trigger: true, scenario: scenario.id, lang });
  }
}

// Negative controls — these must NOT trigger the launch guide.
for (const q of [
  'what’s the weather in London today',
  'write me a short poem about the sea',
  'refactor this python function to run faster',
  'что приготовить на ужин сегодня',
]) {
  triggering.push({ query: q, should_trigger: false, scenario: '(negative-control)', lang: 'n/a' });
}

const scenarioEvals = { skill_name: matrix.journey === 'launch-funnel' ? 'segmently-launch-guide' : 'segmently-launch-guide', evals };
writeFileSync(join(skillRoot, 'evals/scenario-evals.json'), JSON.stringify(scenarioEvals, null, 2) + '\n');
writeFileSync(join(skillRoot, 'evals/triggering.json'), JSON.stringify(triggering, null, 2) + '\n');

console.log(`scenario-evals.json: ${evals.length} behavioral evals (${matrix.scenarios.length} scenarios × langs)`);
console.log(`triggering.json:     ${triggering.length} queries (${triggering.filter(t => t.should_trigger).length} positive, ${triggering.filter(t => !t.should_trigger).length} negative controls)`);
