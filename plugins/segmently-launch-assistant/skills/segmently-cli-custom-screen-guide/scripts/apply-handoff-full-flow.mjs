#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function usage() {
  return [
    'Usage:',
    '  node apply-handoff-full-flow.mjs --catalog <custom-screen-catalog.json> --project <projectId> --funnel <funnelId> --version-id <versionId> [options]',
    '',
    'Options:',
    '  --env <env>             Segmently CLI environment, for example dev.',
    '  --cli <path>            Segmently CLI executable. Defaults to SEGMENTLY_CLI or segmently.',
    '  --create-missing        Pass --create for catalog screens.',
    '  --link-linear           Create catalog-order edges when no edges file exists.',
    '  --publish               Run publish web after audit.',
    '  --alias <alias>         Alias to use with publish web.',
    '  --verify                Run publish verify after publish.',
    '  --skip-healthcheck      Skip per-screen healthchecks.',
    '  --force-canvas-layout   Also apply a graph layout manifest after screen apply.',
    '  --skip-canvas-layout    Do not apply graph layout positions after creating screens.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    cli: process.env.SEGMENTLY_CLI || 'segmently',
    createMissing: false,
    linkLinear: false,
    publish: false,
    verify: false,
    skipHealthcheck: false,
    forceCanvasLayout: false,
    skipCanvasLayout: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--catalog') args.catalog = argv[++i];
    else if (arg === '--project') args.projectId = argv[++i];
    else if (arg === '--funnel') args.funnelId = argv[++i];
    else if (arg === '--version-id') args.versionId = argv[++i];
    else if (arg === '--env') args.env = argv[++i];
    else if (arg === '--cli') args.cli = argv[++i];
    else if (arg === '--create-missing') args.createMissing = true;
    else if (arg === '--link-linear') args.linkLinear = true;
    else if (arg === '--publish') args.publish = true;
    else if (arg === '--alias') args.alias = argv[++i];
    else if (arg === '--verify') args.verify = true;
    else if (arg === '--skip-healthcheck') args.skipHealthcheck = true;
    else if (arg === '--force-canvas-layout') args.forceCanvasLayout = true;
    else if (arg === '--skip-canvas-layout') args.skipCanvasLayout = true;
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
  if (!catalog.outputDir) return path.dirname(catalogPath);
  if (path.isAbsolute(catalog.outputDir)) return catalog.outputDir;
  return path.resolve(path.dirname(catalogPath), catalog.outputDir);
}

function resolveInRun(runDir, relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(runDir, relativeOrAbsolute);
}

