import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'both', 'but', 'by', 'can', 'click', 'each', 'for', 'from', 'has', 'have', 'help', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'keep', 'more', 'of', 'on', 'only', 'or', 'other', 'our', 'set', 'sets', 'should', 'so', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'to', 'use', 'used', 'using', 'when', 'where', 'which', 'will', 'with', 'you', 'your',
  'в', 'вы', 'где', 'для', 'если', 'и', 'из', 'или', 'как', 'когда', 'которые', 'который', 'мне', 'можно', 'на', 'не', 'нужно', 'но', 'перед', 'по', 'после', 'с', 'также', 'только', 'через', 'что', 'чтобы', 'это', 'я', 'здесь',
  'article', 'section', 'settings', 'setting', 'screen', 'segmently', 'http', 'https',
]);
const configCache = new Map();

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function canonicalDocument(value) {
  const copy = structuredClone(value);
  if (copy && typeof copy === 'object') delete copy.projectAnalytics;
  return copy;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(canonicalDocument(value)))).digest('hex');
}

export function normalizeCorpusQuery(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[_/\\#]+/g, ' ')
    .replace(/[^\p{L}\p{N}\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function corpusQueryTerms(value, stopwords = STOPWORDS) {
  return [...new Set(normalizeCorpusQuery(value).split(/[\s-]+/).filter((term) =>
    term.length >= 3
    && term.length <= 40
    && !stopwords.has(term)
    && !/^\d+$/.test(term)
    && !/^[a-f0-9]{16,}$/i.test(term),
  ))];
}

function readTracked(root, relativePath, tracker, kind = 'json') {
  const fullPath = join(root, relativePath);
  if (!existsSync(fullPath)) throw new Error(`Missing Corpus V2 file ${relativePath}`);
  const raw = readFileSync(fullPath, 'utf8');
  tracker.filesOpened.push({ path: relativePath, bytes: Buffer.byteLength(raw), stage: tracker.stage });
  tracker.bytesRead += Buffer.byteLength(raw);
  if (kind === 'jsonl') return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return JSON.parse(raw);
}

function scoreBucket(weight) {
  if (weight < 0) return 'negative-filter';
  if (weight >= 18) return 'alias';
  if (weight >= 12) return 'title';
  if (weight >= 10) return 'reviewed-synonym';
  if (weight >= 8) return 'section-title';
  if (weight >= 6) return 'reviewed-term';
  if (weight >= 3) return 'article-summary';
  return 'section-summary';
}

function compactBreakdown(scores) {
  return Object.fromEntries([...scores.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function createCorpusV2Runtime({ root, fetchImpl = globalThis.fetch, traceEnabled = false } = {}) {
  if (!root) throw new Error('Corpus V2 runtime requires the installed skill root.');
  const tracker = { stage: 'bootstrap', bytesRead: 0, filesOpened: [] };
  const manifest = readTracked(root, 'references/corpus-v2/manifest.json', tracker);
  if (manifest.corpusSchemaVersion !== 2) throw new Error(`Unsupported corpus schema ${manifest.corpusSchemaVersion}`);
  const directory = readTracked(root, 'references/corpus-v2/article-directory.json', tracker);
  const sectionRows = readTracked(root, 'references/corpus-v2/article-section-index.jsonl', tracker, 'jsonl');
  const searchIndex = readTracked(root, 'references/corpus-v2/article-search-index.json', tracker);
  const articleByAlias = new Map(directory.articles.map((entry) => [entry.articleAlias, entry]));
  const sectionsByRef = new Map(sectionRows.map((entry) => [`${entry.articleAlias}#${entry.sectionId}`, entry]));

  function search(query, { topK = 5, locale = 'en', productArea = null } = {}) {
    tracker.stage = 'candidate-selection';
    const started = performance.now();
    const normalizedQuery = normalizeCorpusQuery(query);
    const queryTerms = corpusQueryTerms(query, new Set(searchIndex.stopwords ?? STOPWORDS));
    const articleScores = new Map();
    const sectionScores = new Map();
    const breakdowns = new Map();
    const matchedTerms = new Map();
    const matchedNegativeTerms = new Map();
    const addArticleScore = (alias, term, weight) => {
      articleScores.set(alias, (articleScores.get(alias) ?? 0) + weight);
      const bucketScores = breakdowns.get(alias) ?? new Map();
      const bucket = scoreBucket(weight);
      bucketScores.set(bucket, (bucketScores.get(bucket) ?? 0) + weight);
      breakdowns.set(alias, bucketScores);
      const terms = matchedTerms.get(alias) ?? new Set();
      terms.add(term);
      matchedTerms.set(alias, terms);
    };
    const addNegativeScore = (alias, term, weight) => {
      articleScores.set(alias, (articleScores.get(alias) ?? 0) + weight);
      const bucketScores = breakdowns.get(alias) ?? new Map();
      bucketScores.set('negative-filter', (bucketScores.get('negative-filter') ?? 0) + weight);
      breakdowns.set(alias, bucketScores);
      const terms = matchedNegativeTerms.get(alias) ?? new Set();
      terms.add(term);
      matchedNegativeTerms.set(alias, terms);
    };
    for (const term of queryTerms) {
      const bestWeightByAlias = new Map();
      for (const [ref, weight] of searchIndex.postings?.[term] ?? []) {
        const [alias] = ref.split('#');
        if (!articleByAlias.has(alias)) continue;
        const numericWeight = Number(weight);
        bestWeightByAlias.set(alias, Math.max(bestWeightByAlias.get(alias) ?? 0, numericWeight));
        if (ref.includes('#') && !ref.endsWith('#')) {
          sectionScores.set(ref, (sectionScores.get(ref) ?? 0) + numericWeight);
        }
      }
      // A term may occur in dozens of sections in one long article. Count its
      // strongest article-level signal once so article length cannot dominate
      // retrieval, while retaining per-section scores for evidence selection.
      for (const [alias, weight] of bestWeightByAlias) {
        addArticleScore(alias, term, weight);
      }
      const strongestNegativeByAlias = new Map();
      for (const [ref, weight] of searchIndex.negativePostings?.[term] ?? []) {
        const [alias] = ref.split('#');
        if (!articleByAlias.has(alias)) continue;
        const numericWeight = Number(weight);
        strongestNegativeByAlias.set(alias, Math.min(strongestNegativeByAlias.get(alias) ?? 0, numericWeight));
      }
      for (const [alias, weight] of strongestNegativeByAlias) addNegativeScore(alias, term, weight);
    }
    for (const article of directory.articles) {
      const aliasPhrase = normalizeCorpusQuery(article.articleAlias.replace(/-/g, ' '));
      const titlePhrase = normalizeCorpusQuery(article.title);
      if (aliasPhrase && normalizedQuery.includes(aliasPhrase)) addArticleScore(article.articleAlias, aliasPhrase, 40);
      if (titlePhrase && normalizedQuery.includes(titlePhrase)) addArticleScore(article.articleAlias, titlePhrase, 32);
      const eventCatalogIntent = /(?:which|what|list|catalog|какие|список|каталог)/.test(normalizedQuery)
        && /(?:event|events|событ|ивент)/.test(normalizedQuery);
      const requestedPlatform = /(?:facebook|meta|фейсбук|мета)/.test(normalizedQuery)
        ? 'facebook'
        : /(?:tiktok|тик\s*ток)/.test(normalizedQuery)
          ? 'tiktok'
          : null;
      if (eventCatalogIntent && requestedPlatform && article.articleAlias === `${requestedPlatform}-events-catalog`) {
        addArticleScore(article.articleAlias, 'reviewed-event-catalog-intent', 16);
      }
    }
    const ranked = [...articleScores.entries()].map(([alias, score]) => {
      const article = articleByAlias.get(alias);
      let adjustedScore = score;
      const discardedReasons = [];
      const negativeMatches = [...(matchedNegativeTerms.get(alias) ?? [])].sort();
      if (negativeMatches.length > 0) discardedReasons.push('NEGATIVE_TERM_MATCH');
      if (locale && article.locale !== locale && locale !== 'auto') {
        adjustedScore -= 4;
        discardedReasons.push('LOCALE_MISMATCH');
      }
      if (productArea && article.productArea !== productArea) {
        adjustedScore -= 12;
        discardedReasons.push('PRODUCT_AREA_MISMATCH');
      }
      const sections = [...sectionScores.entries()]
        .filter(([ref]) => ref.startsWith(`${alias}#`))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([ref, sectionScore]) => ({ ...sectionsByRef.get(ref), score: sectionScore }));
      return {
        article,
        score: adjustedScore,
        scoreBreakdown: compactBreakdown(breakdowns.get(alias) ?? new Map()),
        matchedTerms: [...(matchedTerms.get(alias) ?? [])].sort(),
        matchedNegativeTerms: negativeMatches,
        sections,
        discardedReasons,
      };
    }).sort((a, b) => b.score - a.score || a.article.articleAlias.localeCompare(b.article.articleAlias));
    const boundedTopK = Math.max(1, Math.min(5, Number(topK) || 5));
    const topScore = ranked[0]?.score ?? 0;
    const selected = ranked.filter((candidate) => candidate.score >= Math.max(12, topScore * 0.35)).slice(0, boundedTopK);
    const elapsedMs = performance.now() - started;
    return {
      normalizedQuery,
      queryTerms,
      locale,
      productArea,
      topK: boundedTopK,
      candidates: selected,
      discarded: traceEnabled ? ranked.slice(selected.length, selected.length + 10).map((candidate) => ({
        articleAlias: candidate.article.articleAlias,
        score: candidate.score,
        reasons: candidate.discardedReasons.length > 0 ? candidate.discardedReasons : ['BELOW_TOP_K_OR_CONFIDENCE'],
      })) : [],
      elapsedMs,
    };
  }

  function loadFallback(article) {
    tracker.stage = 'article-fallback';
    return readTracked(root, article.fallbackRef, tracker);
  }

  async function fetchArticleConfig(article, { timeoutMs = 1500, cacheMaxAgeMs = 300_000 } = {}) {
    tracker.stage = 'article-config-fetch';
    const cacheKey = `${article.configUrl}#${article.contentHash}`;
    const cached = configCache.get(cacheKey) ?? null;
    const cacheAgeMs = cached ? Math.max(0, Date.now() - cached.cachedAt) : null;
    if (cached && cacheMaxAgeMs >= 0 && cacheAgeMs <= cacheMaxAgeMs) {
      return { ...cached, cache: 'hit', cacheAgeMs };
    }
    if (typeof fetchImpl !== 'function') return { ok: false, status: null, cache: 'unavailable', reason: 'FETCH_UNAVAILABLE' };
    const started = performance.now();
    try {
      const headers = { Accept: 'application/json' };
      if (cached?.etag) headers['If-None-Match'] = cached.etag;
      const response = await fetchImpl(article.configUrl, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 304 && cached) {
        const revalidated = {
          ...cached,
          status: 304,
          etag: response.headers?.get?.('etag') ?? cached.etag,
          cache: 'revalidated',
          cacheAgeMs,
          cachedAt: Date.now(),
          elapsedMs: performance.now() - started,
        };
        configCache.set(cacheKey, revalidated);
        return revalidated;
      }
      const document = response.ok ? await response.json() : null;
      const actualHash = document ? sha256(document) : null;
      const result = {
        ok: response.ok && actualHash === article.contentHash,
        status: response.status,
        etag: response.headers?.get?.('etag') ?? null,
        expectedHash: article.contentHash,
        actualHash,
        hashMatch: actualHash === article.contentHash,
        cache: 'miss',
        cacheAgeMs,
        cachedAt: Date.now(),
        elapsedMs: performance.now() - started,
        document: response.ok && actualHash === article.contentHash ? document : null,
        reason: response.ok
          ? actualHash === article.contentHash ? null : 'STALE_ARTICLE_HASH'
          : 'ARTICLE_CONFIG_FETCH_FAILED',
      };
      if (result.ok) configCache.set(cacheKey, result);
      return result;
    } catch (error) {
      return {
        ok: false,
        status: null,
        cache: 'miss',
        elapsedMs: performance.now() - started,
        reason: error?.name === 'TimeoutError' ? 'ARTICLE_CONFIG_TIMEOUT' : 'ARTICLE_CONFIG_FETCH_FAILED',
        error: String(error?.message ?? error),
      };
    }
  }

  function loadGuideBindings({ articleAliases = [], sectionIds = [] } = {}) {
    tracker.stage = 'guide-bindings';
    const payload = readTracked(root, 'references/corpus-v2/guide-bindings.json', tracker);
    const aliasSet = new Set(articleAliases);
    const sectionSet = new Set(sectionIds);
    return payload.guides.filter((guide) => guide.articleBindings.some((binding) =>
      aliasSet.has(binding.articleAlias)
      && (sectionSet.size === 0 || sectionSet.has(binding.sectionId)),
    )).slice(0, 2);
  }

  function loadGuideBindingsByKeys(guideKeys = []) {
    tracker.stage = 'guide-binding-selection';
    if (guideKeys.length === 0) return [];
    const wanted = new Set(guideKeys);
    const payload = readTracked(root, 'references/corpus-v2/guide-bindings.json', tracker);
    return payload.guides.filter((guide) => wanted.has(guide.guideKey)).slice(0, 2);
  }

  function loadGuideRoutesByKeys(guideKeys = []) {
    tracker.stage = 'guide-route-selection';
    if (guideKeys.length === 0) return [];
    const wanted = new Set(guideKeys);
    const payload = readTracked(root, 'references/corpus-v2/guide-routing-index.json', tracker);
    return payload.guides.filter((guide) => wanted.has(guide.guideKey)).slice(0, 2);
  }

  function loadActions(actionIds = []) {
    tracker.stage = 'actions';
    const payload = readTracked(root, 'runtime/do-action-reference.json', tracker);
    if (actionIds === null) return payload.actions;
    if (actionIds.length === 0) return [];
    const wanted = new Set(actionIds);
    return payload.actions.filter((action) => wanted.has(action.id));
  }

  function trace(extra = {}) {
    return {
      corpusSchemaVersion: 2,
      corpusContentHash: manifest.contentHash,
      filesOpened: tracker.filesOpened,
      bytesRead: tracker.bytesRead,
      ...extra,
    };
  }

  return {
    manifest,
    directory,
    sectionRows,
    search,
    loadFallback,
    fetchArticleConfig,
    loadGuideBindings,
    loadGuideBindingsByKeys,
    loadGuideRoutesByKeys,
    loadActions,
    trace,
  };
}

export function clearCorpusV2ConfigCache() {
  configCache.clear();
}
