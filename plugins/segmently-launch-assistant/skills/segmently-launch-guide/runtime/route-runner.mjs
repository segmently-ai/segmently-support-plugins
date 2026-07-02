#!/usr/bin/env node
/**
 * Deterministic navigation route runner for installed Segmently launch skills.
 *
 * Assembles any route registered in runtime/navigation-atoms.json into an
 * executable playwright-cli driver script. Read-only by design: routes only
 * navigate, expand sidebar sections, open dialogs, and wait for destination
 * markers — they never click Save and never mutate customer data.
 *
 * Also importable: show-runner.mjs and e2e-do-runner.mjs use
 * resolveNavigationRoute / buildRouteNavigationFunction to prepend a proven
 * navigation prefix (--routeId) instead of improvising navigation from prose.
 *
 * Interaction nuances live HERE, once, mirroring the maintainers' e2e helper
 * semantics: `.first()` on every testid lookup (the sidebar renders desktop +
 * mobile drawer copies), expand-if-collapsed for MUI Collapse sections with a
 * settle delay, and /all-projects redirect recovery through the project card.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  authSummary,
  buildAuthPreflight,
  cleanupBrowserAuth,
  prepareBrowserAuth,
  wrapDriverScriptWithBrowserAuth,
} from './browser-auth-bridge.mjs';
import { buildToolPreflight } from './tool-preflight.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const navigationAtomsPath = join(root, 'runtime/navigation-atoms.json');

const ROUTE_PARAM_KEYS = ['projectId', 'funnelId', 'screenId', 'strategyId', 'alias'];

export function loadNavigationAtoms() {
  if (!existsSync(navigationAtomsPath)) return null;
  try {
    return JSON.parse(readFileSync(navigationAtomsPath, 'utf8'));
  } catch {
    return null;
  }
}

export function resolveNavigationRoute(routeId) {
  if (!routeId) return null;
  const atoms = loadNavigationAtoms();
  if (!atoms || !Array.isArray(atoms.routes)) return null;
  const route = atoms.routes.find((entry) => entry.routeId === routeId);
  if (!route) return null;
  return { route, primitives: atoms.primitives ?? {} };
}

export function missingRouteInputs(route, args) {
  const missing = [];
  if (!hasArg(args, 'baseUrl')) missing.push('baseUrl');
  for (const key of ROUTE_PARAM_KEYS) {
    if (route.requires?.[key] && !hasArg(args, key)) missing.push(key);
  }
  return missing;
}

export function routeParams(args) {
  const params = { baseUrl: hasArg(args, 'baseUrl') ? trimSlash(args.baseUrl) : '' };
  for (const key of ROUTE_PARAM_KEYS) {
    if (hasArg(args, key)) params[key] = String(args[key]);
  }
  return params;
}

export function resolveRouteUrl(route, params) {
  return fillTemplate(route.routeTemplate, params);
}

/**
 * Returns the source of an `async (page) => { ... }` function that walks the
 * route's atom steps. Selector values are baked in as data (opaque execution
 * artifact); customer-facing text must use route.customerSafeLabel only.
 */
