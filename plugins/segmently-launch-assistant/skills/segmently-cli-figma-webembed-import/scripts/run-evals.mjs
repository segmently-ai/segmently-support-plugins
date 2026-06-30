#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const evalPath = path.join(skillRoot, 'evals', 'evals.json');
const config = JSON.parse(fs.readFileSync(evalPath, 'utf8'));

let failures = 0;
let dynamicPasses = 0;

for (const testCase of config.cases) {
  const corpus = testCase.files
    .map((relativePath) => {
      const absolutePath = path.join(skillRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        failures += 1;
        return `\n[MISSING:${relativePath}]\n`;
      }
      return fs.readFileSync(absolutePath, 'utf8');
    })
    .join('\n');

  const missing = (testCase.mustContain ?? []).filter((term) => !corpus.includes(term));
  const forbidden = (testCase.mustNotContain ?? []).filter((term) => corpus.includes(term));

  if (missing.length || forbidden.length) {
    failures += 1;
    console.error(`FAIL ${testCase.id}`);
    if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    if (forbidden.length) console.error(`  forbidden: ${forbidden.join(', ')}`);
  } else {
    console.log(`PASS ${testCase.id}`);
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-webembed-eval-'));
const runDir = path.join(tmpRoot, 'run');
const screenDir = path.join(runDir, 'screens', 'S001', 'updated');
fs.mkdirSync(screenDir, { recursive: true });
fs.writeFileSync(
  path.join(runDir, 'screens', 'S001', 'figma-design-context.json'),
  `${JSON.stringify({
    kind: 'figma-design-context',
    status: 'complete',
    rawText: 'export default function Onboarding(){ return <div data-node-id="1:2">Welcome</div>; }',
  }, null, 2)}\n`,
);
fs.writeFileSync(path.join(screenDir, 'index.html'), '<!doctype html><html><body><h1 data-copy="headline">Welcome</h1></body></html>\n');
fs.writeFileSync(path.join(screenDir, 'interaction-map.json'), `${JSON.stringify({
  schemaVersion: 'webembed-interaction-map/v1',
  screenId: 'S001',
  elements: [
    {
      role: 'primary',
      testId: 'screen-S001-primary',
      selector: '[data-testid="screen-S001-primary"]',
      action: { type: 'navigateNext' },
    },
  ],
}, null, 2)}\n`);
const paywallScreenDir = path.join(runDir, 'screens', 'S002', 'updated');
fs.mkdirSync(paywallScreenDir, { recursive: true });
fs.writeFileSync(
  path.join(runDir, 'screens', 'S002', 'figma-design-context.json'),
  `${JSON.stringify({
    kind: 'figma-design-context',
    status: 'complete',
    rawText: 'export default function Paywall(){ return <div data-node-id="1:3">Buy</div>; }',
  }, null, 2)}\n`,
);
fs.writeFileSync(path.join(paywallScreenDir, 'index.html'), '<!doctype html><html><body><button data-copy="cta">Buy</button></body></html>\n');
fs.writeFileSync(path.join(paywallScreenDir, 'interaction-map.json'), `${JSON.stringify({
  schemaVersion: 'webembed-interaction-map/v1',
  screenId: 'S002',
  elements: [
    {
      role: 'product',
      testId: 'screen-S002-product-monthly',
      selector: '[data-testid="screen-S002-product-monthly"]',
      action: { type: 'purchaseProduct' },
    },
  ],
}, null, 2)}\n`);
fs.writeFileSync(path.join(runDir, 'figma-catalog.json'), `${JSON.stringify({
  schemaVersion: 'figma-webembed-catalog/v1',
  source: {
    kind: 'figma',
    figmaUrl: 'https://www.figma.com/design/example/file',
    fileKey: 'example',
    fileName: 'Example',
  },
  outputDir: '.',
  projectProfileFile: 'project-profile.json',
  contentMode: 'data-driven',
  createdAt: '2026-01-01T00:00:00.000Z',
  screens: [
    {
      id: 'S001',
      figmaNodeId: '1:2',
      figmaNodeName: 'Welcome',
      status: 'converted',
      statusHistory: ['pending', 'extracted', 'converted'],
      layoutSource: {
        kind: 'figma-design-context',
        status: 'complete',
        file: 'screens/S001/figma-design-context.json',
      },
      outputHtmlFile: 'screens/S001/updated/index.html',
      outputDataSourcesFile: 'screens/S001/updated/data-sources.json',
      interactionMapFile: 'screens/S001/updated/interaction-map.json',
      dataSourcePlan: [
        { kind: 'Text', label: 'Headline', title: 'Welcome' },
        { kind: 'Media', label: 'Hero Image', url: 'https://cdn.example/hero.png', type: 'image' },
        { kind: 'BulletList', label: 'Benefits', items: [{ title: 'Fast setup' }] },
        {
          id: 'preserved-text',
          kind: 'Text',
          label: 'Preserved Text',
          order: 3,
          textContent: {
            title: {
              kind: 'static',
              translations: { 'en-US': 'Already materialized' },
              appearance: {},
            },
          },
        },
        {
          id: 'preserved-media',
          kind: 'Media',
          label: 'Preserved Media',
          order: 4,
          mediaContent: {
            kind: 'Image',
            content: {
              image: {
                translations: {
                  'en-US': {
                    original: 'https://cdn.example/preserved.png',
                    small: 'https://cdn.example/preserved-small.png',
                  },
                },
              },
            },
          },
        },
      ],
      screenKind: 'webembed-screen',
      renderMode: 'iframe',
      isIframe: true,
      conversionDecisions: {
        statusBar: { detected: true, decision: 'omit', source: 'user' },
        footerCta: { detected: true, decision: 'sticky-footer', source: 'user' },
        headerActions: {
          detected: true,
          decision: {
            back: { action: 'navigateBack' },
            skip: { action: 'navigateNext' },
          },
          source: 'project-profile',
        },
      },
      attempts: 1,
      error: null,
    },
    {
      id: 'S002',
      figmaNodeId: '1:3',
      figmaNodeName: 'Paywall',
      status: 'converted',
      statusHistory: ['pending', 'extracted', 'converted'],
      layoutSource: {
        kind: 'figma-design-context',
        status: 'complete',
        file: 'screens/S002/figma-design-context.json',
      },
      outputHtmlFile: 'screens/S002/updated/index.html',
      outputDataSourcesFile: 'screens/S002/updated/data-sources.json',
      interactionMapFile: 'screens/S002/updated/interaction-map.json',
      dataSourcePlan: [
        { kind: 'Text', label: 'CTA', title: 'Buy' },
        { kind: 'ProductCatalog', label: 'Products', products: [] },
      ],
      screenKind: 'webembed-paywall',
      renderMode: 'shadow-dom',
      conversionDecisions: {
        statusBar: { detected: false, decision: 'omit', source: 'not-detected' },
        footerCta: { detected: true, decision: 'fixed-outside-scroll', source: 'user' },
      },
      attempts: 1,
      error: null,
    },
  ],
}, null, 2)}\n`);

const materializer = path.join(skillRoot, 'scripts', 'materialize-catalog.mjs');
const result = spawnSync(process.execPath, [materializer, '--catalog', path.join(runDir, 'figma-catalog.json')], {
  encoding: 'utf8',
});
if (result.status !== 0) {
  failures += 1;
  console.error('FAIL materializer-smoke');
  console.error(result.stderr || result.stdout);
} else {
  const dataSourcesPath = path.join(screenDir, 'data-sources.json');
  const handoffPath = path.join(runDir, 'custom-screen-catalog.json');
  const dataSources = JSON.parse(fs.readFileSync(dataSourcesPath, 'utf8'));
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  const paywallHandoff = handoff.screens.find((screen) => screen.id === 'S002');
  const media = dataSources.find((section) => section.kind === 'Media');
  const preservedText = dataSources.find((section) => section.label === 'Preserved Text');
  const preservedMedia = dataSources.find((section) => section.label === 'Preserved Media');
  if (
    dataSources.length !== 5 ||
    dataSources[0].kind !== 'Text' ||
    media?.mediaContent?.kind !== 'Image' ||
    media?.mediaContent?.content?.image?.translations?.['en-US']?.original !== 'https://cdn.example/hero.png' ||
    preservedText?.textContent?.title?.translations?.['en-US'] !== 'Already materialized' ||
    preservedMedia?.mediaContent?.content?.image?.translations?.['en-US']?.small !== 'https://cdn.example/preserved-small.png' ||
    handoff.screens[0].status !== 'ready-for-cli-apply' ||
    handoff.screens[0].conversionDecisions?.footerCta?.decision !== 'sticky-footer' ||
    handoff.screens[0].updated?.interactionMapFile !== 'screens/S001/updated/interaction-map.json' ||
    handoff.screens[0].layoutSource?.kind !== 'figma-design-context' ||
    handoff.projectProfileFile !== 'project-profile.json' ||
    paywallHandoff?.screenKind !== 'webembed-paywall' ||
    paywallHandoff?.isIframe !== false
  ) {
    failures += 1;
    console.error('FAIL materializer-smoke');
    console.error('  unexpected materialized output');
  } else {
    dynamicPasses += 1;
    console.log('PASS materializer-smoke');
  }
}

const unresolvedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-webembed-unresolved-eval-'));
const unresolvedRunDir = path.join(unresolvedRoot, 'run');
const unresolvedScreenDir = path.join(unresolvedRunDir, 'screens', 'S001', 'updated');
fs.mkdirSync(unresolvedScreenDir, { recursive: true });
fs.writeFileSync(path.join(unresolvedScreenDir, 'index.html'), '<!doctype html><html><body><h1>Welcome</h1></body></html>\n');
fs.writeFileSync(path.join(unresolvedRunDir, 'figma-catalog.json'), `${JSON.stringify({
  schemaVersion: 'figma-webembed-catalog/v1',
  outputDir: '.',
  screens: [
    {
      id: 'S001',
      status: 'converted',
      outputHtmlFile: 'screens/S001/updated/index.html',
      outputDataSourcesFile: 'screens/S001/updated/data-sources.json',
      dataSourcePlan: [{ kind: 'Text', label: 'Headline', title: 'Welcome' }],
      conversionDecisions: {
        statusBar: { detected: true, decision: 'unresolved', source: 'pending-user' },
      },
    },
  ],
}, null, 2)}\n`);

const unresolvedResult = spawnSync(process.execPath, [materializer, '--catalog', path.join(unresolvedRunDir, 'figma-catalog.json')], {
  encoding: 'utf8',
});
if (unresolvedResult.status === 0 || !String(unresolvedResult.stderr || unresolvedResult.stdout).includes('unresolved conversion decision')) {
  failures += 1;
  console.error('FAIL materializer-unresolved-decision');
  console.error(unresolvedResult.stderr || unresolvedResult.stdout);
} else {
  dynamicPasses += 1;
  console.log('PASS materializer-unresolved-decision');
}

const missingLayoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-webembed-missing-layout-eval-'));
const missingLayoutRunDir = path.join(missingLayoutRoot, 'run');
const missingLayoutScreenDir = path.join(missingLayoutRunDir, 'screens', 'S001', 'updated');
fs.mkdirSync(missingLayoutScreenDir, { recursive: true });
fs.writeFileSync(path.join(missingLayoutScreenDir, 'index.html'), '<!doctype html><html><body><h1>Welcome</h1></body></html>\n');
fs.writeFileSync(path.join(missingLayoutScreenDir, 'interaction-map.json'), `${JSON.stringify({
  schemaVersion: 'webembed-interaction-map/v1',
  screenId: 'S001',
  elements: [],
}, null, 2)}\n`);
fs.writeFileSync(path.join(missingLayoutRunDir, 'figma-catalog.json'), `${JSON.stringify({
  schemaVersion: 'figma-webembed-catalog/v1',
  outputDir: '.',
  screens: [
    {
      id: 'S001',
      status: 'converted',
      outputHtmlFile: 'screens/S001/updated/index.html',
      outputDataSourcesFile: 'screens/S001/updated/data-sources.json',
      interactionMapFile: 'screens/S001/updated/interaction-map.json',
      dataSourcePlan: [{ kind: 'Text', label: 'Headline', title: 'Welcome' }],
      conversionDecisions: {},
    },
  ],
}, null, 2)}\n`);

const missingLayoutResult = spawnSync(process.execPath, [materializer, '--catalog', path.join(missingLayoutRunDir, 'figma-catalog.json')], {
  encoding: 'utf8',
});
if (missingLayoutResult.status === 0 || !String(missingLayoutResult.stderr || missingLayoutResult.stdout).includes('missing complete layoutSource')) {
  failures += 1;
  console.error('FAIL materializer-missing-layout-source');
  console.error(missingLayoutResult.stderr || missingLayoutResult.stdout);
} else {
  dynamicPasses += 1;
  console.log('PASS materializer-missing-layout-source');
}

const summaryLayoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-webembed-summary-layout-eval-'));
const summaryLayoutRunDir = path.join(summaryLayoutRoot, 'run');
const summaryLayoutScreenDir = path.join(summaryLayoutRunDir, 'screens', 'S001', 'updated');
fs.mkdirSync(summaryLayoutScreenDir, { recursive: true });
fs.writeFileSync(
  path.join(summaryLayoutRunDir, 'screens', 'S001', 'figma-design-context.json'),
  `${JSON.stringify({
    kind: 'figma-design-context',
    status: 'complete',
    rawText: 'Figma MCP get_design_context response returned a React+Tailwind screen. Key content includes headline, CTA, and options. Visible content: Welcome.',
  }, null, 2)}\n`,
);
fs.writeFileSync(path.join(summaryLayoutScreenDir, 'index.html'), '<!doctype html><html><body><h1>Welcome</h1></body></html>\n');
fs.writeFileSync(path.join(summaryLayoutScreenDir, 'interaction-map.json'), `${JSON.stringify({
  schemaVersion: 'webembed-interaction-map/v1',
  screenId: 'S001',
  elements: [],
}, null, 2)}\n`);
fs.writeFileSync(path.join(summaryLayoutRunDir, 'figma-catalog.json'), `${JSON.stringify({
  schemaVersion: 'figma-webembed-catalog/v1',
  outputDir: '.',
  screens: [
    {
      id: 'S001',
      status: 'converted',
      layoutSource: {
        kind: 'figma-design-context',
        status: 'complete',
        file: 'screens/S001/figma-design-context.json',
      },
      outputHtmlFile: 'screens/S001/updated/index.html',
      outputDataSourcesFile: 'screens/S001/updated/data-sources.json',
      interactionMapFile: 'screens/S001/updated/interaction-map.json',
      dataSourcePlan: [{ kind: 'Text', label: 'Headline', title: 'Welcome' }],
      conversionDecisions: {},
    },
  ],
}, null, 2)}\n`);

const summaryLayoutResult = spawnSync(process.execPath, [materializer, '--catalog', path.join(summaryLayoutRunDir, 'figma-catalog.json')], {
  encoding: 'utf8',
});
if (summaryLayoutResult.status === 0 || !String(summaryLayoutResult.stderr || summaryLayoutResult.stdout).includes('not a complete layout source')) {
  failures += 1;
  console.error('FAIL materializer-summary-layout-source');
  console.error(summaryLayoutResult.stderr || summaryLayoutResult.stdout);
} else {
  dynamicPasses += 1;
  console.log('PASS materializer-summary-layout-source');
}

if (failures) {
  console.error(`\n${config.name}: ${failures} failed`);
  process.exit(1);
}

console.log(`\n${config.name}: ${config.cases.length + dynamicPasses} passed`);