function assertNoUnresolvedDecisions(screen) {
  const decisions = screen.conversionDecisions;
  if (!decisions || typeof decisions !== 'object') return;
  for (const [key, value] of Object.entries(decisions)) {
    if (!value || typeof value !== 'object') continue;
    if (value.detected === true && (!value.decision || value.decision === 'unresolved')) {
      throw new Error(`Screen ${screen.id} has unresolved conversion decision: ${key}`);
    }
  }
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

function validateFigmaLayoutSource(catalog, screen, runDir) {
  const isFigmaHandoff = catalog?.source?.kind === 'figma' || screen.changePolicy === 'generated-from-figma';
  if (!isFigmaHandoff) return;

  const layoutSource = screen.layoutSource;
  if (!layoutSource || typeof layoutSource !== 'object') {
    throw new Error(
      `Screen ${screen.id} is missing complete layoutSource; refuse to apply Figma handoff generated from summaries, screenshots, generic templates, or stale catalogs.`,
    );
  }

  const acceptedKinds = new Set([
    'figma-design-context',
    'figma-node-tree',
    'existing-html-minimal-edit',
  ]);
  if (layoutSource.status !== 'complete' || !acceptedKinds.has(layoutSource.kind)) {
    throw new Error(
      `Screen ${screen.id} has invalid layoutSource (${layoutSource.kind || 'unknown'}:${layoutSource.status || 'unknown'}); ` +
      'regenerate the screen from a complete layout source before applying.',
    );
  }

  if (!layoutSource.file) {
    throw new Error(`Screen ${screen.id} is missing layoutSource.file; regenerate the handoff before applying.`);
  }
  const sourceFile = resolveInRun(runDir, layoutSource.file);
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Screen ${screen.id} layoutSource.file does not exist: ${layoutSource.file}`);
  }
  const sourceText = fs.readFileSync(sourceFile, 'utf8');
  if (layoutSourceTextLooksIncomplete(sourceText)) {
    throw new Error(
      `Screen ${screen.id} layoutSource file is not a complete layout source; ` +
      'human summaries, compact content inventories, and truncated MCP transcripts must stay needs-layout-source.',
    );
  }
}

function validatePilotGate(catalog, runDir, screens) {
  const isFigmaHandoff = catalog?.source?.kind === 'figma' || screens.some((screen) => screen.changePolicy === 'generated-from-figma');
  if (!isFigmaHandoff || screens.length <= 1) return;

  const pilotReportFile = catalog?.checks?.pilotReportFile || 'checks/pilot-report.json';
  const pilotReportPath = resolveInRun(runDir, pilotReportFile);
  if (!fs.existsSync(pilotReportPath)) {
    throw new Error(
      `Missing ${pilotReportFile}; refuse to apply multi-screen Figma handoff before the one-screen pilot gate renders HTML, validates data-source coverage, scans hardcoded runtime asset URLs, and compares against Figma.`,
    );
  }

  const report = readJson(pilotReportPath);
  if (report.status !== 'passed' || report.batchGate?.remainingScreensMayProcess !== true) {
    throw new Error(
      `${pilotReportFile} has not passed; debug the pilot screen before applying or publishing the remaining Figma screens.`,
    );
  }

  if (report.batchGate?.existingBatchArtifactsUsable === false) {
    throw new Error(
      `${pilotReportFile} marks existing batch artifacts as stale; regenerate the remaining screens with the pilot lessons before applying.`,
    );
  }

  const hardcodedRuntimeAssetUrls = report.htmlRuntimeScan?.hardcodedRuntimeAssetUrls;
  if (Array.isArray(hardcodedRuntimeAssetUrls) && hardcodedRuntimeAssetUrls.length > 0) {
    throw new Error(
      `${pilotReportFile} reports hardcoded runtime asset URLs; move assets into Media or ProductCatalog data sources before handoff.`,
    );
  }
}

function mediaTranslation(section) {
  if (section?.mediaContent?.kind === 'Video') {
    return section.mediaContent.content?.video?.translations?.['en-US'];
  }
  return section?.mediaContent?.content?.image?.translations?.['en-US'];
}

function collectMediaSourceIssues(runDir, screens) {
  const issues = [];
  let mediaCount = 0;
  for (const screen of screens) {
    const dataSourcesFile = screen.updated?.dataSourcesFile;
    if (!dataSourcesFile) continue;
    const dataSourcesPath = resolveInRun(runDir, dataSourcesFile);
    if (!fs.existsSync(dataSourcesPath)) continue;
    const dataSources = readJson(dataSourcesPath);
    for (const section of dataSources) {
      if (section.kind !== 'Media') continue;
      mediaCount += 1;
      const url = mediaTranslation(section)?.original || '';
      if (!url) {
        issues.push({ screenId: screen.id, label: section.label, reason: 'empty-media-url' });
      } else if (url.includes('figma.com/api/mcp/asset')) {
        issues.push({ screenId: screen.id, label: section.label, reason: 'figma-mcp-asset-url' });
      } else if (!/^https?:\/\//i.test(url)) {
        issues.push({ screenId: screen.id, label: section.label, reason: 'local-or-relative-media-url' });
      }
    }
  }
  return { mediaCount, issues };
}

function validateMediaCdnGate(catalog, runDir, screens) {
  const isFigmaHandoff = catalog?.source?.kind === 'figma' || screens.some((screen) => screen.changePolicy === 'generated-from-figma');
  if (!isFigmaHandoff) return;

  const mediaScan = collectMediaSourceIssues(runDir, screens);
  if (mediaScan.mediaCount === 0) return;

  const manifestFile = catalog?.checks?.mediaCdnUploadManifestFile || 'checks/media-cdn-upload-manifest.json';
  const manifestPath = resolveInRun(runDir, manifestFile);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestFile}; run the Figma import media CDN stabilization step before applying screens with Media data sources.`,
    );
  }

  const manifest = readJson(manifestPath);
  if (manifest.status !== 'uploaded' || Number(manifest.failed || 0) !== 0) {
    throw new Error(`${manifestFile} is not clean; retry failed media uploads before applying the Figma handoff.`);
  }

  if (mediaScan.issues.length) {
    throw new Error(
      `Figma handoff still has unstable Media URLs after ${manifestFile}: ${JSON.stringify(mediaScan.issues.slice(0, 10))}`,
    );
  }
}

