#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredSkills = [
  "segmently-launch-guide",
  "segmently-cli-guide",
  "segmently-cli-paywall-ab-rollout",
  "segmently-cli-articles",
  "segmently-cli-content-plan-guide",
  "segmently-cli-custom-screen-guide",
  "segmently-cli-figma-webembed-import",
  "segmently-cli-image-upload",
  "segmently-product-cli-guide",
  "playwright-bowser",
  "segmently-test-kit",
  "playwright-bowser-core",
  "claude-design"
];
const fullCompanionSkills = [
  "segmently-cli-guide",
  "segmently-cli-paywall-ab-rollout",
  "segmently-cli-articles",
  "segmently-cli-content-plan-guide",
  "segmently-cli-custom-screen-guide",
  "segmently-cli-figma-webembed-import",
  "segmently-cli-image-upload",
  "segmently-product-cli-guide",
  "playwright-bowser",
  "segmently-test-kit",
  "playwright-bowser-core",
  "claude-design"
];
const wrapperCompanionSkills = [];
const fullCompanionExclusions = {
  "segmently-cli-guide": [
    "evals/**"
  ],
  "segmently-cli-paywall-ab-rollout": [
    "evals/**"
  ],
  "segmently-cli-articles": [
    "evals/**"
  ],
  "segmently-cli-content-plan-guide": [
    "evals/**"
  ],
  "segmently-cli-custom-screen-guide": [
    "evals/**"
  ],
  "segmently-cli-figma-webembed-import": [
    "evals/**",
    "scripts/receive-figma-mcp-capture.mjs"
  ],
  "segmently-cli-image-upload": [
    "evals/**"
  ],
  "segmently-product-cli-guide": [
    "evals/**"
  ],
  "playwright-bowser": [
    "evals/**"
  ],
  "segmently-test-kit": [
    "evals/**"
  ],
  "playwright-bowser-core": [
    "evals/**"
  ],
  "claude-design": [
    "evals/**",
    "imports/**",
    "evals/opt-results/**",
    "references/import-registry.md",
    "scripts/registry.mjs"
  ]
};
const fullCompanionAllowedForbiddenTokens = {
  "segmently-cli-guide": [
    "--env "
  ],
  "segmently-cli-paywall-ab-rollout": [
    "--env "
  ],
  "segmently-cli-articles": [
    "--env "
  ],
  "segmently-cli-content-plan-guide": [
    "--env "
  ],
  "segmently-cli-custom-screen-guide": [
    "--env ",
    "data-testid"
  ],
  "segmently-cli-figma-webembed-import": [
    "--env ",
    "data-testid"
  ],
  "segmently-cli-image-upload": [
    "--env "
  ],
  "segmently-product-cli-guide": [
    "--env "
  ],
  "playwright-bowser": [
    "--env "
  ],
  "segmently-test-kit": [
    "--env "
  ],
  "playwright-bowser-core": [
    "--env "
  ],
  "claude-design": [
    "--env ",
    "data-testid"
  ]
};
const hardForbiddenFullSkillRules = [
  {
    "id": "internal-cli-auth",
    "pattern": "\\bSEGMENTLY_CLI_INTERNAL\\b|\\binternal auth\\b|\\btest-login\\b|\\bservice-admin\\b",
    "flags": "i"
  },
  {
    "id": "local-source-path",
    "pattern": "(?:^|[\\s`\"'])((?:\\/Users\\/)|(?:\\/private\\/tmp\\b)|(?:src\\/modules\\/)|(?:modules\\/[A-Za-z0-9_-]+\\/)|(?:\\.agents\\/skills\\/)|(?:\\.claude\\/skills\\/)|(?:\\.codex\\/skills\\/))"
  },
  {
    "id": "dev-or-local-host",
    "pattern": "\\bdev-api\\.segmently\\.ai\\b|\\blocalhost\\b|\\b127\\.0\\.0\\.1\\b"
  }
].map(rule => ({
  ...rule,
  pattern: new RegExp(rule.pattern, rule.flags ?? ''),
}));
const internalOnlySkillNames = [
  "support-flow-author",
  "cli-admin-guide",
  "deployweblocal",
  "worktree-local-dev",
  "plugin-creator"
];
const forbiddenTokens = [
  "SEGMENTLY_CLI_INTERNAL",
  "segmently-cli-admin-guide",
  "support-flow-author",
  "cli-admin-guide",
  "deployweblocal",
  "worktree-local-dev",
  "plugin-creator",
  "segmently-guides-dev-to-prod",
  "segmently-migration",
  "segmently-admin-diagnostics",
  "data-testid",
  ".claude/",
  ".agents/",
  "src/modules/",
  "test-login",
  "SEGMENTLY_HOME",
  "127.0.0.1",
  "internal payments",
  "internal guides",
  "internal billing",
  "--env "
];
const failures = [];

