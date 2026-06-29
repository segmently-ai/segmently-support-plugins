#!/usr/bin/env node
/**
 * Self-contained CLI executor for installed Segmently launch skills.
 *
 * This runner consumes the execution contract emitted by editor-do-runner.mjs.
 * By default it is a dry-run planner: it materializes the exact argv/patch
 * intent in JSON without mutating the customer's project. It runs the Segmently
 * CLI only when --execute is provided.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const editorRunner = join(root, 'runtime/editor-do-runner.mjs');
let outputArgs = {};

function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  outputArgs = args;
  if (args.help || !args.action) {
    printHelp();
    return;
  }

  const plan = runEditorRunner(filterLocalArgs(rawArgs));
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

  if (plan.mode !== 'cli' || plan.execution?.kind !== 'delegate-cli') {
    writeJson({
      ok: false,
      actionId: plan.actionId,
      mode: plan.mode,
      reason: 'This action is not executable through the Segmently CLI runner.',
      requiredRunner: plan.mode === 'e2e' ? 'playwright-bowser' : plan.mode,
      runnerPlan: plan,
    });
    process.exitCode = 2;
    return;
  }

  const prepared = prepareCliExecution(plan, args);
  if (!args.execute) {
    writeJson({
      ok: true,
      dryRun: true,
      actionId: plan.actionId,
      mode: plan.mode,
      owningSkill: plan.executeWith?.skill ?? plan.execution.owningSkill,
      commandFamily: plan.execution.commandFamily,
      segmentlyEnv: prepared.segmentlyEnv,
      requiresExecute: true,
      execution: plan.execution,
      wouldRun: [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.argv],
      materializedFiles: prepared.materializedFiles.map(file => ({
        placeholder: file.placeholder,
        suggestedPath: file.suggestedPath,
        content: file.content,
      })),
      verification: plan.verification ?? null,
      wouldVerify: prepared.verifyArgv ? [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv] : null,
      completionClaim: 'not-completed-until-execute-and-verification',
    });
    return;
  }

  const writtenFiles = writeMaterializedFiles(prepared);
  const commandResult = runSegmently(prepared.segmentlyBin, [...prepared.segmentlyGlobalArgs, ...prepared.argv], {
    cwd: prepared.workdir,
    timeoutMs: numberArg(args.timeoutMs, 120000),
  });
  const output = {
    ok: commandResult.status === 0,
    dryRun: false,
    actionId: plan.actionId,
    mode: plan.mode,
    owningSkill: plan.executeWith?.skill ?? plan.execution.owningSkill,
    commandFamily: plan.execution.commandFamily,
    segmentlyEnv: prepared.segmentlyEnv,
    writtenFiles,
    command: {
      argv: [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.argv],
      status: commandResult.status,
      stdoutPreview: safePreview(commandResult.stdout),
      stderrPreview: safePreview(commandResult.stderr),
    },
    verification: null,
    completionClaim: 'not-completed-until-verification',
  };

  if (commandResult.status !== 0) {
    writeJson(output);
    process.exitCode = commandResult.status || 1;
    return;
  }

  if (prepared.verifyArgv && !args.skipVerify) {
    const verifyResult = runSegmently(prepared.segmentlyBin, [...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv], {
      cwd: prepared.workdir,
      timeoutMs: numberArg(args.timeoutMs, 120000),
    });
    const expectedToken = plan.verification?.expectedToken;
    const verifiedToken = expectedToken
      ? verifyResult.stdout.includes(expectedToken) || verifyResult.stderr.includes(expectedToken)
      : verifyResult.status === 0;
    output.verification = {
      argv: [prepared.segmentlyBin, ...prepared.segmentlyGlobalArgs, ...prepared.verifyArgv],
      status: verifyResult.status,
      expectedToken: expectedToken ?? null,
      expectedTokenObserved: Boolean(verifiedToken),
      stdoutPreview: safePreview(verifyResult.stdout),
      stderrPreview: safePreview(verifyResult.stderr),
    };
    output.ok = verifyResult.status === 0 && Boolean(verifiedToken);
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

function prepareCliExecution(plan, args) {
  const segmentlyBin = args.segmentlyBin || args.segmently || 'segmently';
  const segmentlyEnv = resolveSegmentlyEnv(args);
  const segmentlyGlobalArgs = segmentlyEnv ? ['--env', segmentlyEnv] : [];
  const workdir = args.workdir ? resolve(args.workdir) : mkdtempSync(join(tmpdir(), 'segmently-cli-do-'));
  const files = materializedFilesFor(plan.execution);
  let argv = [...(plan.execution.argv ?? [])];
  for (const file of files) {
    const path = join(workdir, file.suggestedPath);
    file.path = path;
    argv = argv.map(item => item === file.placeholder ? path : item);
  }
  const verifyArgv = Array.isArray(plan.verification?.argv) ? [...plan.verification.argv] : null;
  return {
    segmentlyBin,
    segmentlyEnv,
    segmentlyGlobalArgs,
    workdir,
    argv,
    verifyArgv,
    materializedFiles: files,
  };
}

function materializedFilesFor(execution) {
  const materialize = execution?.materialize;
  if (!materialize || materialize.type !== 'json-file') return [];
  const suggestedPath = safeSuggestedPath(materialize.suggestedPath || 'segmently-cli-do-input.json');
  const placeholder = inferFilePlaceholder(execution.argv ?? [], suggestedPath);
  return [{
    placeholder,
    suggestedPath,
    content: materialize.content,
  }];
}

function inferFilePlaceholder(argv, suggestedPath) {
  const jsonPlaceholder = argv.find(item => /^<.*\.json>$/.test(String(item)));
  if (jsonPlaceholder) return jsonPlaceholder;
  const fileIndex = argv.findIndex(item => item === '--file');
  if (fileIndex >= 0 && argv[fileIndex + 1]) return argv[fileIndex + 1];
  return `<${suggestedPath}>`;
}

function writeMaterializedFiles(prepared) {
  mkdirSync(prepared.workdir, { recursive: true });
  const out = [];
  for (const file of prepared.materializedFiles) {
    writeFileSync(file.path, `${JSON.stringify(file.content, null, 2)}\n`, 'utf8');
    out.push({
      placeholder: file.placeholder,
      path: file.path,
      bytes: Buffer.byteLength(JSON.stringify(file.content)),
    });
  }
  return out;
}

function runSegmently(segmentlyBin, argv, options) {
  const result = spawnSync(segmentlyBin, argv, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 4,
  });
  if (result.error) {
    return {
      status: 1,
      stdout: result.stdout ?? '',
      stderr: result.error.message,
    };
  }
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function resolveSegmentlyEnv(args) {
  const value = args.env
    || args.segmentlyEnv
    || process.env.SUPPORT_FLOW_SEGMENTLY_ENV
    || process.env.SUPPORT_FLOW_SEGMENTLY_AUTH_ENV
    || process.env.SEGMENTLY_ENV;
  return value && value !== true ? String(value) : null;
}

function safeSuggestedPath(path) {
  return String(path)
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, '-')
    || 'segmently-cli-do-input.json';
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
    'resultPath',
    'segmently',
    'segmentlyBin',
    'segmentlyEnv',
    'skipVerify',
    'timeoutMs',
    'workdir',
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

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeJson(value) {
  const output = {
    schemaVersion: 1,
    artifactType: 'segmently-launch-guide-cli-do-result',
    createdAt: new Date().toISOString(),
    ...value,
  };
  const resultPath = outputArgs.resultPath
    ? resolve(outputArgs.resultPath)
    : process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR
      ? resolve(process.env.SUPPORT_FLOW_LIVE_AGENT_CASE_DIR, 'cli-do-runner-result.json')
      : null;
  if (resultPath) {
    mkdirSync(dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Segmently launch CLI DO runner

Usage:
  node runtime/cli-do-runner.mjs --action <cliActionId> [inputs...]
  node runtime/cli-do-runner.mjs --action <cliActionId> [inputs...] --env dev --execute

Without --execute this runner is read-only and returns the command, patch files,
and verification read that would run. With --execute it runs the Segmently CLI
and then runs the returned verification command unless --skipVerify is set.
Use --env or SUPPORT_FLOW_SEGMENTLY_ENV / SUPPORT_FLOW_SEGMENTLY_AUTH_ENV to
pin the Segmently CLI environment; otherwise the local CLI default is used.
When SUPPORT_FLOW_LIVE_AGENT_CASE_DIR or --resultPath is set, it also writes
cli-do-runner-result.json for live-agent verification.
`);
}

main();
