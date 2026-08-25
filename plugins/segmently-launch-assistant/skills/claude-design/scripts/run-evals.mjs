#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const evalPath = path.join(skillRoot, 'evals', 'evals.json');
const config = JSON.parse(fs.readFileSync(evalPath, 'utf8'));

let failures = 0;

for (const testCase of config.cases) {
  const corpus = testCase.files
    .map((relativePath) => {
      const absolutePath = path.join(skillRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        failures += 1;
        return `\n[MISSING:${relativePath}]\n`;
      }
      return fs.readFileSync(absolutePath, 'utf8');
    })
    .join('\n');

  const missing = (testCase.mustContain ?? []).filter((term) => !corpus.includes(term));
  const forbidden = (testCase.mustNotContain ?? []).filter((term) => corpus.includes(term));

  if (missing.length || forbidden.length) {
    failures += 1;
    console.error(`FAIL ${testCase.id}`);
    if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    if (forbidden.length) console.error(`  forbidden: ${forbidden.join(', ')}`);
  } else {
    console.log(`PASS ${testCase.id}`);
  }
}

if (failures) {
  console.error(`\n${config.name}: ${failures} failed`);
  process.exit(1);
}

console.log(`\n${config.name}: ${config.cases.length} passed`);