const PROFILE_CSS_MARKER = 'segmently-profile-enforcement:start';
const DEVICE_CHROME_LABEL_RE = /^(status(?:\s+bar)?\s+(?:time|indicators|right(?:\s+indicators)?|right)|status\s+time(?:\s+image)?|status\s+right(?:\s+indicators)?|status\s+indicators|home\s+indicator(?:\s+(?:stripe|bar|image))?)$/i;
const DEVICE_CHROME_ID_RE = /^status(?:-bar)?-(?:time|indicators|right(?:-indicators)?)$|^status-time-image$|^status-right(?:-indicators)?$|^home-indicator(?:-(?:wrap|stripe|bar|image))?$/i;

function isDeviceChromeSection(section) {
  const label = typeof section?.label === 'string' ? section.label.trim() : '';
  const id = typeof section?.id === 'string' ? section.id.trim() : '';
  return section?.kind === 'Media' && (DEVICE_CHROME_LABEL_RE.test(label) || DEVICE_CHROME_ID_RE.test(id));
}

function decisionValue(screen, key) {
  const value = screen.conversionDecisions?.[key]?.decision;
  return typeof value === 'string' ? value : '';
}

function htmlHasDeviceChromeHint(html) {
  return /status-container|status-bar|status-wrap|status-shell|status-stack|class=["']status["']|Status Bar|Status Time|Status Indicators|home-indicator|class=["']home["']|Home Indicator/i.test(html);
}

function validateProjectProfileGate(catalog, runDir, screens) {
  const isFigmaHandoff = catalog?.source?.kind === 'figma' || screens.some((screen) => screen.changePolicy === 'generated-from-figma');
  if (!isFigmaHandoff) return;

  const needsProfileEnforcement = screens.some((screen) => {
    const statusBar = decisionValue(screen, 'statusBar');
    const footerCta = decisionValue(screen, 'footerCta');
    return statusBar === 'omit' || statusBar === 'spacer' || footerCta === 'sticky-footer' || footerCta === 'fixed-outside-scroll';
  });
  if (!needsProfileEnforcement) return;

  const reportFile = catalog?.checks?.projectProfileEnforcementFile || 'checks/project-profile-enforcement.json';
  const reportPath = resolveInRun(runDir, reportFile);
  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `Missing ${reportFile}; run the Figma import project-profile enforcement step before applying profile-sensitive generated screens.`,
    );
  }
  const report = readJson(reportPath);
  if (report.status !== 'passed') {
    throw new Error(`${reportFile} has not passed; fix project profile enforcement before applying the Figma handoff.`);
  }

  const issues = [];
  for (const screen of screens) {
    const statusBar = decisionValue(screen, 'statusBar');
    const footerCta = decisionValue(screen, 'footerCta');
    const html = screen.updated?.htmlFile ? readScreenHtml(runDir, screen) : '';
    const requiresMarker = (
      (statusBar === 'omit' || statusBar === 'spacer') && htmlHasDeviceChromeHint(html)
    ) || footerCta === 'sticky-footer' || footerCta === 'fixed-outside-scroll';

    if (requiresMarker && !html.includes(PROFILE_CSS_MARKER)) {
      issues.push({ screenId: screen.id, reason: 'missing-profile-enforcement-css' });
    }

    if (statusBar === 'omit' || statusBar === 'spacer') {
      const dataSources = screen.updated?.dataSourcesFile ? readScreenDataSources(runDir, screen) : [];
      const deviceChromeSections = dataSources.filter(isDeviceChromeSection);
      if (deviceChromeSections.length) {
        issues.push({
          screenId: screen.id,
          reason: 'device-chrome-media-data-sources-present',
          labels: deviceChromeSections.map((section) => section.label || section.id),
        });
      }
    }
  }

  if (issues.length) {
    throw new Error(`Project profile enforcement is incomplete: ${JSON.stringify(issues.slice(0, 10))}`);
  }
}

