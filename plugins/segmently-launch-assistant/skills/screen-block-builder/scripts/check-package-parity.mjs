#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (!args.source || !args.target) {
  fail('Usage: check-package-parity.mjs --source <skill-root> --target <packaged-skill-root>');
}

const source = resolve(args.source);
const target = resolve(args.target);
const sourceFiles = fileMap(source);
const targetFiles = fileMap(target);
const paths = [...new Set([...sourceFiles.keys(), ...targetFiles.keys()])].sort();
const findings = [];
for (const path of paths) {
  if (!sourceFiles.has(path)) findings.push(`${path}: target-only`);
  else if (!targetFiles.has(path)) findings.push(`${path}: source-only`);
  else if (sourceFiles.get(path) !== targetFiles.get(path)) findings.push(`${path}: content drift`);
}

process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, source, target, checkedFiles: paths.length, findings }, null, 2)}\n`);
if (findings.length) process.exitCode = 1;

function fileMap(root) {
  const map = new Map();
  for (const file of listFiles(root)) {
    const rel = relative(root, file);
    if (rel === '.DS_Store') continue;
    map.set(rel, createHash('sha256').update(readFileSync(file)).digest('hex'));
  }
  return map;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source') out.source = argv[++index];
    else if (token === '--target') out.target = argv[++index];
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
