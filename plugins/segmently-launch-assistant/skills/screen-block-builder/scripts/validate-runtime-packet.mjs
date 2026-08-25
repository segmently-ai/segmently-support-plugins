#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRuntimePacket } from './lib/runtime-packet.mjs';

const args = parseArgs(process.argv.slice(2));
const packetPath = args.packet ?? args._[0];
if (!packetPath) fail('Usage: validate-runtime-packet.mjs --packet <runtime-packet.json> [--format json]');

let packet;
try {
  packet = JSON.parse(readFileSync(resolve(packetPath), 'utf8'));
} catch (error) {
  fail(`Cannot read packet: ${error instanceof Error ? error.message : String(error)}`);
}

const result = validateRuntimePacket(packet);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) out._.push(token);
    else if (token === '--format') out.format = argv[++index];
    else if (token === '--packet') out.packet = argv[++index];
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