function commandPrefix(args) {
  const prefix = [];
  if (args.env) prefix.push('--env', args.env);
  prefix.push('--format', 'json');
  return prefix;
}

function runCli(args, commandArgs, label) {
  const result = spawnSync(args.cli, [...commandPrefix(args), ...commandArgs], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = result.stdout?.trim() || '';
  const stderr = result.stderr?.trim() || '';
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = stdout;
    }
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}\n${stderr || stdout}`);
  }
  return { label, parsed, stdout, stderr };
}

function checksPath(runDir, screen, fallbackName) {
  const filePath = screen.checks?.[fallbackName] || `screens/${screen.id}/checks/${fallbackName}.json`;
  return resolveInRun(runDir, filePath);
}

function persistResult(filePath, result) {
  writeJson(filePath, result.parsed ?? { stdout: result.stdout, stderr: result.stderr });
}

function readInteractionMap(runDir, screen) {
  const relative = screen.updated?.interactionMapFile;
  if (!relative) return null;
  const filePath = resolveInRun(runDir, relative);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Screen ${screen.id} is missing interaction map: ${relative}`);
  }
  const map = readJson(filePath);
  const elements = Array.isArray(map.elements) ? map.elements : [];
  const duplicateTestIds = findDuplicates(elements.map((element) => element.testId));
  const duplicateSelectors = findDuplicates(elements.map((element) => element.selector));
  if (duplicateTestIds.length || duplicateSelectors.length) {
    throw new Error(
      `Screen ${screen.id} has duplicate interaction map selectors: ` +
      [...duplicateTestIds, ...duplicateSelectors].join(', '),
    );
  }
  return {
    file: relative,
    screenId: map.screenId || screen.id,
    elements,
  };
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

function generateLinearEdgeFile(runDir, screen, nextScreen) {
  const filePath = resolveInRun(runDir, screen.updated.edgesFile || `screens/${screen.id}/updated/edges.json`);
  writeJson(filePath, [{ to: nextScreen.id, conditions: [] }]);
  screen.updated.edgesFile = path.relative(runDir, filePath);
  return filePath;
}

