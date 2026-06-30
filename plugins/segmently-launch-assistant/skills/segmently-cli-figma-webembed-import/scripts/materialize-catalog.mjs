#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCALE = 'en-US';

function usage() {
  return [
    'Usage:',
    '  node materialize-catalog.mjs --catalog <figma-catalog.json> [--locale en-US]',
    '',
    'Reads a figma-webembed catalog, writes materialized data-sources.json files,',
    'updates screen status to ready-for-cli-apply, and writes custom-screen-catalog.json.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { locale: DEFAULT_LOCALE };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--catalog') {
      args.catalog = argv[++i];
    } else if (arg === '--locale') {
      args.locale = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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

function resolveScreenKind(screen) {
  return screen.screenKind || screen.kind || 'webembed-screen';
}

function resolveRenderMode(screen) {
  if (screen.renderMode) return screen.renderMode;
  return resolveScreenKind(screen) === 'webembed-paywall' ? 'shadow-dom' : 'iframe';
}

function resolveIsIframe(screen) {
  if (typeof screen.isIframe === 'boolean') return screen.isIframe;
  return resolveRenderMode(screen) !== 'shadow-dom';
}

function unresolvedConversionDecision(screen) {
  const decisions = screen.conversionDecisions;
  if (!decisions || typeof decisions !== 'object') return null;

  for (const [key, value] of Object.entries(decisions)) {
    if (!value || typeof value !== 'object') continue;
    if (value.detected === true && (!value.decision || value.decision === 'unresolved')) {
      return key;
    }
  }

  return null;
}

function layoutSourceTextLooksIncomplete(text) {
  const normalized = String(text || '').toLowerCase();
  const incompleteMarkers = [
    'truncated',
    'omitted',
    'partial',
    'key content includes',
    'visible content:',
    'embedded preview',
    'rawtext preserves the visible',
    'rather than inventing missing code',
    'summary',
  ];
  return incompleteMarkers.some((marker) => normalized.includes(marker));
}

function validateLayoutSource(screen, runDir) {
  const layoutSource = screen.layoutSource;
  if (!layoutSource || typeof layoutSource !== 'object') {
    throw new Error(`Screen ${screen.id} is missing complete layoutSource; do not materialize generic-template HTML from summaries or screenshots.`);
  }

  const acceptedKinds = new Set([
    'figma-design-context',
    'figma-node-tree',
    'existing-html-minimal-edit',
  ]);
  if (layoutSource.status !== 'complete' || !acceptedKinds.has(layoutSource.kind)) {
    throw new Error(
      `Screen ${screen.id} has invalid layoutSource (${layoutSource.kind || 'unknown'}:${layoutSource.status || 'unknown'}); ` +
      'screens without a measured layout source must stay needs-layout-source.',
    );
  }

  if (layoutSource.kind === 'figma-render-fallback' || layoutSource.kind === 'figma-screenshot' || layoutSource.kind === 'text-summary') {
    throw new Error(`Screen ${screen.id} uses ${layoutSource.kind}, which is not a publishable layout source.`);
  }

  const sourceFile = requireExistingRunFile(runDir, layoutSource.file, 'layout source file', screen.id);
  const sourceText = fs.readFileSync(resolveInRun(runDir, sourceFile), 'utf8');
  if (layoutSourceTextLooksIncomplete(sourceText)) {
    throw new Error(
      `Screen ${screen.id} layoutSource file is not a complete layout source; ` +
      'human summaries, compact content inventories, and truncated MCP transcripts must stay needs-layout-source.',
    );
  }
}

function resolveInRun(runDir, relativeOrAbsolute) {
  if (!relativeOrAbsolute) return null;
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(runDir, relativeOrAbsolute);
}

function requireExistingRunFile(runDir, relativeOrAbsolute, label, screenId) {
  if (!relativeOrAbsolute) return null;
  const filePath = resolveInRun(runDir, relativeOrAbsolute);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Screen ${screenId} is missing ${label}: ${relativeOrAbsolute}`);
  }
  return relativeOrAbsolute;
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

function assertUniqueInteractionMap(runDir, relativeOrAbsolute, screenId) {
  const filePath = resolveInRun(runDir, relativeOrAbsolute);
  const map = readJson(filePath);
  const elements = Array.isArray(map.elements) ? map.elements : [];
  const duplicateTestIds = findDuplicates(elements.map((element) => element.testId));
  const duplicateSelectors = findDuplicates(elements.map((element) => element.selector));
  if (duplicateTestIds.length || duplicateSelectors.length) {
    throw new Error(
      `Screen ${screenId} has duplicate interaction map selectors: ` +
      [...duplicateTestIds, ...duplicateSelectors].join(', '),
    );
  }
}

function resolveRunDir(catalogPath, catalog) {
  const catalogDir = path.dirname(catalogPath);
  if (!catalog.outputDir) return catalogDir;
  if (path.isAbsolute(catalog.outputDir)) return catalog.outputDir;

  const fromCatalogDir = path.resolve(catalogDir, catalog.outputDir);
  if (fs.existsSync(fromCatalogDir)) return fromCatalogDir;

  const fromCwd = path.resolve(process.cwd(), catalog.outputDir);
  if (fs.existsSync(fromCwd)) return fromCwd;

  return fromCatalogDir;
}

function slug(value, fallback) {
  const text = String(value || fallback || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback || 'section';
}

function staticText(value, locale) {
  return {
    kind: 'static',
    translations: { [locale]: String(value ?? '') },
    appearance: {},
  };
}

function normalizeItems(items, locale) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item.id || `${index + 1}`,
    title: staticText(item.title ?? item.label ?? '', locale),
    subtitle: item.subtitle ? staticText(item.subtitle, locale) : undefined,
    variableValue: item.variableValue ?? item.value ?? item.id ?? `${index + 1}`,
  })).map((item) => {
    const result = { ...item };
    if (!result.subtitle) delete result.subtitle;
    return result;
  });
}

function resolveMediaKind(plan) {
  const raw = String(plan.mediaType || plan.type || plan.kindType || 'image').toLowerCase();
  return raw === 'video' ? 'Video' : 'Image';
}

function materializeMediaContent(plan, locale) {
  const mediaKind = resolveMediaKind(plan);
  const url = plan.url || plan.assetUrl || plan.mediaUrl || '';
  if (mediaKind === 'Video') {
    return {
      kind: 'Video',
      content: {
        video: {
          translations: {
            [locale]: { original: url },
          },
        },
      },
    };
  }

  return {
    kind: 'Image',
    content: {
      image: {
        translations: {
          [locale]: { original: url, small: url },
        },
      },
    },
  };
}

function hasMaterializedContent(plan) {
  return Boolean(
    plan &&
    typeof plan === 'object' &&
    (
      plan.textContent ||
      plan.optionsListContent ||
      plan.mediaContent ||
      plan.productCatalogContent ||
      plan.textFieldContent
    )
  );
}

function normalizeMaterializedSection(plan, index) {
  const kind = plan.kind;
  const label = plan.label || plan.name || `${kind} ${index + 1}`;
  return {
    ...plan,
    id: plan.id || slug(label, `section-${index + 1}`),
    kind,
    label,
    order: Number.isFinite(plan.order) ? plan.order : index,
  };
}

function materializeSection(plan, index, locale) {
  const kind = plan.kind;
  const label = plan.label || plan.name || `${kind} ${index + 1}`;
  const base = {
    id: plan.id || slug(label, `section-${index + 1}`),
    kind,
    label,
    order: Number.isFinite(plan.order) ? plan.order : index,
  };

  if (hasMaterializedContent(plan)) {
    return normalizeMaterializedSection(plan, index);
  }

  if (kind === 'Text') {
    return {
      ...base,
      textContent: {
        title: staticText(plan.title ?? plan.text ?? plan.value ?? '', locale),
      },
    };
  }

  if (kind === 'BulletList' || kind === 'SingleSelectionList' || kind === 'MultipleSelectionList' || kind === 'OptionsList') {
    return {
      ...base,
      optionsListContent: {
        items: normalizeItems(plan.items ?? plan.options, locale),
      },
    };
  }

  if (kind === 'Media') {
    return {
      ...base,
      mediaContent: materializeMediaContent(plan, locale),
    };
  }

  if (kind === 'ProductCatalog') {
    return {
      ...base,
      productCatalogContent: {
        items: Array.isArray(plan.items)
          ? plan.items
          : Array.isArray(plan.products)
            ? plan.products
            : [],
      },
    };
  }

  if (kind === 'TextField') {
    return {
      ...base,
      textFieldContent: {
        placeholder: staticText(plan.placeholder ?? '', locale),
      },
    };
  }

  throw new Error(`Unsupported data source kind "${kind}" for label "${label}"`);
}

function materializeDataSources(plan, locale) {
  const entries = Array.isArray(plan) ? plan : [];
  const labels = new Set();
  return entries.map((entry, index) => {
    const label = entry.label || entry.name || `${entry.kind} ${index + 1}`;
    const key = String(label).toLowerCase();
    if (labels.has(key)) {
      throw new Error(`Duplicate data source label: ${label}`);
    }
    labels.add(key);
    return materializeSection(entry, index, locale);
  });
}

function updateStats(catalog) {
  const stats = {};
  for (const screen of catalog.screens ?? []) {
    stats[screen.status] = (stats[screen.status] || 0) + 1;
  }
  catalog.statistics = {
    total: (catalog.screens ?? []).length,
    pending: stats.pending || 0,
    'mcp-discovered': stats['mcp-discovered'] || 0,
    'layout-source-ready': stats['layout-source-ready'] || 0,
    extracted: stats.extracted || 0,
    converted: stats.converted || 0,
    materialized: stats.materialized || 0,
    'ready-for-cli-apply': stats['ready-for-cli-apply'] || 0,
    'needs-user-decision': stats['needs-user-decision'] || 0,
    failed: stats.failed || 0,
    skipped: stats.skipped || 0,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.catalog) {
    throw new Error(`Missing --catalog\n\n${usage()}`);
  }

  const catalogPath = path.resolve(args.catalog);
  const catalog = readJson(catalogPath);
  const effectiveRunDir = resolveRunDir(catalogPath, catalog);

  const handoffScreens = [];
  for (const screen of catalog.screens ?? []) {
    if (screen.status === 'failed' || screen.status === 'skipped') continue;
    if (screen.status !== 'converted' && screen.status !== 'done' && screen.status !== 'materialized' && screen.status !== 'ready-for-cli-apply') {
      throw new Error(`Screen ${screen.id} is not converted (status: ${screen.status})`);
    }

    const unresolvedDecision = unresolvedConversionDecision(screen);
    if (unresolvedDecision) {
      throw new Error(`Screen ${screen.id} has unresolved conversion decision: ${unresolvedDecision}`);
    }
    validateLayoutSource(screen, effectiveRunDir);

    const htmlRelative = screen.outputHtmlFile || screen.outputFile || `screens/${screen.id}/updated/index.html`;
    const htmlPath = resolveInRun(effectiveRunDir, htmlRelative);
    if (!htmlPath || !fs.existsSync(htmlPath)) {
      throw new Error(`Screen ${screen.id} is missing HTML: ${htmlRelative}`);
    }

    const dataSourcesRelative = screen.outputDataSourcesFile || `screens/${screen.id}/updated/data-sources.json`;
    const dataSourcesPath = resolveInRun(effectiveRunDir, dataSourcesRelative);
    const plan = screen.dataSourcePlan ?? screen.dataSources ?? [];
    const dataSources = materializeDataSources(plan, args.locale);
    writeJson(dataSourcesPath, dataSources);
    const interactionMapRelative = requireExistingRunFile(
      effectiveRunDir,
      screen.interactionMapFile || screen.updated?.interactionMapFile,
      'interaction map',
      screen.id,
    );
    assertUniqueInteractionMap(effectiveRunDir, interactionMapRelative, screen.id);

    const history = Array.isArray(screen.statusHistory) ? screen.statusHistory : [];
    if (!history.includes('materialized')) history.push('materialized');
    if (!history.includes('ready-for-cli-apply')) history.push('ready-for-cli-apply');
    screen.statusHistory = history;
    screen.status = 'ready-for-cli-apply';
    screen.outputDataSourcesFile = dataSourcesRelative;

    const screenKind = resolveScreenKind(screen);
    const renderMode = resolveRenderMode(screen);
    const isIframe = resolveIsIframe(screen);

    screen.screenKind = screenKind;
    screen.renderMode = renderMode;
    screen.isIframe = isIframe;

    handoffScreens.push({
      id: screen.id,
      name: screen.figmaNodeName || screen.name || screen.id,
      screenType: 'WebEmbed',
      status: 'ready-for-cli-apply',
      statusHistory: ['pending', 'ready-for-cli-apply'],
      original: null,
      updated: {
        htmlFile: htmlRelative,
        dataSourcesFile: dataSourcesRelative,
        edgesFile: screen.edgesFile || null,
        variablesFile: screen.variablesFile || null,
        interactionMapFile: interactionMapRelative,
      },
      checks: {
        applyResultFile: `screens/${screen.id}/checks/apply-result.json`,
        healthcheckFile: `screens/${screen.id}/checks/healthcheck.json`,
        imageScanFile: `screens/${screen.id}/checks/image-scan.json`,
      },
      layoutSource: screen.layoutSource,
      screenKind,
      renderMode,
      isIframe,
      position: screen.position || null,
      conversionDecisions: screen.conversionDecisions || null,
      changePolicy: 'generated-from-figma',
      attempts: screen.attempts || 1,
      error: null,
    });
  }

  updateStats(catalog);
  writeJson(catalogPath, catalog);

  const handoff = {
    schemaVersion: 'custom-screen-cli-catalog/v1',
    source: {
      kind: 'figma',
      figmaUrl: catalog.source?.figmaUrl || null,
      fileKey: catalog.source?.fileKey || null,
      fileName: catalog.source?.fileName || null,
    },
    outputDir: catalog.outputDir || path.dirname(catalogPath),
    projectProfileFile: catalog.projectProfileFile || null,
    createdAt: new Date().toISOString(),
    screens: handoffScreens,
    statistics: {
      total: handoffScreens.length,
      pending: 0,
      drafted: 0,
      applied: 0,
      failed: 0,
      'ready-for-cli-apply': handoffScreens.length,
    },
  };
  const handoffPath = path.join(effectiveRunDir, 'custom-screen-catalog.json');
  writeJson(handoffPath, handoff);

  console.log(JSON.stringify({
    catalog: catalogPath,
    customScreenCatalog: handoffPath,
    screens: handoffScreens.length,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
