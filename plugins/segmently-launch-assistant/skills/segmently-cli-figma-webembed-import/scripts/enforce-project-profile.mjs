#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PROFILE = {
  defaults: {
    statusBar: 'unresolved',
    footerCta: 'unresolved',
  },
};

const DEVICE_CHROME_LABEL_RE = /^(status(?:\s+bar)?\s+(?:time|indicators|right(?:\s+indicators)?|right)|status\s+time(?:\s+image)?|status\s+right(?:\s+indicators)?|status\s+indicators|home\s+indicator(?:\s+(?:stripe|bar|image))?)$/i;
const DEVICE_CHROME_ID_RE = /^status(?:-bar)?-(?:time|indicators|right(?:-indicators)?)$|^status-time-image$|^status-right(?:-indicators)?$|^home-indicator(?:-(?:wrap|stripe|bar|image))?$/i;
const DEVICE_CHROME_CLASS_RE = /^(status-container|status-bar|status-wrap|status-shell|status-stack|status-time|status-right|home-indicator-wrap|home-indicator)$/;
const EMPTY_DEVICE_CHROME_CLASS_RE = /^(status|home)$/;
const DEVICE_CHROME_MEDIA_RE = /^(Status Bar Time|Status Bar Indicators|Status Bar Right Indicators|Status Time|Status Indicators|Status Time Image|Status Right|Status Right Indicators|Home Indicator|Home Indicator Stripe|Home Indicator Bar)$/i;
const PROFILE_CSS_MARKER_START = '/* segmently-profile-enforcement:start */';
const PROFILE_CSS_MARKER_END = '/* segmently-profile-enforcement:end */';

