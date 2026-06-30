#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  return [
    'Usage:',
    '  node extract-figma-screens.mjs --frames <figma-frames.json> --out <run-dir> [options]',
    '',
    'Initializes a Segmently Figma WebEmbed run from a Figma MCP discovery file.',
    'This helper is MCP-only: it does not contact Figma. The main agent must',
    'create figma-frames.json from Figma MCP top-level node discovery.',
    '',
    'Options:',
    '  --frames <file>        Frame discovery JSON produced from Figma MCP.',
    '  --out <dir>            Run directory to create/update.',
    '  --figma-url <url>      Source Figma URL for the catalog.',
    '  --file-key <key>       Figma file key. Required when absent from --frames.',
    '  --init-only            Accepted for backward-compatible command lines.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--frames') args.frames = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--figma-url') args.figmaUrl = argv[++i];
    else if (arg === '--file-key') args.fileKey = argv[++i];
    else if (arg === '--init-only') args.initOnly = true;
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

function screenId(index) {
  return `S${String(index + 1).padStart(3, '0')}`;
}

function normalizeNodeId(nodeId) {
  return String(nodeId || '').replace(/-/g, ':');
}

function figmaFrameUrl(baseUrl, nodeId) {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('node-id', normalizeNodeId(nodeId).replace(/:/g, '-'));
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function inferScreenKind(frame) {
  const name = String(frame.name || '').toLowerCase();
  return name.includes('paywall') ? 'webembed-paywall' : 'webembed-screen';
}

function inferRenderMode(screenKind) {
  return screenKind === 'webembed-paywall' ? 'shadow-dom' : 'iframe';
}

function updateStatistics(catalog) {
  const stats = {};
  for (const screen of catalog.screens || []) {
    stats[screen.status] = (stats[screen.status] || 0) + 1;
  }
  catalog.statistics = {
    total: (catalog.screens || []).length,
    pending: stats.pending || 0,
    'mcp-discovered': stats['mcp-discovered'] || 0,
    'layout-source-ready': stats['layout-source-ready'] || 0,
    extracted: stats.extracted || 0,
    converted: stats.converted || 0,
    materialized: stats.materialized || 0,
    'ready-for-cli-apply': stats['ready-for-cli-apply'] || 0,
    'needs-user-decision': stats['needs-user-decision'] || 0,
    'needs-layout-source': stats['needs-layout-source'] || 0,
    failed: stats.failed || 0,
    skipped: stats.skipped || 0,
  };
}

function buildWorkItem(screen) {
  return {
    schemaVersion: 'figma-webembed-work-item/v1',
    screenId: screen.id,
    screenName: screen.figmaNodeName || screen.id,
    figmaNodeId: screen.figmaNodeId,
    figmaUrl: screen.figmaUrl || null,
    designContextFile: screen.designContextFile,
    assetsManifestFile: screen.assetsManifestFile,
    outputHtmlFile: screen.outputHtmlFile,
    outputDataSourcesFile: screen.outputDataSourcesFile,
    interactionMapFile: screen.interactionMapFile,
    contentMode: 'data-driven',
    screenKind: screen.screenKind,
    renderMode: screen.renderMode,
    isIframe: screen.isIframe,
    position: screen.position || null,
    projectProfileFile: 'project-profile.json',
    conversionDecisions: screen.conversionDecisions || {},
    status: screen.status,
  };
}

function writeWorkItems(runDir, screens) {
  for (const screen of screens) {
    writeJson(path.join(runDir, screen.workItemFile), buildWorkItem(screen));
  }
}

function createCatalog(args) {
  if (!args.frames) throw new Error(`Missing --frames\n\n${usage()}`);
  if (!args.out) throw new Error('Missing --out when --frames is used');

  const framesPath = path.resolve(args.frames);
  const framesDoc = readJson(framesPath);
  const fileKey = args.fileKey || framesDoc.fileKey;
  if (!fileKey) throw new Error('Missing Figma file key. Pass --file-key or include fileKey in --frames.');

  const runDir = path.resolve(args.out);
  const figmaUrl = args.figmaUrl || framesDoc.figmaUrl || null;
  const frames = Array.isArray(framesDoc.frames) ? framesDoc.frames : [];
  const screens = frames.map((frame, index) => {
    const id = screenId(index);
    const screenKind = inferScreenKind(frame);
    const renderMode = inferRenderMode(screenKind);
    return {
      id,
      figmaNodeId: normalizeNodeId(frame.id),
      figmaNodeName: frame.name || id,
      figmaUrl: figmaFrameUrl(figmaUrl, frame.id),
      status: 'mcp-discovered',
      statusHistory: ['mcp-discovered'],
      workItemFile: `work-items/${id}.json`,
      designContextFile: `screens/${id}/figma-design-context.json`,
      screenshotEvidenceFile: `screens/${id}/figma-screenshot.json`,
      assetsManifestFile: `screens/${id}/assets/manifest.json`,
      outputHtmlFile: `screens/${id}/updated/index.html`,
      outputDataSourcesFile: `screens/${id}/updated/data-sources.json`,
      interactionMapFile: `screens/${id}/updated/interaction-map.json`,
      dataSourcePlan: [],
      contentBindingPolicy: 'text-and-media-data-sources',
      screenKind,
      renderMode,
      isIframe: renderMode !== 'shadow-dom',
      position: Number.isFinite(frame.x) && Number.isFinite(frame.y)
        ? { x: Math.round(frame.x), y: Math.round(frame.y) }
        : null,
      conversionDecisions: {},
      attempts: 0,
      error: null,
    };
  });

  const catalog = {
    schemaVersion: 'figma-webembed-catalog/v1',
    source: {
      kind: 'figma',
      acquisition: 'figma-mcp',
      figmaUrl,
      fileKey,
      fileName: framesDoc.fileName || null,
      sectionId: framesDoc.sectionId || null,
      startNodeId: framesDoc.startNodeId || null,
      selectionPolicy: framesDoc.selectionPolicy || null,
    },
    outputDir: runDir,
    projectProfileFile: 'project-profile.json',
    contentMode: 'data-driven',
    createdAt: new Date().toISOString(),
    screens,
    statistics: {},
  };

  updateStatistics(catalog);
  fs.mkdirSync(runDir, { recursive: true });
  const catalogPath = path.join(runDir, 'figma-catalog.json');
  writeJson(catalogPath, catalog);
  writeWorkItems(runDir, screens);
  writeJson(path.join(runDir, 'figma-extraction-report.json'), {
    runDir,
    catalog: catalogPath,
    mode: 'figma-mcp-discovery',
    screens: screens.length,
    statistics: catalog.statistics,
  });
  return { catalogPath, catalog, runDir };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const { catalogPath, catalog, runDir } = createCatalog(args);
  console.log(JSON.stringify({
    catalog: catalogPath,
    runDir,
    screens: catalog.screens.length,
    statistics: catalog.statistics,
    mode: 'figma-mcp-discovery',
    initOnly: Boolean(args.initOnly),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
