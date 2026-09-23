#!/usr/bin/env node
/**
 * Standalone validator for the segmently-unit-economics plugin (UEC-AC-030 / UEC-AC-034).
 * Exit code is the test: 0 = every check passed, 1 = offenders listed on stderr.
 *
 * Forbidden tokens and sibling skill names are assembled from parts so this file does not
 * match its own scan.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const PLUGIN = ['segmently', 'unit', 'economics'].join('-');
const PREREQUISITES = 'Node.js 22+ with npx';

const FORBIDDEN = new RegExp([
  ['auth', 'login'].join(' '),
  `${'-'.repeat(2)}env `,
  ['play', 'wright'].join(''),
  ['local', 'host'].join(''),
  ['dev', 'api'].join('-'),
  ['SEGMENTLY', 'API', 'KEY'].join('_'),
].join('|'), 'i');

/** Every other Segmently skill / plugin a customer could meet — none may be named here. */
const OTHER_SEGMENTLY_SKILLS = [
  ['segmently', 'launch', 'assistant'],
  ['segmently', 'launch', 'guide'],
  ['segmently', 'cli', 'guide'],
  ['segmently', 'cli', 'paywall', 'ab', 'rollout'],
  ['segmently', 'cli', 'articles'],
  ['segmently', 'cli', 'content', 'plan', 'guide'],
  ['segmently', 'cli', 'custom', 'screen', 'guide'],
  ['segmently', 'cli', 'figma', 'webembed', 'import'],
  ['segmently', 'cli', 'image', 'upload'],
  ['segmently', 'cli', 'flexible', 'layout', 'sections'],
  ['segmently', 'cli', 'admin', 'guide'],
  ['segmently', 'product', 'cli', 'guide'],
  ['segmently', 'test', 'kit'],
  ['segmently', 'admin', 'diagnostics'],
  ['segmently', 'migration'],
  ['segmently', 'guides', 'dev', 'to', 'prod'],
  ['segmently', 'research', 'analytics'],
  ['segmently', 'ad', 'engine'],
  ['segmently', 'terraform'],
  ['screen', 'block', 'builder'],
  ['claude', 'design'],
  ['support', 'flow', 'article', 'impact'],
  ['support', 'flow', 'article', 'release'],
].map(parts => parts.join('-'));