function readScreenDataSources(runDir, screen) {
  const filePath = resolveInRun(runDir, screen.updated?.dataSourcesFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Screen ${screen.id} is missing data sources: ${screen.updated?.dataSourcesFile}`);
  }
  return readJson(filePath);
}

function getEditorDataSourceCount(getResult) {
  const data = getResult?.parsed;
  const dataSources = data?.getConfig?.dataSources;
  return Array.isArray(dataSources) ? dataSources.length : 0;
}

function getCustomScreen(args, screen, labelSuffix = '') {
  return runCli(
    args,
    ['funnels', 'custom-screen', 'get', args.funnelId, args.versionId, screen.id, args.projectId],
    `get ${screen.id}${labelSuffix}`,
  );
}

function readScreenHtml(runDir, screen) {
  const filePath = resolveInRun(runDir, screen.updated?.htmlFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Screen ${screen.id} is missing HTML: ${screen.updated?.htmlFile}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function isFinitePosition(position) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y);
}

function screenPosition(screen, index) {
  if (isFinitePosition(screen.position)) return screen.position;
  return { x: index * 520, y: 0 };
}

function ensureScreenPositions(screens) {
  for (const [index, screen] of screens.entries()) {
    if (!isFinitePosition(screen.position)) {
      screen.position = screenPosition(screen, index);
    }
  }
}

function readGraphEdges(runDir, screens) {
  const edges = [];
  for (const screen of screens) {
    if (!screen.updated?.edgesFile) continue;
    const edgesFile = resolveInRun(runDir, screen.updated.edgesFile);
    if (!fs.existsSync(edgesFile)) continue;
    const screenEdges = readJson(edgesFile);
    for (const edge of Array.isArray(screenEdges) ? screenEdges : []) {
      if (!edge?.to) continue;
      edges.push({
        from: screen.id,
        to: edge.to,
        action: 'embed.callback',
        label: edge.label || 'Continue',
        conditions: Array.isArray(edge.conditions) ? edge.conditions : [],
      });
    }
  }
  return edges;
}

function writeGraphLayoutManifest(runDir, screens) {
  const graph = {
    launchScreenKey: screens[0]?.id,
    screens: screens.map((screen, index) => {
      const position = screenPosition(screen, index);
      screen.position = position;
      return {
        key: screen.id,
        type: 'WebEmbed',
        name: screen.name || screen.id,
        position,
        content: {
          embed: {
            html: readScreenHtml(runDir, screen),
            isIframe: screen.isIframe !== false,
            childSections: readScreenDataSources(runDir, screen),
          },
        },
      };
    }),
    edges: readGraphEdges(runDir, screens),
  };
  const filePath = resolveInRun(runDir, 'checks/graph-layout-apply.json');
  writeJson(filePath, graph);
  return filePath;
}

function applyScreenContent(args, runDir, screen, labelSuffix = '', options = {}) {
  const htmlFile = resolveInRun(runDir, screen.updated?.htmlFile);
  const dataSourcesFile = resolveInRun(runDir, screen.updated?.dataSourcesFile);
  const position = isFinitePosition(screen.position) ? screen.position : null;
  const commandArgs = [
    'funnels', 'custom-screen', 'apply', args.funnelId, args.versionId, args.projectId,
    '--screen', screen.id,
    '--name', screen.name || screen.id,
    '--html-file', htmlFile,
    '--data-sources-file', dataSourcesFile,
    '--iframe', String(screen.isIframe !== false),
  ];
  if (args.createMissing) commandArgs.push('--create');
  if (options.launch) commandArgs.push('--launch');
  if (position) commandArgs.push('--position', `${position.x},${position.y}`);
  return runCli(args, commandArgs, `apply ${screen.id}${labelSuffix}`);
}

function publishedUrlFrom(result, alias) {
  const data = result?.parsed;
  return data?.url || data?.webUrl || data?.publishedUrl || data?.publication?.url || (alias ? `/${alias}` : null);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  for (const required of ['catalog', 'projectId', 'funnelId', 'versionId']) {
    if (!args[required]) throw new Error(`Missing --${required === 'projectId' ? 'project' : required}`);
  }
  if (args.verify && !args.publish) {
    throw new Error('--verify requires --publish');
  }

  const catalogPath = path.resolve(args.catalog);
  const catalog = readJson(catalogPath);
  const runDir = resolveRunDir(catalogPath, catalog);
  const screens = Array.isArray(catalog.screens) ? catalog.screens : [];
  if (!screens.length) throw new Error('Catalog has no screens.');
  ensureScreenPositions(screens);
  validatePilotGate(catalog, runDir, screens);
  validateProjectProfileGate(catalog, runDir, screens);
  validateMediaCdnGate(catalog, runDir, screens);

  const summary = {
    projectId: args.projectId,
    funnelId: args.funnelId,
    versionId: args.versionId,
    catalog: catalogPath,
    runDir,
    screens: [],
    linked: [],
    audit: null,
    publish: null,
    verify: null,
    canvasLayout: null,
    positionApply: screens.map((screen) => ({ id: screen.id, position: screen.position })),
    postGraphContentRestore: [],
    cliRegressions: [],
  };
  const flowInteractionMap = {
    schemaVersion: 'webembed-flow-interaction-map/v1',
    screens: [],
  };

  for (const [index, screen] of screens.entries()) {
    assertNoUnresolvedDecisions(screen);
    validateFigmaLayoutSource(catalog, screen, runDir);
    const interactionMap = readInteractionMap(runDir, screen);
    if (interactionMap) {
      flowInteractionMap.screens.push(interactionMap);
    }
    const applyResult = applyScreenContent(args, runDir, screen, '', { launch: index === 0 && args.createMissing });
    persistResult(checksPath(runDir, screen, 'applyResultFile'), applyResult);

    let healthcheck = null;
    if (!args.skipHealthcheck) {
      healthcheck = runCli(
        args,
        ['funnels', 'custom-screen', 'healthcheck', args.funnelId, args.versionId, screen.id, args.projectId],
        `healthcheck ${screen.id}`,
      );
      persistResult(checksPath(runDir, screen, 'healthcheckFile'), healthcheck);
    }

    screen.status = 'applied';
    screen.statusHistory = Array.from(new Set([...(screen.statusHistory || []), 'applied']));
    if (healthcheck) screen.statusHistory.push('healthcheck-passed');
    summary.screens.push({
      id: screen.id,
      apply: applyResult.parsed,
      healthcheck: healthcheck?.parsed ?? null,
      interactionMapFile: interactionMap?.file ?? null,
      interactiveElements: interactionMap?.elements.length ?? 0,
    });
  }

  if (args.linkLinear && screens.length > 1) {
    for (let index = 0; index < screens.length - 1; index += 1) {
      const screen = screens[index];
      const nextScreen = screens[index + 1];
      const existingEdgesFile = screen.updated?.edgesFile ? resolveInRun(runDir, screen.updated.edgesFile) : null;
      const edgesFile = existingEdgesFile && fs.existsSync(existingEdgesFile)
        ? existingEdgesFile
        : generateLinearEdgeFile(runDir, screen, nextScreen);
      const linkResult = runCli(
        args,
        [
          'funnels', 'custom-screen', 'apply', args.funnelId, args.versionId, args.projectId,
          '--screen', screen.id,
          '--edges-file', edgesFile,
        ],
        `link ${screen.id} to ${nextScreen.id}`,
      );
      persistResult(resolveInRun(runDir, `screens/${screen.id}/checks/apply-edges-result.json`), linkResult);

      let healthcheck = null;
      if (!args.skipHealthcheck) {
        healthcheck = runCli(
          args,
          ['funnels', 'custom-screen', 'healthcheck', args.funnelId, args.versionId, screen.id, args.projectId],
          `healthcheck linked ${screen.id}`,
        );
        persistResult(resolveInRun(runDir, `screens/${screen.id}/checks/healthcheck-after-link.json`), healthcheck);
      }

      summary.linked.push({ from: screen.id, to: nextScreen.id, apply: linkResult.parsed, healthcheck: healthcheck?.parsed ?? null });
    }
  }

  if (args.createMissing && args.forceCanvasLayout && !args.skipCanvasLayout) {
    const graphFile = writeGraphLayoutManifest(runDir, screens);
    const dryRun = runCli(
      args,
      ['funnels', 'graph', 'dry-run', args.projectId, '--funnel', args.funnelId, '--version-id', args.versionId, '--file', graphFile],
      'graph layout dry-run',
    );
    persistResult(resolveInRun(runDir, 'checks/graph-layout-dry-run.json'), dryRun);
    const apply = runCli(
      args,
      ['funnels', 'graph', 'apply', args.projectId, '--funnel', args.funnelId, '--version-id', args.versionId, '--file', graphFile],
      'graph layout apply',
    );
    persistResult(resolveInRun(runDir, 'checks/graph-layout-apply-result.json'), apply);
    summary.canvasLayout = {
      graphFile: path.relative(runDir, graphFile),
      dryRun: dryRun.parsed,
      apply: apply.parsed,
    };

    for (const screen of screens) {
      const expectedDataSources = readScreenDataSources(runDir, screen).length;
      const postGraphGet = getCustomScreen(args, screen, ' after graph');
      persistResult(resolveInRun(runDir, `screens/${screen.id}/checks/get-after-graph.json`), postGraphGet);
      const postGraphDataSources = getEditorDataSourceCount(postGraphGet);
      let restore = null;
      let restoredGet = null;
      if (expectedDataSources > 0 && postGraphDataSources === 0) {
        summary.cliRegressions.push({
          id: screen.id,
          issue: 'graph-apply-dropped-content-embed-childSections',
          expectedDataSources,
          actualDataSources: postGraphDataSources,
        });
        restore = applyScreenContent(args, runDir, screen, ' content restore after graph');
        persistResult(resolveInRun(runDir, `screens/${screen.id}/checks/post-graph-content-restore.json`), restore);
        restoredGet = getCustomScreen(args, screen, ' after content restore');
        persistResult(resolveInRun(runDir, `screens/${screen.id}/checks/get-after-content-restore.json`), restoredGet);
        const restoredDataSources = getEditorDataSourceCount(restoredGet);
        if (restoredDataSources !== expectedDataSources) {
          throw new Error(
            `Screen ${screen.id} editor data source count is ${restoredDataSources}, expected ${expectedDataSources} after content restore.`,
          );
        }
      }
      let healthcheck = null;
      if (!args.skipHealthcheck) {
        healthcheck = runCli(
          args,
          ['funnels', 'custom-screen', 'healthcheck', args.funnelId, args.versionId, screen.id, args.projectId],
          `healthcheck post-graph ${screen.id}`,
        );
        persistResult(resolveInRun(runDir, `screens/${screen.id}/checks/healthcheck-post-graph.json`), healthcheck);
      }
      summary.postGraphContentRestore.push({
        id: screen.id,
        expectedDataSources,
        postGraphDataSources,
        restoredDataSources: restoredGet ? getEditorDataSourceCount(restoredGet) : postGraphDataSources,
        appliedWorkaround: Boolean(restore),
        apply: restore?.parsed ?? null,
        healthcheck: healthcheck?.parsed ?? null,
      });
    }
  }

  const audit = runCli(args, ['funnels', 'audit', args.funnelId, args.versionId, args.projectId], 'funnel audit');
  persistResult(resolveInRun(runDir, 'checks/funnel-audit.json'), audit);
  summary.audit = audit.parsed;

  if (args.publish) {
    const publishArgs = ['publish', 'web', args.projectId, '--funnel', args.funnelId, '--version-id', args.versionId];
    if (args.alias) publishArgs.push('--alias', args.alias);
    const publish = runCli(args, publishArgs, 'publish web');
    persistResult(resolveInRun(runDir, 'checks/publish-web.json'), publish);
    summary.publish = publish.parsed;

    if (args.verify) {
      const url = publishedUrlFrom(publish, args.alias);
      if (!url) throw new Error('Could not resolve published URL for verify.');
      const verify = runCli(args, ['publish', 'verify', args.projectId, '--url', url], 'publish verify');
      persistResult(resolveInRun(runDir, 'checks/publish-verify.json'), verify);
      summary.verify = verify.parsed;
    }
  }

  catalog.statistics = {
    ...(catalog.statistics || {}),
    applied: screens.length,
  };
  if (flowInteractionMap.screens.length) {
    writeJson(resolveInRun(runDir, 'checks/flow-interaction-map.json'), flowInteractionMap);
  }
  writeJson(catalogPath, catalog);
  writeJson(resolveInRun(runDir, 'checks/full-flow-summary.json'), summary);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
