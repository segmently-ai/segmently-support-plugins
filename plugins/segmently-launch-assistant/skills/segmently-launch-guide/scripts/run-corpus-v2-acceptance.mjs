#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const allowLegacy = process.argv.includes('--allow-legacy');
const runner = path.join(root, 'runtime/customer-response-runner.mjs');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evals/corpus-v2-cases.json'), 'utf8'));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'segmently-corpus-v2-acceptance-'));
const results = [];
let runtimeContract = null;

try {
  for (const testCase of fixture.cases) {
    const resultPath = path.join(tempRoot, `${testCase.id}.json`);
    const tracePath = path.join(tempRoot, `${testCase.id}.trace.json`);
    const child = spawnSync(process.execPath, [
      runner,
      '--corpus-version', 'v2',
      '--prompt', testCase.prompt,
      '--config-timeout-ms', '1',
      '--result-path', resultPath,
      '--trace-path', tracePath,
    ], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (child.status !== 0 || !fs.existsSync(resultPath) || !fs.existsSync(tracePath)) {
      results.push({ id: testCase.id, ok: false, failures: [(child.stderr || child.stdout || 'missing result').slice(0, 2000)] });
      continue;
    }
    const response = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    const ranked = (trace.searchResult?.candidates ?? []).map((candidate) => candidate.article.articleAlias);
    const primary = response.selectedArticles?.[0]?.articleAlias ?? null;
    const failures = [];
    if (response.mode !== testCase.expectedMode) failures.push(`mode ${response.mode} != ${testCase.expectedMode}`);
    if (testCase.expectedNoMatch) {
      if (response.mode !== 'handoff' || (response.selectedArticles ?? []).length !== 0) failures.push('no-match did not hand off');
    } else {
      if (primary !== testCase.expectedArticleAlias) failures.push(`primary ${primary} != ${testCase.expectedArticleAlias}`);
      if (!ranked.slice(0, 5).includes(testCase.expectedArticleAlias)) failures.push('expected Article absent from top 5');
    }
    if ((response.selectedArticles ?? []).length > 5) failures.push('selected more than five Articles');
    if ((response.guideBindings ?? []).length > 2) failures.push('selected more than two Guide bindings');
    if (testCase.expectedResolverKind && response.resolver?.kind !== testCase.expectedResolverKind) {
      failures.push(`resolver ${response.resolver?.kind ?? 'missing'} != ${testCase.expectedResolverKind}`);
    }
    if (testCase.expectedActionId && response.action?.actionId !== testCase.expectedActionId) {
      failures.push(`action ${response.action?.actionId ?? 'missing'} != ${testCase.expectedActionId}`);
    }
    if (testCase.expectedMissingInputs?.some((input) => !response.action?.missingInputs?.includes(input))) {
      failures.push(`action missing required missing-input evidence: ${testCase.expectedMissingInputs.join(', ')}`);
    }
    if (response.mode === 'teach' && trace.responseBytes > 32_000) failures.push('TEACH response exceeds 32 KB');
    const bootstrapBytes = (trace.filesOpened ?? []).filter((file) => file.stage === 'bootstrap').reduce((sum, file) => sum + file.bytes, 0);
    if (bootstrapBytes > 1_500_000) failures.push('bootstrap exceeds 1.5 MB');
    if ((trace.filesOpened ?? []).some((file) => file.path.includes('support-knowledge-graph'))) failures.push('opened public graph');
    if (testCase.expectedFailureCode && !(trace.failureCodes ?? []).includes(testCase.expectedFailureCode)) {
      failures.push(`failure code ${testCase.expectedFailureCode} missing`);
    }
    if (testCase.forbidExecutionClaim && (response.action?.executionObserved || response.action?.verificationObserved)) failures.push('unobserved execution/verification claim');
    results.push({ id: testCase.id, ok: failures.length === 0, ranked, primary, mode: response.mode, bootstrapBytes, responseBytes: trace.responseBytes, failures });
  }
  const forbiddenLegacy = [
    'references/support-knowledge-graph',
    'references/article-registry.json',
    'references/article-directory.json',
    'references/article-search-index.json',
    'references/article-search-synonyms.json',
    'references/articles',
    'references/guide-registry.json',
    'references/guide-evidence.json',
    'references/guides',
    'references/teach-reference.json',
  ].filter((relative) => fs.existsSync(path.join(root, relative)));
  const runtimeTest = spawnSync(process.execPath, [path.join(root, 'scripts/test-corpus-v2-runtime.mjs')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  runtimeContract = runtimeTest.status === 0
    ? JSON.parse(runtimeTest.stdout)
    : { ok: false, error: (runtimeTest.stderr || runtimeTest.stdout || 'runtime contract test failed').slice(0, 4000) };
  const report = {
    ok: results.every((result) => result.ok) && runtimeContract.ok === true && (allowLegacy || forbiddenLegacy.length === 0),
    corpusContentHash: JSON.parse(fs.readFileSync(path.join(root, 'references/corpus-v2/manifest.json'), 'utf8')).contentHash,
    caseCount: results.length,
    failedCases: results.filter((result) => !result.ok),
    forbiddenLegacyPresent: forbiddenLegacy,
    legacyCorpusAllowedForMaintainerTarget: allowLegacy,
    runtimeContract,
    maximumBootstrapBytes: Math.max(...results.map((result) => result.bootstrapBytes ?? 0)),
    maximumTeachResponseBytes: Math.max(0, ...results.filter((result) => result.mode === 'teach').map((result) => result.responseBytes ?? 0)),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
