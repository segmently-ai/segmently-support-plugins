#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = {
  skill: read('SKILL.md'),
  commands: read('references/commands.md'),
  manifests: read('references/manifests.md'),
  workflows: read('references/workflows.md'),
  backlog: read('references/backlog.md'),
};
corpus.all = Object.values(corpus).join('\n');

const evals = JSON.parse(read('evals/evals.json'));
let failures = 0;

for (const item of evals.evals) {
  const failed = [];
  for (const assertion of item.assertions) {
    const source = corpus[assertion.corpus || 'all'];
    if (!source) {
      failed.push(`${assertion.name}: unknown corpus ${assertion.corpus}`);
      continue;
    }
    const lowerSource = source.toLowerCase();
    const missing = (assertion.mustContain || []).filter((needle) => !lowerSource.includes(String(needle).toLowerCase()));
    const forbidden = (assertion.mustNotContain || []).filter((needle) => lowerSource.includes(String(needle).toLowerCase()));
    if (missing.length > 0) {
      failed.push(`${assertion.name}: missing ${missing.map((entry) => JSON.stringify(entry)).join(', ')}`);
    }
    if (forbidden.length > 0) {
      failed.push(`${assertion.name}: forbidden ${forbidden.map((entry) => JSON.stringify(entry)).join(', ')}`);
    }
  }

  if (failed.length > 0) {
    failures += 1;
    console.error(`not ok - ${item.id}`);
    for (const message of failed) console.error(`  ${message}`);
  } else {
    console.log(`ok - ${item.id}`);
  }
}

if (failures > 0) {
  console.error(`${failures} eval(s) failed`);
  process.exit(1);
}

console.log(`${evals.evals.length} eval(s) passed`);

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}
