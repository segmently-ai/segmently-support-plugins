#!/usr/bin/env node
/**
 * Read-only launch progress runner for installed Segmently launch skills.
 *
 * Wraps `segmently launch preflight` (a read-only readiness checklist) and
 * maps its checks onto the customer-facing launch milestones from
 * references/project-status.md. Returns which milestones are done, which are
 * left for the selected goal, and the single shortest next action.
 *
 * Honesty contract: milestones the preflight cannot observe are reported as
 * `not-checked-automatically` with the manual read that would observe them.
 * This runner never mutates data and never claims completion.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildToolPreflight } from './tool-preflight.mjs';
import { buildAuthPreflight } from './browser-auth-bridge.mjs';
import { resolveProjectContext } from './session-context.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let outputArgs = {};

const GOALS = ['first-value', 'monetized', 'ads-ready', 'full'];

// Milestones from references/project-status.md. checkIds bind preflight
// evidence; milestones with no checkIds are not observable by the preflight
// yet (tracked in the maintainer gap register in the Segmently repo) and are
// reported as not-checked-automatically with their manual read.
const MILESTONES = [
  { id: 'funnelCreated', label: 'Funnel created', checkIds: ['funnel.version.v2'], read: 'segmently funnels list', goals: ['first-value'], next: { actionId: 'launch.funnel.create', description: 'Create the first funnel.' } },
  { id: 'themeSet', label: 'Theme applied', checkIds: ['theme.active'], read: 'segmently themes list', goals: ['first-value'], next: { command: 'segmently themes set-active', description: 'Pick and activate a project theme.' } },
  { id: 'screensConnected', label: 'Screens added and connected', checkIds: ['funnel.graph.connected'], read: 'segmently funnels export', goals: ['first-value'], next: { articleAlias: 'launch-paid-funnel-overview', description: 'Add screens to the canvas and connect them.' } },
  { id: 'variablesBound', label: 'Required variables bound', checkIds: ['variables.required'], read: 'segmently funnels export', goals: ['monetized'], next: { articleAlias: 'collect-email-before-paywall', description: 'Capture the email variable before the paywall.' } },
  { id: 'stripeConnected', label: 'Stripe connected (test mode)', checkIds: ['stripe.sandbox.connected'], read: 'segmently stripe account --mode test && segmently stripe account --mode live', goals: ['monetized'], next: { actionId: 'handoff.stripe.connect', description: 'Connect Stripe through the Integrations page (customer handoff).' } },
  { id: 'paywallProductsAttached', label: 'Paywall screen with products', checkIds: ['paywall.present'], read: 'segmently stripe products && segmently funnels export', goals: ['monetized'], next: { actionId: 'launch.paywallProducts.create', description: 'Create sandbox paywall products and attach them to the Paywall screen.' } },
  { id: 'webPlacementConfigured', label: 'Web placement configured', checkIds: ['webPlacement.exists'], read: 'segmently web-placements list', goals: ['ads-ready'], next: { articleAlias: 'launch-paid-funnel-overview', description: 'Create the web placement for the funnel.' } },
  { id: 'attributionConfigured', label: 'Facebook/source attribution configured', checkIds: ['webPlacement.facebookAttribution'], read: 'segmently web-placements list', goals: ['ads-ready'], next: { articleAlias: 'facebook-pixel-capi-setup', description: 'Add source/attribution URL parameters to the web placement.' } },
  { id: 'analyticsConnected', label: 'Analytics provider connected', checkIds: [], read: 'segmently analytics settings get', goals: ['ads-ready'], next: { actionId: 'launch.analytics.pixel.apply', description: 'Connect the analytics provider and pixels.' } },
  { id: 'facebookPixel', label: 'Facebook pixel configured', checkIds: [], read: 'segmently analytics settings get', goals: ['ads-ready'], next: { articleAlias: 'facebook-pixel-capi-setup', description: 'Set the Facebook pixel id and events API.' } },
  { id: 'tiktokPixel', label: 'TikTok pixel configured (optional)', checkIds: [], read: 'segmently analytics settings get', goals: [], next: { articleAlias: 'tiktok-pixel-events-api-setup', description: 'Set the TikTok pixel id and events API if TikTok ads are planned.' } },
  { id: 'published', label: 'Published', checkIds: ['webPlacement.published'], read: 'segmently publish verify', goals: ['full'], next: { actionId: 'launch.publish', description: 'Publish the web placement.' } },
  { id: 'customDomainVerified', label: 'Custom domain verified (optional)', checkIds: [], read: 'segmently domains verify', goals: [], next: { actionId: 'handoff.domain.dns', description: 'Verify custom-domain DNS, or keep the default domain.' } },
  { id: 'sandboxPurchaseVerified', label: 'Sandbox purchase verified', checkIds: [], read: 'test purchase + segmently publish verify', goals: ['full'], next: { articleAlias: 'launch-paid-funnel-overview', description: 'Run a sandbox test purchase on the published funnel.' } },
  { id: 'launchVerified', label: 'Launch verified end to end', checkIds: [], read: 'segmently publish verify', goals: ['full'], next: { articleAlias: 'launch-paid-funnel-overview', description: 'Verify the live URL end to end at the chosen depth.' } },
];

const GOAL_INCLUDES = {
  'first-value': ['first-value'],
  monetized: ['first-value', 'monetized'],
  'ads-ready': ['first-value', 'monetized', 'ads-ready'],
  full: ['first-value', 'monetized', 'ads-ready', 'full'],
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  outputArgs = args;
  if (args.help) {
    printHelp();
    return;
  }

  const goal = String(args.goal ?? 'ads-ready');
  if (!GOALS.includes(goal)) {
    writeJson({ ok: false, reason: `Unknown --goal ${goal}. Expected one of: ${GOALS.join(', ')}.` });
    process.exitCode = 2;
    return;
  }

  const projectContext = resolveProjectContext(args);
  const sessionContext = buildSessionContextContract(projectContext);
  const toolPreflight = buildToolPreflight(args, { needsPlaywright: false, needsBrowser: false });
  const authPreflight = buildAuthPreflight(args, {});

  const missingInputs = [];
  if (!projectContext.projectId) missingInputs.push('projectId');
  if (!hasValue(args.funnel)) missingInputs.push('funnel');
  if (!hasValue(args.versionId)) missingInputs.push('versionId');
  if (missingInputs.length) {
    writeJson({
      ok: false,
      mode: 'launch-progress',
      reason: 'Missing target inputs for the launch readiness read.',
      missingInputs,
      discoveryReads: [
        'segmently funnels list        # find the funnel id and its latest version id',
        'segmently web-placements list # find the placement attached to the funnel',
      ],
      sessionContext,
      interactionPolicy: buildInteractionPolicy(missingInputs),
      completionClaim: 'launch-progress-not-executed',
    });
    process.exitCode = 2;
    return;
  }

  const argv = buildPreflightArgv(args, projectContext.projectId, goal);
  const result = runSegmently(args, argv);
  if (!result.ok) {
    if (result.authRequired) {
      writeJson({
        ok: false,
        mode: 'launch-progress',
        reason: 'Segmently CLI authorization is required before the launch readiness read.',
        authPreflight,
        toolPreflight,
        sessionContext,
        nextStepForAgent: 'Run authPreflight.statusProbe, run authPreflight.login if needed, then retry this command.',
        completionClaim: 'auth-preflight-required',
      });
      process.exitCode = 3;
      return;
    }
    writeJson({
      ok: false,
      mode: 'launch-progress',
      reason: result.reason,
      command: ['segmently', ...argv].join(' '),
      stderr: result.stderr?.slice(0, 2000) ?? null,
      toolPreflight,
      sessionContext,
      completionClaim: 'launch-progress-not-executed',
    });
    process.exitCode = 2;
    return;
  }

  const preflight = result.data;
  const checkById = new Map((preflight.checks ?? []).map(check => [check.id, check]));
  const goalTiers = GOAL_INCLUDES[goal];
  const milestones = MILESTONES.map(milestone => {
    const inGoal = milestone.goals.some(tier => goalTiers.includes(tier));
    const checks = milestone.checkIds.map(id => checkById.get(id)).filter(Boolean);
    let status;
    let source;
    if (!milestone.checkIds.length || !checks.length) {
      status = 'not-checked-automatically';
      source = 'manual-read';
    } else if (checks.some(check => check.status === 'failed')) {
      status = 'failed';
      source = 'preflight';
    } else if (checks.some(check => check.status === 'warning')) {
      status = 'warning';
      source = 'preflight';
    } else if (checks.every(check => check.status === 'skipped')) {
      status = 'skipped';
      source = 'preflight';
    } else {
      status = 'passed';
      source = 'preflight';
    }
    return {
      id: milestone.id,
      label: milestone.label,
      inGoal,
      status,
      source,
      read: milestone.read,
      checks: checks.map(check => ({ id: check.id, status: check.status, severity: check.severity, message: check.message, nextAction: check.nextAction ?? null })),
      next: milestone.next,
    };
  });

  const remainingSteps = milestones.filter(m => m.inGoal && (m.status === 'failed' || m.status === 'warning'));
  const unverifiedSteps = milestones.filter(m => m.inGoal && m.status === 'not-checked-automatically');
  const nextMilestone = remainingSteps[0] ?? null;

  writeJson({
    ok: true,
    mode: 'launch-progress',
    goal,
    checkedAt: preflight.checkedAt ?? null,
    preflightStatus: preflight.status ?? null,
    summary: preflight.summary ?? null,
    command: ['segmently', ...argv].join(' '),
    milestones,
    remainingSteps: remainingSteps.map(m => ({ id: m.id, label: m.label, status: m.status })),
    notCheckedAutomatically: unverifiedSteps.map(m => ({ id: m.id, label: m.label, read: m.read })),
    nextAction: nextMilestone
      ? {
          milestoneId: nextMilestone.id,
          description: nextMilestone.next.description,
          ...(nextMilestone.next.actionId ? { actionId: nextMilestone.next.actionId, resolveWith: 'runtime/do-action-reference.json' } : {}),
          ...(nextMilestone.next.articleAlias ? { articleAlias: nextMilestone.next.articleAlias } : {}),
          ...(nextMilestone.next.command ? { command: nextMilestone.next.command } : {}),
          checkNextActions: nextMilestone.checks.map(check => check.nextAction).filter(Boolean),
        }
      : null,
    answerPolicy: [
      'Report done milestones, the next missing milestone, and the shortest next action.',
      'Milestones listed in notCheckedAutomatically were NOT verified by this read; never claim them done — offer their manual read instead.',
      'This is a read-only status check. Do not open the answer with completion wording.',
    ],
    sessionContext,
    toolPreflight,
    authPreflight,
    completionClaim: 'launch-progress-read-only',
  });
}

function buildPreflightArgv(args, projectId, goal) {
  const argv = [];
  const env = hasValue(args.env) ? String(args.env) : null;
  if (env) argv.push('--env', env);
  argv.push('--project', projectId, '--format', 'json');
  argv.push('launch', 'preflight', '--funnel', String(args.funnel), '--version-id', String(args.versionId));
  if (hasValue(args.webPlacement)) argv.push('--web-placement', String(args.webPlacement));
  if (hasValue(args.abTest)) argv.push('--ab-test', String(args.abTest));
  if (hasValue(args.requiredVariable)) argv.push('--required-variable', String(args.requiredVariable));
  if (hasValue(args.attributionParam)) argv.push('--attribution-param', String(args.attributionParam));
  const tiers = GOAL_INCLUDES[goal];
  if (tiers.includes('monetized')) argv.push('--require-paywall', '--require-stripe-sandbox');
  if (tiers.includes('ads-ready')) argv.push('--require-web-placement', '--require-facebook-attribution');
  if (tiers.includes('full')) argv.push('--require-published');
  return argv;
}

function runSegmently(args, argv) {
  const bin = args.segmentlyBin || args.segmently || 'segmently';
  const spawned = spawnSync(bin, argv, { encoding: 'utf8', timeout: 120000 });
  if (spawned.error) {
    return { ok: false, reason: `Failed to run the Segmently CLI: ${spawned.error.message}`, stderr: spawned.stderr };
  }
  const stdout = spawned.stdout ?? '';
  const stderr = spawned.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  if (/auth_required|not authenticated|not logged in/i.test(combined)) {
    return { ok: false, authRequired: true, reason: 'auth_required', stderr };
  }
  const parsed = parseJsonLoose(stdout);
  if (!parsed) {
    return { ok: false, reason: 'The Segmently CLI did not return parseable JSON for launch preflight.', stderr: combined };
  }
  // launch preflight exits 1 when blocked; that is still a successful read.
  const data = parsed.data ?? parsed;
  if (!Array.isArray(data.checks)) {
    return { ok: false, reason: 'launch preflight JSON did not include checks[].', stderr: combined };
  }
  return { ok: true, data };
}

function parseJsonLoose(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildSessionContextContract(projectContext) {
  return {
    schemaVersion: 1,
    contextFile: projectContext.contextFile,
    currentProject: projectContext.currentProject
      ? {
          id: projectContext.currentProject.id,
          name: projectContext.currentProject.name ?? projectContext.currentProject.id,
          source: projectContext.currentProject.source ?? projectContext.projectIdSource,
        }
      : null,
    projectIdSource: projectContext.projectIdSource,
    usingCurrentProject: projectContext.usingStoredProject === true,
    missingCurrentProject: projectContext.missingProject === true,
    askToSetCurrentProject: projectContext.missingProject === true && !hasValue(outputArgs.projectId),
    setCurrentProjectCommand: 'node runtime/session-context.mjs set-current-project --projectId <projectId> --projectName "<Project name>"',
    readError: projectContext.readError ?? null,
  };
}

function buildInteractionPolicy(missingInputs = []) {
  return {
    useTodoListTool: false,
    useAskUserQuestionTool: missingInputs.length > 0,
    firstQuestionInput: missingInputs[0] ?? null,
    note: 'Ask one targeted question for the first blocking input. Prefer a funnel/editor link over raw ids when either is acceptable.',
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._ = [...(out._ ?? []), arg];
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function hasValue(value) {
  if (value === undefined || value === null || value === true || value === false) return false;
  return String(value).trim().length > 0;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node runtime/launch-progress-runner.mjs --funnel <funnelId> --version-id <versionId> [--goal first-value|monetized|ads-ready|full]',
    '      [--projectId <id>] [--web-placement <id>] [--ab-test <id>] [--required-variable a,b] [--attribution-param a,b] [--env <env>]',
    '',
    'Read-only: wraps `segmently launch preflight` and maps its checks onto the',
    'launch milestones from references/project-status.md. Reports done/left',
    'milestones for the goal, the shortest next action, and which milestones',
    'are not checked automatically (offer their manual read instead).',
  ].join('\n'));
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
