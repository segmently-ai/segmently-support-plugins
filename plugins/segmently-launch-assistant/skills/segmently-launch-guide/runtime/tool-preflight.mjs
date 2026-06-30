/**
 * Customer-runtime tool prerequisite contract for installed Segmently support
 * skills. This module is intentionally declarative: runners expose the checks
 * that must pass before SHOW/DO execution so an agent can prepare the customer
 * workspace instead of treating a missing CLI/browser as a permanent failure.
 */

export function buildToolPreflight(args = {}, options = {}) {
  const segmentlyBin = args.segmentlyBin || args.segmently || options.segmentlyBin || 'segmently';
  const playwrightBin = args.playwrightBin || args.playwright || options.playwrightBin || 'playwright-cli';
  const segmentlyEnv = options.segmentlyEnv ?? resolveSegmentlyEnv(args, options.baseUrl);
  const segmentlyGlobalArgs = segmentlyEnv ? ['--env', segmentlyEnv] : [];
  const browserName = args.browser || options.browser || process.env.SUPPORT_FLOW_PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_MCP_BROWSER || 'chrome';
  const checks = [];

  if (options.needsSegmently !== false) {
    checks.push({
      id: 'segmently-cli-version',
      purpose: 'Verify the public Segmently CLI is installed.',
      argv: [segmentlyBin, '--version'],
      safeToShowOutput: true,
      setup: {
        argv: ['npm', 'install', '-g', '@segmently/cli'],
        note: 'Install or update the Segmently CLI, then rerun this check.',
      },
    });
    checks.push({
      id: 'segmently-auth-status',
      purpose: 'Verify the Segmently CLI is authenticated for the target environment.',
      argv: [segmentlyBin, ...segmentlyGlobalArgs, 'auth', 'status'],
      safeToShowOutput: true,
      setup: {
        argv: [segmentlyBin, ...segmentlyGlobalArgs, 'auth', 'login'],
        note: 'Run interactive login when auth status reports auth_required or not logged in.',
      },
    });
    checks.push({
      id: 'segmently-capabilities',
      purpose: 'Verify the installed Segmently CLI exposes the public customer command surface needed by the runner.',
      argv: [segmentlyBin, ...segmentlyGlobalArgs, 'capabilities'],
      safeToShowOutput: true,
      setup: {
        argv: ['npm', 'install', '-g', '@segmently/cli'],
        note: 'Upgrade the Segmently CLI if capabilities are missing or the command is unavailable.',
      },
    });
  }

  if (options.needsBrowser === true) {
    checks.push({
      id: 'playwright-cli-help',
      purpose: 'Verify playwright-cli is installed for observable browser automation.',
      argv: [playwrightBin, '--help'],
      safeToShowOutput: true,
      setup: {
        argv: ['npm', 'install', '-g', '@playwright/cli@latest'],
        note: 'Install or update playwright-cli, then rerun this check.',
      },
    });
    checks.push({
      id: 'playwright-browser-availability',
      purpose: `Verify a ${browserName} browser binary is available before opening the editor.`,
      argv: [playwrightBin, 'install-browser'],
      safeToShowOutput: true,
      setup: {
        argv: [playwrightBin, 'install-browser'],
        fallbackArgv: ['npx', 'playwright', 'install', browserName === 'chrome' ? 'chromium' : browserName],
        note: 'Run the install-browser command when the browser binary is missing; use the npx fallback if this playwright-cli build does not provide install-browser.',
      },
    });
  }

  return {
    requiredForExecute: checks.length > 0,
    segmentlyEnv: segmentlyEnv ?? null,
    browser: options.needsBrowser === true ? browserName : null,
    checks,
    retry: Array.isArray(options.retryArgv) ? { argv: options.retryArgv } : null,
    agentInstruction: 'Before live SHOW/DO execution, run these checks in order. If a tool/auth/browser check fails, perform the setup command, rerun the failed check, then retry the same runner. Do not claim execution failed permanently or succeeded until the checks and the runner verification pass.',
  };
}

function resolveSegmentlyEnv(args, baseUrl) {
  const explicit = args.env
    || args.segmentlyEnv
    || process.env.SUPPORT_FLOW_SEGMENTLY_ENV
    || process.env.SUPPORT_FLOW_SEGMENTLY_AUTH_ENV
    || process.env.SEGMENTLY_ENV;
  if (explicit && explicit !== true) return String(explicit);
  const url = String(args.baseUrl || baseUrl || '');
  const devApiHost = ['dev', 'api.segmently.ai'].join('-');
  if (/dev[.-]segmently\.ai/i.test(url) || url.toLowerCase().includes(devApiHost)) return 'dev';
  if (/stage|staging/i.test(url)) return 'stage';
  if (/app\.segmently\.ai|api\.segmently\.ai/i.test(url)) return 'prod';
  return null;
}
