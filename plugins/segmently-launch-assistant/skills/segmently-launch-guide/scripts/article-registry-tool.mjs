#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? 'help';
  if (command === 'help' || args.help) return printHelp();
  if (command === 'list') return listArticles();
  if (command === 'search') return searchArticles(String(args.query ?? args.q ?? ''));
  if (command === 'show') return showArticle(args);
  if (command === 'graph') return graphSummary();
  if (command === 'validate') return validateArtifacts();
  if (command === 'quality-report') return qualityReport();
  if (command === 'diff') return diffSummary();
  fail(`Unknown command: ${command}`);
}

function listArticles() {
  const directory = readJson('references/article-directory.json');
  const rows = (directory.articles ?? []).map(article => ({
    articleAlias: article.articleAlias,
    title: article.title,
    qualityScore: article.qualityScore,
    tags: (article.tags ?? []).join(','),
    summary: article.oneLineSummary,
  }));
  writeJson({ ok: true, count: rows.length, articles: rows });
}

function searchArticles(query) {
  if (!query.trim()) fail('--query is required for search');
  const directory = readJson('references/article-directory.json');
  const index = readJson('references/article-search-index.json');
  const graphIndex = readOptionalJson('references/support-knowledge-graph/search-index.json');
  const normalized = normalize(query);
  const directAliases = directArticleAliasesFromQuery(normalized, directory.articles ?? []);
  const candidateAliases = unique([...directAliases, ...candidateAliasesFromSearchIndex(normalized, index)]);
  const candidateSet = candidateAliases.length > 0 ? new Set(candidateAliases) : null;
  const scored = (directory.articles ?? [])
    .filter(article => !candidateSet || candidateSet.has(article.articleAlias))
    .map(article => {
      const score = scoreArticle(normalized, article, candidateSet);
      return {
        articleAlias: article.articleAlias,
        title: article.title,
        score,
        matched: explainMatches(normalized, article, index, graphIndex),
        subarticles: (article.subarticles ?? []).filter(subarticle =>
          scoreText(normalized, `${subarticle.id} ${subarticle.title} ${subarticle.summary} ${(subarticle.tags ?? []).join(' ')}`) > 0,
        ),
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(argsLimit() ?? 8));
  writeJson({ ok: true, query, candidateSource: 'article-directory', count: scored.length, candidates: scored });
}

function showArticle(args) {
  const alias = String(args.alias ?? '').trim();
  const subarticleId = String(args.subarticle ?? '').trim();
  if (!alias && !subarticleId) fail('--alias or --subarticle is required');
  const registry = readJson('references/article-registry.json');
  const article = alias
    ? (registry.articles ?? []).find(item => item.articleAlias === alias)
    : (registry.articles ?? []).find(item => (item.subarticles ?? []).some(subarticle => subarticle.id === subarticleId));
  if (!article) fail(`Article not found: ${alias || subarticleId}`);
  const content = article.contentRef ? readJson(article.contentRef) : null;
  const selectedSubarticle = subarticleId
    ? (content?.subarticles ?? article.subarticles ?? []).find(item => item.id === subarticleId)
    : null;
  writeJson({
    ok: true,
    article,
    content: content ? {
      articleAlias: content.articleAlias,
      title: content.title,
      sectionCount: (content.sections ?? []).length,
      subarticleCount: (content.subarticles ?? []).length,
      media: content.media ?? [],
      settingsAnchors: content.settingsAnchors ?? [],
      selectedSubarticle,
    } : null,
  });
}

function validateArtifacts() {
  const failures = [];
  const registry = readJson('references/article-registry.json');
  const directory = readJson('references/article-directory.json');
  const index = readJson('references/article-search-index.json');
  const synonyms = readJson('references/article-search-synonyms.json');
  const guideRegistry = readJson('references/guide-registry.json');
  const graphSchema = readJson('references/support-knowledge-graph/schema.json');
  const graphAdjacency = readJson('references/support-knowledge-graph/adjacency.json');
  const graphIndex = readJson('references/support-knowledge-graph/search-index.json');
  const graphNodes = readJsonl('references/support-knowledge-graph/nodes.jsonl');
  const graphEdges = readJsonl('references/support-knowledge-graph/edges.jsonl');
  const registryAliases = new Set((registry.articles ?? []).map(article => article.articleAlias));
  const directoryAliases = new Set((directory.articles ?? []).map(article => article.articleAlias));
  for (const alias of registryAliases) {
    if (!directoryAliases.has(alias)) failures.push(`directory missing ${alias}`);
    const article = (registry.articles ?? []).find(item => item.articleAlias === alias);
    if (!article?.contentRef) failures.push(`${alias} missing contentRef`);
    if (article?.contentRef && !existsSync(join(root, article.contentRef))) failures.push(`${alias} contentRef missing on disk`);
    if (article && Object.prototype.hasOwnProperty.call(article, 'sections')) failures.push(`${alias} compact registry embeds sections`);
    if (article && Object.prototype.hasOwnProperty.call(article, 'media')) failures.push(`${alias} compact registry embeds media`);
    if (article?.quality?.summaryStatus === 'title-only') failures.push(`${alias} uses title-only summary`);
    if ((article?.quality?.warnings ?? []).some(warning => ['missing-description', 'title-only-summary', 'title-only-description', 'too-short-search-summary'].includes(warning))) {
      failures.push(`${alias} has insufficient searchable summary: ${(article.quality.warnings ?? []).join(',')}`);
    }
  }
  for (const alias of directoryAliases) {
    if (!registryAliases.has(alias)) failures.push(`registry missing directory alias ${alias}`);
  }
  if (!index.tags || !index.tokens) failures.push('search index missing tags/tokens');
  if (!index.synonyms?.['selected product']?.includes('help-block-flexible-sections')) failures.push('search index missing selected product synonym');
  if (!synonyms.groups?.some(group => group.id === 'selected-product')) failures.push('synonym overlay missing selected-product group');
  for (const guide of guideRegistry.guides ?? []) {
    for (const ref of guide.articleRefs ?? []) {
      if (!registryAliases.has(ref.articleAlias)) failures.push(`${guide.guideKey} references unknown article ${ref.articleAlias}`);
    }
  }
  const nodeIds = new Set(graphNodes.map(node => node.id));
  const edgeIds = new Set(graphEdges.map(edge => edge.id));
  for (const id of [
    'Article:help-block-flexible-sections',
    'Guide:screenedit-flexible-sections-linked-product-labels',
    'SynonymGroup:selected-product',
  ]) {
    if (!nodeIds.has(id)) failures.push(`knowledge graph missing node ${id}`);
  }
  for (const id of [
    'ARTICLE_SUPPORTED_BY_GUIDE:Article:help-block-flexible-sections->Guide:screenedit-flexible-sections-linked-product-labels',
    'SYNONYM_POINTS_TO_ARTICLE:SynonymGroup:selected-product->Article:help-block-flexible-sections',
  ]) {
    if (!edgeIds.has(id)) failures.push(`knowledge graph missing edge ${id}`);
  }
  if (!graphSchema.runtimePolicy?.some(line => /No graph database/.test(line))) failures.push('knowledge graph schema missing no-external-db runtime policy');
  if (!graphAdjacency.outgoing?.['Article:help-block-flexible-sections']?.ARTICLE_SUPPORTED_BY_GUIDE?.includes('Guide:screenedit-flexible-sections-linked-product-labels')) {
    failures.push('knowledge graph adjacency missing flexible article guide edge');
  }
  if (!graphIndex.synonyms?.['selected product']?.includes('SynonymGroup:selected-product')) failures.push('knowledge graph search index missing selected-product synonym');
  writeJson({ ok: failures.length === 0, failures });
  process.exit(failures.length === 0 ? 0 : 1);
}

function qualityReport() {
  const registry = readJson('references/article-registry.json');
  const rows = (registry.articles ?? [])
    .map(article => ({
      articleAlias: article.articleAlias,
      title: article.title,
      score: article.quality?.score ?? 0,
      warnings: article.quality?.warnings ?? [],
      summaryStatus: article.quality?.summaryStatus ?? 'missing',
      description: article.description ?? article.oneLineSummary ?? '',
      keywordStatus: article.quality?.keywordStatus ?? 'missing',
      relationStatus: article.quality?.relationStatus ?? 'missing',
      subarticleStatus: article.quality?.subarticleStatus ?? 'missing',
    }))
    .filter(row => row.warnings.length > 0 || row.score < 0.8)
    .sort((a, b) => a.score - b.score);
  writeJson({ ok: true, count: rows.length, gaps: rows });
}

function diffSummary() {
  const registry = readJson('references/article-registry.json');
  const directory = readJson('references/article-directory.json');
  const guideRegistry = readJson('references/guide-registry.json');
  writeJson({
    ok: true,
    summary: {
      articleRegistryRows: (registry.articles ?? []).length,
      articleDirectoryRows: (directory.articles ?? []).length,
      guideRegistryRows: (guideRegistry.guides ?? []).length,
      contentRefs: (registry.articles ?? []).filter(article => article.contentRef).length,
    },
  });
}

function graphSummary() {
  const schema = readJson('references/support-knowledge-graph/schema.json');
  const nodes = readJsonl('references/support-knowledge-graph/nodes.jsonl');
  const edges = readJsonl('references/support-knowledge-graph/edges.jsonl');
  const byType = {};
  for (const node of nodes) byType[node.type] = (byType[node.type] ?? 0) + 1;
  const edgeByType = {};
  for (const edge of edges) edgeByType[edge.type] = (edgeByType[edge.type] ?? 0) + 1;
  writeJson({
    ok: true,
    schemaVersion: schema.schemaVersion,
    runtimePolicy: schema.runtimePolicy,
    nodes: nodes.length,
    edges: edges.length,
    byType,
    edgeByType,
  });
}

function scoreArticle(text, article, candidateSet) {
  let score = candidateSet?.has(article.articleAlias) ? 20 : 0;
  if (directArticleAliasesFromQuery(text, [article]).includes(article.articleAlias)) score += 250;
  if (text.includes(normalize(article.articleAlias))) score += 100;
  if (text.includes(normalize(article.articleAlias).replace(/-/g, ' '))) score += 90;
  score += scoreText(text, article.title) * 4;
  score += scoreText(text, article.oneLineSummary) * 3;
  score += (article.tags ?? []).filter(tag => text.includes(normalize(tag).replace(/-/g, ' '))).length * 20;
  score += (article.keywords ?? []).slice(0, 80).filter(keyword => text.includes(normalize(keyword))).length * 5;
  score += (article.subarticles ?? []).reduce((sum, subarticle) => sum + scoreText(text, `${subarticle.id} ${subarticle.title} ${subarticle.summary} ${(subarticle.tags ?? []).join(' ')}`), 0) * 3;
  return score;
}

function directArticleAliasesFromQuery(text, articles) {
  const aliases = new Set(articles.map(article => article.articleAlias));
  const out = [];
  if (aliases.has('facebook-events-catalog') && /facebook|meta|фейсбук|мета/.test(text) && /event|events|событ|ивент|catalog|каталог|список|list|which|what|какие/.test(text)) {
    out.push('facebook-events-catalog');
  }
  if (aliases.has('tiktok-events-catalog') && /tiktok|тик.?ток/.test(text) && /event|events|событ|ивент|catalog|каталог|список|list|which|what|какие/.test(text)) {
    out.push('tiktok-events-catalog');
  }
  return out;
}

function explainMatches(text, article, index, graphIndex = null) {
  const matched = [];
  if (text.includes(normalize(article.articleAlias))) matched.push(`alias:${article.articleAlias}`);
  for (const tag of article.tags ?? []) {
    if (text.includes(normalize(tag).replace(/-/g, ' '))) matched.push(`tag:${tag}`);
  }
  for (const token of unique(text.split(/\s+/).filter(item => item.length >= 3))) {
    if ((index.tokens?.[token] ?? []).includes(article.articleAlias)) matched.push(`token:${token}`);
    if ((index.keywords?.[token] ?? []).includes(article.articleAlias)) matched.push(`keyword:${token}`);
    if ((index.synonyms?.[token] ?? []).includes(article.articleAlias)) matched.push(`synonym:${token}`);
    if ((index.subarticles?.[token] ?? []).includes(article.articleAlias)) matched.push(`subarticle-token:${token}`);
    if ((index.settingsAnchors?.[token] ?? []).includes(article.articleAlias)) matched.push(`setting:${token}`);
    if ((index.scenarioIds?.[token] ?? []).includes(article.articleAlias)) matched.push(`scenario:${token}`);
    if ((index.supportedSurfaces?.[token] ?? []).includes(article.articleAlias)) matched.push(`surface:${token}`);
  }
  for (const [phrase, aliases] of Object.entries(index.synonyms ?? {})) {
    if (phrase && text.includes(normalize(phrase)) && aliases.includes(article.articleAlias)) matched.push(`synonym-phrase:${phrase}`);
  }
  const articleNodeId = `Article:${article.articleAlias}`;
  if (graphIndex?.articleAliases?.[article.articleAlias]?.includes(articleNodeId)) matched.push('graph-node:article');
  return unique(matched).slice(0, 20);
}

function candidateAliasesFromSearchIndex(text, index) {
  const scores = new Map();
  const add = (aliases, score) => {
    for (const alias of aliases ?? []) scores.set(alias, (scores.get(alias) ?? 0) + score);
  };
  for (const token of unique(text.split(/\s+/).filter(item => item.length >= 3))) {
    add(index.tokens?.[token], 2);
    add(index.tags?.[token], 8);
    add(index.keywords?.[token], 5);
    add(index.synonyms?.[token], 12);
    add(index.subarticles?.[token], 6);
    add(index.settingsAnchors?.[token], 7);
    add(index.supportedSurfaces?.[token], 6);
    add(index.supportFlowFlows?.[token], 7);
    add(index.scenarioIds?.[token], 8);
    add(index.guideKeys?.[token], 8);
    add(index.actionIds?.[token], 6);
    add(index.atoms?.[token], 5);
    add(index.workflowIds?.[token], 7);
    add(index.workflowStepIds?.[token], 7);
    add(index.negativeKeywords?.[token], -8);
  }
  for (const [key, aliases] of Object.entries(index.aliases ?? {})) {
    if (text.includes(normalize(key))) add(aliases, 100);
  }
  for (const [phrase, aliases] of Object.entries(index.synonyms ?? {})) {
    if (text.includes(normalize(phrase))) add(aliases, 32);
  }
  for (const [tag, aliases] of Object.entries(index.tags ?? {})) {
    if (text.includes(normalize(tag).replace(/-/g, ' '))) add(aliases, 20);
  }
  for (const [anchor, aliases] of Object.entries(index.settingsAnchors ?? {})) {
    if (text.includes(normalize(anchor))) add(aliases, 18);
  }
  for (const [surface, aliases] of Object.entries(index.supportedSurfaces ?? {})) {
    if (text.includes(normalize(surface).replace(/-/g, ' '))) add(aliases, 16);
  }
  for (const [scenarioId, aliases] of Object.entries(index.scenarioIds ?? {})) {
    if (text.includes(normalize(scenarioId).replace(/-/g, ' '))) add(aliases, 18);
  }
  for (const [phrase, aliases] of Object.entries(index.negativeKeywords ?? {})) {
    if (text.includes(normalize(phrase))) add(aliases, -20);
  }
  return [...scores.entries()].filter(([, score]) => score >= 4).sort((a, b) => b[1] - a[1]).map(([alias]) => alias);
}

function scoreText(text, value) {
  const haystack = normalize(value);
  return unique(text.split(/\s+/).filter(item => item.length >= 4)).filter(token => haystack.includes(token)).length;
}

function readJson(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) fail(`Missing file ${rel}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readOptionalJson(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonl(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) fail(`Missing file ${rel}`);
  return readFileSync(path, 'utf8')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      out._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function argsLimit() {
  const index = process.argv.indexOf('--limit');
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^\p{L}\p{N}: ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/article-registry-tool.mjs list
  node scripts/article-registry-tool.mjs search --query "<customer prompt>"
  node scripts/article-registry-tool.mjs show --alias <articleAlias>
  node scripts/article-registry-tool.mjs show --subarticle <articleAlias#subarticle>
  node scripts/article-registry-tool.mjs graph
  node scripts/article-registry-tool.mjs validate
  node scripts/article-registry-tool.mjs quality-report
  node scripts/article-registry-tool.mjs diff
`);
}

function fail(message) {
  writeJson({ ok: false, reason: message });
  process.exit(2);
}

main();
