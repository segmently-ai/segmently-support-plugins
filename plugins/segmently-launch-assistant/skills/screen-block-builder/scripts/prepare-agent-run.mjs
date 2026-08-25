#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentRequest, validateRuntimePacket } from './lib/runtime-packet.mjs';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const args = parseArgs(process.argv.slice(2));
if (!args.packet || !args.outDir) {
  fail('Usage: prepare-agent-run.mjs --packet <runtime-packet.json> --out-dir <directory>');
}

const packet = readJson(args.packet);
const validation = validateRuntimePacket(packet);
if (!validation.ok) fail(`Runtime packet failed validation:\n- ${validation.failures.join('\n- ')}`);

const outDir = resolve(args.outDir);
mkdirSync(outDir, { recursive: true });
const agentRequestPath = join(outDir, 'agent-request.json');
const evalContextPath = join(outDir, 'eval-context.json');
const manifestPath = join(outDir, 'run-manifest.json');
const validationSchemaPath = join(outDir, 'validation-schema.json');
const validationSchemaSourcePath = join(skillRoot, 'references/block-screen-output-schema.json');
const validationSchemaChecksum = sha256(readFileSync(validationSchemaSourcePath));

writeJson(agentRequestPath, buildAgentRequest(packet));
writeJson(evalContextPath, {
  schemaVersion: 1,
  exactInputHash: packet.exactInputHash,
  agentId: packet.agentId,
  baseUserMessage: packet.userMessage,
  renderInput: packet.renderInput,
  resolvedBranch: packet.resolvedBranch,
  promptPaths: packet.promptPaths,
  promptVersions: packet.promptVersions,
});
copyFileSync(validationSchemaSourcePath, validationSchemaPath);
writeJson(manifestPath, {
  schemaVersion: 2,
  kind: 'segmently.packet-only-agent-run',
  status: 'prepared-awaiting-agent',
  exactInputHash: packet.exactInputHash,
  checksum: packet.checksum,
  agentInput: 'agent-request.json',
  heldBackEvaluatorContext: 'eval-context.json',
  heldBackValidationSchema: 'validation-schema.json',
  validationSchemaChecksum,
  rawOutput: 'raw-output.json',
  evaluation: 'evaluation.json',
  completion: 'completion.json',
  proofClass: 'advisory-subagent-smoke',
  replacesRuntimeTaskDebug: false,
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  exactInputHash: packet.exactInputHash,
  outDir,
  agentRequestPath,
  evalContextPath,
  validationSchemaPath,
  validationSchemaChecksum,
  manifestPath,
}, null, 2)}\n`);

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--packet') out.packet = argv[++index];
    else if (token === '--out-dir') out.outDir = argv[++index];
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    fail(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