check('manifest', () => {
  const path = join(pluginRoot, '.codex-plugin/plugin.json');
  assert(existsSync(path), 'missing .codex-plugin/plugin.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  assert(manifest.name === 'segmently-launch-assistant', 'manifest.name must be segmently-launch-assistant');
  assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(manifest.version ?? '')), 'manifest.version must be semver');
  assert(manifest.skills === './skills/', 'manifest.skills must be ./skills/');
  assert(manifest.interface?.displayName, 'manifest.interface.displayName is required');
  assert(manifest.interface?.shortDescription, 'manifest.interface.shortDescription is required');
  assert(manifest.interface?.developerName, 'manifest.interface.developerName is required');
  assert(manifest.interface?.category, 'manifest.interface.category is required');
});

check('claude-plugin-manifest', () => {
  const codexManifest = JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const path = join(pluginRoot, '.claude-plugin/plugin.json');
  assert(existsSync(path), 'missing .claude-plugin/plugin.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  assert(manifest.name === 'segmently-launch-assistant', 'Claude manifest.name must be segmently-launch-assistant');
  assert(manifest.version === codexManifest.version, 'Claude manifest.version must match Codex plugin manifest version');
  assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(manifest.version ?? '')), 'Claude manifest.version must be semver');
  assert(manifest.description, 'Claude manifest.description is required');
  assert(manifest.author?.name, 'Claude manifest.author.name is required');
  assert(Array.isArray(manifest.skills), 'Claude manifest.skills must be an array');
  assert(manifest.skills.includes('./skills/') || manifest.skills.includes('./skills'), 'Claude manifest.skills must include ./skills/');
});

check('release-manifest', () => {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const path = join(pluginRoot, '.codex-plugin/release.json');
  assert(existsSync(path), 'missing .codex-plugin/release.json');
  const release = JSON.parse(readFileSync(path, 'utf8'));
  assert(release.schemaVersion === 1, 'release schemaVersion must be 1');
  assert(release.pluginName === 'segmently-launch-assistant', 'release pluginName drifted');
  assert(release.version === manifest.version, 'release version must match plugin manifest version');
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+codex\.[0-9a-f]{12}$/.test(String(release.version ?? '')), 'release version must use codex content-hash build metadata');
  assert(String(release.contentHash ?? '').length === 64, 'release contentHash must be sha256 hex');
  assert(release.version.endsWith(`+codex.${String(release.contentHash).slice(0, 12)}`), 'release version cachebuster must match contentHash');
  const computed = computeContentHash(pluginRoot);
  assert(release.contentHash === computed, `release contentHash drifted: ${release.contentHash} !== ${computed}`);
});

check('codex-plugin-shipment', () => {
  for (const skillName of requiredSkills) {
    assert(existsSync(join(pluginRoot, 'skills', skillName, 'SKILL.md')), `missing bundled skill ${skillName}`);
  }
  for (const forbidden of internalOnlySkillNames) {
    assert(!existsSync(join(pluginRoot, 'skills', forbidden)), `plugin must not bundle dev/internal skill ${forbidden}`);
  }
});

