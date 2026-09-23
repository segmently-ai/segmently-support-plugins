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
  if (command === 'search') return searchArticles(String(args.query ?? args.q ?? ''), Number(args.limit ?? 8));
  if (command === 'show') return showArticle(args);
  if (command === 'graph') return graphSummary();
  if (command === 'validate') return validateArtifacts();
  if (command === 'quality-report') return qualityReport();
  if (command === 'diff') return diffSummary();
  fail('Unknown command: ' + command);
}

function listArticles() {
  const directory = readJson('references/article-directory.json');
  writeJson({
    ok: true,
    count: (directory.articles ?? []).length,
    articles: (directory.articles ?? []).map(article => ({
      articleAlias: article.articleAlias,
      title: article.title,
      qualityScore: article.qualityScore,
      tags: (article.tags ?? []).join(','),
      summary: article.oneLineSummary,
    })),
  });
}

function searchArticles(query, limit) {
  if (!query.trim()) fail('--query is required for search');
  const directory = readJson('references/article-directory.json');
  const index = readJson('references/article-search-index.json');
  const normalized = normalize(query);
  const candidates = candidateAliasesFromSearchIndex(normalized, index);
  const candidateSet = candidates.length > 0 ? new Set(candidates) : null;
  const scored = (directory.articles ?? [])
    .filter(article => !candidateSet || candidateSet.has(article.articleAlias))
    .map(article => ({
      articleAlias: article.articleAlias,
      title: article.title,
      score: scoreArticle(normalized, article, candidateSet, index),
      matched: explainMatches(normalized, article, index),
      subarticles: (article.subarticles ?? []).filter(subarticle =>
        scoreText(normalized, [subarticle.id, subarticle.title, subarticle.summary, ...(subarticle.tags ?? [])].join(' ')) > 0,
      ),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit || 8);
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
  if (!article) fail('Article not found: ' + (alias || subarticleId));
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

function graphSummary() {
  const schema = readJson('references/support-knowledge-graph/schema.json');
  const nodes = readJsonl('references/support-knowledge-graph/nodes.jsonl');
  const edges = readJsonl('references/support-knowledge-graph/edges.jsonl');
  const byType = {};
  for (const node of nodes) byType[node.type] = (byType[node.type] ?? 0) + 1;
  const edgeByType = {};
  for (const edge of edges) edgeByType[edge.type] = (edgeByType[edge.type] ?? 0) + 1;
  writeJson({ ok: true, schemaVersion: schema.schemaVersion, runtimePolicy: schema.runtimePolicy, nodes: nodes.length, edges: edges.length, byType, edgeByType });
}

function validateArtifacts() {
  const failures = [];
  const registry = readJson('references/article-registry.json');
  const directory = readJson('references/article-directory.json');
  const index = readJson('references/article-search-index.json');
  const synonyms = readJson('references/article-search-synonyms.json');
  const guideRegistry = readJson('references/guide-registry.json');
  const schema = readJson('references/support-knowledge-graph/schema.json');
  const adjacency = readJson('references/support-knowledge-graph/adjacency.json');
  const graphIndex = readJson('references/support-knowledge-graph/search-index.json');
  const nodes = readJsonl('references/support-knowledge-graph/nodes.jsonl');
  const edges = readJsonl('references/support-knowledge-graph/edges.jsonl');
  const registryAliases = new Set((registry.articles ?? []).map(article => article.articleAlias));
  const directoryAliases = new Set((directory.articles ?? []).map(article => article.articleAlias));
  for (const alias of registryAliases) {
    if (!directoryAliases.has(alias)) failures.push('directory missing ' + alias);
    const article = (registry.articles ?? []).find(item => item.articleAlias === alias);
    if (!article?.contentRef) failures.push(alias + ' missing contentRef');
    if (article?.contentRef && !existsSync(join(root, article.contentRef))) failures.push(alias + ' contentRef missing on disk');
    if (article && Object.prototype.hasOwnProperty.call(article, 'sections')) failures.push(alias + ' compact registry embeds sections');
    if (article && Object.prototype.hasOwnProperty.call(article, 'media')) failures.push(alias + ' compact registry embeds media');
    if (article?.quality?.summaryStatus === 'title-only') failures.push(alias + ' uses title-only summary');
  }
  for (const alias of directoryAliases) if (!registryAliases.has(alias)) failures.push('registry missing directory alias ' + alias);
  if (!index.tags || !index.tokens) failures.push('search index missing tags/tokens');
  if (!index.synonyms?.['selected product']?.includes('help-block-flexible-sections')) failures.push('search index missing selected product synonym');
  if (!synonyms.groups?.some(group => group.id === 'selected-product')) failures.push('synonym overlay missing selected-product group');
  for (const guide of guideRegistry.guides ?? []) {
    for (const ref of guide.articleRefs ?? []) if (!registryAliases.has(ref.articleAlias)) failures.push(guide.guideKey + ' references unknown article ' + ref.articleAlias);
  }
  const nodeIds = new Set(nodes.map(node => node.id));
  const edgeIds = new Set(edges.map(edge => edge.id));
  for (const id of [
    'Article:help-block-flexible-sections',
    'Guide:screenedit-flexible-sections-linked-product-labels',
    'SynonymGroup:selected-product',
    'Scenario:facebook-events-list',
    'Workflow:capability.connect-analytics',
  ]) {
    if (!nodeIds.has(id)) failures.push('knowledge graph missing node ' + id);
  }
  for (const id of [
    'ARTICLE_SUPPORTED_BY_GUIDE:Article:help-block-flexible-sections->Guide:screenedit-flexible-sections-linked-product-labels',
    'GUIDE_REFERENCES_ARTICLE:Guide:screenedit-flexible-sections-linked-product-labels->Article:help-block-flexible-sections',
    'SYNONYM_POINTS_TO_ARTICLE:SynonymGroup:selected-product->Article:help-block-flexible-sections',
    'ARTICLE_RELATES_TO_SCENARIO:Article:facebook-events-catalog->Scenario:facebook-events-list',
  ]) {
    if (!edgeIds.has(id)) failures.push('knowledge graph missing edge ' + id);
  }
  assertNoInternalSurface(failures, { schema, adjacency, graphIndex, nodes, edges });
  writeJson({ ok: failures.length === 0, failures });
  process.exit(failures.length === 0 ? 0 : 1);
}

function qualityReport() {
  const registry = readJson('references/article-registry.json');
  const gaps = (registry.articles ?? [])
    .map(article => ({
      articleAlias: article.articleAlias,
      title: article.title,
      score: article.quality?.score ?? 0,
      warnings: article.quality?.warnings ?? [],
      summaryStatus: article.quality?.summaryStatus ?? 'missing',
      description: article.description ?? article.oneLineSummary ?? '',
    }))
    .filter(row => row.warnings.length > 0 || row.score < 0.8)
    .sort((a, b) => a.score - b.score);
  writeJson({ ok: true, count: gaps.length, gaps });
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

function assertNoInternalSurface(failures, graph) {
  const serialized = JSON.stringify(graph);
  const markers = [
    'Mod' + 'ule:',
    'Sub' + 'module:',
    'MODULE' + '_RELATED_',
    'SUBMODULE' + '_RELATED_',
    'modules' + '/registry.json',
    'support' + '-module-relations-overrides',
  ];
  for (const marker of markers) {
    if (serialized.includes(marker)) failures.push('customer graph contains internal marker ' + marker);
  }
  if (graph.schema.nodeTypes?.some(type => type === 'Module' || type === 'Submodule')) failures.push('customer graph exposes internal node types');
  if (graph.schema.edgeTypes?.some(type => String(type).startsWith('MODULE_') || String(type).startsWith('SUBMODULE_'))) failures.push('customer graph exposes internal edge types');
  if (Object.prototype.hasOwnProperty.call(graph.graphIndex, 'moduleNames')) failures.push('customer graph search index exposes internal moduleNames');
  if (Object.prototype.hasOwnProperty.call(graph.graphIndex, 'submoduleIds')) failures.push('customer graph search index exposes internal submoduleIds');
}

function scoreArticle(text, article, candidateSet, index = null) {
  let score = candidateSet?.has(article.articleAlias) ? 20 : 0;
  if (text.includes(normalize(article.articleAlias))) score += 100;
  if (text.includes(normalize(article.articleAlias).replace(/-/g, ' '))) score += 90;
  score += scoreText(text, article.title) * 4;
  score += scoreText(text, article.oneLineSummary) * 3;
  score += (article.tags ?? []).filter(tag => text.includes(normalize(tag).replace(/-/g, ' '))).length * 20;
  score += (article.keywords ?? []).slice(0, 80).filter(keyword => text.includes(normalize(keyword))).length * 5;
  score += (article.subarticles ?? []).reduce((sum, subarticle) => sum + scoreText(text, [subarticle.id, subarticle.title, subarticle.summary, ...(subarticle.tags ?? [])].join(' ')), 0) * 3;
  score += Object.entries(index?.synonyms ?? {})
    .filter(([phrase, aliases]) => phrase.includes(' ') && text.includes(normalize(phrase)) && aliases.includes(article.articleAlias))
    .length * 25;
  return score;
}

function explainMatches(text, article, index) {
  const matched = [];
  if (text.includes(normalize(article.articleAlias))) matched.push('alias:' + article.articleAlias);
  for (const tag of article.tags ?? []) if (text.includes(normalize(tag).replace(/-/g, ' '))) matched.push('tag:' + tag);
  for (const token of unique(text.split(/\s+/).filter(item => item.length >= 3))) {
    if ((index.tokens?.[token] ?? []).includes(article.articleAlias)) matched.push('token:' + token);
    if ((index.keywords?.[token] ?? []).includes(article.articleAlias)) matched.push('keyword:' + token);
    if ((index.synonyms?.[token] ?? []).includes(article.articleAlias)) matched.push('synonym:' + token);
    if ((index.subarticles?.[token] ?? []).includes(article.articleAlias)) matched.push('subarticle-token:' + token);
    if ((index.settingsAnchors?.[token] ?? []).includes(article.articleAlias)) matched.push('setting:' + token);
    if ((index.scenarioIds?.[token] ?? []).includes(article.articleAlias)) matched.push('scenario:' + token);
    if ((index.supportedSurfaces?.[token] ?? []).includes(article.articleAlias)) matched.push('surface:' + token);
  }
  for (const [phrase, aliases] of Object.entries(index.synonyms ?? {})) {
    if (phrase && text.includes(normalize(phrase)) && aliases.includes(article.articleAlias)) matched.push('synonym-phrase:' + phrase);
  }
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
  }
  for (const [key, aliases] of Object.entries(index.aliases ?? {})) if (text.includes(normalize(key))) add(aliases, 100);
  for (const [phrase, aliases] of Object.entries(index.synonyms ?? {})) if (text.includes(normalize(phrase))) add(aliases, 32);
  for (const [tag, aliases] of Object.entries(index.tags ?? {})) if (text.includes(normalize(tag).replace(/-/g, ' '))) add(aliases, 20);
  return [...scores.entries()].filter(([, score]) => score >= 4).sort((a, b) => b[1] - a[1]).map(([alias]) => alias);
}

function scoreText(text, value) {
  const haystack = normalize(value);
  return unique(text.split(/\s+/).filter(item => item.length >= 4)).filter(token => haystack.includes(token)).length;
}

function readJson(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) fail('Missing file ' + rel);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonl(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) fail('Missing file ' + rel);
  return readFileSync(path, 'utf8').split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[\u2010-\u2015_]/g, '-').replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      out._.push(value);
      continue;
    }
    const eq = value.indexOf('=');
    if (eq >= 0) out[value.slice(2, eq)] = value.slice(eq + 1);
    else {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) out[key] = argv[++index];
      else out[key] = true;
    }
  }
  return out;
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  process.stdout.write([
    'Usage:',
    '  node scripts/article-registry-tool.mjs list',
    '  node scripts/article-registry-tool.mjs search --query "<question>" [--limit 8]',
    '  node scripts/article-registry-tool.mjs show --alias <articleAlias>',
    '  node scripts/article-registry-tool.mjs graph',
    '  node scripts/article-registry-tool.mjs validate',
    '  node scripts/article-registry-tool.mjs quality-report',
    '',
    'This customer-safe tool works only with shipped article, guide, and public graph references.',
    '',
  ].join('\n'));
}

main();
