#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = parseArgs(process.argv.slice(2));
const root = resolve(args.root ?? dirname(dirname(fileURLToPath(import.meta.url))));
const extensions = new Set(['.md', '.json', '.mjs', '.yaml', '.yml']);
const forbidden = [
  '.' + 'agents/',
  '.' + 'claude/',
  'src/' + 'modules/',
  'n' + '8n/',
  'data-' + 'testid',
  'service-' + String.fromCharCode(97, 100, 109, 105, 110),
  'SEGMENTLY_' + 'TOKEN',
  'SEGMENTLY_' + 'API_KEY',
  '/Users' + '/',
  'local' + 'host',
  '127.' + '0.0.1',
  '-----BEGIN ' + 'PRIVATE KEY-----',
];
const findings = [];

for (const file of listFiles(root)) {
  if (!extensions.has(extname(file))) continue;
  const content = readFileSync(file, 'utf8');
  for (const marker of forbidden) {
    if (content.includes(marker)) findings.push(`${relative(root, file)} contains forbidden marker ${JSON.stringify(marker)}`);
  }
  if (/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/.test(content)) {
    findings.push(`${relative(root, file)} contains a token-shaped value`);
  }
}

process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, root, findings }, null, 2)}\n`);
if (findings.length) process.exitCode = 1;

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root') out.root = argv[++index];
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
