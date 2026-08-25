#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (process.argv.includes('--isolate') && process.env.SEGMENTLY_CORPUS_V2_ISOLATED !== '1') {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'segmently-corpus-v2-forward-'));
  const isolatedRoot = path.join(tempRoot, 'segmently-launch-guide');
  try {
    fs.cpSync(root, isolatedRoot, { recursive: true });
    const child = spawnSync(process.execPath, [path.join(isolatedRoot, 'scripts/run-codex-forward-test.mjs')], {
      cwd: tempRoot,
      env: { ...process.env, SEGMENTLY_CORPUS_V2_ISOLATED: '1' },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    process.exitCode = child.status ?? 1;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
} else {
  const failures = [];
  const required = [
    'SKILL.md',
    'references/corpus-v2/manifest.json',
    'references/corpus-v2/article-directory.json',
    'references/corpus-v2/article-section-index.jsonl',
    'references/corpus-v2/article-search-index.json',
    'references/corpus-v2/guide-routing-index.json',
    'references/corpus-v2/guide-bindings.json',
    'runtime/corpus-v2.mjs',
    'runtime/customer-response-runner.mjs',
    'runtime/do-action-reference.json',
    'scripts/run-evals.mjs',
    'scripts/test-corpus-v2-runtime.mjs',
    'evals/corpus-v2-cases.json',
  ];
  for (const relative of required) if (!fs.existsSync(path.join(root, relative))) failures.push(`missing ${relative}`);
  const responsePath = path.join(os.tmpdir(), `segmently-corpus-v2-forward-${process.pid}.json`);
  const tracePath = path.join(os.tmpdir(), `segmently-corpus-v2-forward-${process.pid}.trace.json`);
  try {
    const child = spawnSync(process.execPath, [
      path.join(root, 'runtime/customer-response-runner.mjs'),
      '--corpus-version', 'v2',
      '--mode', 'teach',
      '--prompt', 'How do I change the Flexible Layout button font?',
      '--article-aliases', 'help-flexible-layout-button-sections',
      '--config-timeout-ms', '1',
      '--result-path', responsePath,
      '--trace-path', tracePath,
    ], { cwd: root, encoding: 'utf8' });
    if (child.status !== 0) failures.push((child.stderr || child.stdout || 'runner failed').slice(0, 2000));
    else {
      const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
      const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
      if (response.corpusSchemaVersion !== 2) failures.push('response schema is not V2');
      if (response.selectedArticles?.[0]?.articleAlias !== 'help-flexible-layout-button-sections') failures.push('semantic Article selection drifted');
      if ((trace.filesOpened ?? []).some((file) => file.path.includes('support-knowledge-graph'))) failures.push('graph loaded');
    }
  } finally {
    fs.rmSync(responsePath, { force: true });
    fs.rmSync(tracePath, { force: true });
  }
  const acceptance = spawnSync(process.execPath, [path.join(root, 'scripts/run-evals.mjs')], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (acceptance.status !== 0) failures.push((acceptance.stderr || acceptance.stdout || 'acceptance failed').slice(0, 4000));
  const runtimeTest = spawnSync(process.execPath, [path.join(root, 'scripts/test-corpus-v2-runtime.mjs')], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (runtimeTest.status !== 0) failures.push((runtimeTest.stderr || runtimeTest.stdout || 'Corpus V2 runtime test failed').slice(0, 4000));
  process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, isolated: process.env.SEGMENTLY_CORPUS_V2_ISOLATED === '1', failures }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}
