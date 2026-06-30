#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage() {
  return [
    'Usage:',
    '  node render-local-webembed.mjs --catalog <custom-screen-catalog.json> --screen <screenId> [options]',
    '  node render-local-webembed.mjs --html-file <index.html> --data-sources-file <data-sources.json> [options]',
    '',
    'Options:',
    '  --out <file.png>     Screenshot path. Defaults to the screen checks directory.',
    '  --report <file.json> Metrics report path. Defaults next to --out.',
    '  --width <px>         Viewport width. Default: 402.',
    '  --height <px>        Viewport height. Default: 868.',
    '  --wait-ms <ms>       Wait after load. Default: 2500.',
    '  --help              Show this help.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    width: 402,
    height: 868,
    waitMs: 2500,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--catalog') args.catalog = argv[++index];
    else if (arg === '--screen') args.screenId = argv[++index];
    else if (arg === '--html-file') args.htmlFile = argv[++index];
    else if (arg === '--data-sources-file') args.dataSourcesFile = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else if (arg === '--report') args.report = argv[++index];
    else if (arg === '--width') args.width = Number(argv[++index]);
    else if (arg === '--height') args.height = Number(argv[++index]);
    else if (arg === '--wait-ms') args.waitMs = Number(argv[++index]);
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
    : path.resolve(runDir, relativeOrAbsolute);
}

function resolveInputFiles(args) {
  if (args.catalog) {
    if (!args.screenId) throw new Error('Missing --screen when --catalog is used.');
    const catalogPath = path.resolve(args.catalog);
    const catalog = readJson(catalogPath);
    const runDir = resolveRunDir(catalogPath, catalog);
    const screen = (catalog.screens || []).find((item) => item.id === args.screenId);
    if (!screen) throw new Error(`Screen ${args.screenId} was not found in catalog.`);
    const htmlFile = resolveInRun(runDir, screen.updated?.htmlFile);
    const dataSourcesFile = resolveInRun(runDir, screen.updated?.dataSourcesFile);
    const defaultOut = resolveInRun(runDir, `screens/${screen.id}/checks/local-render.png`);
    return {
      runDir,
      screen,
      htmlFile,
      dataSourcesFile,
      out: args.out ? path.resolve(args.out) : defaultOut,
      report: args.report ? path.resolve(args.report) : defaultOut.replace(/\.png$/i, '.json'),
    };
  }

  if (!args.htmlFile || !args.dataSourcesFile) {
    throw new Error('Provide either --catalog/--screen or --html-file/--data-sources-file.');
  }
  const htmlFile = path.resolve(args.htmlFile);
  const dataSourcesFile = path.resolve(args.dataSourcesFile);
  const out = args.out ? path.resolve(args.out) : path.resolve(path.dirname(htmlFile), '../checks/local-render.png');
  return {
    runDir: path.dirname(path.dirname(path.dirname(htmlFile))),
    screen: { id: path.basename(path.dirname(path.dirname(htmlFile))) },
    htmlFile,
    dataSourcesFile,
    out,
    report: args.report ? path.resolve(args.report) : out.replace(/\.png$/i, '.json'),
  };
}

function assertFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath || '(empty)'}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!Number.isFinite(args.width) || !Number.isFinite(args.height)) {
    throw new Error('--width and --height must be finite numbers.');
  }

  const files = resolveInputFiles(args);
  assertFile(files.htmlFile, 'HTML file');
  assertFile(files.dataSourcesFile, 'data sources file');
  const dataSources = readJson(files.dataSourcesFile);

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    throw new Error(`Playwright is required for local render checks: ${error.message}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1,
  });

  await page.addInitScript((sources) => {
    const byLabel = Object.fromEntries(sources.map((section) => [section.label, section]));
    function translation(value) {
      if (!value) return '';
      return value.translations?.['en-US'] || value.translations?.en || value.translations?.default || '';
    }
    function mediaUrl(section) {
      if (!section) return '';
      const image = section.mediaContent?.content?.image?.translations?.['en-US'];
      const video = section.mediaContent?.content?.video?.translations?.['en-US'];
      return image?.original || image?.small || video?.original || video?.small || '';
    }
    window.segmentlySDK = {
      ready: () => Promise.resolve(window.segmentlySDK),
      getChildSectionText: (label) => {
        const section = byLabel[label];
        return { title: translation(section?.textContent?.title) };
      },
      getChildSectionMedia: (label) => ({ url: mediaUrl(byLabel[label]) }),
      getChildSection: (label) => {
        const section = byLabel[label];
        if (!section) return null;
        const items = section.optionsListContent?.items || [];
        return {
          data: {
            options: items.map((item) => ({
              id: item.id,
              title: translation(item.title),
              subtitle: translation(item.subtitle),
              variableValue: item.variableValue,
            })),
          },
        };
      },
      setVariable: () => {},
      navigateBack: () => {},
      navigateNext: () => {},
    };
  }, dataSources);

  await page.goto(pathToFileURL(files.htmlFile).href, { waitUntil: 'load' });
  await page.waitForTimeout(args.waitMs);
  fs.mkdirSync(path.dirname(files.out), { recursive: true });
  await page.screenshot({ path: files.out, fullPage: true });

  const metrics = await page.evaluate(() => {
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        display: style.display,
        visibility: style.visibility,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const queryRects = (selector) => Array.from(document.querySelectorAll(selector)).map(rectOf);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      body: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
      },
      deviceChrome: {
        nodeCount: document.querySelectorAll(
          '.status-container,.status-bar,.status-wrap,.status-shell,.status-stack,.status-time,.status-right,.home-indicator-wrap,.home-indicator,.status:empty,.home:empty,[data-media^="Status"],[data-media^="Home Indicator"]',
        ).length,
        nodes: queryRects(
          '.status-container,.status-bar,.status-wrap,.status-shell,.status-stack,.status-time,.status-right,.home-indicator-wrap,.home-indicator,.status:empty,.home:empty,[data-media^="Status"],[data-media^="Home Indicator"]',
        ),
      },
      footer: {
        ctaWrap: rectOf(document.querySelector('.cta-wrap')),
        buttonStack: rectOf(document.querySelector('.button-stack')),
      },
      images: Array.from(document.images).map((image) => ({
        media: image.dataset.media || '',
        src: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })),
      testIds: Array.from(document.querySelectorAll('[data-testid]')).map((element) => ({
        testId: element.getAttribute('data-testid'),
        tag: element.tagName,
      })),
    };
  });

  await browser.close();

  const report = {
    schemaVersion: 'figma-webembed-local-render/v1',
    screenId: files.screen.id,
    htmlFile: path.relative(files.runDir, files.htmlFile),
    dataSourcesFile: path.relative(files.runDir, files.dataSourcesFile),
    screenshotFile: path.relative(files.runDir, files.out),
    metrics,
  };
  writeJson(files.report, report);
  console.log(JSON.stringify({ screenshot: files.out, report: files.report, metrics }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