check('customer-safety', () => {
  for (const skillName of wrapperCompanionSkills) {
    const root = join(pluginRoot, 'skills', skillName);
    const skillPath = join(root, 'SKILL.md');
    const runtimePath = join(root, 'CUSTOMER_RUNTIME.md');
    assert(existsSync(skillPath), `${skillName} missing generated customer SKILL.md`);
    assert(existsSync(runtimePath), `${skillName} missing CUSTOMER_RUNTIME.md`);
    const skillText = readFileSync(skillPath, 'utf8');
    assert(skillText.includes('customer-runtime companion'), `${skillName} SKILL.md was not normalized for customer runtime`);
  }
  for (const skillName of fullCompanionSkills) {
    const root = join(pluginRoot, 'skills', skillName);
    assert(existsSync(join(root, 'SKILL.md')), `${skillName} missing full customer SKILL.md`);
    assertExcludedPathsMissing(root, fullCompanionExclusions[skillName] ?? [], skillName);
  }
  for (const file of customerFacingFiles(join(pluginRoot, 'skills'))) {
    const text = readFileSync(file, 'utf8');
    const skillName = pluginSkillNameForFile(file);
    const allowedTokens = new Set(fullCompanionAllowedForbiddenTokens[skillName] ?? []);
    for (const skillName of internalOnlySkillNames) {
      assert(!text.includes(skillName), `${file} references internal-only skill ${skillName}`);
    }
    for (const token of forbiddenTokens) {
      if (allowedTokens.has(token)) continue;
      assert(!text.includes(token), `${file} contains forbidden token ${JSON.stringify(token)}`);
    }
  }
});

check('referential-closure', () => {
  const skillsRoot = join(pluginRoot, 'skills');
  for (const file of referentialClosureFiles(skillsRoot)) {
    assertLocalMarkdownLinksExist(file);
    assertInlinePackagedPathsExist(file, skillsRoot);
  }
});

