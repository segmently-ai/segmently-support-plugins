#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateBlueprint } from './lib/library-example.mjs';
import { isRecord } from './lib/runtime-packet.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.input) fail('Usage: validate-compile-input.mjs --input <compile-input.json> [--format json]');

let input;
try {
  input = JSON.parse(readFileSync(resolve(args.input), 'utf8'));
} catch (error) {
  fail(`Cannot read compile input: ${error instanceof Error ? error.message : String(error)}`);
}

const result = validateCompileInput(input);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

export function validateCompileInput(value) {
  const failures = [];
  if (!isRecord(value)) return { ok: false, failures: ['compile input must be an object'] };
  if ('input' in value) failures.push('request file must be the compile input itself, without an input wrapper');
  if (!['staged', 'immediate'].includes(value.insertionMode)) failures.push('insertionMode must be staged or immediate');

  if (!isRecord(value.source)) failures.push('source must be an object');
  else {
    if (!['project', 'system'].includes(value.source.scope)) failures.push('source.scope must be project or system');
    for (const field of ['exampleId', 'name']) {
      if (!nonEmpty(value.source[field])) failures.push(`source.${field} must be non-empty`);
    }
    if (!/^fnv1a:[a-f0-9]{8}$/.test(String(value.source.checksum ?? ''))) {
      failures.push('source.checksum must be fnv1a:<8 lowercase hex characters>');
    }
    validateBlueprint(value.source.blueprint, failures);
  }

  if (!isRecord(value.target)) failures.push('target must be an object');
  else {
    if (!isRecord(value.target.strategy)) failures.push('target.strategy must be an object');
    if (value.target.sequence !== undefined && !Array.isArray(value.target.sequence)) {
      failures.push('target.sequence must be an array when present');
    }
    for (const [index, block] of (value.target.sequence ?? []).entries()) {
      if (!isRecord(block) || !nonEmpty(block.entityId) || !nonEmpty(block.name) || !nonEmpty(block.blockType)) {
        failures.push(`target.sequence[${index}] must be a compact block summary`);
      }
      if (isRecord(block) && ('screens' in block || 'previewScreens' in block)) {
        failures.push(`target.sequence[${index}] must not contain screens`);
      }
    }
    for (const side of ['predecessor', 'successor']) {
      const neighbour = value.target[side];
      if (neighbour === undefined) continue;
      if (!isRecord(neighbour) || !nonEmpty(neighbour.name) || !nonEmpty(neighbour.blockType)) {
        failures.push(`target.${side} must be a compact neighbour`);
      } else if ('screens' in neighbour || 'previewScreens' in neighbour) {
        failures.push(`target.${side} must not contain screens`);
      }
    }
  }

  if (!isRecord(value.evidence) || !isRecord(value.evidence.selection)) {
    failures.push('evidence.selection must be an object');
  } else {
    const mode = value.evidence.selection.mode;
    if (!['strategy-default', 'selected-only', 'no-evidence'].includes(mode)) {
      failures.push('evidence.selection.mode is invalid');
    }
    if (mode === 'selected-only') {
      const refs = value.evidence.selection.refs;
      if (!Array.isArray(refs) || refs.length === 0) failures.push('selected-only evidence requires refs');
      const catalog = Array.isArray(value.evidence.availableItems) ? value.evidence.availableItems : [];
      for (const ref of refs ?? []) {
        const found = catalog.find((item) => isRecord(item)
          && item.kind === ref?.kind && item.id === ref?.id && item.accessible === true);
        if (!found) failures.push(`selected evidence is unavailable or inaccessible: ${ref?.kind}/${ref?.id}`);
      }
    }
  }

  if (value.variableMappings !== undefined && !Array.isArray(value.variableMappings)) {
    failures.push('variableMappings must be an array when present');
  }
  for (const [index, mapping] of (value.variableMappings ?? []).entries()) {
    if (!isRecord(mapping) || !['bind', 'create', 'drop', 'incompatible'].includes(mapping.action)) {
      failures.push(`variableMappings[${index}].action is invalid`);
    }
  }
  if (!nonEmpty(value.provider)) failures.push('provider must be non-empty');
  if (!nonEmpty(value.model)) failures.push('model must be non-empty');
  if (value.maxTokens !== undefined && (!Number.isInteger(value.maxTokens) || value.maxTokens <= 0)) {
    failures.push('maxTokens must be a positive integer when present');
  }

  for (const path of findForbidden(value)) failures.push(`compile input contains forbidden material at ${path}`);
  return { ok: failures.length === 0, failures };
}

function findForbidden(value, path = '$', results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbidden(item, `${path}[${index}]`, results));
    return results;
  }
  if (!isRecord(value)) return results;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (['previewScreens', 'aiAssets', 'generatedUrl', 'posterUrl', 'referenceImages', 'storagePath', 'providerRequest', 'providerResponse'].includes(key)) {
      results.push(childPath);
    } else {
      findForbidden(child, childPath, results);
    }
  }
  return results;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') out.input = argv[++index];
    else if (token === '--format') out.format = argv[++index];
    else fail(`Unknown option ${token}`);
  }
  return out;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