const failures = [];
const results = [];
function check(id, fn) {
  const before = failures.length;
  try {
    fn();
  } catch (error) {
    failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
  results.push(`${failures.length === before ? 'ok' : 'FAIL'} - ${id}`);
}
function fail(message) {
  throw new Error(message);
}

function listFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}
const rel = file => relative(pluginRoot, file).split(sep).join('/');
const files = listFiles(pluginRoot).filter(file => !rel(file).endsWith('.DS_Store'));
function readJson(path) {
  if (!existsSync(path)) fail(`missing ${rel(path)}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`${rel(path)} does not parse: ${error.message}`);
  }
}

const skillRoot = join(pluginRoot, 'skills', PLUGIN);

check('exactly one skill', () => {
  const skillsDir = join(pluginRoot, 'skills');
  const skills = existsSync(skillsDir) ? readdirSync(skillsDir).filter(name => statSync(join(skillsDir, name)).isDirectory()) : [];
  if (skills.length !== 1 || skills[0] !== PLUGIN) fail(`skills/ must hold only ${PLUGIN}, found [${skills.join(', ')}]`);
});

check('SKILL.md with frontmatter', () => {
  const path = join(skillRoot, 'SKILL.md');
  if (!existsSync(path)) fail('missing skills/<skill>/SKILL.md');
  const text = readFileSync(path, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) fail('SKILL.md has no frontmatter block');
  if (!new RegExp(`^name:\\s*"?${PLUGIN}"?\\s*$`, 'm').test(match[1])) fail(`frontmatter name must be ${PLUGIN}`);
  if (!/^description:\s*\S/m.test(match[1])) fail('frontmatter description missing');
});

check('monorepo-only files absent', () => {
  const offenders = files.map(rel).filter(path => /(^|\/)internal-admin-seams\.md$/.test(path) || /(^|\/)evals(\/|$)/.test(path));
  if (offenders.length) fail(`must not ship: ${offenders.join(', ')}`);
});

check('no agents, hooks, MCP config', () => {
  const offenders = files.map(rel).filter(path => /^(agents|hooks|commands)\//.test(path) || /(^|\/)\.mcp\.json$/.test(path) || /(^|\/)hooks\.json$/.test(path));
  if (offenders.length) fail(`unexpected plugin components: ${offenders.join(', ')}`);
});

let claudeManifest;
let codexManifest;
check('manifests parse and agree', () => {
  claudeManifest = readJson(join(pluginRoot, '.claude-plugin/plugin.json'));
  codexManifest = readJson(join(pluginRoot, '.codex-plugin/plugin.json'));
  const release = readJson(join(pluginRoot, '.codex-plugin/release.json'));
  for (const [label, manifest] of [['claude', claudeManifest], ['codex', codexManifest], ['release', { name: release.pluginName, version: release.version }]]) {
    if (manifest.name !== PLUGIN) fail(`${label} manifest name must be ${PLUGIN}`);
  }
  if (!claudeManifest.version || claudeManifest.version !== codexManifest.version) fail(`version mismatch: claude ${claudeManifest.version} vs codex ${codexManifest.version}`);
  if (release.version !== claudeManifest.version) fail(`release.json version ${release.version} differs from manifests ${claudeManifest.version}`);
  if (!String(release.contentHash ?? '').startsWith(release.cachebuster ?? '?') || !claudeManifest.version.endsWith(`+codex.${release.cachebuster}`)) {
    fail('version must be <base>+codex.<first 12 hex of contentHash>');
  }
  if (JSON.stringify(release.includedSkills) !== JSON.stringify([PLUGIN])) fail('release.json includedSkills must be exactly the one skill');
  for (const [label, manifest] of [['claude', claudeManifest], ['codex', codexManifest]]) {
    for (const key of ['hooks', 'mcpServers', 'agents', 'commands']) {
      if (manifest[key] !== undefined) fail(`${label} manifest declares ${key}`);
    }
  }
});

check('prerequisites: Node 22 + npx only', () => {
  const readmePath = join(pluginRoot, 'README.md');
  if (!existsSync(readmePath)) fail('missing README.md');
  const readme = readFileSync(readmePath, 'utf8');
  if (!readme.includes(`Prerequisites: ${PREREQUISITES}. That is all.`)) fail(`README must state "Prerequisites: ${PREREQUISITES}. That is all."`);
  const longDescription = codexManifest?.interface?.longDescription ?? '';
  if (!longDescription.includes(`Prerequisites: ${PREREQUISITES}.`)) fail(`codex manifest longDescription must state "Prerequisites: ${PREREQUISITES}."`);
  const prereqLines = [readme, longDescription, claudeManifest?.description ?? '']
    .flatMap(text => text.split('\n'))
    .filter(line => /prerequisite|requires|install .* first/i.test(line));
  const extra = prereqLines.filter(line => /git|segmently (cli|account)|login|browser|chrom|python|docker|api key|token/i.test(line) && !/no browser/i.test(line));
  if (extra.length) fail(`extra prerequisites stated: ${extra.join(' | ')}`);
});

check('no forbidden tokens', () => {
  const offenders = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (FORBIDDEN.test(line)) offenders.push(`${rel(file)}:${index + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  if (offenders.length) fail(`\n  ${offenders.join('\n  ')}`);
});

check('no other Segmently skill named', () => {
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const name of OTHER_SEGMENTLY_SKILLS) {
      if (new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(text)) offenders.push(`${rel(file)}: ${name}`);
    }
  }
  if (offenders.length) fail(`\n  ${offenders.join('\n  ')}`);
});

console.log(results.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`\n${PLUGIN} plugin valid (${files.length} file(s)).`);
