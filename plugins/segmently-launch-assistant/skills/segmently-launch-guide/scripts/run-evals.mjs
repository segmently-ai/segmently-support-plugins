#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

check('article-public-registry-contract', () => {
  const registry = readJson('references/article-registry.json');
  const directory = readJson('references/article-directory.json');
  const index = readJson('references/article-search-index.json');
  assert((registry.articles ?? []).length >= 50, 'article registry row count is too low');
  assert((directory.articles ?? []).length === (registry.articles ?? []).length, 'article directory and registry row counts drifted');
  assert(index.synonyms?.['selected product']?.includes('help-block-flexible-sections'), 'selected product synonym must route to flexible sections');
  for (const alias of ['facebook-events-catalog', 'help-screen-paywall', 'help-screen-webembed', 'help-screen-flexiblelayout', 'help-block-flexible-sections']) {
    const article = (registry.articles ?? []).find(item => item.articleAlias === alias);
    assert(article, 'missing article ' + alias);
    assert(article.contentRef && existsSync(join(root, article.contentRef)), alias + ' missing contentRef');
    assert(!Object.prototype.hasOwnProperty.call(article, 'sections'), alias + ' compact registry embeds sections');
  }
});

check('customer-public-graph-boundary', () => {
  const schema = readJson('references/support-knowledge-graph/schema.json');
  const graphIndex = readJson('references/support-knowledge-graph/search-index.json');
  const nodesText = readFileSync(join(root, 'references/support-knowledge-graph/nodes.jsonl'), 'utf8');
  const edgesText = readFileSync(join(root, 'references/support-knowledge-graph/edges.jsonl'), 'utf8');
  assert(!(schema.nodeTypes ?? []).includes('Module'), 'customer graph must not expose internal node type');
  assert(!(schema.nodeTypes ?? []).includes('Submodule'), 'customer graph must not expose internal subnode type');
  assert(!(schema.edgeTypes ?? []).some(type => String(type).startsWith('MODULE_') || String(type).startsWith('SUBMODULE_')), 'customer graph must not expose internal relation edges');
  assert(!Object.prototype.hasOwnProperty.call(graphIndex, 'moduleNames'), 'customer graph index must not expose internal name index');
  assert(!Object.prototype.hasOwnProperty.call(graphIndex, 'submoduleIds'), 'customer graph index must not expose internal subnode index');
  const markers = [
    'Mod' + 'ule:',
    'Sub' + 'module:',
    'MODULE' + '_RELATED_',
    'SUBMODULE' + '_RELATED_',
    'support' + '-module-relations-overrides',
    'modules' + '/registry.json',
  ];
  for (const marker of markers) {
    assert(!nodesText.includes(marker), 'customer graph nodes contain internal marker ' + marker);
    assert(!edgesText.includes(marker), 'customer graph edges contain internal marker ' + marker);
  }
  assert(nodesText.includes('"CliCapability:'), 'customer graph must keep CLI capability nodes');
  assert(nodesText.includes('"TestKitHelper:'), 'customer graph must keep test-kit helper nodes');
  assert(nodesText.includes('"E2eScenario:'), 'customer graph must keep e2e scenario nodes');
  assert(edgesText.includes('ACTION_BACKED_BY_CLI_CAPABILITY'), 'customer graph must keep action-capability edges');
});

check('capability-binding-references', () => {
  const bindings = readJson('references/capability-bindings.json');
  const helperIndex = readJson('references/test-kit-helper-index.json');
  const scenarioRefs = readJson('references/e2e-scenario-refs.json');
  const actions = readJson('runtime/do-action-reference.json');
  const actionIds = new Set((actions.actions ?? []).map(action => action.id));
  const helperNames = new Set((helperIndex.helpers ?? []).map(helper => helper.name));
  const recipeKeys = new Set((scenarioRefs.scenarios ?? []).map(scenario => scenario.recipeKey));
  assert((bindings.bindings ?? []).length >= 20, 'capability bindings row count is too low');
  for (const binding of bindings.bindings ?? []) {
    for (const actionId of binding.actionIds ?? []) assert(actionIds.has(actionId), binding.capabilityAtomId + ' references unknown action ' + actionId);
    for (const helperName of binding.testKitHelpers ?? []) assert(helperNames.has(helperName), binding.capabilityAtomId + ' references unknown helper ' + helperName);
    for (const recipeKey of binding.e2eScenarioRefs ?? []) assert(recipeKeys.has(recipeKey), binding.capabilityAtomId + ' references unknown scenario ' + recipeKey);
  }
});

check('article-search-candidates', () => {
  for (const item of [
    { query: 'когда пользователь выбирает продукт текст кнопки купить и описание должны обновляться во flexible layout', expected: 'help-block-flexible-sections' },
    { query: 'which events does Segmently send to Facebook events catalog', expected: 'facebook-events-catalog' },
    { query: 'webembed paywall with product purchase label', expectedAny: ['help-block-custom-html', 'help-block-paywall-subscriptions', 'help-block-flexible-sections'] },
  ]) {
    const result = JSON.parse(execFileSync('node', [join(root, 'scripts/article-registry-tool.mjs'), 'search', '--query', item.query], { encoding: 'utf8' }));
    const aliases = (result.candidates ?? []).map(candidate => candidate.articleAlias);
    if (item.expected) assert(aliases[0] === item.expected, 'query ' + JSON.stringify(item.query) + ' expected top ' + item.expected + ', got ' + aliases.slice(0, 5).join(', '));
    if (item.expectedAny) assert(item.expectedAny.some(alias => aliases.includes(alias)), 'query ' + JSON.stringify(item.query) + ' expected one of ' + item.expectedAny.join(', ') + ', got ' + aliases.slice(0, 5).join(', '));
  }
});

check('article-tool-validate', () => {
  const result = JSON.parse(execFileSync('node', [join(root, 'scripts/article-registry-tool.mjs'), 'validate'], { encoding: 'utf8' }));
  assert(result.ok === true, 'article registry tool validate failed: ' + (result.failures ?? []).join('; '));
});

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(failures.length + ' eval check(s) failed');
  process.exit(1);
}
console.log('evals passed');

function check(id, fn) {
  try {
    fn();
    console.log('ok - ' + id);
  } catch (error) {
    failures.push('not ok - ' + id + '\n  ' + (error instanceof Error ? error.message : String(error)));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}
