#!/usr/bin/env node
/**
 * Self-contained DO resolver for installed Segmently launch skills.
 *
 * This file intentionally does not import Segmently project source. It consumes
 * runtime/do-action-reference.json and returns a machine-readable execution
 * contract that a Claude/Codex agent can execute by delegating to the owning
 * customer skill:
 *
 *   node runtime/editor-do-runner.mjs --list
 *   node runtime/editor-do-runner.mjs --action editor.actionBar.primaryButton.label --value "Start"
 *   node runtime/editor-do-runner.mjs --action launch.funnel.create --projectId <id> --funnelName "Launch"
 *
 * The runner is conservative: CLI syntax remains owned by segmently-cli-* skills,
 * and browser execution remains owned by playwright-bowser + segmently-test-kit.
 * It validates inputs, identifies the correct owning skill, and only emits browser
 * write plans for actions that have shipped selector metadata and verification.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const referencePath = join(root, 'runtime/do-action-reference.json');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reference = readReference();

  if (args.help || (!args.action && !args.list)) {
    printHelp();
    return;
  }

  if (args.list) {
    writeJson({
      ok: true,
      actions: reference.actions.map(action => ({
        id: action.id,
        status: action.status,
        mode: action.mode,
        label: action.label,
        owningSkill: action.owningSkill ?? null,
      })),
    });
    return;
  }

  const action = reference.actions.find(item => item.id === args.action);
  if (!action) {
    fail(`Unknown action "${args.action}". Run --list to see supported action ids.`, {
      availableActions: reference.actions.map(item => item.id),
    });
  }

  const missingInputs = action.requiredInputs.filter(input => !hasInput(args, input));
  const base = {
    ok: missingInputs.length === 0 && action.status === 'supported',
    actionId: action.id,
    status: action.status,
    mode: action.mode,
    label: action.label,
    requiredInputs: action.requiredInputs,
    missingInputs,
    optionalInputs: action.optionalInputs ?? [],
    verify: action.verify ?? null,
  };

  if (action.status !== 'supported') {
    writeJson({
      ...base,
      ok: false,
      reason: action.unsupportedReason,
      teachFallback: action.teachFallback ?? null,
      nextStep: action.mode === 'handoff'
        ? 'Guide the customer through the manual step, then run the verify read.'
        : 'Use TEACH mode from the fallback article/reference until write metadata exists.',
    });
    process.exitCode = 2;
    return;
  }

  if (missingInputs.length > 0) {
    writeJson({
      ...base,
      ok: false,
      reason: `Missing required input(s): ${missingInputs.join(', ')}`,
      nextStep: `Ask one targeted question for ${missingInputs[0]}.`,
    });
    process.exitCode = 2;
    return;
  }

  const inputs = pickInputs(args, [...action.requiredInputs, ...(action.optionalInputs ?? [])]);

  if (action.mode === 'cli') {
    writeJson({
      ...base,
      ok: true,
      executeWith: {
        skill: action.owningSkill,
        commandFamily: action.commandFamily,
        contract:
          'Delegate to the owning CLI skill. Do not invent command syntax in segmently-launch-guide.',
      },
      inputs,
      execution: cliExecutionFor(action, args),
      verification: verificationFor(action, args),
      nextStep: `Invoke ${action.owningSkill} for ${action.commandFamily}, then run verify.`,
    });
    return;
  }

  if (action.mode === 'e2e') {
    writeJson({
      ...base,
      ok: true,
      executeWith: {
        skill: action.owningSkill,
        companionSkill: 'segmently-test-kit',
        runner: action.runner,
        contract:
          'Use playwright-bowser to drive the customer browser with the returned execution object.',
      },
      inputs,
      execution: e2eExecutionFor(action, args),
      verification: verificationFor(action, args),
      browserPlan: browserPlanFor(action, args),
      nextStep: `Invoke ${action.owningSkill} in DO mode, then run verify.`,
    });
    return;
  }

  fail(`Action "${action.id}" has unsupported mode "${action.mode}".`);
}

function readReference() {
  if (!existsSync(referencePath)) {
    fail(`Missing ${referencePath}. Rebuild the skill target before using DO mode.`);
  }
  return JSON.parse(readFileSync(referencePath, 'utf8'));
}

function browserPlanFor(action, args) {
  const common = [
    'Confirm segmently auth login has completed.',
    'Open the customer project in the browser.',
    'Navigate to the funnel canvas and open the requested screen editor.',
  ];
  if (action.id === 'editor.actionBar.primaryButton.label') {
    return [
      ...common,
      'Open the Action button section.',
      `Set the primary action button label to ${JSON.stringify(args.value)}.`,
      'Save/close the editor, reopen it, and read the label back.',
    ];
  }
  if (action.id === 'editor.actionBar.primaryButton.backgroundColor') {
    return [
      ...common,
      'Open the Action Bar section.',
      'Open the primary button style settings.',
      'Open the Container style subsection.',
      `Set the button background color to ${JSON.stringify(args.value)}.`,
      'Save/close the editor, reopen it, and verify the exported primary button background color.',
    ];
  }
  if (action.id === 'editor.paywall.attachProduct') {
    return [
      ...common,
      'Open the Paywall subscriptions section.',
      `Attach the sandbox product ${JSON.stringify(args.productName)}.`,
      'Save/close the editor, reopen it, and confirm the product is visible.',
    ];
  }
  if (action.id === 'editor.list.options.itemTitle.fontSize') {
    return [
      ...common,
      'Open the Options section.',
      'Open the style settings gear.',
      'Open the Title style subsection.',
      `Set the option title font size to ${JSON.stringify(args.value)} px.`,
      'Save/close the editor, reopen it, and verify the exported option title style.',
    ];
  }
  return common;
}

function cliExecutionFor(action, args) {
  const base = {
    kind: 'delegate-cli',
    tool: 'segmently',
    owningSkill: action.owningSkill,
    commandFamily: action.commandFamily,
    requiresUserApproval: true,
    destructive: false,
    contract:
      'Route this execution object to the owning CLI skill. The owning CLI skill remains the command-shape authority.',
  };
  if (action.id === 'launch.funnel.create') {
    return {
      ...base,
      argvTemplate: ['funnels', 'create', '--name', '<funnelName>', '--project', '<projectId>'],
      argv: ['funnels', 'create', '--name', args.funnelName, '--project', args.projectId],
      expectedWrite: 'Create one V2 funnel shell in the target project.',
    };
  }
  if (action.id === 'launch.analytics.pixel.apply') {
    return {
      ...base,
      argvTemplate: ['analytics', 'settings', 'apply', '--project', '<projectId>', '--file', '<analytics.json>', '--merge'],
      argv: ['analytics', 'settings', 'apply', '--project', args.projectId, '--file', '<analytics.json>', '--merge'],
      materialize: {
        type: 'json-file',
        suggestedPath: 'analytics.json',
        content: analyticsManifestFor(args),
      },
      expectedWrite: `Apply ${args.pixelProvider} analytics settings for the target project.`,
    };
  }
  if (action.id === 'launch.paywallProducts.create') {
    return {
      ...base,
      argvTemplate: ['stripe', 'paywall-product', 'ensure', '--project', '<projectId>', '--name', '<productName>', '--price', '<price>'],
      argv: [
        'stripe',
        'paywall-product',
        'ensure',
        '--project',
        args.projectId,
        '--name',
        args.productName,
        '--price',
        args.price ?? '<price>',
      ],
      materialize: {
        type: 'cli-arguments',
        optionalDefaults: {
          currency: args.currency ?? 'usd',
          interval: args.interval ?? 'month',
        },
      },
      expectedWrite: `Create or ensure the sandbox paywall product ${args.productName}.`,
    };
  }
  if (action.cliPatch) return cliPatchExecutionFor(action, args, base);
  if (action.id === 'launch.publish') {
    return {
      ...base,
      argvTemplate: ['web-placements', 'publish', '--project', '<projectId>', '--funnel', '<funnelId>', '--name', '<placementName>'],
      argv: [
        'web-placements',
        'publish',
        '--project',
        args.projectId,
        '--funnel',
        args.funnelId,
        '--name',
        args.placementName ?? '<placementName>',
      ],
      expectedWrite: 'Publish or update a customer-visible web link for the funnel.',
    };
  }
  return base;
}

function cliPatchExecutionFor(action, args, base) {
  const patch = {
    operations: [materializedCliPatchOperation(action, args)],
  };
  return {
    ...base,
    argvTemplate: [
      'funnels',
      'screens',
      'patch',
      '<screenId>',
      '--funnel',
      '<funnelId>',
      '--version-id',
      '<versionId>',
      '--file',
      '<patch.json>',
      '<projectId>',
    ],
    argv: [
      'funnels',
      'screens',
      'patch',
      args.screenId,
      '--funnel',
      args.funnelId,
      '--version-id',
      args.versionId,
      '--file',
      '<patch.json>',
      args.projectId,
    ],
    materialize: {
      type: 'json-file',
      suggestedPath: action.cliPatch.suggestedPath,
      content: patch,
    },
    expectedWrite: interpolateCliPatchText(action.cliPatch.expectedWrite, args),
  };
}

function materializedCliPatchOperation(action, args) {
  const value = patchValueFor(action, args);
  if (action.cliPatch.operation === 'setFlexibleSectionLayoutField') {
    const sectionIdInput = action.cliPatch.sectionIdInput ?? 'sectionId';
    const sectionId = args[sectionIdInput];
    if (!sectionId) {
      fail(`Action "${action.id}" requires ${sectionIdInput}.`);
    }
    if (!action.cliPatch.field) {
      fail(`Action "${action.id}" is missing cliPatch.field metadata.`);
    }
    return {
      op: action.cliPatch.operation,
      sectionId,
      field: action.cliPatch.field,
      value,
    };
  }
  return {
    op: action.cliPatch.operation,
    path: action.cliPatch.path,
    value,
  };
}

function patchValueFor(action, args) {
  const inputName = action.cliPatch?.valueInput ?? 'value';
  const value = args[inputName];
  if (action.cliPatch?.valueType === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      fail(`Action "${action.id}" requires a numeric ${inputName}.`);
    }
    return parsed;
  }
  if (action.cliPatch?.valueType === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    fail(`Action "${action.id}" requires a boolean ${inputName}.`);
  }
  return value;
}

function interpolateCliPatchText(template, args) {
  return String(template ?? '')
    .replaceAll('<value>', JSON.stringify(args.value))
    .replaceAll('<screenId>', String(args.screenId ?? '<screenId>'))
    .replaceAll('<sectionId>', String(args.sectionId ?? '<sectionId>'));
}

function e2eExecutionFor(action, args) {
  const baseUrl = args.baseUrl || '<baseUrl>';
  const sessionName = `segmently-launch-${action.id.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
  return {
    kind: 'playwright-bowser',
    tool: 'playwright-cli',
    owningSkill: action.owningSkill,
    companionSkill: 'segmently-test-kit',
    commandFamily: action.commandFamily,
    requiresUserApproval: true,
    destructive: false,
    sessionName,
    openCommand: `PLAYWRIGHT_MCP_VIEWPORT_SIZE=1440x900 playwright-cli -s=${sessionName} open ${baseUrl}/login --persistent`,
    runCodeCommand: `playwright-cli -s=${sessionName} run-code <driverScript>`,
    closeCommand: `playwright-cli -s=${sessionName} close`,
    driverScript: browserDriverScriptFor(action, args),
    contract:
      'Use playwright-bowser to run the commands in order. The driverScript is generated from shipped runtime metadata and must be verified after save.',
  };
}

function verificationFor(action, args) {
  if (!action.verify) return null;
  const verification = {
    kind: action.verify.kind,
    read: action.verify.command ?? null,
    evidence: action.verify.evidence,
    proves: action.verify.evidence,
  };
  if (action.verify.command === 'funnels list') {
    return {
      ...verification,
      tool: 'segmently',
      argvTemplate: ['funnels', 'list', '--project', '<projectId>'],
      argv: ['funnels', 'list', '--project', args.projectId],
      expectedToken: args.funnelName ?? null,
    };
  }
  if (action.verify.command === 'analytics settings get') {
    return {
      ...verification,
      tool: 'segmently',
      argvTemplate: ['analytics', 'settings', 'get', '--project', '<projectId>'],
      argv: ['analytics', 'settings', 'get', '--project', args.projectId],
      expectedToken: args.pixelId ?? null,
    };
  }
  if (action.verify.command === 'stripe products') {
    return {
      ...verification,
      tool: 'segmently',
      argvTemplate: ['stripe', 'products', '--project', '<projectId>'],
      argv: ['stripe', 'products', '--project', args.projectId],
      expectedToken: args.productName ?? null,
    };
  }
  if (action.verify.command === 'publish verify') {
    return {
      ...verification,
      tool: 'segmently',
      argvTemplate: ['publish', 'verify', '--project', '<projectId>', '--funnel', '<funnelId>'],
      argv: ['publish', 'verify', '--project', args.projectId, '--funnel', args.funnelId],
      expectedToken: args.placementName ?? args.funnelId ?? null,
    };
  }
  if (action.verify.command === 'funnels export') {
    return {
      ...verification,
      tool: 'segmently',
      argvTemplate: ['funnels', 'export', '<funnelId>', '<versionId>', '<projectId>'],
      argv: ['funnels', 'export', args.funnelId, args.versionId ?? '<versionId>', args.projectId],
      expectedToken: args.value ?? args.productName ?? null,
      note: 'Read the latest version id through the owning CLI skill before exporting.',
    };
  }
  return verification;
}

function analyticsManifestFor(args) {
  const provider = String(args.pixelProvider || '').toLowerCase();
  if (provider.includes('facebook') || provider === 'meta') {
    return {
      facebook: {
        enabled: true,
        pixelId: args.pixelId,
        enableClientSide: true,
        enableServerSide: true,
      },
    };
  }
  if (provider.includes('tiktok')) {
    return {
      tiktok: {
        enabled: true,
        pixelId: args.pixelId,
      },
    };
  }
  return {
    [provider || '<provider>']: {
      enabled: true,
      pixelId: args.pixelId,
    },
  };
}

function browserDriverScriptFor(action, args) {
  const payload = JSON.stringify({
    actionId: action.id,
    projectId: args.projectId,
    funnelId: args.funnelId,
    screenId: args.screenId ?? null,
    value: args.value ?? null,
    productName: args.productName ?? null,
    baseUrl: args.baseUrl ?? null,
  });
  if (action.id === 'editor.actionBar.primaryButton.label') {
    return `async (page) => {
  const input = ${payload};
  const baseUrl = input.baseUrl || page.url().match(/^https?:\\/\\/[^/]+/)?.[0] || 'http://localhost:3000';
  await page.goto(\`\${baseUrl}/project/\${input.projectId}/onboarding-v2/\${input.funnelId}\`);
  await page.waitForSelector('.react-flow', { timeout: 30000 });
  const node = input.screenId
    ? page.locator(\`[data-id="\${input.screenId}"]\`).first()
    : page.locator('.react-flow__node').first();
  await node.dblclick();
  await page.getByTestId('section-action-bar').click();
  await page.getByTestId('checkbox-action-bar-primary-button').check().catch(() => {});
  const fieldRoot = page.getByTestId('input-action-bar-primary-button').first();
  const nested = fieldRoot.locator('input, textarea');
  const target = await nested.count() ? nested.first() : fieldRoot;
  await target.fill(input.value);
  await target.blur().catch(() => {});
  await page.getByTestId('editor-done-btn').click().catch(async () => {
    await page.getByTestId('editor-save-btn').click();
  });
  return { actionId: input.actionId, saved: true, expectedToken: input.value };
}`;
  }
  if (action.id === 'editor.actionBar.primaryButton.backgroundColor') {
    return `async (page) => {
  const input = ${payload};
  const baseUrl = input.baseUrl || page.url().match(/^https?:\\/\\/[^/]+/)?.[0] || 'http://localhost:3000';
  await page.goto(\`\${baseUrl}/project/\${input.projectId}/onboarding-v2/\${input.funnelId}\`);
  await page.waitForSelector('.react-flow', { timeout: 30000 });
  const node = page.locator(\`[data-id="\${input.screenId}"]\`).first();
  await node.waitFor({ state: 'visible', timeout: 30000 });
  await node.dblclick();
  const actionBar = page.getByTestId('section-action-bar').first();
  await actionBar.waitFor({ state: 'visible', timeout: 30000 });
  const actionBarToggle = actionBar.locator('[aria-expanded]').first();
  if ((await actionBarToggle.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await actionBarToggle.click();
  }
  await page.getByTestId('checkbox-action-bar-primary-button').check().catch(() => {});
  const styleToggle = page.getByTestId('styles-toggle-action-bar-primary-button').first();
  if (!(await page.getByTestId('button-style-section-container').isVisible({ timeout: 800 }).catch(() => false))) {
    await styleToggle.scrollIntoViewIfNeeded();
    await styleToggle.click();
  }
  const container = page.getByTestId('button-style-section-container').first();
  await container.waitFor({ state: 'visible', timeout: 30000 });
  const containerToggle = container.locator('[aria-expanded]').first();
  if ((await containerToggle.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await containerToggle.click();
  }
  const checkboxRoot = page.getByTestId('checkbox-style-container-button-background-input').first();
  const nestedCheckbox = checkboxRoot.locator('input[type="checkbox"]').first();
  const checkbox = await nestedCheckbox.count() ? nestedCheckbox : checkboxRoot;
  if (!(await checkbox.isChecked())) await checkbox.click();
  const inputRoot = page.getByTestId('input-style-container-button-background').first();
  const colorInput = inputRoot.locator('input[type="color"]').first();
  if (await colorInput.count()) {
    await colorInput.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, input.value);
  } else {
    const nested = inputRoot.locator('input').first();
    const target = await nested.count() ? nested : inputRoot;
    await target.fill(input.value);
    await target.blur().catch(() => {});
  }
  await page.getByTestId('editor-done-btn').click().catch(async () => {
    await page.getByTestId('editor-save-btn').click();
  });
  return {
    actionId: input.actionId,
    saved: true,
    expectedToken: input.value,
    field: 'content.actionBar.primary.appearance.backgroundColor'
  };
}`;
  }
  if (action.id === 'editor.paywall.attachProduct') {
    return `async (page) => {
  const input = ${payload};
  return {
    actionId: input.actionId,
    requiresHelper: 'segmently-test-kit:webshell/paywall-helpers.configurePaywallSubscriptions',
    productName: input.productName,
    nextStep: 'Use playwright-bowser with segmently-test-kit to open the Paywall subscriptions section, call configurePaywallSubscriptions, save, reopen, and verify the product name.'
  };
}`;
  }
  if (action.id === 'editor.list.options.itemTitle.fontSize') {
    return `async (page) => {
  const input = ${payload};
  const baseUrl = input.baseUrl || page.url().match(/^https?:\\/\\/[^/]+/)?.[0] || 'http://localhost:3000';
  await page.goto(\`\${baseUrl}/project/\${input.projectId}/onboarding-v2/\${input.funnelId}\`);
  await page.waitForSelector('.react-flow', { timeout: 30000 });
  const node = page.locator(\`[data-id="\${input.screenId}"]\`).first();
  await node.waitFor({ state: 'visible', timeout: 30000 });
  await node.dblclick();
  await page.getByTestId('section-options').locator('[aria-expanded]').first().evaluate((el) => {
    if (el.getAttribute('aria-expanded') !== 'true') el.click();
  });
  const styleButton = page.getByTestId('style-settings-button');
  if (!(await page.getByTestId('style-sections-container').isVisible({ timeout: 800 }).catch(() => false))) {
    await styleButton.scrollIntoViewIfNeeded();
    await styleButton.click();
  }
  const titleSection = page.getByTestId('style-section-titleStyles');
  await titleSection.scrollIntoViewIfNeeded();
  const titleSummary = titleSection.locator('[aria-expanded]').first();
  if ((await titleSummary.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await titleSummary.click();
  }
  const checkboxRoot = page.getByTestId('checkbox-style-title-styles-font-size-input').first();
  const checkbox = checkboxRoot.locator('input[type="checkbox"]').first();
  if (await checkbox.count()) {
    if (!(await checkbox.isChecked())) await checkbox.click();
  }
  const inputRoot = page.getByTestId('input-style-title-styles-font-size').first();
  const inputEl = inputRoot.locator('input').first();
  const target = await inputEl.count() ? inputEl : inputRoot;
  await target.fill(String(input.value));
  await target.blur().catch(() => {});
  await page.getByTestId('editor-done-btn').click().catch(async () => {
    await page.getByTestId('editor-save-btn').click();
  });
  return { actionId: input.actionId, saved: true, expectedToken: String(input.value), field: 'content.options.items.0.title.appearance.fontSize' };
}`;
  }
  return `async () => ({ actionId: ${JSON.stringify(action.id)}, unsupportedDriver: true })`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
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

function hasInput(args, name) {
  return args[name] !== undefined && args[name] !== '';
}

function pickInputs(args, names) {
  const out = {};
  for (const name of names) {
    if (hasInput(args, name)) out[name] = args[name];
  }
  return out;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, extra = {}) {
  writeJson({ ok: false, error: message, ...extra });
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`Segmently launch DO resolver

Usage:
  node runtime/editor-do-runner.mjs --list
  node runtime/editor-do-runner.mjs --action <actionId> [--projectId <id>] [--funnelId <id>] [--screenId <id>] [--value <value>]

The output is JSON for the agent to execute via the owning customer skill.
`);
}

main();