check('runtime-safety', () => {
  const allowedCompanionFiles = new Set(['SKILL.md', 'CUSTOMER_RUNTIME.md']);
  const forbiddenRuntimeMarkers = [
    'src/modules/cli/dist',
    'SEGMENTLY_API_KEY',
    'npm run build',
    'dev-api.segmently.ai',
    '.claude/',
    '.agents/',
  ];
  for (const skillName of wrapperCompanionSkills) {
    const root = join(pluginRoot, 'skills', skillName);
    const files = listFiles(root);
    for (const file of files) {
      const rel = relative(root, file).replaceAll('\\', '/');
      assert(allowedCompanionFiles.has(rel), `${skillName} ships non-customer runtime file ${rel}`);
      const text = readFileSync(file, 'utf8');
      for (const marker of forbiddenRuntimeMarkers) {
        assert(!text.includes(marker), `${skillName}/${rel} contains runtime marker ${JSON.stringify(marker)}`);
      }
    }
  }
  for (const skillName of fullCompanionSkills) {
    const root = join(pluginRoot, 'skills', skillName);
    assertExcludedPathsMissing(root, fullCompanionExclusions[skillName] ?? [], skillName);
    for (const file of listFiles(root)) {
      assertNoHardFullSkillLeak(file, root, skillName);
    }
  }
  const launchRuntimeRoot = join(pluginRoot, 'skills/segmently-launch-guide/runtime');
  for (const file of listFiles(launchRuntimeRoot)) {
    const rel = relative(launchRuntimeRoot, file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8');
    for (const marker of forbiddenRuntimeMarkers) {
      assert(!text.includes(marker), `segmently-launch-guide/runtime/${rel} contains runtime marker ${JSON.stringify(marker)}`);
    }
  }
});

check('launch runtime', () => {
  const launchRoot = join(pluginRoot, 'skills/segmently-launch-guide');
  for (const rel of [
    'references/scenarios.matrix.json',
    'references/teach-reference.json',
    'references/guide-evidence.json',
    'references/help-article-reference.json',
    'references/semantic-routing.md',
    'runtime/do-action-reference.json',
    'runtime/editor-do-runner.mjs',
    'runtime/cli-do-runner.mjs',
    'runtime/e2e-do-runner.mjs',
    'runtime/show-runner.mjs',
    'runtime/customer-response-runner.mjs',
    'runtime/session-context.mjs',
    'runtime/session-engine.mjs',
    'runtime/route-runner.mjs',
    'runtime/navigation-atoms.json',
    'runtime/tool-preflight.mjs',
    'references/session-context.md',
    'references/session-engine.md',
    'scripts/run-evals.mjs',
    'scripts/run-codex-forward-test.mjs',
    'scripts/audit-guide-coverage.mjs',
    'scripts/audit-do-coverage.mjs',
    'scripts/run-customer-surface-acceptance.mjs',
    'evals/persona-flow-evals.json',
  ]) {
    assert(existsSync(join(launchRoot, rel)), `missing launch artifact ${rel}`);
  }
  const audit = JSON.parse(execFileSync('node', [join(launchRoot, 'scripts/audit-guide-coverage.mjs'), '--json', '--strict'], { encoding: 'utf8' }));
  assert(audit.ok === true, 'coverage audit strict mode failed');
  assert(audit.screenSettings?.allScreenSettingQuestionsCovered === true, 'screen setting article/text coverage is incomplete');
  assert(audit.screenSettings?.articleAliasCorpusCount > 0, 'screen setting article alias corpus is empty');
  assert(audit.screenSettings?.fieldQuestionProbeCount > 0, 'screen setting resolver probe count is empty');
  assert(audit.guideEvidence?.missingConcreteImageUrlCount >= 0, 'coverage audit missing image count is invalid');
  assert(audit.guideEvidence?.missingSectionConcreteImageUrlCount >= 0, 'coverage audit missing section image count is invalid');
  assert(Array.isArray(audit.guideEvidence?.coverageRows), 'coverage audit guide coverage rows are missing');
  assert(audit.guideEvidence.coverageRows.length === audit.guideEvidence.totalGuides, 'coverage audit guide coverage rows do not cover every guide');
  const doAudit = JSON.parse(execFileSync('node', [join(launchRoot, 'scripts/audit-do-coverage.mjs'), '--json', '--strict'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
  assert(doAudit.ok === true, 'DO coverage audit strict mode failed');
  assert(doAudit.actionRegistry?.totalActions >= 300, 'DO coverage audit action count is too low');
  assert(doAudit.settings?.totalPublishedSettings >= 400, 'DO coverage audit setting inventory is too low');
  assert(doAudit.settings?.anyDoSettingCount >= 150, 'DO coverage audit supported setting coverage regressed');
  assert(doAudit.conditionalActions?.probes?.filter((probe) => probe.ok === true).length >= 2, 'DO coverage audit conditional media probes regressed');
  const customerSurface = execFileSync('node', [join(launchRoot, 'scripts/run-customer-surface-acceptance.mjs')], { encoding: 'utf8' });
  assert(customerSurface.includes('customer-surface acceptance passed'), 'customer-surface acceptance runner did not pass');
});

check('customer-public-graph-boundary', () => {
  const launchRoot = join(pluginRoot, 'skills/segmently-launch-guide');
  const graphRoot = join(launchRoot, 'references/support-knowledge-graph');
  assert(!existsSync(join(launchRoot, 'references/support-module-relations-overrides.json')), 'customer plugin must not ship support-module-relations-overrides.json');
  const schema = JSON.parse(readFileSync(join(graphRoot, 'schema.json'), 'utf8'));
  const graphIndex = JSON.parse(readFileSync(join(graphRoot, 'search-index.json'), 'utf8'));
  assert(!(schema.nodeTypes ?? []).includes('Module'), 'customer plugin graph must not expose Module node type');
  assert(!(schema.nodeTypes ?? []).includes('Submodule'), 'customer plugin graph must not expose Submodule node type');
  assert(!(schema.edgeTypes ?? []).some(type => String(type).startsWith('MODULE_') || String(type).startsWith('SUBMODULE_')), 'customer plugin graph must not expose module relation edge types');
  assert(!Object.prototype.hasOwnProperty.call(graphIndex, 'moduleNames'), 'customer plugin graph must not expose moduleNames index');
  assert(!Object.prototype.hasOwnProperty.call(graphIndex, 'submoduleIds'), 'customer plugin graph must not expose submoduleIds index');
  const leakMarkers = [
    'Module:',
    'Submodule:',
    'MODULE_RELATED_',
    'SUBMODULE_RELATED_',
    'modules/registry.json',
    'support-module-relations-overrides',
  ];
  for (const file of listFiles(launchRoot)) {
    const rel = relative(launchRoot, file).replaceAll('\\', '/');
    if (!(
      rel.startsWith('references/support-knowledge-graph/')
      || rel === 'scripts/article-registry-tool.mjs'
      || rel === 'scripts/run-evals.mjs'
      || rel === 'SKILL.md'
    )) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of leakMarkers) {
      assert(!text.includes(marker), `segmently-launch-guide/${rel} leaks internal support impact marker ${JSON.stringify(marker)}`);
    }
  }
});

check('codex-dispatch-contract', () => {
  const launchRoot = join(pluginRoot, 'skills/segmently-launch-guide');
  const runner = join(launchRoot, 'runtime/editor-do-runner.mjs');
  const cliRunner = join(launchRoot, 'runtime/cli-do-runner.mjs');
  const e2eRunner = join(launchRoot, 'runtime/e2e-do-runner.mjs');
  const showRunner = join(launchRoot, 'runtime/show-runner.mjs');
  const responseRunner = join(launchRoot, 'runtime/customer-response-runner.mjs');
  for (const args of [
    ['--action', 'launch.funnel.create', '--projectId', 'project_demo', '--funnelName', 'Demo Funnel'],
    ['--action', 'launch.analytics.pixel.apply', '--projectId', 'project_demo', '--pixelProvider', 'facebook', '--pixelId', '1234567890'],
    ['--action', 'launch.paywallProducts.create', '--projectId', 'project_demo', '--productName', 'Pro Monthly', '--price', '19'],
    ['--action', 'editor.actionBar.primaryButton.label', '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--value', 'Start'],
    ['--action', 'editor.actionBar.primaryButton.backgroundColor', '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', '#ffc201'],
    ['--action', 'editor.paywall.attachProduct', '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--productName', 'Pro Monthly'],
    ['--action', 'editor.list.options.itemTitle.fontSize', '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', '18'],
    ['--action', 'launch.publish', '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--placementName', 'Default web link'],
  ]) {
    const plan = JSON.parse(execFileSync('node', [runner, ...args], { encoding: 'utf8' }));
    assert(plan.ok === true, `${args[1]} did not return ok=true`);
    assert(plan.executeWith?.skill, `${args[1]} missing executeWith.skill`);
    assert(plan.execution, `${args[1]} missing execution object`);
    assert(plan.verification?.read, `${args[1]} missing verification read`);
  }
  const cliDryRun = JSON.parse(execFileSync('node', [
    cliRunner,
    '--action',
    'editor.actionBar.primaryButton.backgroundColor',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#ffc201',
  ], { encoding: 'utf8' }));
  assert(cliDryRun.ok === true, 'CLI dry-run runner did not return ok=true');
  assert(cliDryRun.dryRun === true, 'CLI dry-run runner must not execute by default');
  assert(cliDryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.actionBar.primary.appearance.backgroundColor', 'CLI dry-run patch path drifted');
  assert(cliDryRun.verification?.read === 'funnels export', 'CLI dry-run missing funnels export verification');
  const e2eDryRun = JSON.parse(execFileSync('node', [
    e2eRunner,
    '--action',
    'editor.list.options.itemTitle.fontSize',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '18',
    '--baseUrl',
    'https://app.segmently.ai',
  ], { encoding: 'utf8' }));
  assert(e2eDryRun.ok === true, 'E2E dry-run runner did not return ok=true');
  assert(e2eDryRun.dryRun === true, 'E2E dry-run runner must not execute by default');
  assert(e2eDryRun.owningSkill === 'playwright-bowser', 'E2E dry-run missing playwright-bowser owningSkill');
  assert(e2eDryRun.companionSkill === 'segmently-test-kit', 'E2E dry-run missing segmently-test-kit companion');
  assert(String(e2eDryRun.driverScript ?? '').includes('input-style-title-styles-font-size'), 'E2E dry-run driverScript missing title font-size input');
  assert(e2eDryRun.verifyReady === true, 'E2E dry-run should be verification-ready with versionId');
  assert(e2eDryRun.verification?.read === 'funnels export', 'E2E dry-run missing funnels export verification');
  assert(e2eDryRun.completionClaim === 'not-completed-until-execute-and-verification', 'E2E dry-run claimed completion before execution/verification');
  const showDryRun = JSON.parse(execFileSync('node', [
    showRunner,
    '--prompt',
    'покажи где поменять цвет кнопки продолжить',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
    '--baseUrl',
    'https://app.segmently.ai',
  ], { encoding: 'utf8' }));
  assert(showDryRun.ok === true, 'SHOW dry-run runner did not return ok=true');
  assert(showDryRun.dryRun === true, 'SHOW dry-run runner must not execute by default');
  assert(showDryRun.mutation === false, 'SHOW dry-run must be non-mutating');
  assert(showDryRun.liveBrowserReady === true, 'SHOW dry-run should be browser-ready');
  assert(showDryRun.visibleBrowser === true && showDryRun.headed === true, 'SHOW dry-run must expose visible headed browser contract');
  assert(showDryRun.wouldOpen?.join(' ').includes('--headed'), 'SHOW dry-run must open a headed browser');
  assert(showDryRun.keepOpen === true, 'SHOW dry-run must keep browser open by default');
  assert(showDryRun.closePolicy === 'keep-visible-browser-open-for-customer', 'SHOW dry-run close policy must keep the window visible');
  assert(showDryRun.wouldClose === null, 'SHOW dry-run must not close browser unless explicitly requested');
  assert(showDryRun.wouldScreenshot?.join(' ').includes('screenshot'), 'SHOW dry-run missing screenshot argv');
  assert(showDryRun.completionClaim === 'show-not-completed-until-visible-browser-and-screenshot', 'SHOW dry-run claimed completion before visible browser and screenshot evidence');
  for (const args of [
    ['--persona', 'maya-founder', '--question', 'maya-01'],
    ['--persona', 'oleg-marketer', '--question', 'oleg-06'],
  ]) {
    const response = JSON.parse(execFileSync('node', [responseRunner, ...args], { encoding: 'utf8' }));
    assert(response.ok === true, `${args.join(' ')} did not return ok=true`);
    assert(response.answer?.instructions?.length > 0, `${args.join(' ')} missing instructions`);
    assert(response.answer.instructions.some(item => item.visualEvidence === true), `${args.join(' ')} missing visual evidence`);
    if (response.mode === 'handoff') {
      assert(response.completionClaim === 'handoff-not-done', `${args.join(' ')} handoff claimed completion`);
    }
  }
});

check('marketplace when colocated', () => {
  const marketplacePath = join(dirname(dirname(pluginRoot)), '.agents/plugins/marketplace.json');
  if (!existsSync(marketplacePath)) return;
  const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const entry = marketplace.plugins?.find(plugin => plugin.name === 'segmently-launch-assistant');
  assert(entry, 'marketplace missing segmently-launch-assistant entry');
  assert(entry.source?.source === 'local', 'marketplace source.source must be local');
  assert(entry.source?.path === './plugins/segmently-launch-assistant', 'marketplace source.path drifted');
  assert(entry.policy?.installation === 'AVAILABLE', 'marketplace policy.installation must be AVAILABLE');
  assert(entry.policy?.authentication === 'ON_INSTALL', 'marketplace policy.authentication must be ON_INSTALL');
});

check('claude-marketplace when colocated', () => {
  const marketplacePath = join(dirname(dirname(pluginRoot)), '.claude-plugin/marketplace.json');
  if (!existsSync(marketplacePath)) return;
  const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const codexManifest = JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const entry = marketplace.plugins?.find(plugin => plugin.name === 'segmently-launch-assistant');
  assert(marketplace.name === 'segmently-support', 'Claude marketplace name must be segmently-support');
  assert(entry, 'Claude marketplace missing segmently-launch-assistant entry');
  assert(entry.source === './plugins/segmently-launch-assistant', 'Claude marketplace source path drifted');
  assert(entry.version === codexManifest.version, 'Claude marketplace plugin version must match plugin manifest version');
  assert(entry.category === 'productivity', 'Claude marketplace category must be productivity');
});

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} plugin validation check(s) failed`);
  process.exit(1);
}
console.log('plugin validation passed');

function check(id, fn) {
  try {
    fn();
    console.log(`ok - plugin:${id}`);
  } catch (error) {
    failures.push(`not ok - plugin:${id}\n  ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function customerFacingFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const file of listFiles(root)) {
    const normalized = file.replaceAll('\\', '/');
    if (
      normalized.endsWith('/SKILL.md')
      || normalized.endsWith('/CUSTOMER_RUNTIME.md')
      || normalized.includes('/references/')
      || normalized.includes('/docs/')
    ) {
      out.push(file);
    }
  }
  return out;
}

function referentialClosureFiles(root) {
  if (!existsSync(root)) return [];
  return listFiles(root).filter(file => {
    const normalized = file.replaceAll('\\', '/');
    return normalized.endsWith('/SKILL.md')
      || normalized.endsWith('/CUSTOMER_RUNTIME.md')
      || normalized.includes('/references/')
      || normalized.includes('/docs/')
      || normalized.includes('/hooks/');
  }).filter(file => /\.(md|markdown)$/i.test(file) || file.endsWith('/SKILL.md') || file.endsWith('/CUSTOMER_RUNTIME.md'));
}

function assertLocalMarkdownLinksExist(file) {
  const text = readFileSync(file, 'utf8');
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(linkRe)) {
    const href = cleanMarkdownHref(match[1]);
    if (!href || shouldSkipLinkClosure(href)) continue;
    const target = href.split('#')[0];
    if (!target) continue;
    const resolved = join(dirname(file), target);
    assert(existsSync(resolved), file + ' links to missing packaged file ' + href);
  }
}

