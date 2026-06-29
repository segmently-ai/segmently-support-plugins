#!/usr/bin/env node
/**
 * Self-contained E2E executor for installed Segmently launch skills.
 *
 * This runner consumes the execution contract emitted by editor-do-runner.mjs.
 * By default it is a dry-run planner: it returns the exact playwright-cli calls,
 * driver script, and verification read without opening a browser or mutating the
 * customer's project. It opens the browser and runs the driver only when
 * --execute is provided.
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const editorRunner = join(root, 'runtime/editor-do-runner.mjs');
let outputArgs = {};

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  applyDefaultBaseUrl(args);
  applyDefaultAuthEnv(args);
  const runnerArgs = applyDefaultBaseUrlToRawArgs(rawArgs, args);
  outputArgs = args;
  if (args.help || !args.action) {
    printHelp();
    return;
  }

  const plan = runEditorRunner(filterLocalArgs(runnerArgs));
  if (plan.ok !== true) {
    writeJson({
      ok: false,
      actionId: plan.actionId ?? args.action,
      reason: plan.reason ?? plan.error ?? 'editor-do-runner did not return an executable plan',
      missingInputs: plan.missingInputs ?? [],
      runnerPlan: plan,
    });
    process.exitCode = 2;
    return;
  }

  if (plan.mode !== 'e2e' || plan.execution?.kind !== 'playwright-bowser') {
    writeJson({
      ok: false,
      actionId: plan.actionId,
      mode: plan.mode,
      reason: 'This action is not executable through the E2E browser runner.',
      requiredRunner: plan.mode === 'cli' ? 'segmently-cli-guide' : plan.mode,
      runnerPlan: plan,
    });
    process.exitCode = 2;
    return;
  }

  const prepared = prepareE2eExecution(plan, args);
  prepared.authPreflight = buildAuthPreflight(args, {
    baseUrl: args.baseUrl,
    authEnv: prepared.segmentlyEnv ?? undefined,
    retryArgv: ['node', 'runtime/e2e-do-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });
  if (!args.execute) {
    writeJson({
      ok: true,
      dryRun: true,
      actionId: plan.actionId,
      mode: plan.mode,
      owningSkill: plan.executeWith?.skill ?? plan.execution.owningSkill,
      companionSkill: plan.executeWith?.companionSkill ?? plan.execution.companionSkill,
      commandFamily: plan.execution.commandFamily,
      requiresExecute: true,
      execution: plan.execution,
      browserPlan: plan.browserPlan ?? [],
      browser: prepared.browserName,
      segmentlyEnv: prepared.segmentlyEnv,
      authBridge: {
        requiredForExecute: true,
        credentialSource: 'segmently auth print-token',
        firebaseApiKeySource: 'app',
        env: prepared.segmentlyEnv,
      },
      authPreflight: prepared.authPreflight,
      wouldOpen: [prepared.playwrightBin, ...prepared.openArgv],
      wouldRunCode: [prepared.playwrightBin, ...prepared.runCodeArgvPreview],
      driverScript: prepared.driverScript,
      verification: plan.verification ?? null,
      verifyReady: prepared.verifyReady,
      wouldVerify: prepared.verifyArgv ? [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv] : null,
      blockedExecuteReason: prepared.blockedExecuteReason ?? null,
      completionClaim: 'not-completed-until-execute-and-verification',
    });
    return;
  }

  if (prepared.blockedExecuteReason) {
    writeJson({
      ok: false,
      dryRun: false,
      actionId: plan.actionId,
      mode: plan.mode,
      reason: prepared.blockedExecuteReason,
      requiredInputs: prepared.requiredExecutionInputs,
      completionClaim: 'not-executed',
    });
    process.exitCode = 2;
    return;
  }

  const auth = await prepareBrowserAuth(args, {
    baseUrl: args.baseUrl,
    retryArgv: ['node', 'runtime/e2e-do-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });
  if (auth.ok !== true) {
    writeJson({
      ok: false,
      dryRun: false,
      actionId: plan.actionId,
      mode: plan.mode,
      reason: auth.reason ?? 'Browser authentication bridge failed.',
      authBridge: authSummary(auth),
      authPreflight: auth.authPreflight ?? prepared.authPreflight,
      nextStepForAgent: 'Run authPreflight.statusProbe, run authPreflight.login if the probe is not authenticated, re-run the probe, then retry this E2E DO command. Do not ask the customer to do the whole flow manually unless the browser login requires their approval.',
      completionClaim: 'auth-preflight-required',
    });
    process.exitCode = 2;
    return;
  }
  prepared.authBridge = auth;
  prepared.driverScript = wrapDriverScriptWithBrowserAuth(prepared.driverScript, auth);
  prepared.runCodeArgv = ['-s', prepared.sessionName, 'run-code', prepared.driverScript];

  const openResult = runTool(prepared.playwrightBin, prepared.openArgv, {
    timeoutMs: numberArg(args.timeoutMs, 120000),
    env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: prepared.viewport },
  });
  const output = {
    ok: openResult.status === 0,
    dryRun: false,
    actionId: plan.actionId,
    mode: plan.mode,
    owningSkill: plan.executeWith?.skill ?? plan.execution.owningSkill,
    companionSkill: plan.executeWith?.companionSkill ?? plan.execution.companionSkill,
    commandFamily: plan.execution.commandFamily,
    authBridge: authSummary(auth),
    segmentlyEnv: prepared.segmentlyEnv,
    browser: {
      open: commandSummary(prepared.playwrightBin, prepared.openArgv, openResult),
      runCode: null,
      close: null,
    },
    verification: null,
    completionClaim: 'not-completed-until-verification',
  };

  if (openResult.status === 0) {
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

  if (!args.keepOpen) {
    const closeResult = runTool(prepared.playwrightBin, prepared.closeArgv, {
      timeoutMs: numberArg(args.timeoutMs, 30000),
      env: { PLAYWRIGHT_MCP_VIEWPORT_SIZE: prepared.viewport },
    });
    output.browser.close = commandSummary(prepared.playwrightBin, prepared.closeArgv, closeResult);
  }

  if (!output.ok) {
    writeJson(output);
    process.exitCode = 1;
    return;
  }

  if (prepared.verifyArgv && !args.skipVerify) {
    const verifyResult = runTool(prepared.segmentlyBin, [...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv], {
      timeoutMs: numberArg(args.timeoutMs, 120000),
    });
    const expectedToken = plan.verification?.expectedToken;
    const tokenObserved = expectedToken
      ? verifyResult.stdout.includes(expectedToken) || verifyResult.stderr.includes(expectedToken)
      : verifyResult.status === 0;
    output.verification = {
      argv: [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv],
      status: verifyResult.status,
      expectedToken: expectedToken ?? null,
      expectedTokenObserved: Boolean(tokenObserved),
      stdoutPreview: safePreview(verifyResult.stdout),
      stderrPreview: safePreview(verifyResult.stderr),
    };
    output.ok = verifyResult.status === 0 && Boolean(tokenObserved);
    output.completionClaim = output.ok ? 'verified' : 'verification-failed';
  } else {
    output.verification = prepared.verifyArgv
      ? { skipped: true, reason: '--skipVerify was provided', argv: [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv] }
      : { skipped: true, reason: 'No verification argv was returned by editor-do-runner.mjs' };
    output.completionClaim = 'execution-complete-verification-skipped';
  }

  writeJson(output);
  if (!output.ok) process.exitCode = 1;
}

function runEditorRunner(args) {
  if (!existsSync(editorRunner)) {
    throw new Error(`Missing ${editorRunner}`);
  }
  const result = spawnSync('node', [editorRunner, ...args], { encoding: 'utf8' });
  if (result.status !== 0 && !result.stdout) {
    throw new Error(result.stderr || `editor-do-runner exited ${result.status}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`editor-do-runner returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function prepareE2eExecution(plan, args) {
  const playwrightBin = args.playwrightBin || args.playwright || 'playwright-cli';
  const segmentlyBin = args.segmentlyBin || args.segmently || 'segmently';
  const segmentlyEnv = resolveSegmentlyEnv(args);
  const segmentlyGlobalArgs = segmentlyEnv ? ['--env', segmentlyEnv] : [];
  const browserName = args.browser || process.env.SUPPORT_FLOW_PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_MCP_BROWSER || 'chrome';
  const sessionName = plan.execution.sessionName || `segmently-launch-${plan.actionId.replace(/[^a-z0-9]+/gi, '-')}`;
  const viewport = args.viewport || '1440x900';
  const openUrl = openUrlFor(plan, args);
  const driverScript = plan.execution.driverScript;
  const openArgv = ['-s', sessionName, 'open', openUrl, '--persistent', `--browser=${browserName}`];
  const runCodeArgv = ['-s', sessionName, 'run-code', driverScript];
  const runCodeArgvPreview = ['-s', sessionName, 'run-code', '<driverScript>'];
  const closeArgv = ['-s', sessionName, 'close'];
  const verifyArgv = Array.isArray(plan.verification?.argv) ? [...plan.verification.argv] : null;
  const verifyReady = !verifyArgv || !verifyArgv.some(item => /<[^>]+>/.test(String(item)));
  const requiredExecutionInputs = [];
  if (!args.baseUrl) requiredExecutionInputs.push('baseUrl');
  if (!verifyReady && !args.skipVerify) requiredExecutionInputs.push('versionId or --skipVerify');
  const blockedExecuteReason = requiredExecutionInputs.length > 0
    ? `Live E2E execution needs ${requiredExecutionInputs.join(', ')} before it can run safely.`
    : null;
  return {
    playwrightBin,
    segmentlyBin,
    segmentlyEnv,
    segmentlyGlobalArgs,
    browserName,
    sessionName,
    viewport,
    openUrl,
    openArgv,
    runCodeArgv,
    runCodeArgvPreview,
    closeArgv,
    driverScript,
    verifyArgv,
    verifyReady,
    requiredExecutionInputs,
    blockedExecuteReason,
  };
}

function openUrlFor(plan, args) {
  if (args.baseUrl) return `${String(args.baseUrl).replace(/\/+$/, '')}/login`;
  const commandUrl = String(plan.execution.openCommand ?? '').match(/\sopen\s+(\S+)/)?.[1];
  return commandUrl ?? '<baseUrl>/login';
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

function filterLocalArgs(argv) {
  const local = new Set([
    'execute',
    'env',
    'help',
    'keepOpen',
    'playwright',
    'playwrightBin',
    'browser',
    'authEnv',
    'firebaseApiKey',
    'resultPath',
    'segmently',
    'segmentlyBin',
    'segmentlyEnv',
    'skipVerify',
    'skipAuthBridge',
    'timeoutMs',
    'viewport',
  ]);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (local.has(key)) {
      if (next && !next.startsWith('--')) i += 1;
      continue;
    }
    out.push(arg);
    if (next && !next.startsWith('--')) {
      out.push(next);
      i += 1;
    }
  }
  return out;
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

function applyDefaultBaseUrlToRawArgs(argv, args) {
  if (!hasArg(args, 'baseUrl')) return argv;
  if (argv.some((arg) => arg === '--baseUrl')) return argv;
  return [...argv, '--baseUrl', String(args.baseUrl)];
}

function applyDefaultAuthEnv(args) {
  if (hasArg(args, 'authEnv')) return;
  const value = args.env
    || args.segmentlyEnv
    || process.env.SUPPORT_FLOW_SEGMENTLY_ENV
    || process.env.SUPPORT_FLOW_SEGMENTLY_AUTH_ENV
    || process.env.SEGMENTLY_ENV;
  if (value && value !== true) args.authEnv = String(value);
}

function resolveSegmentlyEnv(args) {
  const value = args.env
    || args.segmentlyEnv
    || args.authEnv
    || process.env.SUPPORT_FLOW_SEGMENTLY_ENV
    || process.env.SUPPORT_FLOW_SEGMENTLY_AUTH_ENV
    || process.env.SEGMENTLY_ENV;
  return value && value !== true ? String(value) : null;
}

function hasArg(args, key) {
  return args[key] !== undefined && args[key] !== true && String(args[key]).trim() !== '';
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeJson(value) {
  const output = {
    schemaVersion: 1,
    artifactType: 'segmently-launch-guide-e2e-do-result',
    createdAt: new Date().toISOString(),
    ...value,
  };
  const resultPath = outputArgs.resultPath
    ? resolve(outputArgs.resultPath)
    : process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR
      ? resolve(process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR, 'e2e-do-runner-result.json')
      : null;
  if (resultPath) {
    mkdirSync(dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Segmently launch E2E DO runner

Usage:
  node runtime/e2e-do-runner.mjs --action <e2eActionId> [inputs...]
  node runtime/e2e-do-runner.mjs --action <e2eActionId> [inputs...] --env dev --execute --baseUrl <url>

Without --execute this runner is read-only and returns the playwright-cli open,
run-code, close, driverScript, and verification read that would run. With
--execute it opens the browser, runs the shipped driver script, closes the
session unless --keepOpen is set, and then runs verification unless --skipVerify
is set. When SUPPORT_FLOW_LIVE_AGENT_CASE_DIR or --resultPath is set, it also
writes e2e-do-runner-result.json for live-agent verification.
Use --env or SUPPORT_FLOW_SEGMENTLY_ENV / SUPPORT_FLOW_SEGMENTLY_AUTH_ENV to
pin both browser auth and Segmently CLI verification to the same environment.
By default it opens Chrome through playwright-cli; override with --browser or
SUPPORT_FLOW_PLAYWRIGHT_BROWSER if the local install uses a different browser.
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