export function buildRouteNavigationFunction(route, params, primitives = {}) {
  const payload = JSON.stringify({
    routeId: route.routeId,
    steps: route.steps,
    params,
    projectCardPrefix: primitives.projectCardPrefix ?? 'project-card-',
  });
  return `async (page) => {
  const nav = ${payload};
  const notes = [];
  const first = (testId) => page.getByTestId(testId).first();
  const fill = (template) => String(template).replace(/{{(\\w+)}}/g, (match, key) => nav.params[key] ?? match);
  for (const step of nav.steps) {
    if (step.kind === 'goto') {
      const url = nav.params.baseUrl.replace(/\\/+$/, '') + fill(step.pathTemplate);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      if (nav.params.projectId && new URL(page.url()).pathname === '/all-projects') {
        const card = page.getByTestId(nav.projectCardPrefix + nav.params.projectId).first();
        await card.waitFor({ state: 'visible', timeout: 20000 });
        await card.click();
        await page.waitForURL((next) => next.pathname.startsWith('/project/' + nav.params.projectId), { timeout: 20000 });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        notes.push('recovered from /all-projects redirect through the project card');
      }
    } else if (step.kind === 'wait-selector') {
      if (step.selector) {
        await page.waitForSelector(step.selector, { timeout: 15000 });
      } else if (step.testIdPrefix) {
        await page.waitForSelector('[data-testid^="' + step.testIdPrefix + '"]', { timeout: 15000 });
      } else {
        await first(step.testId).waitFor({ state: 'visible', timeout: 15000 });
      }
    } else if (step.kind === 'wait-testid') {
      await first(step.testId).waitFor({ state: 'visible', timeout: 15000 });
    } else if (step.kind === 'expand-section') {
      const section = first(step.testId);
      await section.waitFor({ state: 'visible', timeout: 10000 });
      const collapse = section.locator('.MuiCollapse-root');
      const expanded = await collapse.evaluate((el) => el.style.height !== '0px' && !el.classList.contains('MuiCollapse-hidden')).catch(() => false);
      if (!expanded) {
        await section.locator('.MuiListItemButton-root').first().click();
        await page.waitForTimeout(500);
        notes.push('expanded a collapsed sidebar section');
      }
    } else if (step.kind === 'click-testid') {
      const item = first(step.testId);
      await item.waitFor({ state: 'visible', timeout: 10000 });
      await item.click();
      await page.waitForTimeout(500);
    } else if (step.kind === 'fill-testid') {
      const input = first(step.testId);
      await input.waitFor({ state: 'visible', timeout: 10000 });
      await input.fill(String(nav.params[step.valueParam] ?? ''));
    } else if (step.kind === 'dblclick-node') {
      const node = page.locator('[data-id="' + nav.params[step.nodeIdParam] + '"]').first();
      await node.waitFor({ state: 'visible', timeout: 15000 });
      await node.dblclick();
      await page.waitForTimeout(500);
    } else {
      throw new Error('Unknown navigation step kind: ' + step.kind);
    }
  }
  return { mode: 'route', mutation: false, routeId: nav.routeId, url: page.url(), notes };
}`;
}

