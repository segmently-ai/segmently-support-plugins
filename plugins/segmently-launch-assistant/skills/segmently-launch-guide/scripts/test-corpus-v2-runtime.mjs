#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearCorpusV2ConfigCache, createCorpusV2Runtime } from '../runtime/corpus-v2.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function canonicalHash(value) {
  const copy = structuredClone(value);
  if (copy && typeof copy === 'object') delete copy.projectAnalytics;
  return crypto.createHash('sha256').update(JSON.stringify(stable(copy))).digest('hex');
}

function headers(values = {}) {
  const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (key) => normalized[String(key).toLowerCase()] ?? null };
}

const document = {
  schemaVersion: '2.0.0',
  launchScreenId: 'article-screen',
  screens: { 'article-screen': { id: 'article-screen', content: { title: 'Deterministic fetch fixture' } } },
  projectAnalytics: { generatedAt: 'ignored-by-canonical-hash' },
};
const article = {
  articleAlias: 'runtime-fetch-fixture',
  configUrl: 'https://example.test/runtime-fetch-fixture/config.json',
  contentHash: canonicalHash(document),
};
const requests = [];

clearCorpusV2ConfigCache();
const runtime = createCorpusV2Runtime({
  root,
  fetchImpl: async (url, init) => {
    requests.push({ url, headers: init.headers });
    if (requests.length === 1) {
      return { ok: true, status: 200, headers: headers({ etag: '"fixture-v1"' }), json: async () => document };
    }
    return { ok: false, status: 304, headers: headers({ etag: '"fixture-v1"' }) };
  },
});

const first = await runtime.fetchArticleConfig(article, { timeoutMs: 50 });
assert.equal(first.ok, true);
assert.equal(first.cache, 'miss');
assert.equal(first.hashMatch, true);
assert.equal(first.etag, '"fixture-v1"');

const second = await runtime.fetchArticleConfig(article, { timeoutMs: 50 });
assert.equal(second.ok, true);
assert.equal(second.cache, 'hit');
assert.equal(requests.length, 1, 'fresh cache hit must not perform a second request');

const third = await runtime.fetchArticleConfig(article, { timeoutMs: 50, cacheMaxAgeMs: -1 });
assert.equal(third.ok, true);
assert.equal(third.status, 304);
assert.equal(third.cache, 'revalidated');
assert.equal(requests.length, 2);
assert.equal(requests[1].headers['If-None-Match'], '"fixture-v1"');

clearCorpusV2ConfigCache();
const staleRuntime = createCorpusV2Runtime({
  root,
  fetchImpl: async () => ({ ok: true, status: 200, headers: headers(), json: async () => document }),
});
const stale = await staleRuntime.fetchArticleConfig({ ...article, contentHash: '0'.repeat(64) }, { timeoutMs: 50 });
assert.equal(stale.ok, false);
assert.equal(stale.hashMatch, false);
assert.equal(stale.reason, 'STALE_ARTICLE_HASH');
assert.equal(stale.document, null);

clearCorpusV2ConfigCache();
const timeoutRuntime = createCorpusV2Runtime({
  root,
  fetchImpl: async () => {
    const error = new Error('fixture timeout');
    error.name = 'TimeoutError';
    throw error;
  },
});
const timedOut = await timeoutRuntime.fetchArticleConfig(article, { timeoutMs: 1 });
assert.equal(timedOut.ok, false);
assert.equal(timedOut.reason, 'ARTICLE_CONFIG_TIMEOUT');

const fallbackArticle = timeoutRuntime.directory.articles[0];
const fallback = timeoutRuntime.loadFallback(fallbackArticle);
assert.equal(fallback.articleAlias, fallbackArticle.articleAlias);
assert.equal(fallback.contentHash, fallbackArticle.contentHash);
assert.ok(Array.isArray(fallback.sections) && fallback.sections.length > 0);

process.stdout.write(`${JSON.stringify({
  ok: true,
  checks: {
    canonicalHash: true,
    cacheHit: true,
    etagRevalidation: true,
    staleHashRejected: true,
    timeoutClassified: true,
    boundedFallbackLoaded: true,
  },
}, null, 2)}\n`);
