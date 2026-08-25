#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (!args.runDir || !args.scenario || !args.runId || !args.agentTask || args.notes.length === 0) {
  fail('Usage: record-agent-completion.mjs --run-dir <directory> --scenario <name> --run-id <id> --agent-task <fresh-agent-id> --note <evaluator note> [--note <evaluator note> ...]');
}

const runDir = resolve(args.runDir);
const manifest = readJson(join(runDir, 'run-manifest.json'));
const requestPath = join(runDir, manifest.agentInput ?? 'agent-request.json');
const rawOutputPath = join(runDir, manifest.rawOutput ?? 'raw-output.json');
const evaluationPath = join(runDir, manifest.evaluation ?? 'evaluation.json');
const completionPath = join(runDir, manifest.completion ?? 'completion.json');
const request = readJson(requestPath);
readJson(rawOutputPath);
const evaluation = readJson(evaluationPath);

assert(manifest.kind === 'segmently.packet-only-agent-run' && manifest.schemaVersion === 2,
  'run manifest is not the supported packet-only schemaVersion 2 contract');
assert(manifest.status === 'prepared-awaiting-agent',
  'run manifest must remain the immutable prepared-awaiting-agent receipt');
assert(request.exactInputHash === manifest.exactInputHash && request.checksum === manifest.checksum,
  'agent request does not match the prepared run manifest');
assert(evaluation.ok === true && Array.isArray(evaluation.failures) && evaluation.failures.length === 0,
  'evaluation must pass with zero failures before completion can be recorded');
assert(evaluation.exactInputHash === manifest.exactInputHash,
  'evaluation does not match the prepared packet hash');

writeJson(completionPath, {
  schemaVersion: 1,
  kind: 'segmently.packet-only-agent-completion',
  status: 'evaluated-pass',
  scenario: compact(args.scenario, 'scenario'),
  runId: compact(args.runId, 'run id'),
  agentTask: compact(args.agentTask, 'agent task'),
  completedAt: new Date().toISOString(),
  inputBoundary: {
    kind: 'agent-request-only',
    file: manifest.agentInput ?? 'agent-request.json',
    checksum: sha256(readFileSync(requestPath)),
    inheritedConversation: false,
    repositoryAccess: false,
    webAccess: false,
    writeAccess: false,
  },
  exactInputHash: manifest.exactInputHash,
  checksum: manifest.checksum,
  validationSchemaChecksum: manifest.validationSchemaChecksum,
  rawOutput: {
    file: manifest.rawOutput ?? 'raw-output.json',
    checksum: sha256(readFileSync(rawOutputPath)),
  },
  evaluation: {
    file: manifest.evaluation ?? 'evaluation.json',
    checksum: sha256(readFileSync(evaluationPath)),
    ok: true,
  },
  evaluatorNotes: args.notes.map((note) => compact(note, 'evaluator note')),
  proofClass: manifest.proofClass,
  replacesRuntimeTaskDebug: false,
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  status: 'evaluated-pass',
  completionPath,
  exactInputHash: manifest.exactInputHash,
}, null, 2)}\n`);

function parseArgs(argv) {
  const out = { notes: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-dir') out.runDir = argv[++index];
    else if (token === '--scenario') out.scenario = argv[++index];
    else if (token === '--run-id') out.runId = argv[++index];
    else if (token === '--agent-task') out.agentTask = argv[++index];
    else if (token === '--note') out.notes.push(argv[++index]);
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compact(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim().slice(0, 500);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