/** Wraps an existing driver script so the route navigation runs first. */
export function wrapDriverScriptWithRouteNavigation(driverScript, route, params, primitives = {}) {
  const navigate = buildRouteNavigationFunction(route, params, primitives);
  return `async (page) => {
  await (${navigate})(page);
  return await (${driverScript})(page);
}`;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  applyDefaultBaseUrl(args);
  const routeId = args.route ?? args.routeId;
  if (args.help || (!routeId && !args.list)) return printHelp();

  const atoms = loadNavigationAtoms();
  if (!atoms) {
    return finish({ ok: false, reason: 'runtime/navigation-atoms.json is missing or unreadable.' }, args, 2);
  }
  if (args.list) {
    return finish({
      ok: true,
      routes: atoms.routes.map((route) => ({
        routeId: route.routeId,
        entity: route.entity,
        title: route.title,
        customerSafeLabel: route.customerSafeLabel,
        requires: route.requires,
        provesWith: route.provesWith ?? null,
      })),
    }, args, 0);
  }

  const resolved = resolveNavigationRoute(routeId);
  if (!resolved) {
    return finish({
      ok: false,
      routeId,
      reason: `Route ${routeId} is not registered. Run --list for the registered navigation routes.`,
    }, args, 2);
  }
  const { route, primitives } = resolved;
  const missingInputs = missingRouteInputs(route, args);
  const params = routeParams(args);
  const resolvedUrl = resolveRouteUrl(route, { baseUrl: params.baseUrl || '{{baseUrl}}', ...params });
  const driverScript = buildRouteNavigationFunction(route, params, primitives);

  const playwrightBin = args.playwrightBin || args.playwright || 'playwright-cli';
  const browserName = args.browser || process.env.SUPPORT_FLOW_PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_MCP_BROWSER || 'chrome';
  const sessionName = args.session || `segmently-route-${route.routeId}`;
  const viewport = args.viewport || '1440x900';
  const outputDir = resolve(args.outputDir || process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR || 'qa-screenshots/segmently-launch-guide');
  const screenshotPath = resolve(args.screenshot || join(outputDir, `route-${route.routeId}-${Date.now()}.png`));
  const openArgv = ['-s', sessionName, 'open', params.baseUrl ? `${params.baseUrl}/login` : '<baseUrl>/login', '--persistent', '--headed', `--browser=${browserName}`];
  const screenshotArgv = ['-s', sessionName, 'screenshot', '--filename', screenshotPath];
  const authPreflight = route.requires?.auth === false
    ? { required: false, reason: 'This route does not need an authenticated session.' }
    : buildAuthPreflight(args, {
        baseUrl: args.baseUrl,
        retryArgv: ['node', 'runtime/route-runner.mjs', ...ensureExecuteArgv(rawArgs)],
      });
  const toolPreflight = buildToolPreflight(args, {
    baseUrl: args.baseUrl,
    needsSegmently: route.requires?.auth !== false,
    needsBrowser: true,
    retryArgv: ['node', 'runtime/route-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });

  if (!args.execute) {
    return finish({
      ok: true,
      dryRun: true,
      mode: 'route',
      mutation: false,
      routeId: route.routeId,
      customerSafeLabel: route.customerSafeLabel,
      requires: route.requires,
      provesWith: route.provesWith ?? null,
      missingInputs,
      resolvedUrl,
      requiresExecute: true,
      wouldOpen: [playwrightBin, ...openArgv],
      wouldRunCode: [playwrightBin, '-s', sessionName, 'run-code', '<routeDriverScript>'],
      wouldScreenshot: [playwrightBin, ...screenshotArgv],
      authPreflight,
      toolPreflight,
      driverScript,
      completionClaim: 'route-not-executed',
    }, args, 0);
  }

  if (missingInputs.length) {
    return finish({
      ok: false,
      dryRun: false,
      mode: 'route',
      routeId: route.routeId,
      reason: `Route execution needs ${missingInputs.join(', ')} before opening the browser.`,
      missingInputs,
      completionClaim: 'route-not-executed',
    }, args, 2);
  }

  let executableDriverScript = driverScript;
  let auth = null;
  if (route.requires?.auth !== false) {
    auth = await prepareBrowserAuth(args, {
      baseUrl: args.baseUrl,
      retryArgv: ['node', 'runtime/route-runner.mjs', ...ensureExecuteArgv(rawArgs)],
    });
    if (auth.ok !== true) {
      return finish({
        ok: false,
        dryRun: false,
        mode: 'route',
        routeId: route.routeId,
        reason: auth.reason ?? 'Browser authentication bridge failed.',
        authBridge: authSummary(auth),
        authPreflight: auth.authPreflight ?? authPreflight,
        toolPreflight,
        completionClaim: 'route-auth-preflight-required',
      }, args, 2);
    }
    executableDriverScript = wrapDriverScriptWithBrowserAuth(driverScript, auth);
  }

  mkdirSync(outputDir, { recursive: true });
  const output = {
    ok: false,
    dryRun: false,
    mode: 'route',
    mutation: false,
    routeId: route.routeId,
    customerSafeLabel: route.customerSafeLabel,
    resolvedUrl,
    authBridge: auth ? authSummary(auth) : null,
    toolPreflight,
    browser: { open: null, runCode: null, screenshot: null },
    screenshot: { path: screenshotPath, exists: false },
    visibleBrowser: true,
    headed: true,
    keepOpen: args.closeAfterRun !== true && args.closeAfterRun !== 'true',
    completionClaim: 'route-not-completed-until-destination-reached',
  };
  const openResult = runTool(playwrightBin, openArgv, {
    timeoutMs: numberArg(args.timeoutMs, 120000),
    env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: viewport },
  });
  output.browser.open = commandSummary(playwrightBin, openArgv, openResult);
  output.ok = openResult.status === 0;

  if (output.ok) {
    const runCodeArgv = ['-s', sessionName, 'run-code', executableDriverScript];
    const runCodeResult = runTool(playwrightBin, runCodeArgv, {
      timeoutMs: numberArg(args.timeoutMs, 120000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: viewport },
    });
    if (auth) cleanupBrowserAuth(auth);
    output.browser.runCode = commandSummary(playwrightBin, ['-s', sessionName, 'run-code', '<routeDriverScript>'], runCodeResult);
    output.ok = runCodeResult.status === 0;
  } else if (auth) {
    cleanupBrowserAuth(auth);
  }

  if (output.ok) {
    const screenshotResult = runTool(playwrightBin, screenshotArgv, {
      timeoutMs: numberArg(args.timeoutMs, 60000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: viewport },
    });
    output.browser.screenshot = commandSummary(playwrightBin, screenshotArgv, screenshotResult);
    output.screenshot.exists = existsSync(screenshotPath);
    output.ok = screenshotResult.status === 0 && output.screenshot.exists;
  }

  if (!output.keepOpen) {
    runTool(playwrightBin, ['-s', sessionName, 'close'], {
      timeoutMs: numberArg(args.timeoutMs, 30000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: viewport },
    });
  }

  output.completionClaim = output.ok ? 'route-destination-reached' : 'route-navigation-failed';
  return finish(output, args, output.ok ? 0 : 1);
}

function fillTemplate(template, params) {
  return String(template).replace(/{{(\w+)}}/g, (match, key) => (params[key] !== undefined ? String(params[key]) : match));
}

function finish(value, args, code) {
  const output = {
    schemaVersion: 1,
    artifactType: 'segmently-launch-guide-route-result',
    createdAt: new Date().toISOString(),
    ...value,
  };
  const resultPath = args.resultPath
    ? resolve(args.resultPath)
    : process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR
      ? resolve(process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR, 'route-runner-result.json')
      : null;
  if (resultPath) {
    mkdirSync(dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = code;
}

function runTool(tool, argv, options) {
  const result = spawnSync(tool, argv, {
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 4,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.error) {
    return { status: 1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  const stdout = result.stdout ?? '';
  const effectiveStatus = (result.status ?? 0) === 0 && /^### Error\b/m.test(stdout)
    ? 1
    : (result.status ?? 0);
  return { status: effectiveStatus, stdout, stderr: result.stderr ?? '' };
}

function commandSummary(tool, argv, result) {
  return {
    argv: [tool, ...argv],
    status: result.status,
    stdoutPreview: safePreview(result.stdout),
    stderrPreview: safePreview(result.stderr),
  };
}

function safePreview(value) {
  const text = redactSecrets(String(value ?? ''));
  return text.length > 4000 ? `${text.slice(0, 4000)}\n...[truncated]` : text;
}

function redactSecrets(text) {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, '$1[REDACTED]')
    .replace(/(SEGMENTLY_(?:TOKEN|API_KEY)=)[^\s]+/g, '$1[REDACTED]')
    .replace(/("(?:accessToken|refreshToken|idToken|apiKey)"\s*:\s*")[^"]+"/g, '$1[REDACTED]"');
}

function hasArg(args, key) {
  return args[key] !== undefined && args[key] !== true && String(args[key]).trim() !== '';
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function ensureExecuteArgv(argv) {
  return argv.includes('--execute') ? argv : [...argv, '--execute'];
}

function applyDefaultBaseUrl(args) {
  if (hasArg(args, 'baseUrl')) return;
  const value = process.env.SUPPORT_FLOW_BASE_URL
    || process.env.LIVE_SEGMENTLY_BASE_URL
    || process.env.BASE_URL;
  if (value) args.baseUrl = value;
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function printHelp() {
  process.stdout.write(`Segmently launch route runner

Usage:
  node runtime/route-runner.mjs --list
  node runtime/route-runner.mjs --route <routeId> [--projectId <id>] [--funnelId <id>] [--screenId <id>] [--strategyId <id>] [--alias <alias>] [--baseUrl <url>]
  node runtime/route-runner.mjs --route <routeId> ... --execute

Routes come from runtime/navigation-atoms.json (generated from the maintained
navigation catalog). Without --execute this runner is read-only and returns the
resolved destination URL, the exact playwright-cli calls, and the route driver
script that would run. With --execute it opens a visible headed browser,
authenticates through the CLI auth bridge (segmently auth print-token) when the
route needs it — routes never fill the login form — walks the registered steps,
and captures screenshot evidence. Routes never click Save and never mutate
customer data. Use --list to enumerate registered routes.
`);
}

const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsCli) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
