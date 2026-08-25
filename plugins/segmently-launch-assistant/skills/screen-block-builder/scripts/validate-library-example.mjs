#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateLibraryExample } from './lib/library-example.mjs';

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input ?? args._[0];
if (!inputPath) fail('Usage: validate-library-example.mjs --input <library-example.json> [--format json]');

let input;
try {
  input = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
} catch (error) {
  fail(`Cannot read example: ${error instanceof Error ? error.message : String(error)}`);
}

const result = validateLibraryExample(input.example ?? input.payload ?? input);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) out._.push(token);
    else if (token === '--input') out.input = argv[++index];
    else if (token === '--format') out.format = argv[++index];
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
