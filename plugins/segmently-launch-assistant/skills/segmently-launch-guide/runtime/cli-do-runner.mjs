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
import { buildToolPreflight } from './tool-preflight.mjs';
import { resolveProjectContext } from './session-context.mjs';

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

  const projectContext = resolveProjectContext(args);
  const effectiveArgs = argsForProjectContext(args, projectContext);
  const runnerArgs = argsForProjectContextArgv(filterLocalArgs(rawArgs), effectiveArgs, projectContext);

  const plan = runEditorRunner(runnerArgs);
  if (plan.ok !== true) {
    writeJson({
      ok: false,
      actionId: plan.actionId ?? args.action,
      reason: plan.reason ?? plan.error ?? 'editor-do-runner did not return an executable plan',
      missingInputs: plan.missingInputs ?? [],
      sessionContext: buildSessionContextContract(projectContext),
      interactionPolicy: buildInteractionPolicy(plan.missingInputs ?? []),
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
      sessionContext: buildSessionContextContract(projectContext),
      interactionPolicy: buildInteractionPolicy(plan.missingInputs ?? []),
      runnerPlan: plan,
    });
    process.exitCode = 2;
    return;
  }

  const prepared = prepareCliExecution(plan, effectiveArgs);
  prepared.toolPreflight = buildToolPreflight(args, {
    segmentlyEnv: prepared.segmentlyEnv,
    needsSegmently: true,
    needsBrowser: false,
    retryArgv: ['node', 'runtime/cli-do-runner.mjs', ...ensureExecuteArgv(rawArgs)],
  });
  if (!args.execute) {
    writeJson({
      ok: true,
      dryRun: true,
      actionId: plan.actionId,
      mode: plan.mode,
      owningSkill: plan.executeWith?.skill ?? plan.execution.owningSkill,
      commandFamily: plan.execution.commandFamily,
      routingPolicy: cliRoutingPolicy(plan),
      sessionContext: buildSessionContextContract(projectContext),
      interactionPolicy: buildInteractionPolicy(plan.missingInputs ?? []),
      segmentlyEnv: prepared.segmentlyEnv,
      requiresExecute: true,
      execution: plan.execution,
      toolPreflight: prepared.toolPreflight,
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
    routingPolicy: cliRoutingPolicy(plan),
    sessionContext: buildSessionContextContract(projectContext),
    interactionPolicy: buildInteractionPolicy([]),
    segmentlyEnv: prepared.segmentlyEnv,
    toolPreflight: prepared.toolPreflight,
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

function cliRoutingPolicy(plan) {
  return {
    schemaVersion: 1,
    semanticDecisionOwner: 'agent-model',
    primaryExecutionOwner: plan.executeWith?.skill ?? plan.execution?.owningSkill ?? null,
    mustDelegateCliDoToOwningSkill: true,
    runnerRole: 'dry-run-or-approved-smoke-executor-after-owning-skill-selection',
    lowLevelExecutionAllowedOnlyAfter: [
      'the agent selected the action semantically from shipped catalog references',
      'the customer approved the mutation',
      'tool/auth preflight passed',
      'verification readback is available',
    ],
  };
}

function argsForProjectContext(args, projectContext) {
  if (!projectContext.projectId || hasArg(args, 'projectId')) return args;
  return {
    ...args,
    projectId: projectContext.projectId,
    projectName: hasArg(args, 'projectName') ? args.projectName : projectContext.projectName,
  };
}

function argsForProjectContextArgv(argv, args, projectContext) {
  if (!projectContext.projectId || argv.includes('--projectId')) return argv;
  return [...argv, '--projectId', projectContext.projectId];
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
    askToSetCurrentProject: projectContext.missingProject === true && !hasArg(outputArgs, 'projectId'),
    setCurrentProjectCommand: 'node runtime/session-context.mjs set-current-project --projectId <projectId> --projectName "<Project name>"',
    readError: projectContext.readError ?? null,
  };
}

function buildInteractionPolicy(missingInputs = []) {
  return {
    schemaVersion: 1,
    multiStepActionTool: 'todo-list',
    multiStepActionToolAliases: ['TodoWrite', 'update_plan', 'task-list'],
    askUserQuestionTool: 'ask-user-question',
    askUserQuestionToolAliases: ['AskUserQuestion', 'request_user_input'],
    shouldUseTodoList: true,
    shouldAskUserQuestion: missingInputs.length > 0,
    missingInputs,
    fallbackWhenToolUnavailable: 'ask one concise targeted question in prose and continue only after the answer is available',
  };
}

function ensureExecuteArgv(argv) {
  return argv.includes('--execute') ? argv : [...argv, '--execute'];
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
    'contextFile',
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
  node runtime/cli-do-runner.mjs --action <cliActionId> [inputs...] --execute

Without --execute this runner is read-only and returns the command, patch files,
and verification read that would run. With --execute it runs the Segmently CLI
and then runs the returned verification command unless --skipVerify is set.
Use --env or SUPPORT_FLOW_SEGMENTLY_ENV / SUPPORT_FLOW_SEGMENTLY_AUTH_ENV to
pin the Segmently CLI environment only when the customer or harness explicitly
provides one; otherwise use the local CLI default.
When SUPPORT_FLOW_LIVE_AGENT_CASE_DIR or --resultPath is set, it also writes
cli-do-runner-result.json for live-agent verification.
`);
}

main();
