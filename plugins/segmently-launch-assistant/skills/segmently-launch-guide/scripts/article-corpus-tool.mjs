#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCorpusV2Runtime } from '../runtime/corpus-v2.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) { out._.push(token); continue; }
    const [key, inline] = token.slice(2).split('=', 2);
    out[key] = inline ?? (argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'help';
const runtime = createCorpusV2Runtime({ root, traceEnabled: true });
const bindings = () => JSON.parse(fs.readFileSync(path.join(root, 'references/corpus-v2/guide-bindings.json'), 'utf8'));
let result;
if (command === 'list') {
  result = { ok: true, corpusContentHash: runtime.manifest.contentHash, count: runtime.directory.articles.length, articles: runtime.directory.articles };
} else if (command === 'search') {
  const query = String(args.query ?? args.q ?? '').trim();
  if (!query) throw new Error('--query is required.');
  result = { ok: true, corpusContentHash: runtime.manifest.contentHash, ...runtime.search(query, { topK: Number(args.limit ?? 5) }) };
} else if (command === 'show') {
  const alias = String(args.alias ?? '').trim();
  const article = runtime.directory.articles.find((entry) => entry.articleAlias === alias);
  if (!article) throw new Error(`Unknown Article alias ${alias}.`);
  result = { ok: true, article, sections: runtime.sectionRows.filter((section) => section.articleAlias === alias), guideBindings: bindings().guides.filter((guide) => guide.articleBindings.some((binding) => binding.articleAlias === alias)) };
} else if (command === 'guide') {
  const guideKey = String(args['guide-key'] ?? '').trim();
  const guide = bindings().guides.find((entry) => entry.guideKey === guideKey);
  if (!guide) throw new Error(`Unknown Guide key ${guideKey}.`);
  result = { ok: true, guide, articles: runtime.directory.articles.filter((article) => guide.articleBindings.some((binding) => binding.articleAlias === article.articleAlias)) };
} else if (command === 'validate') {
  const forbidden = ['references/support-knowledge-graph', 'references/article-registry.json', 'references/articles', 'references/guides'].filter((relative) => fs.existsSync(path.join(root, relative)));
  result = { ok: runtime.manifest.validation?.ok === true && forbidden.length === 0, corpusContentHash: runtime.manifest.contentHash, manifest: runtime.manifest, forbiddenLegacyPresent: forbidden };
} else {
  result = { ok: true, usage: ['article-registry-tool.mjs list', 'article-registry-tool.mjs search --query "..."', 'article-registry-tool.mjs show --alias <alias>', 'article-registry-tool.mjs guide --guide-key <key>', 'article-registry-tool.mjs validate'] };
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.ok === false) process.exitCode = 1;