function usage() {
  return [
    'Usage:',
    '  node enforce-project-profile.mjs --catalog <custom-screen-catalog.json> [options]',
    '',
    'Applies explicit project-profile conversion decisions to generated',
    'WebEmbed artifacts before pilot render, media stabilization, or CLI apply.',
    '`statusBar: omit` removes device chrome, including the top status bar,',
    'bottom iOS home indicator, and decorative footer preview strips.',
    '',
    'Options:',
    '  --profile <project-profile.json>  Profile file. Defaults to catalog projectProfileFile.',
    '  --status-bar <mode>               include, omit, spacer. Overrides profile default.',
    '  --footer-cta <mode>               scroll-with-content, sticky-footer, fixed-outside-scroll.',
    '  --dry-run                         Report changes without writing files.',
    '  --help                            Show this help.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--catalog') args.catalog = argv[++index];
    else if (arg === '--profile') args.profile = argv[++index];
    else if (arg === '--status-bar') args.statusBar = argv[++index];
    else if (arg === '--footer-cta') args.footerCta = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveRunDir(catalogPath, catalog) {
  if (catalog.outputDir) {
    return path.isAbsolute(catalog.outputDir)
      ? catalog.outputDir
      : path.resolve(path.dirname(catalogPath), catalog.outputDir);
  }
  return path.dirname(catalogPath);
}

function resolveInRun(runDir, relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(runDir, relativeOrAbsolute);
}

function readProfile(args, catalogPath, catalog, runDir) {
  const profilePath = args.profile
    ? path.resolve(args.profile)
    : catalog.projectProfileFile
      ? resolveInRun(runDir, catalog.projectProfileFile)
      : path.resolve(path.dirname(catalogPath), 'project-profile.json');
  if (!fs.existsSync(profilePath)) {
    return { profilePath, profile: DEFAULT_PROFILE, exists: false };
  }
  return { profilePath, profile: readJson(profilePath), exists: true };
}

function screenOverride(profile, screenId, key) {
  return profile?.screenOverrides?.[screenId]?.[key];
}

function decisionFor(args, profile, screen, key) {
  if (key === 'statusBar' && args.statusBar) return { decision: args.statusBar, source: 'cli-override' };
  if (key === 'footerCta' && args.footerCta) return { decision: args.footerCta, source: 'cli-override' };
  const override = screenOverride(profile, screen.id, key);
  if (override) return { decision: override, source: 'screen-override' };
  const existing = screen.conversionDecisions?.[key];
  if (existing?.decision && existing.decision !== 'unresolved') {
    return { decision: existing.decision, source: existing.source || 'catalog' };
  }
  const fallback = profile?.defaults?.[key];
  if (fallback) return { decision: fallback, source: 'project-profile' };
  return { decision: 'unresolved', source: 'missing' };
}

function isDeviceChromeSection(section) {
  const label = typeof section?.label === 'string' ? section.label.trim() : '';
  const id = typeof section?.id === 'string' ? section.id.trim() : '';
  return section?.kind === 'Media' && (DEVICE_CHROME_LABEL_RE.test(label) || DEVICE_CHROME_ID_RE.test(id));
}

function profileCss(statusBarDecision, footerDecision) {
  const rules = [];
  if (statusBarDecision === 'omit' || statusBarDecision === 'spacer') {
    rules.push(`
.status-container,
.status-bar,
.status-wrap,
.status-shell,
.status-stack,
.status-time,
.status-right,
.home-indicator-wrap,
.home-indicator,
[data-media="Status Bar Time"],
[data-media="Status Bar Indicators"],
[data-media="Status Bar Right Indicators"],
[data-media="Status Time"],
[data-media="Status Indicators"],
[data-media="Status Time Image"],
[data-media="Status Right"],
[data-media="Status Right Indicators"],
[data-media="Home Indicator"],
[data-media="Home Indicator Stripe"],
[data-media="Home Indicator Bar"] {
  display: none !important;
}`);
  }

  if (footerDecision === 'sticky-footer' || footerDecision === 'fixed-outside-scroll') {
    rules.push(`
html,
body {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  background: transparent !important;
}

body {
  display: block !important;
  place-items: unset !important;
}

.screen,
[class$="-screen"] {
  margin: 0 auto !important;
}

.cta-wrap {
  position: fixed !important;
  left: 20px !important;
  right: 20px !important;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px) !important;
  top: auto !important;
  width: auto !important;
  z-index: 50 !important;
}

.cta-wrap > button,
.cta-wrap .primary-cta,
.button-stack > button {
  width: 100% !important;
}

.button-stack {
  position: fixed !important;
  left: 20px !important;
  right: 20px !important;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px) !important;
  top: auto !important;
  width: auto !important;
  z-index: 50 !important;
}

.button-stack:has(+ .security),
.button-stack:has(+ .security-badge),
.button-stack:has(+ .secure) {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 76px) !important;
}

.button-stack + .security,
.button-stack + .security-badge,
.button-stack + .secure,
.primary-cta + .security,
.primary-cta + .security-badge,
.primary-cta + .secure,
.primary + .security,
.primary + .security-badge,
.primary + .secure {
  position: fixed !important;
  left: 20px !important;
  right: 20px !important;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 44px) !important;
  top: auto !important;
  width: auto !important;
  height: auto !important;
  z-index: 51 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}`);
  }

  if (!rules.length) return '';
  return `${PROFILE_CSS_MARKER_START}\n${rules.join('\n')}\n${PROFILE_CSS_MARKER_END}`;
}

function injectProfileCss(html, css) {
  const withoutExisting = html.replace(
    new RegExp(`${escapeRegExp(PROFILE_CSS_MARKER_START)}[\\s\\S]*?${escapeRegExp(PROFILE_CSS_MARKER_END)}\\s*`, 'g'),
    '',
  );
  if (!css) return withoutExisting;
  if (/<\/style>/i.test(withoutExisting)) {
    return withoutExisting.replace(/<\/style>/i, `\n${css}\n</style>`);
  }
  return withoutExisting.replace(/<\/head>/i, `<style>\n${css}\n</style>\n</head>`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseAttrs(tagText) {
  const attrs = {};
  const attrRe = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRe.exec(tagText))) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    attrs[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
  }
  return attrs;
}

function classList(attrs) {
  return String(attrs.class || '').split(/\s+/).filter(Boolean);
}

function deviceChromeElementMode(attrs) {
  if (classList(attrs).some((className) => DEVICE_CHROME_CLASS_RE.test(className))) return 'strict';
  if (classList(attrs).some((className) => EMPTY_DEVICE_CHROME_CLASS_RE.test(className))) return 'empty';
  const media = String(attrs['data-media'] || '').trim();
  if (DEVICE_CHROME_MEDIA_RE.test(media)) return 'strict';
  return null;
}

function findElementEnd(html, startTagEndIndex) {
  const tagRe = /<\/?([a-zA-Z][\w:-]*)(?:\s[^>]*)?>/g;
  tagRe.lastIndex = startTagEndIndex;
  let depth = 1;
  let match;
  while ((match = tagRe.exec(html))) {
    const [tagText, tagName] = match;
    const lowerTag = tagName.toLowerCase();
    if (lowerTag !== 'div' && lowerTag !== 'span' && lowerTag !== 'img') continue;
    const isClosing = tagText.startsWith('</');
    const isSelfClosing = tagText.endsWith('/>') || lowerTag === 'img';
    if (!isClosing && !isSelfClosing) depth += 1;
    if (isClosing) depth -= 1;
    if (depth === 0) return tagRe.lastIndex;
  }
  return -1;
}

function stripDeviceChromeHtml(html) {
  let output = '';
  let cursor = 0;
  const tagRe = /<(div|span|img)\b([^>]*)>/gi;
  let match;
  let removed = 0;
  while ((match = tagRe.exec(html))) {
    const [tagText, tagName, attrText] = match;
    const attrs = parseAttrs(attrText);
    const mode = deviceChromeElementMode(attrs);
    if (!mode) continue;

    const start = match.index;
    const selfClosing = tagText.endsWith('/>') || tagName.toLowerCase() === 'img';
    const contentStart = tagRe.lastIndex;
    const end = selfClosing ? tagRe.lastIndex : findElementEnd(html, tagRe.lastIndex);
    if (end < 0) continue;
    if (mode === 'empty' && !selfClosing) {
      const inner = html.slice(contentStart, end).replace(/<\/(?:div|span)>\s*$/i, '').trim();
      if (inner) continue;
    }

    output += html.slice(cursor, start);
    cursor = end;
    tagRe.lastIndex = end;
    removed += 1;
  }

  if (removed === 0) return { html, removed };
  output += html.slice(cursor);
  return { html: output, removed };
}

function removeDeviceChromeDataSources(dataSources) {
  const removed = [];
  const kept = [];
  for (const section of dataSources) {
    if (isDeviceChromeSection(section)) removed.push({ id: section.id, label: section.label });
    else kept.push(section);
  }
  return { kept, removed };
}

function removeDeviceChromePlanSections(plan) {
  if (!Array.isArray(plan)) return { next: plan, removed: [] };
  const removed = [];
  const kept = [];
  for (const section of plan) {
    if (isDeviceChromeSection(section)) removed.push({ id: section.id, label: section.label });
    else kept.push(section);
  }
  return { next: kept, removed };
}

function applyToScreen(args, runDir, screen, profile) {
  const statusBar = decisionFor(args, profile, screen, 'statusBar');
  const footerCta = decisionFor(args, profile, screen, 'footerCta');
  const changes = {
    screenId: screen.id,
    statusBar,
    footerCta,
    htmlCssInjected: false,
    removedDeviceChromeElements: 0,
    removedDeviceChromeDataSources: [],
    removedDeviceChromePlanSections: [],
  };

  if (!screen.conversionDecisions || typeof screen.conversionDecisions !== 'object') {
    screen.conversionDecisions = {};
  }
  screen.conversionDecisions.statusBar = {
    detected: screen.conversionDecisions.statusBar?.detected ?? true,
    decision: statusBar.decision,
    source: statusBar.source,
  };
  screen.conversionDecisions.footerCta = {
    detected: screen.conversionDecisions.footerCta?.detected ?? true,
    decision: footerCta.decision,
    source: footerCta.source,
  };

  const css = profileCss(statusBar.decision, footerCta.decision);
  if (screen.updated?.htmlFile) {
    const htmlPath = resolveInRun(runDir, screen.updated.htmlFile);
    if (fs.existsSync(htmlPath)) {
      const before = fs.readFileSync(htmlPath, 'utf8');
      const stripped = statusBar.decision === 'omit' ? stripDeviceChromeHtml(before) : { html: before, removed: 0 };
      const after = injectProfileCss(stripped.html, css);
      changes.removedDeviceChromeElements = stripped.removed;
      changes.htmlCssInjected = before !== after;
      if (!args.dryRun && before !== after) fs.writeFileSync(htmlPath, after, 'utf8');
    }
  }

  if ((statusBar.decision === 'omit' || statusBar.decision === 'spacer') && screen.updated?.dataSourcesFile) {
      const dataSourcesPath = resolveInRun(runDir, screen.updated.dataSourcesFile);
    if (fs.existsSync(dataSourcesPath)) {
      const dataSources = readJson(dataSourcesPath);
      const { kept, removed } = removeDeviceChromeDataSources(dataSources);
      changes.removedDeviceChromeDataSources = removed;
      if (!args.dryRun && removed.length) writeJson(dataSourcesPath, kept);
    }
  }

  const planFile = screen.updated?.dataSourcePlanFile || `screens/${screen.id}/updated/data-source-plan.json`;
  const planPath = resolveInRun(runDir, planFile);
  if ((statusBar.decision === 'omit' || statusBar.decision === 'spacer') && fs.existsSync(planPath)) {
    const plan = readJson(planPath);
    const { next, removed } = removeDeviceChromePlanSections(plan);
    changes.removedDeviceChromePlanSections = removed;
    if (!args.dryRun && removed.length) writeJson(planPath, next);
  }

  return changes;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.catalog) throw new Error('Missing --catalog');

  const catalogPath = path.resolve(args.catalog);
  const catalog = readJson(catalogPath);
  const runDir = resolveRunDir(catalogPath, catalog);
  const { profilePath, profile, exists } = readProfile(args, catalogPath, catalog, runDir);
  const screens = Array.isArray(catalog.screens) ? catalog.screens : [];
  if (!screens.length) throw new Error('Catalog has no screens.');

  const report = {
    schemaVersion: 'figma-webembed-project-profile-enforcement/v1',
    status: 'passed',
    dryRun: args.dryRun,
    profileFile: path.relative(runDir, profilePath),
    profileFound: exists,
    screens: screens.map((screen) => applyToScreen(args, runDir, screen, profile)),
  };
  report.summary = {
    screenCount: report.screens.length,
    htmlFilesChanged: report.screens.filter((screen) => screen.htmlCssInjected).length,
    removedDeviceChromeElements: report.screens.reduce((sum, screen) => sum + screen.removedDeviceChromeElements, 0),
    removedDeviceChromeDataSources: report.screens.reduce((sum, screen) => sum + screen.removedDeviceChromeDataSources.length, 0),
  };

  const reportPath = resolveInRun(runDir, 'checks/project-profile-enforcement.json');
  if (!args.dryRun) {
    if (!catalog.checks || typeof catalog.checks !== 'object') catalog.checks = {};
    catalog.checks.projectProfileEnforcementFile = 'checks/project-profile-enforcement.json';
    writeJson(catalogPath, catalog);
    writeJson(reportPath, report);
  }

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
