#!/usr/bin/env node
/**
 * Read-only SHOW executor for installed Segmently launch skills.
 *
 * This runner resolves a customer SHOW prompt through the shipped
 * customer-response runner, then either returns a dry-run visible browser
 * walkthrough package or opens a headed browser, focuses the target control,
 * and captures screenshot evidence. It never calls DO runners, never clicks
 * Save, and never mutates customer data.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authSummary,
  buildAuthPreflight,
  cleanupBrowserAuth,
  prepareBrowserAuth,
  wrapDriverScriptWithBrowserAuth,
} from './browser-auth-bridge.mjs';
import { buildToolPreflight } from './tool-preflight.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const responseRunner = join(root, 'runtime/customer-response-runner.mjs');

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  applyDefaultBaseUrl(args);
  if (args.help || !args.prompt) return printHelp();

  const response = resolveShow(args);
  if (response.ok !== true || response.mode !== 'show' || !response.show) {
    return finish({
      ok: false,
      mode: response.mode ?? null,
      reason: 'The prompt did not resolve to a SHOW request.',
      resolver: response.resolver ?? null,
      response,
    }, args, 2);
  }

  const prepared = prepareShow(response, args);
  prepared.authPreflight = buildAuthPreflight(args, {
    baseUrl: args.baseUrl,
    retryArgv: ['node', 'runtime/show-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });
  prepared.toolPreflight = buildToolPreflight(args, {
    baseUrl: args.baseUrl,
    needsSegmently: true,
    needsBrowser: true,
    retryArgv: ['node', 'runtime/show-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });
  if (!args.execute) {
    return finish({
      ok: true,
      dryRun: true,
      mode: 'show',
      mutation: false,
      prompt: args.prompt,
      guideKeys: response.show.guideKeys ?? [],
      evidenceLevel: response.show.evidenceLevel,
      liveBrowserReady: prepared.liveBrowserReady,
      missingInputs: response.show.missingInputs ?? [],
      providedInputs: response.show.providedInputs ?? {},
      browserPlan: response.show.browserPlan ?? [],
      requiresExecute: true,
      wouldOpen: [prepared.playwrightBin, ...prepared.openArgv],
      wouldRunCode: [prepared.playwrightBin, ...prepared.runCodeArgvPreview],
      wouldScreenshot: [prepared.playwrightBin, ...prepared.screenshotArgv],
      wouldClose: prepared.closeAfterShow ? [prepared.playwrightBin, ...prepared.closeArgv] : null,
      browser: prepared.browserName,
      visibleBrowser: true,
      headed: true,
      keepOpen: !prepared.closeAfterShow,
      closePolicy: prepared.closeAfterShow
        ? 'explicit-close-after-show'
        : 'keep-visible-browser-open-for-customer',
      authBridge: {
        requiredForExecute: true,
        credentialSource: 'segmently auth print-token',
        firebaseApiKeySource: 'app',
      },
      authPreflight: prepared.authPreflight,
      toolPreflight: prepared.toolPreflight,
      driverScript: prepared.driverScript,
      screenshot: {
        path: prepared.screenshotPath,
        exists: false,
      },
      completionClaim: 'show-not-completed-until-visible-browser-and-screenshot',
    }, args, 0);
  }

  if (!prepared.liveBrowserReady) {
    return finish({
      ok: false,
      dryRun: false,
      mode: 'show',
      mutation: false,
      reason: `Live SHOW needs ${prepared.requiredInputs.join(', ')} before opening the browser.`,
      missingInputs: prepared.requiredInputs,
      completionClaim: 'show-not-executed',
    }, args, 2);
  }

  const auth = await prepareBrowserAuth(args, {
    baseUrl: args.baseUrl,
    retryArgv: ['node', 'runtime/show-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });
  prepared.authBridge = auth;
  if (auth.ok !== true) {
    return finish({
      ok: false,
      dryRun: false,
      mode: 'show',
      mutation: false,
      reason: auth.reason ?? 'Browser authentication bridge failed.',
      authBridge: authSummary(auth),
      authPreflight: auth.authPreflight ?? prepared.authPreflight,
      toolPreflight: prepared.toolPreflight,
      nextStepForAgent: 'Run authPreflight.statusProbe, run authPreflight.login if the probe is not authenticated, re-run the probe, then retry this SHOW command. Do not ask the customer to do the whole flow manually unless the browser login requires their approval.',
      completionClaim: 'show-auth-preflight-required',
    }, args, 2);
  }
  prepared.driverScript = wrapDriverScriptWithBrowserAuth(prepared.driverScript, auth);
  prepared.runCodeArgv = ['-s', prepared.sessionName, 'run-code', prepared.driverScript];

  const output = {
    ok: false,
    dryRun: false,
    mode: 'show',
    mutation: false,
    prompt: args.prompt,
    guideKeys: response.show.guideKeys ?? [],
    evidenceLevel: response.show.evidenceLevel,
    browserPlan: response.show.browserPlan ?? [],
    authBridge: authSummary(auth),
    toolPreflight: prepared.toolPreflight,
    targetUrl: prepared.targetUrl,
    browser: {
      open: null,
      runCode: null,
      screenshot: null,
      close: null,
    },
    screenshot: {
      path: prepared.screenshotPath,
      exists: false,
    },
    visibleBrowser: true,
    headed: true,
    keepOpen: !prepared.closeAfterShow,
    closePolicy: prepared.closeAfterShow
      ? 'explicit-close-after-show'
      : 'keep-visible-browser-open-for-customer',
    completionClaim: 'show-not-completed-until-visible-browser-and-screenshot',
  };

  const openResult = runTool(prepared.playwrightBin, prepared.openArgv, {
    timeoutMs: numberArg(args.timeoutMs, 120000),
    env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: prepared.viewport },
  });
  output.browser.open = commandSummary(prepared.playwrightBin, prepared.openArgv, openResult);
  output.ok = openResult.status === 0;

  if (output.ok) {
    const runCodeResult = runTool(prepared.playwrightBin, prepared.runCodeArgv, {
      timeoutMs: numberArg(args.timeoutMs, 120000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: prepared.viewport },
    });
    cleanupBrowserAuth(auth);
    output.browser.runCode = commandSummary(prepared.playwrightBin, prepared.runCodeArgvPreview, runCodeResult);
    output.ok = runCodeResult.status === 0;
  } else {
    cleanupBrowserAuth(auth);
  }

  if (output.ok) {
    const screenshotResult = runTool(prepared.playwrightBin, prepared.screenshotArgv, {
      timeoutMs: numberArg(args.timeoutMs, 60000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: prepared.viewport },
    });
    output.browser.screenshot = commandSummary(prepared.playwrightBin, prepared.screenshotArgv, screenshotResult);
    output.screenshot.exists = existsSync(prepared.screenshotPath);
    output.ok = screenshotResult.status === 0 && output.screenshot.exists;
  }

  if (prepared.closeAfterShow) {
    const closeResult = runTool(prepared.playwrightBin, prepared.closeArgv, {
      timeoutMs: numberArg(args.timeoutMs, 30000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: prepared.viewport },
    });
    output.browser.close = commandSummary(prepared.playwrightBin, prepared.closeArgv, closeResult);
  }

  output.completionClaim = output.ok
    ? 'show-visible-browser-opened-and-screenshot-captured'
    : 'show-visible-browser-or-screenshot-failed';
  return finish(output, args, output.ok ? 0 : 1);
}

function resolveShow(args) {
  if (!existsSync(responseRunner)) throw new Error(`Missing ${responseRunner}`);
  const argv = ['--prompt', args.prompt];
  for (const key of ['projectId', 'funnelId', 'screenId', 'baseUrl']) {
    if (hasArg(args, key)) argv.push(`--${key}`, String(args[key]));
  }
  const result = spawnSync('node', [responseRunner, ...argv], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
  });
  if (!result.stdout) {
    throw new Error(result.stderr || `customer-response-runner exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function prepareShow(response, args) {
  const playwrightBin = args.playwrightBin || args.playwright || 'playwright-cli';
  const browserName = args.browser || process.env.SUPPORT_FLOW_PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_MCP_BROWSER || 'chrome';
  const sessionName = args.session || `segmently-show-${slug(args.prompt).slice(0, 48)}`;
  const viewport = args.viewport || '1440x900';
  const outputDir = resolve(args.outputDir || process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR || 'qa-screenshots/segmently-launch-guide');
  mkdirSync(outputDir, { recursive: true });
  const screenshotPath = resolve(args.screenshot || join(outputDir, `show-${Date.now()}.png`));
  const targetUrl = targetUrlFor(args);
  const driverScript = showDriverScript({
    projectId: args.projectId,
    funnelId: args.funnelId,
    screenId: args.screenId,
    baseUrl: args.baseUrl,
    guideKeys: response.show?.guideKeys ?? [],
    prompt: args.prompt,
  });
  const closeAfterShow = args.closeAfterShow === true || args.closeAfterShow === 'true';
  const openArgv = ['-s', sessionName, 'open', args.baseUrl ? `${trimSlash(args.baseUrl)}/login` : targetUrl, '--persistent', '--headed', `--browser=${browserName}`];
  const runCodeArgv = ['-s', sessionName, 'run-code', driverScript];
  const runCodeArgvPreview = ['-s', sessionName, 'run-code', '<showDriverScript>'];
  const screenshotArgv = ['-s', sessionName, 'screenshot', '--filename', screenshotPath];
  const closeArgv = ['-s', sessionName, 'close'];
  const requiredInputs = [];
  if (!args.baseUrl) requiredInputs.push('baseUrl');
  for (const input of response.show?.missingInputs ?? []) requiredInputs.push(input);
  return {
    playwrightBin,
    browserName,
    sessionName,
    viewport,
    outputDir,
    screenshotPath,
    targetUrl,
    openArgv,
    runCodeArgv,
    runCodeArgvPreview,
    screenshotArgv,
    closeArgv,
    closeAfterShow,
    driverScript,
    requiredInputs: [...new Set(requiredInputs)],
    liveBrowserReady: requiredInputs.length === 0,
  };
}

function targetUrlFor(args) {
  if (!args.baseUrl) return '<baseUrl>/login';
  const base = trimSlash(args.baseUrl);
  if (args.projectId && args.funnelId) {
    const url = `${base}/project/${encodeURIComponent(args.projectId)}/onboarding-v2/${encodeURIComponent(args.funnelId)}`;
    return args.screenId ? `${url}?screenId=${encodeURIComponent(args.screenId)}` : url;
  }
  if (args.projectId) return `${base}/project/${encodeURIComponent(args.projectId)}`;
  return `${base}/login`;
}

function showDriverScript(input) {
  const payload = JSON.stringify(input);
  return `async (page) => {
  const input = ${payload};
  const currentOriginMatch = page.url().match(/^https?:\\/\\/[^/]+/);
  const baseUrl = input.baseUrl || (currentOriginMatch ? currentOriginMatch[0] : 'http://localhost:3000');
  const targetUrl = input.projectId && input.funnelId
    ? \`\${baseUrl.replace(/\\/+$/, '')}/project/\${input.projectId}/onboarding-v2/\${input.funnelId}\${input.screenId ? \`?screenId=\${encodeURIComponent(input.screenId)}\` : ''}\`
    : input.projectId
      ? \`\${baseUrl.replace(/\\/+$/, '')}/project/\${input.projectId}\`
      : \`\${baseUrl.replace(/\\/+$/, '')}/login\`;
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForSelector('[data-testid="screen-editor-dialog"], [data-testid="rf__wrapper"], .react-flow', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  const notes = [];
  const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  if (/missing or insufficient permissions|permission denied|not authorized|access denied|sign in|log in|login/i.test(bodyText)) {
    throw new Error('The target app route did not load an authorized editor view. Run the Segmently auth preflight and retry; if auth succeeds, verify this account has access to the project.');
  }
  if (input.screenId) {
    const editorAlreadyOpen = await page.getByTestId('screen-editor-dialog').first().isVisible({ timeout: 1000 }).catch(() => false)
      || await page.getByTestId('section-action-bar').first().isVisible({ timeout: 1000 }).catch(() => false)
      || await page.getByTestId('section-options').first().isVisible({ timeout: 1000 }).catch(() => false)
      || await page.getByTestId('section-media').first().isVisible({ timeout: 1000 }).catch(() => false)
      || await page.getByTestId('section-paywall-media').first().isVisible({ timeout: 1000 }).catch(() => false)
      || await page.getByTestId('section-basic-config').first().isVisible({ timeout: 1000 }).catch(() => false);
    if (editorAlreadyOpen) {
      notes.push('screen editor already opened from screen id route');
    } else {
      const node = page.locator(\`[data-id="\${input.screenId}"]\`).first();
      if (await node.isVisible({ timeout: 10000 }).catch(() => false)) {
        await node.dblclick();
        notes.push('opened requested screen editor by screen id');
      } else {
        throw new Error(\`Requested screen node \${input.screenId} was not visible and the editor did not open from the screen id route. The browser is probably not authenticated or the funnel route did not load.\`);
      }
    }
  }
  const joinedGuides = (input.guideKeys || []).join(' ');
  const expectedSections = [];
  if (/action-button|action-bar/.test(joinedGuides)) {
    expectedSections.push('Action Bar');
    const section = page.getByTestId('section-action-bar').first();
    if (await section.isVisible({ timeout: 5000 }).catch(() => false)) {
      await section.scrollIntoViewIfNeeded().catch(() => {});
      await section.click().catch(() => {});
      notes.push('focused Action Bar section without changing values');
    }
  }
  if (/options|title-styles/.test(joinedGuides)) {
    expectedSections.push('Options');
    const section = page.getByTestId('section-options').first();
    if (await section.isVisible({ timeout: 5000 }).catch(() => false)) {
      await section.scrollIntoViewIfNeeded().catch(() => {});
      await section.click().catch(() => {});
      notes.push('focused Options section without changing values');
    }
  }
  if (/paywall-media/.test(joinedGuides)) {
    expectedSections.push('Paywall Media');
    const section = page.getByTestId('section-paywall-media').first();
    if (await section.isVisible({ timeout: 5000 }).catch(() => false)) {
      await section.scrollIntoViewIfNeeded().catch(() => {});
      await section.click().catch(() => {});
      notes.push('focused Paywall Media section without changing values');
    }
  } else if (/media/.test(joinedGuides)) {
    expectedSections.push('Media');
    const section = page.getByTestId('section-media').first();
    if (await section.isVisible({ timeout: 5000 }).catch(() => false)) {
      await section.scrollIntoViewIfNeeded().catch(() => {});
      await section.click().catch(() => {});
      notes.push('focused Media section without changing values');
    }
  }
  for (const sectionName of expectedSections) {
    if (!notes.some(note => note.includes(\`focused \${sectionName} section\`))) {
      throw new Error(\`Expected \${sectionName} section was not visible before screenshot. Live SHOW cannot claim screenshot evidence.\`);
    }
  }
  return {
    mode: 'show',
    mutation: false,
    url: page.url(),
    guideKeys: input.guideKeys,
    notes,
  };
}`;
}

function finish(value, args, code) {
  const output = {
    schemaVersion: 1,
    artifactType: 'segmently-launch-guide-show-result',
    createdAt: new Date().toISOString(),
    ...value,
  };
  const resultPath = args.resultPath
    ? resolve(args.resultPath)
    : process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR
      ? resolve(process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR, 'show-runner-result.json')
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
    return {
      status: 1,
      stdout: result.stdout ?? '',
      stderr: result.error.message,
    };
  }
  const stdout = result.stdout ?? '';
  const effectiveStatus = (result.status ?? 0) === 0 && /^### Error\b/m.test(stdout)
    ? 1
    : (result.status ?? 0);
  return {
    status: effectiveStatus,
    stdout,
    stderr: result.stderr ?? '',
  };
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

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'show';
}

function printHelp() {
  process.stdout.write(`Segmently launch SHOW runner

Usage:
  node runtime/show-runner.mjs --prompt "<show request>" [--projectId <id>] [--funnelId <id>] [--screenId <id>] [--baseUrl <url>]
  node runtime/show-runner.mjs --prompt "<show request>" --projectId <id> --funnelId <id> --screenId <id> --baseUrl <url> --execute

Without --execute this runner is read-only and returns the playwright-cli headed
open, run-code, screenshot, driverScript, and screenshot manifest path that
would run. With --execute it opens a visible headed browser, focuses the target
control, keeps the browser open for the customer by default, captures screenshot
evidence for the artifact, and writes show-runner-result.json when
SUPPORT_FLOW_LIVE_AGENT_CASE_DIR or --resultPath is set. Pass --closeAfterShow
only for automated cleanup when the customer does not need to see the window.
By default it opens Chrome through playwright-cli --headed; override with
--browser or SUPPORT_FLOW_PLAYWRIGHT_BROWSER if the local install uses a
different browser.
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