function assertInlinePackagedPathsExist(file, skillsRoot) {
  const text = readFileSync(file, 'utf8');
  const relFromSkills = relative(skillsRoot, file).replaceAll('\\', '/');
  const skillName = relFromSkills.split('/')[0];
  if (!skillName) return;
  const skillRoot = join(skillsRoot, skillName);
  const inlineCodeTick = String.fromCharCode(96);
  const pathRe = new RegExp(inlineCodeTick + '((?:references|runtime|scripts|hooks|agents|docs)/[^' + inlineCodeTick + '\\s]+\\.(?:md|mjs|json|yaml|yml|sh))' + inlineCodeTick, 'g');
  for (const match of text.matchAll(pathRe)) {
    const rel = match[1].split('#')[0];
    if (!rel || rel.includes('<') || rel.includes('>')) continue;
    assert(existsSync(join(skillRoot, rel)), file + ' references missing packaged path ' + rel);
  }
}

function cleanMarkdownHref(raw) {
  let href = String(raw ?? '').trim();
  if (!href) return '';
  if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
  const titleMatch = href.match(/^(\S+)\s+["'][^"']+["']$/);
  if (titleMatch) href = titleMatch[1];
  return href;
}

function shouldSkipLinkClosure(href) {
  const localFileLike = href.startsWith('.')
    || href.includes('/')
    || /\.(?:md|markdown|json|mjs|js|ts|sh|yaml|yml|txt|html?)($|#)/i.test(href);
  return href.startsWith('#')
    || /^[a-z][a-z0-9+.-]*:/i.test(href)
    || href.startsWith('/')
    || href.startsWith('mailto:')
    || href.includes('<')
    || href.includes('>')
    || !localFileLike;
}

function pluginSkillNameForFile(file) {
  const rel = relative(join(pluginRoot, 'skills'), file).replaceAll('\\', '/');
  return rel.split('/')[0] ?? '';
}

function assertExcludedPathsMissing(root, patterns, skillName) {
  for (const pattern of patterns ?? []) {
    const normalized = String(pattern).replaceAll('\\', '/');
    if (normalized.endsWith('/**')) {
      const prefix = normalized.slice(0, -3);
      assert(!existsSync(join(root, prefix)), skillName + ' must not ship excluded path ' + normalized);
      continue;
    }
    assert(!existsSync(join(root, normalized)), skillName + ' must not ship excluded path ' + normalized);
  }
}

function assertNoHardFullSkillLeak(file, root, skillName) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file).replaceAll('\\', '/');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of hardForbiddenFullSkillRules) {
      assert(!rule.pattern.test(line), skillName + '/' + rel + ':' + (index + 1) + ' contains hard forbidden marker ' + rule.id);
    }
  });
}

function listFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listFiles(full));
    if (stat.isFile()) out.push(full);
  }
  return out;
}

function computeContentHash(root) {
  const hash = createHash('sha256');
  for (const file of listFiles(root).sort()) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (
      rel === '.codex-plugin/plugin.json'
      || rel === '.codex-plugin/release.json'
      || rel === '.claude-plugin/plugin.json'
      || rel.startsWith('.in_use/')
    ) continue;
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
