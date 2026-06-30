#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function readDirectoryCorpus(relativePath) {
  try {
    const names = await readdir(join(root, relativePath), { withFileTypes: true });
    const files = await Promise.all(
      names
        .filter((entry) => entry.isFile())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) => {
          const content = await readFile(join(root, relativePath, entry.name), 'utf8');
          return `\n--- ${entry.name} ---\n${content}`;
        }),
    );
    return files.join('\n');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

const files = {
  skill: await readFile(join(root, 'SKILL.md'), 'utf8'),
  commands: await readFile(join(root, 'references/commands.md'), 'utf8'),
  manifests: await readFile(join(root, 'references/manifests.md'), 'utf8'),
  workflows: await readFile(join(root, 'references/workflows.md'), 'utf8'),
  assetWorkflows: await readFile(join(root, 'references/asset-workflows.md'), 'utf8'),
  examples: await readDirectoryCorpus('examples'),
};

const evals = JSON.parse(await readFile(join(root, 'evals/evals.json'), 'utf8'));
let failures = 0;

for (const evaluation of evals.evals) {
  for (const assertion of evaluation.assertions) {
    const corpus = files[assertion.corpus];
    if (!corpus) {
      console.error(`[${evaluation.id}] unknown corpus: ${assertion.corpus}`);
      failures += 1;
      continue;
    }
    for (const expected of assertion.mustContain ?? []) {
      if (!corpus.includes(expected)) {
        console.error(`[${evaluation.id}] ${assertion.name}: missing "${expected}" in ${assertion.corpus}`);
        failures += 1;
      }
    }
    for (const forbidden of assertion.mustNotContain ?? []) {
      if (corpus.includes(forbidden)) {
        console.error(`[${evaluation.id}] ${assertion.name}: found forbidden "${forbidden}" in ${assertion.corpus}`);
        failures += 1;
      }
    }
  }
}

if (failures > 0) {
  console.error(`segmently-product-cli-guide evals failed: ${failures}`);
  process.exit(1);
}

console.log(`segmently-product-cli-guide evals passed: ${evals.evals.length}`);
