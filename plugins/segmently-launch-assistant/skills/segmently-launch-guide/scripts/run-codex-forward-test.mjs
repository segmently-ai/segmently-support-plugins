#!/usr/bin/env node
/**
 * Codex forward-test for generated segmently-launch-guide targets.
 *
 * This harness intentionally reads only the installed/generated skill surface:
 * SKILL.md, references/**, runtime/**, and sibling companion skills. It does not
 * import project source. The goal is to prove a fresh Codex delivery can:
 *
 *   - trigger/load the launch guide;
 *   - resolve field-level TEACH from shipped references;
 *   - produce a CLI delegation plan;
 *   - produce a packaged CLI dry-run execution package;
 *   - produce an E2E/browser delegation plan;
 *   - produce a packaged E2E dry-run execution package;
 *   - produce an E2E/browser delegation plan for a nested field write;
 *   - audit guide image/link coverage and screen-setting article coverage;
 *   - audit DO coverage and remaining teach/show-only setting gaps;
 *   - produce a non-mutating SHOW browser/screenshot plan;
 *   - prove raw customer TEACH/SHOW/CLI DO/E2E DO contracts through the
 *     customer-surface acceptance runner;
 *   - identify handoff+verify paths.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_TOKENS } from './forbidden-tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultContextFile = join(mkdtempSync(join(tmpdir(), 'segmently-launch-guide-forward-')), 'empty-context.json');
const args = new Set(process.argv.slice(2));
const companionSkills = Object.freeze([
  'segmently-cli-guide',
  'segmently-cli-paywall-ab-rollout',
  'segmently-cli-articles',
  'segmently-cli-content-plan-guide',
  'segmently-cli-custom-screen-guide',
  'segmently-cli-figma-webembed-import',
  'segmently-cli-image-upload',
  'segmently-product-cli-guide',
  'playwright-bowser',
  'segmently-test-kit',
]);

const failures = [];

if (args.has('--isolate') && process.env.SEGMENTLY_FORWARD_ISOLATED !== '1') {
  runIsolatedCopy();
  process.exit(0);
}

check('projection files exist', () => {
  for (const rel of [
    'SKILL.md',
    'references/scenarios.matrix.json',
    'references/teach-reference.json',
    'references/guide-evidence.json',
    'references/help-article-reference.json',
    'references/semantic-routing.md',
    'runtime/do-action-reference.json',
    'runtime/browser-auth-bridge.mjs',
    'runtime/editor-do-runner.mjs',
    'runtime/cli-do-runner.mjs',
    'runtime/e2e-do-runner.mjs',
    'runtime/show-runner.mjs',
    'runtime/customer-response-runner.mjs',
    'runtime/session-context.mjs',
    'references/session-context.md',
    'scripts/audit-guide-coverage.mjs',
    'scripts/audit-do-coverage.mjs',
    'scripts/run-customer-surface-acceptance.mjs',
    'evals/persona-flow-evals.json',
  ]) {
    assert(existsSync(join(root, rel)), `missing ${rel}`);
  }
});

check('customer-surface acceptance runner passes from shipped artifacts', () => {
  const stdout = execFileSync('node', [join(root, 'scripts/run-customer-surface-acceptance.mjs')], {
    encoding: 'utf8',
  });
  assert(stdout.includes('customer-surface acceptance passed'), 'customer-surface acceptance runner did not pass');
});

check('coverage audit reports image gaps and covers screen settings', () => {
  const audit = JSON.parse(execFileSync('node', [
    join(root, 'scripts/audit-guide-coverage.mjs'),
    '--json',
    '--strict',
  ], {
    encoding: 'utf8',
  }));
  assert(audit.ok === true, 'coverage audit strict mode failed');
  assert(audit.screenSettings?.allScreenSettingQuestionsCovered === true, 'screen setting questions are not fully covered');
  assert(audit.screenSettings?.fieldCount > 0, 'screen setting field count is empty');
  assert(audit.screenSettings?.leafCount > 0, 'screen setting leaf count is empty');
  assert(audit.screenSettings?.articleAliasCorpusCount > 0, 'screen setting article alias corpus is empty');
  assert(audit.screenSettings?.fieldQuestionProbeCount > 0, 'screen setting resolver probe count is empty');
  assert(audit.guideEvidence?.missingConcreteImageUrlCount >= 0, 'missing image URL inventory is absent');
  assert(audit.guideEvidence?.missingSectionConcreteImageUrlCount >= 0, 'missing section image URL inventory is absent');
  assert(audit.guideEvidence?.missingArticleLinkCount >= 0, 'missing article-link inventory is absent');
  assert(Array.isArray(audit.guideEvidence?.coverageRows), 'guide image/link coverage rows are absent');
  assert(
    audit.guideEvidence.coverageRows.length === audit.guideEvidence.totalGuides,
    'guide image/link coverage rows do not cover every guide',
  );
});

check('DO coverage audit reports supported and teach-only setting inventory', () => {
  const audit = JSON.parse(execFileSync('node', [
    join(root, 'scripts/audit-do-coverage.mjs'),
    '--json',
    '--strict',
  ], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }));
  assert(audit.ok === true, 'DO coverage audit strict mode failed');
  assert(audit.actionRegistry?.totalActions >= 300, 'DO coverage audit action inventory is too low');
  assert(audit.settings?.totalPublishedSettings >= 400, 'DO coverage audit setting inventory is too low');
  assert(audit.settings?.anyDoSettingCount >= 150, 'DO coverage audit supported setting coverage regressed');
  assert(Array.isArray(audit.settings?.teachOnlySettings), 'DO coverage audit teach-only setting inventory is missing');
  assert(Array.isArray(audit.articleCoverage?.topGapArticles), 'DO coverage audit top gap article inventory is missing');
  assert(audit.gapTaxonomy?.schemaVersion === 1, 'DO coverage audit gap taxonomy schemaVersion missing');
  assert(
    audit.gapTaxonomy?.totalTeachOnlySettings === audit.settings?.teachOnlySettingCount,
    'DO coverage audit gap taxonomy count does not match teach-only setting inventory',
  );
  assert(audit.gapTaxonomy?.unclassifiedSettingCount === 0, 'DO coverage audit gap taxonomy has unclassified settings');
  assert((audit.gapTaxonomy?.gapGroups ?? []).length >= 5, 'DO coverage audit gap taxonomy groups are missing');
  for (const family of [
    'options-structure-and-items',
    'media-assets-and-image-layout',
    'copy-and-label-text',
    'variable-binding-and-scoring',
  ]) {
    assert(
      (audit.gapTaxonomy?.gapGroups ?? []).some(group => group.family === family),
      `DO coverage audit gap taxonomy is missing ${family}`,
    );
  }
  assert(
    (audit.conditionalActions?.probes ?? []).filter(probe => probe.ok === true).length >= 2,
    'DO coverage audit conditional media probes regressed',
  );
});

check('customer projection has no internal leaks', () => {
  for (const file of projectionFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const token of FORBIDDEN_TOKENS) {
      assert(!text.includes(token), `${relative(root, file)} contains forbidden token ${JSON.stringify(token)}`);
    }
  }
});

check('required companion skills are present', () => {
  const skillsRoot = dirname(root);
  for (const skillName of companionSkills) {
    assert(
      existsSync(join(skillsRoot, skillName, 'SKILL.md')),
      `missing companion skill ${skillName} next to generated launch skill`,
    );
  }
});

check('field-level TEACH resolves from shipped reference', () => {
  const skill = read('SKILL.md');
  assert(skill.includes('Required companion skills'), 'SKILL.md missing Required companion skills section');
  assert(skill.includes('runtime/do-action-reference.json'), 'SKILL.md does not mention DO action registry');
  const teach = json('references/teach-reference.json');
  const probe = teach.fieldQuestionProbes?.find(item => item.query === 'как настроить шрифт ячейки в списке');
  assert(probe, 'missing list-cell-font field probe');
  const block = teach.blocksByAlias?.[probe.expected.articleAlias];
  assert(block, `missing block payload for ${probe.expected.articleAlias}`);
  const field = block.fields?.find(item => item.label === probe.expected.field);
  assert(field, `missing field ${probe.expected.field}`);
  const leaf = field.leaves?.find(item => item.label === probe.expected.leaf);
  assert(leaf, `missing leaf ${probe.expected.leaf}`);
  const syntheticAnswer = [
    teach.purpose,
    block.title,
    block.summary,
    field.label,
    field.description,
    leaf.label,
    leaf.description,
  ].join('\n');
  for (const token of FORBIDDEN_TOKENS) {
    assert(!syntheticAnswer.includes(token), `TEACH synthetic answer leaks ${JSON.stringify(token)}`);
  }
});

check('CLI DO request returns owning skill execution contract', () => {
  const plan = runRunner([
    '--action', 'launch.funnel.create',
    '--projectId', 'project_demo',
    '--funnelName', 'Demo Funnel',
  ]);
  assert(plan.ok === true, 'CLI action should be executable as a delegation plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'CLI action did not route to segmently-cli-guide');
  assert(plan.executeWith?.commandFamily === 'funnels create', 'CLI action commandFamily drifted');
  assert(plan.execution?.kind === 'delegate-cli', 'CLI action missing delegate-cli execution object');
  assert(plan.execution?.tool === 'segmently', 'CLI execution tool must be segmently');
  assert(Array.isArray(plan.execution?.argv), 'CLI execution missing argv');
  assert(plan.execution.argv.includes('funnels'), 'CLI execution argv missing funnels command');
  assert(plan.verification?.read === 'funnels list', 'CLI action missing verification read object');
  assert(plan.verify?.command === 'funnels list', 'CLI action verify read drifted');
});

check('E2E DO request returns playwright-bowser execution contract', () => {
  const plan = runRunner([
    '--action', 'editor.actionBar.primaryButton.label',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--value', 'Start',
  ]);
  assert(plan.ok === true, 'E2E action should be executable as a browser plan');
  assert(plan.mode === 'e2e', `expected e2e mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'playwright-bowser', 'E2E action did not route to playwright-bowser');
  assert(plan.executeWith?.companionSkill === 'segmently-test-kit', 'E2E action missing segmently-test-kit companion');
  assert(plan.execution?.kind === 'playwright-bowser', 'E2E action missing playwright-bowser execution object');
  assert(plan.execution?.openCommand?.includes('playwright-cli'), 'E2E execution missing openCommand');
  assert(plan.execution?.runCodeCommand?.includes('run-code'), 'E2E execution missing run-code command');
  assert(plan.execution?.driverScript?.includes('async (page)'), 'E2E execution missing driverScript');
  assert(plan.verification?.read === 'funnels export', 'E2E action missing verification read object');
  assert(Array.isArray(plan.browserPlan) && plan.browserPlan.length >= 4, 'E2E action did not emit a browser plan');
  assert(plan.verify?.command === 'funnels export', 'E2E verify read drifted');
});

check('all supported DO actions return dispatch contracts', () => {
  const reference = json('runtime/do-action-reference.json');
  for (const action of reference.actions ?? []) {
    if (action.status !== 'supported') continue;
    const args = sampleArgsForAction(action.id);
    assert(args, `${action.id} has no forward-test sample inputs`);
    const plan = runRunner(args);
    assert(plan.ok === true, `${action.id} did not return ok=true`);
    assert(plan.actionId === action.id, `${action.id} returned wrong actionId ${plan.actionId}`);
    assert(plan.executeWith?.skill === action.owningSkill, `${action.id} executeWith.skill drifted`);
    assert(plan.execution, `${action.id} missing execution object`);
    assert(plan.verification?.read, `${action.id} missing verification read`);
    if (action.mode === 'cli') {
      assert(plan.execution.kind === 'delegate-cli', `${action.id} expected delegate-cli execution`);
      assert(Array.isArray(plan.execution.argvTemplate), `${action.id} missing argvTemplate`);
    }
    if (action.mode === 'e2e') {
      assert(plan.execution.kind === 'playwright-bowser', `${action.id} expected playwright-bowser execution`);
      assert(plan.execution.runCodeCommand?.includes('run-code'), `${action.id} missing run-code command`);
      assert(plan.execution.driverScript?.includes('async'), `${action.id} missing async driverScript`);
      assert(plan.executeWith.companionSkill === 'segmently-test-kit', `${action.id} missing segmently-test-kit companion`);
    }
  }
});

check('nested list font-size write returns playwright-bowser execution contract', () => {
  const plan = runRunner([
    '--action', 'editor.list.options.itemTitle.fontSize',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--screenId', 'screen_demo',
    '--value', '18',
  ]);
  assert(plan.ok === true, 'list font-size action should be executable as a browser plan');
  assert(plan.mode === 'e2e', `expected e2e mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'playwright-bowser', 'list font-size action did not route to playwright-bowser');
  assert(plan.executeWith?.companionSkill === 'segmently-test-kit', 'list font-size action missing segmently-test-kit companion');
  assert(plan.execution?.driverScript?.includes('input-style-title-styles-font-size'), 'driverScript missing title font-size input');
  assert(plan.verification?.read === 'funnels export', 'list font-size action missing export verification');
});

check('action bar button color write returns CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.actionBar.primaryButton.backgroundColor',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '#ffc201',
  ]);
  assert(plan.ok === true, 'button color action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'button color action did not route to segmently-cli-guide');
  assert(plan.execution?.argv?.includes('screens'), 'CLI argv missing screens command');
  assert(plan.execution?.argv?.includes('patch'), 'CLI argv missing patch command');
  assert(plan.execution?.materialize?.content?.operations?.[0]?.op === 'setFieldValue', 'CLI patch missing setFieldValue operation');
  assert(
    plan.execution?.materialize?.content?.operations?.[0]?.path === 'content.actionBar.primary.appearance.backgroundColor',
    'CLI patch missing schema field marker',
  );
  assert(plan.verification?.read === 'funnels export', 'button color action missing export verification');
});

check('action bar button text style write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.actionBar.primaryButton.textStyle.fontSize',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '20',
  ]);
  assert(plan.ok === true, 'button text font-size action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'button text font-size action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'button text font-size patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.actionBar.primary.content.styles.fontSize',
    'button text font-size patch path drifted',
  );
  assert(operation?.value === 20, 'button text font-size patch value must be numeric');
  assert(plan.verification?.read === 'funnels export', 'button text font-size action missing export verification');
});

check('options title text style write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.options.itemTitle.textStyle.color',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '#222222',
  ]);
  assert(plan.ok === true, 'options title color action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'options title color action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'options title color patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.options.items.0.title.appearance.color',
    'options title color patch path drifted',
  );
  assert(operation?.value === '#222222', 'options title color patch value drifted');
  assert(plan.verification?.read === 'funnels export', 'options title color action missing export verification');
});

check('content title text style write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.content.title.textStyle.color',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '#333333',
  ]);
  assert(plan.ok === true, 'content title color action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'content title color action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'content title color patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.copy.title.appearance.color',
    'content title color patch path drifted',
  );
  assert(operation?.value === '#333333', 'content title color patch value drifted');
  assert(plan.verification?.read === 'funnels export', 'content title color action missing export verification');
});

check('paywall body title text style write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.paywallBody.title.textStyle.color',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '#111111',
  ]);
  assert(plan.ok === true, 'paywall title color action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'paywall title color action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'paywall title color patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.copy.title.appearance.color',
    'paywall title color patch path drifted',
  );
  assert(operation?.value === '#111111', 'paywall title color patch value drifted');
  assert(plan.verification?.read === 'funnels export', 'paywall title color action missing export verification');
});

check('paywall footer background write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.paywallFooter.style.backgroundColor',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '#18181b',
  ]);
  assert(plan.ok === true, 'paywall footer background action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'paywall footer background action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'paywall footer background patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.paywall.footerAppearance.backgroundColor',
    'paywall footer background patch path drifted',
  );
  assert(operation?.value === '#18181b', 'paywall footer background patch value drifted');
  assert(plan.verification?.read === 'funnels export', 'paywall footer background action missing export verification');
});

check('paywall header restore font-size write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.paywallHeader.restoreLink.style.fontSize',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '13',
  ]);
  assert(plan.ok === true, 'paywall header restore font-size action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'paywall header restore font-size action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'paywall header restore font-size patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.paywall.restoreLabel.appearance.fontSize',
    'paywall header restore font-size patch path drifted',
  );
  assert(operation?.value === 13, 'paywall header restore font-size patch value must be numeric');
  assert(plan.verification?.read === 'funnels export', 'paywall header restore font-size action missing export verification');
});

check('paywall media height write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.paywallMedia.style.heightPercentage',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '65',
  ]);
  assert(plan.ok === true, 'paywall media height action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'paywall media height action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'paywall media height patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage',
    'paywall media height patch path drifted',
  );
  assert(operation?.value === 65, 'paywall media height patch value drifted');
  assert(plan.verification?.read === 'funnels export', 'paywall media height action missing export verification');
});

check('screen background color write returns generic CLI patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.screen.backgroundColor',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '#000000',
  ]);
  assert(plan.ok === true, 'screen background action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'screen background action did not route to segmently-cli-guide');
  assert(plan.execution?.materialize?.content?.operations?.[0]?.op === 'setFieldValue', 'screen background patch missing setFieldValue operation');
  assert(
    plan.execution?.materialize?.content?.operations?.[0]?.path === 'content.canvas.background.content.color',
    'screen background patch path drifted',
  );
  assert(plan.verification?.read === 'funnels export', 'screen background action missing export verification');
});

check('text field style write returns generated CLI screen patch contract', () => {
  const plan = runRunner([
    '--action', 'editor.textField.style.fontSize',
    '--projectId', 'project_demo',
    '--funnelId', 'funnel_demo',
    '--versionId', 'version_demo',
    '--screenId', 'screen_demo',
    '--value', '18',
  ]);
  assert(plan.ok === true, 'text field font-size action should be executable as a CLI patch plan');
  assert(plan.mode === 'cli', `expected cli mode, got ${plan.mode}`);
  assert(plan.executeWith?.skill === 'segmently-cli-guide', 'text field font-size action did not route to segmently-cli-guide');
  const operation = plan.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'text field font-size patch missing setFieldValue operation');
  assert(
    operation?.path === 'content.textField.placeholder.appearance.fontSize',
    'text field font-size patch path drifted',
  );
  assert(operation?.value === 18, 'text field font-size patch value must be numeric');
  assert(plan.verification?.read === 'funnels export', 'text field font-size action missing export verification');
});

check('CLI DO runner dry-run materializes patch and verification contract', () => {
  const dryRun = runCliRunner([
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
  ]);
  assert(dryRun.ok === true, 'CLI dry-run should return ok=true');
  assert(dryRun.dryRun === true, 'CLI runner must not execute without --execute');
  assert(dryRun.mode === 'cli', `CLI dry-run mode drifted to ${dryRun.mode}`);
  assert(dryRun.wouldRun?.join(' ').includes('funnels screens patch'), 'CLI dry-run missing patch argv');
  const operation = dryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'CLI dry-run patch operation drifted');
  assert(
    operation?.path === 'content.actionBar.primary.appearance.backgroundColor',
    'CLI dry-run patch path drifted',
  );
  assert(operation?.value === '#ffc201', 'CLI dry-run patch value drifted');
  assert(dryRun.verification?.read === 'funnels export', 'CLI dry-run missing export verification');
  assert(dryRun.wouldVerify?.join(' ').includes('funnels export'), 'CLI dry-run missing verification argv');
  assertToolPreflight(dryRun.toolPreflight, { browser: false });

  const backgroundDryRun = runCliRunner([
    '--action',
    'editor.screen.backgroundColor',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#000000',
  ]);
  const backgroundOperation = backgroundDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(backgroundDryRun.ok === true, 'screen background CLI dry-run should return ok=true');
  assert(backgroundOperation?.path === 'content.canvas.background.content.color', 'screen background CLI dry-run patch path drifted');
  assert(backgroundOperation?.value === '#000000', 'screen background CLI dry-run patch value drifted');

  const fontSizeDryRun = runCliRunner([
    '--action',
    'editor.actionBar.primaryButton.textStyle.fontSize',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '20',
  ]);
  const fontSizeOperation = fontSizeDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(fontSizeDryRun.ok === true, 'button text font-size CLI dry-run should return ok=true');
  assert(fontSizeOperation?.path === 'content.actionBar.primary.content.styles.fontSize', 'button text font-size CLI dry-run patch path drifted');
  assert(fontSizeOperation?.value === 20, 'button text font-size CLI dry-run patch value must be numeric');

  const headerBackDryRun = runCliRunner([
    '--action',
    'editor.header.backButton.textStyle.fontSize',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '13',
  ]);
  const headerBackOperation = headerBackDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(headerBackDryRun.ok === true, 'header back font-size CLI dry-run should return ok=true');
  assert(headerBackOperation?.path === 'content.header.back.content.appearance.fontSize', 'header back font-size CLI dry-run patch path drifted');
  assert(headerBackOperation?.value === 13, 'header back font-size CLI dry-run patch value must be numeric');

  const optionsTitleDryRun = runCliRunner([
    '--action',
    'editor.options.itemTitle.textStyle.color',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#222222',
  ]);
  const optionsTitleOperation = optionsTitleDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(optionsTitleDryRun.ok === true, 'options title color CLI dry-run should return ok=true');
  assert(optionsTitleOperation?.path === 'content.options.items.0.title.appearance.color', 'options title color CLI dry-run patch path drifted');
  assert(optionsTitleOperation?.value === '#222222', 'options title color CLI dry-run patch value drifted');

  const optionsSubtitleDryRun = runCliRunner([
    '--action',
    'editor.options.itemSubtitle.textStyle.color',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#555555',
  ]);
  const optionsSubtitleOperation = optionsSubtitleDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(optionsSubtitleDryRun.ok === true, 'options subtitle color CLI dry-run should return ok=true');
  assert(optionsSubtitleOperation?.path === 'content.options.items.0.subtitle.appearance.color', 'options subtitle color CLI dry-run patch path drifted');
  assert(optionsSubtitleOperation?.value === '#555555', 'options subtitle color CLI dry-run patch value drifted');

  const contentTitleDryRun = runCliRunner([
    '--action',
    'editor.content.title.textStyle.color',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#333333',
  ]);
  const contentTitleOperation = contentTitleDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(contentTitleDryRun.ok === true, 'content title color CLI dry-run should return ok=true');
  assert(contentTitleOperation?.path === 'content.copy.title.appearance.color', 'content title color CLI dry-run patch path drifted');
  assert(contentTitleOperation?.value === '#333333', 'content title color CLI dry-run patch value drifted');

  const paywallTitleDryRun = runCliRunner([
    '--action',
    'editor.paywallBody.title.textStyle.color',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#111111',
  ]);
  const paywallTitleOperation = paywallTitleDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(paywallTitleDryRun.ok === true, 'paywall title color CLI dry-run should return ok=true');
  assert(paywallTitleOperation?.path === 'content.copy.title.appearance.color', 'paywall title color CLI dry-run patch path drifted');
  assert(paywallTitleOperation?.value === '#111111', 'paywall title color CLI dry-run patch value drifted');

  const paywallFooterDryRun = runCliRunner([
    '--action',
    'editor.paywallFooter.style.backgroundColor',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#18181b',
  ]);
  const paywallFooterOperation = paywallFooterDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(paywallFooterDryRun.ok === true, 'paywall footer background CLI dry-run should return ok=true');
  assert(paywallFooterOperation?.path === 'content.paywall.footerAppearance.backgroundColor', 'paywall footer background CLI dry-run patch path drifted');
  assert(paywallFooterOperation?.value === '#18181b', 'paywall footer background CLI dry-run patch value drifted');

  const paywallMediaHeightDryRun = runCliRunner([
    '--action',
    'editor.paywallMedia.style.heightPercentage',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '65',
  ]);
  const paywallMediaHeightOperation = paywallMediaHeightDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(paywallMediaHeightDryRun.ok === true, 'paywall media height CLI dry-run should return ok=true');
  assert(paywallMediaHeightOperation?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage', 'paywall media height CLI dry-run patch path drifted');
  assert(paywallMediaHeightOperation?.value === 65, 'paywall media height CLI dry-run patch value drifted');

  const textFieldDryRun = runCliRunner([
    '--action',
    'editor.textField.style.fontSize',
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
  ]);
  const textFieldOperation = textFieldDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(textFieldDryRun.ok === true, 'text field font-size CLI dry-run should return ok=true');
  assert(textFieldOperation?.path === 'content.textField.placeholder.appearance.fontSize', 'text field font-size CLI dry-run patch path drifted');
  assert(textFieldOperation?.value === 18, 'text field font-size CLI dry-run patch value must be numeric');

  const refused = runCliRunnerExpectingRefusal([
    '--action',
    'editor.list.options.itemTitle.fontSize',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '18',
  ]);
  assert(refused.ok === false, 'CLI runner should refuse non-CLI action');
  assert(refused.requiredRunner === 'playwright-bowser', 'CLI runner refusal should point to playwright-bowser');
});

check('E2E DO runner dry-run exposes browser package and refuses CLI actions', () => {
  const dryRun = runE2eRunner([
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
  ]);
  assert(dryRun.ok === true, 'E2E dry-run should return ok=true');
  assert(dryRun.dryRun === true, 'E2E runner must not execute without --execute');
  assert(dryRun.mode === 'e2e', `E2E dry-run mode drifted to ${dryRun.mode}`);
  assert(dryRun.owningSkill === 'playwright-bowser', 'E2E dry-run should route to playwright-bowser');
  assert(dryRun.companionSkill === 'segmently-test-kit', 'E2E dry-run missing segmently-test-kit companion');
  assert(dryRun.wouldOpen?.join(' ').includes('playwright-cli'), 'E2E dry-run missing playwright-cli open argv');
  assert(dryRun.browser === 'chrome', 'E2E dry-run should default to Chrome');
  assert(dryRun.wouldOpen?.join(' ').includes('--browser=chrome'), 'E2E dry-run missing Chrome browser selector');
  assert(dryRun.authPreflight?.requiredForExecute === true, 'E2E dry-run missing auth preflight');
  assert(dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status'), 'E2E auth preflight missing safe status probe');
  assert(dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login'), 'E2E auth preflight missing login command');
  assert(dryRun.authPreflight?.tokenProbe?.safeToShowOutput === false, 'E2E auth preflight must mark token probe output unsafe');
  assertToolPreflight(dryRun.toolPreflight, { browser: true, segmentlyEnv: 'prod' });
  const envDryRun = runE2eRunner([
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
  ], {
    LIVE_SEGMENTLY_BASE_URL: 'https://env.segmently.example',
  });
  assert(envDryRun.blockedExecuteReason === null, 'E2E dry-run should accept baseUrl from live harness env');
  assert(
    envDryRun.wouldOpen?.join(' ').includes('https://env.segmently.example/login'),
    'E2E dry-run did not use LIVE_SEGMENTLY_BASE_URL for browser open URL',
  );
  assert(dryRun.wouldRunCode?.join(' ').includes('<driverScript>'), 'E2E dry-run missing run-code preview');
  assert(
    String(dryRun.driverScript ?? '').includes('input-style-title-styles-font-size'),
    'E2E dry-run driverScript missing title font-size input',
  );
  assert(dryRun.verification?.read === 'funnels export', 'E2E dry-run missing export verification');
  assert(dryRun.verifyReady === true, 'E2E dry-run should be verification-ready with versionId');
  assert(dryRun.wouldVerify?.join(' ').includes('funnels export'), 'E2E dry-run missing verification argv');
  assert(dryRun.blockedExecuteReason === null, 'E2E dry-run should be execute-ready with baseUrl/versionId');
  assert(
    dryRun.completionClaim === 'not-completed-until-execute-and-verification',
    'E2E dry-run claimed completion before execution/verification',
  );

  const refused = runE2eRunnerExpectingRefusal([
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
  ]);
  assert(refused.ok === false, 'E2E runner should refuse non-E2E action');
  assert(refused.requiredRunner === 'segmently-cli-guide', 'E2E runner refusal should point to segmently-cli-guide');
});

check('SHOW runner dry-run exposes read-only browser screenshot package', () => {
  const dryRun = runShowRunner([
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
  ]);
  assert(dryRun.ok === true, 'SHOW dry-run should return ok=true');
  assert(dryRun.dryRun === true, 'SHOW runner must not execute without --execute');
  assert(dryRun.mode === 'show', `SHOW dry-run mode drifted to ${dryRun.mode}`);
  assert(dryRun.mutation === false, 'SHOW dry-run must be non-mutating');
  assert(dryRun.liveBrowserReady === true, 'SHOW dry-run should be browser-ready with ids/baseUrl');
  assert(dryRun.wouldOpen?.join(' ').includes('playwright-cli'), 'SHOW dry-run missing playwright-cli open argv');
  assert(dryRun.browser === 'chrome', 'SHOW dry-run should default to Chrome');
  assert(dryRun.wouldOpen?.join(' ').includes('--browser=chrome'), 'SHOW dry-run missing Chrome browser selector');
  assert(String(dryRun.driverScript ?? '').includes('waitForSelector'), 'SHOW driver must wait for canvas/editor readiness before inspecting nodes');
  assert(dryRun.authPreflight?.requiredForExecute === true, 'SHOW dry-run missing auth preflight');
  assert(dryRun.authPreflight?.authEnv === 'prod', 'SHOW auth preflight must infer prod for app.segmently.ai');
  assert(dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status'), 'SHOW auth preflight missing safe status probe');
  assert(dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login'), 'SHOW auth preflight missing login command');
  assert(dryRun.authPreflight?.tokenProbe?.safeToShowOutput === false, 'SHOW auth preflight must mark token probe output unsafe');
  assert(dryRun.authPreflight?.retry?.argv?.includes('--execute'), 'SHOW auth preflight retry must execute live runner');
  assertToolPreflight(dryRun.toolPreflight, { browser: true, segmentlyEnv: 'prod' });
  const devDryRun = runShowRunner([
    '--prompt',
    'покажи где поменять цвет кнопки продолжить',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
    '--baseUrl',
    'https://dev.segmently.ai',
  ]);
  assert(devDryRun.authPreflight?.authEnv === 'dev', 'SHOW auth preflight must infer dev for dev.segmently.ai');
  assert(devDryRun.authPreflight?.tokenProbe?.argv?.includes('--allow-prod') === false, 'SHOW dev token probe must not require --allow-prod');
  const paywallMediaDryRun = runShowRunner([
    '--prompt',
    'покажи где добавить видео в пейвол',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
    '--baseUrl',
    'https://app.segmently.ai',
  ]);
  assert(String(paywallMediaDryRun.driverScript ?? '').includes("getByTestId('section-paywall-media')"), 'paywall media SHOW driver must target section-paywall-media');
  assert(String(paywallMediaDryRun.driverScript ?? '').includes('focused Paywall Media section'), 'paywall media SHOW driver must focus Paywall Media section');
  const envDryRun = runShowRunner([
    '--prompt',
    'покажи где поменять цвет кнопки продолжить',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
  ], {
    LIVE_SEGMENTLY_BASE_URL: 'https://env.segmently.example',
  });
  assert(envDryRun.liveBrowserReady === true, 'SHOW dry-run should accept baseUrl from live harness env');
  assert(
    envDryRun.wouldOpen?.join(' ').includes('https://env.segmently.example/login'),
    'SHOW dry-run did not use LIVE_SEGMENTLY_BASE_URL for browser open URL',
  );
  assert(dryRun.wouldRunCode?.join(' ').includes('<showDriverScript>'), 'SHOW dry-run missing run-code preview');
  assert(dryRun.wouldScreenshot?.join(' ').includes('screenshot'), 'SHOW dry-run missing screenshot argv');
  assert(String(dryRun.driverScript ?? '').includes("mode: 'show'"), 'SHOW dry-run driverScript missing show marker');
  assert(String(dryRun.screenshot?.path ?? '').includes('qa-screenshots'), 'SHOW dry-run screenshot path should default under qa-screenshots');
  assert(
    dryRun.completionClaim === 'show-not-completed-until-browser-screenshot',
    'SHOW dry-run claimed completion before browser screenshot',
  );
});

check('persona questions have text, screenshot evidence, response contracts, and DO contracts', () => {
  const guideEvidence = json('references/guide-evidence.json');
  const helpArticleReference = json('references/help-article-reference.json');
  const personaFlow = json('evals/persona-flow-evals.json');
  const actionReference = json('runtime/do-action-reference.json');
  const guidesByKey = new Map((guideEvidence.guides ?? []).map(guide => [guide.guideKey, guide]));
  const actionsById = new Map((actionReference.actions ?? []).map(action => [action.id, action]));
  const shippedImageUrls = (guideEvidence.guides ?? [])
    .flatMap(guide => guide.sections ?? [])
    .map(section => section.imageUrl)
    .filter(Boolean);
  assert(guideEvidence.policy?.articleHtmlRequired === false, 'guide evidence must not require article HTML');
  assert(guideEvidence.policy?.imageUrlPreferred === true, 'guide evidence must prefer real image URLs');
  const helpArticlesByAlias = new Map((helpArticleReference.articles ?? []).map(article => [article.alias, article]));
  for (const alias of ['help-block-media', 'help-block-paywall-media', 'help-block-action-bar']) {
    assert(String(helpArticlesByAlias.get(alias)?.publishedUrl ?? '').startsWith('https://'), `help article ${alias} missing published URL`);
  }
  assert(shippedImageUrls.length > 0, 'guide evidence should propagate authored image URLs when available');
  for (const imageUrl of shippedImageUrls) {
    assert(String(imageUrl).startsWith('https://'), `guide evidence imageUrl is not https: ${imageUrl}`);
  }
  assert(personaFlow.personas?.length === 3, 'persona flow must contain exactly three personas');
  for (const persona of personaFlow.personas) {
    assert(persona.questions?.length >= 10, `${persona.id} must have at least ten naive questions`);
    for (const question of persona.questions) {
      const guideKeys = question.guidance?.guideKeys ?? [];
      assert(guideKeys.length > 0, `${persona.id}/${question.id} missing guideKeys`);
      for (const guideKey of guideKeys) {
        const guide = guidesByKey.get(guideKey);
        assert(guide, `${persona.id}/${question.id} guide ${guideKey} missing`);
        assert(guide.hasAuthoredText, `${persona.id}/${question.id} guide ${guideKey} has no text`);
        assert(hasUsableGuideText(guide), `${persona.id}/${question.id} guide ${guideKey} has no shipped title/description text`);
        assert(guide.hasScreenshotEvidence, `${persona.id}/${question.id} guide ${guideKey} has no screenshot evidence`);
        assert(hasSectionImageEvidence(guide), `${persona.id}/${question.id} guide ${guideKey} has no section-level image evidence`);
      }
      if (question.expectedDo) {
        assert(hasExplicitActionIntent(question.text), `${persona.id}/${question.id} expectedDo lacks explicit action intent`);
        const action = actionsById.get(question.expectedDo.actionId);
        assert(action, `${persona.id}/${question.id} action ${question.expectedDo.actionId} missing`);
        assert(action.status === question.expectedDo.status, `${persona.id}/${question.id} action status drifted`);
        assert(action.mode === question.expectedDo.mode, `${persona.id}/${question.id} action mode drifted`);
        if (action.status === 'supported') {
          const plan = runRunner(question.expectedDo.sampleArgs);
          assert(plan.ok === true, `${persona.id}/${question.id} supported action did not return ok=true`);
          assert(plan.execution, `${persona.id}/${question.id} missing execution object`);
          assert(plan.verification?.read, `${persona.id}/${question.id} missing verification read`);
        } else if (action.status === 'handoff') {
          const plan = runRunnerExpectingRefusal(question.expectedDo.sampleArgs);
          assert(plan.status === 'handoff', `${persona.id}/${question.id} did not return handoff status`);
          assert(plan.verify?.command, `${persona.id}/${question.id} handoff missing verify command`);
        }
      }
      const response = runCustomerResponse(persona.id, question.id);
      assert(response.ok === true, `${persona.id}/${question.id} customer response did not return ok=true`);
      assert(response.answer?.instructions?.length > 0, `${persona.id}/${question.id} customer response missing instructions`);
      assert(
        response.answer.instructions.some(item => item.visualEvidence === true),
        `${persona.id}/${question.id} customer response missing visual evidence marker`,
      );
      for (const imageUrl of response.answer?.imageUrls ?? []) {
        assert(String(imageUrl).startsWith('https://'), `${persona.id}/${question.id} response imageUrl is not https: ${imageUrl}`);
      }
      if (question.expectedDo) {
        assert(response.mode === expectedResponseMode(question.expectedDo), `${persona.id}/${question.id} response mode drifted`);
        assert(response.action, `${persona.id}/${question.id} customer response missing action`);
        if (question.expectedDo.status === 'supported') {
          assert(response.action.execution, `${persona.id}/${question.id} response missing execution object`);
          assert(response.action.verification, `${persona.id}/${question.id} response missing verification object`);
          assert(
            response.completionClaim === 'not-completed-until-verification',
            `${persona.id}/${question.id} supported response claimed completion before verification`,
          );
        }
        if (question.expectedDo.status === 'handoff') {
          assert(response.completionClaim === 'handoff-not-done', `${persona.id}/${question.id} handoff response claimed completion`);
          assert(response.action.reason, `${persona.id}/${question.id} handoff response missing reason`);
          assert(response.action.verification, `${persona.id}/${question.id} handoff response missing verification`);
        }
      } else {
        assert(response.mode === 'teach', `${persona.id}/${question.id} non-action response should be teach`);
      }
    }
  }
});

check('raw customer prompt resolves teach, show, missing inputs, and execution contracts', () => {
  const teach = runCustomerPrompt(['--prompt', 'как настроить шрифт ячейки в списке']);
  assert(teach.ok === true, 'teach prompt did not return ok=true');
  assert(teach.source === 'prompt', 'teach prompt source must be prompt');
  assert(teach.mode === 'teach', `teach prompt mode drifted to ${teach.mode}`);
  assert(teach.answer?.instructions?.length > 0, 'teach prompt missing instructions');
  assert(
    teach.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles'),
    'teach prompt did not resolve list title style guide',
  );

  const buttonFont = runCustomerPrompt(['--prompt', 'как настроить шрифты в кнопке']);
  assert(buttonFont.ok === true, 'button font prompt did not return ok=true');
  assert(buttonFont.mode === 'teach', `button font prompt mode drifted to ${buttonFont.mode}`);
  assert(
    buttonFont.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-action-bar-primary-text-styles'),
    'button font prompt did not resolve primary text style guide',
  );
  assert(
    !buttonFont.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles'),
    'button font prompt incorrectly resolved options title guide',
  );
  const builtInReference = buttonFont.answer?.builtInArticleReferences?.find(reference => reference.articleAlias === 'help-block-action-bar');
  assert(builtInReference?.status === 'public-url-available', 'button font prompt missing published article reference status');
  assert(
    buttonFont.answer?.publicArticleLinks?.some(url => /help-block-action-bar\/index\.html$/.test(url)),
    'button font prompt missing published Action Bar article URL',
  );
  assert(
    /Built-in guide\/article references are available/.test(buttonFont.answer?.articleReferenceSummary ?? '')
      && !/no public web URL|not published|no-public-url/i.test(buttonFont.answer?.articleReferenceSummary ?? ''),
    'button font prompt missing positive built-in article summary',
  );
  const buttonFontAnswerText = JSON.stringify(buttonFont.answer ?? {});
  for (const pattern of [
    /готовой статьи[-\s]?ссылки/i,
    /нет\s+готовой\s+статьи/i,
    /no\s+ready\s+article/i,
    /no\s+article\s+(exists|link)/i,
    /explicitly\s+asks?\s+for\s+a\s+web\s+link/i,
    /only\s+if\s+(the\s+)?customer\s+asks?/i,
    /only\s+if\s+.*full\s+web\s+article/i,
  ]) {
    assert(!pattern.test(buttonFontAnswerText), `button font prompt hides built-in article reference with ${pattern}`);
  }

  const buttonFontFullArticle = runCustomerPrompt(['--prompt', 'дай полную статью как настроить шрифты в кнопке']);
  assert(buttonFontFullArticle.ok === true, 'button font full-article prompt did not return ok=true');
  assert(
    buttonFontFullArticle.mode === 'article-fetch',
    `button font full-article prompt mode drifted to ${buttonFontFullArticle.mode}`,
  );
  assert(
    buttonFontFullArticle.resolver?.kind === 'article-fetch',
    `button font full-article resolver kind drifted to ${buttonFontFullArticle.resolver?.kind}`,
  );
  assert(
    buttonFontFullArticle.articleFetch?.owningSkill === 'segmently-cli-articles',
    'button font full-article prompt did not delegate to segmently-cli-articles',
  );
  assert(
    buttonFontFullArticle.articleFetch?.mutation === false && buttonFontFullArticle.articleFetch?.readOnly === true,
    'button font full-article fetch must be read-only and non-mutating',
  );
  assert(
    buttonFontFullArticle.articleFetch?.articleAlias === 'help-block-action-bar',
    `button font full-article article alias drifted to ${buttonFontFullArticle.articleFetch?.articleAlias}`,
  );
  assert(
    buttonFontFullArticle.articleFetch?.referencePath === 'help-block-action-bar/screenedit-action-bar-primary-text-styles',
    'button font full-article prompt missing stable Action Bar reference path',
  );
  assert(
    buttonFontFullArticle.articleFetch?.fetchCommand?.resolveFirst?.match?.equals === 'help-block-action-bar',
    'button font full-article fetch must resolve articleAlias through articles list',
  );
  assert(
    buttonFontFullArticle.articleFetch?.fetchCommand?.argv?.includes('<resolvedArticleId>'),
    'button font full-article fetch command must get resolved articleId, not alias',
  );
  assert(
    buttonFontFullArticle.completionClaim === 'article-fetch-plan-not-executed',
    `button font full-article completion claim drifted to ${buttonFontFullArticle.completionClaim}`,
  );
  assert(
    buttonFontFullArticle.missingArticleClaimed === false,
    'button font full-article prompt incorrectly claimed the built-in article is missing',
  );

  for (const [label, prompt, alias, guideKey] of [
    ['list-video', 'как добавить видео к списку', 'help-block-media', 'screenedit-media-video-upload'],
    ['paywall-video', 'добавить видео в пейвол', 'help-block-paywall-media', 'screenedit-paywall-media-video'],
  ]) {
    const response = runCustomerPrompt(['--prompt', prompt]);
    assert(response.ok === true, `${label} prompt did not return ok=true`);
    assert(response.mode === 'teach', `${label} prompt mode drifted to ${response.mode}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === guideKey), `${label} prompt missing expected guide ${guideKey}`);
    assert(
      response.answer?.publicArticleLinks?.some(url => new RegExp(`${alias}/index\\.html$`).test(url)),
      `${label} prompt missing published article URL for ${alias}`,
    );
    assert(response.answer?.imageUrls?.some(url => String(url).startsWith('https://')), `${label} prompt missing concrete image URL`);
    const answerText = JSON.stringify(response.answer ?? {});
    for (const pattern of [/explicitly\s+asks?\s+for\s+a\s+web\s+link/i, /only\s+if\s+(the\s+)?customer\s+asks?/i, /only\s+if\s+.*full\s+web\s+article/i]) {
      assert(!pattern.test(answerText), `${label} prompt incorrectly makes published article URL conditional with ${pattern}`);
    }
    assert(response.answer?.showDoOptions?.show?.available === true, `${label} prompt must offer SHOW`);
    assert(response.answer?.showDoOptions?.do?.available === 'conditional', `${label} prompt must offer conditional DO boundary`);
  }
  for (const [label, prompt, actionId, alias] of [
    ['list-video-do', 'сделай видео в списке', 'browser.media.videoUpload', 'help-block-media'],
    ['paywall-video-do', 'сделай видео в пейволе', 'browser.paywallMedia.videoUpload', 'help-block-paywall-media'],
  ]) {
    const response = runCustomerPrompt(['--prompt', prompt]);
    assert(response.ok === true, `${label} prompt did not return ok=true`);
    assert(response.mode === 'do-e2e-conditional', `${label} prompt mode drifted to ${response.mode}`);
    assert(response.resolver?.kind === 'conditional-do', `${label} resolver kind drifted to ${response.resolver?.kind}`);
    assert(response.action?.actionId === actionId, `${label} action id drifted to ${response.action?.actionId}`);
    assert(response.action?.owningSkill === 'playwright-bowser', `${label} missing playwright-bowser route`);
    assert(response.action?.companionSkill === 'segmently-test-kit', `${label} missing segmently-test-kit companion`);
    assert(response.action?.supportedBoundary === 'conditional-browser-editor-upload', `${label} must mark browser upload as conditional`);
    assert(response.action?.missingInputs?.includes('videoUrl-or-local-file'), `${label} missing video source input`);
    assert(response.action?.authPreflight?.requiredForExecute === true, `${label} missing auth preflight`);
    assert(
      response.answer?.publicArticleLinks?.some(url => new RegExp(`${alias}/index\\.html$`).test(url)),
      `${label} prompt missing published article URL for ${alias}`,
    );
    assert(
      response.completionClaim === 'needs-inputs-before-execution',
      `${label} completion claim drifted to ${response.completionClaim}`,
    );
  }

  const show = runCustomerPrompt(['--prompt', 'покажи где поменять цвет кнопки продолжить']);
  assert(show.ok === true, 'show prompt did not return ok=true');
  assert(show.mode === 'show', `show prompt mode drifted to ${show.mode}`);
  assert(show.resolver?.kind === 'show', `show prompt resolver kind drifted to ${show.resolver?.kind}`);
  assert(show.action === null, 'show prompt must not attach a DO action');
  assert(show.show?.mutation === false, 'show prompt must be non-mutating');
  assert(show.show?.executeWith?.skill === 'playwright-bowser', 'show prompt missing playwright-bowser route');
  assert(show.show?.executeWith?.companionSkill === 'segmently-test-kit', 'show prompt missing segmently-test-kit companion');
  assert(
    show.show?.evidenceLevel === 'screenshot-flag' || show.show?.evidenceLevel === 'concrete-image-url',
    `show prompt evidence level drifted to ${show.show?.evidenceLevel}`,
  );
  assert(Array.isArray(show.show?.browserPlan) && show.show.browserPlan.length >= 5, 'show prompt missing browser plan');
  assert(
    show.show.browserPlan.join(' ').includes('Do not change field values'),
    'show prompt browser plan must explicitly forbid mutation',
  );
  assert(
    Array.isArray(show.show?.missingInputs) && show.show.missingInputs.includes('projectId'),
    'show prompt without ids must ask for projectId',
  );
  assert(
    show.completionClaim === 'show-needs-target-before-browser',
    'show prompt claimed live browser evidence before target inputs',
  );
  assert(
    show.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-action-bar-primary-container'),
    'show prompt did not resolve primary button container guide',
  );

  const showReady = runCustomerPrompt([
    '--prompt',
    'покажи где поменять цвет кнопки продолжить',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(showReady.ok === true, 'show-ready prompt did not return ok=true');
  assert(showReady.mode === 'show', `show-ready prompt mode drifted to ${showReady.mode}`);
  assert(showReady.show?.liveBrowserReady === true, 'show-ready prompt should be ready for browser navigation');
  assert(showReady.show?.missingInputs?.length === 0, 'show-ready prompt should not ask for more inputs');
  assert(
    showReady.completionClaim === 'show-plan-not-executed',
    'show-ready prompt claimed screenshot evidence before browser execution',
  );

  const missing = runCustomerPrompt(['--prompt', 'сделай главную кнопку желтой']);
  assert(missing.ok === true, 'missing-input prompt did not return ok=true');
  assert(missing.mode === 'do-cli', `missing-input prompt mode drifted to ${missing.mode}`);
  assert(
    missing.action?.actionId === 'editor.actionBar.primaryButton.backgroundColor',
    `missing-input prompt resolved ${missing.action?.actionId}`,
  );
  assert(
    Array.isArray(missing.action?.missingInputs) && missing.action.missingInputs.includes('projectId'),
    'missing-input prompt did not ask for projectId',
  );
  assert(
    missing.completionClaim === 'needs-inputs-before-execution',
    'missing-input prompt claimed execution before required inputs',
  );

  const executable = runCustomerPrompt([
    '--prompt',
    'сделай главную кнопку желтой',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(executable.ok === true, 'executable prompt did not return ok=true');
  assert(executable.action?.runnerOk === true, 'executable prompt runnerOk must be true');
  assert(executable.action?.execution?.kind === 'delegate-cli', 'executable prompt missing delegate-cli execution');
  assert(executable.action?.verification?.read === 'funnels export', 'executable prompt missing funnels export verification');

  const buttonTextExecutable = runCustomerPrompt([
    '--prompt',
    'сделай шрифт кнопки 20',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(buttonTextExecutable.ok === true, 'button text executable prompt did not return ok=true');
  assert(buttonTextExecutable.mode === 'do-cli', `button text executable prompt mode drifted to ${buttonTextExecutable.mode}`);
  assert(
    buttonTextExecutable.action?.actionId === 'editor.actionBar.primaryButton.textStyle.fontSize',
    `button text executable prompt resolved ${buttonTextExecutable.action?.actionId}`,
  );
  assert(buttonTextExecutable.action?.runnerOk === true, 'button text executable prompt runnerOk must be true');
  assert(buttonTextExecutable.action?.execution?.kind === 'delegate-cli', 'button text executable prompt missing delegate-cli execution');
  assert(
    buttonTextExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.actionBar.primary.content.styles.fontSize',
    'button text executable prompt patch path drifted',
  );
  assert(
    buttonTextExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === 20,
    'button text executable prompt patch value must be numeric',
  );
  assert(buttonTextExecutable.action?.verification?.read === 'funnels export', 'button text executable prompt missing export verification');

  const contentTitleExecutable = runCustomerPrompt([
    '--prompt',
    'сделай цвет заголовка экрана #333333',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(contentTitleExecutable.ok === true, 'content title executable prompt did not return ok=true');
  assert(contentTitleExecutable.mode === 'do-cli', `content title executable prompt mode drifted to ${contentTitleExecutable.mode}`);
  assert(
    contentTitleExecutable.action?.actionId === 'editor.content.title.textStyle.color',
    `content title executable prompt resolved ${contentTitleExecutable.action?.actionId}`,
  );
  assert(contentTitleExecutable.action?.runnerOk === true, 'content title executable prompt runnerOk must be true');
  assert(contentTitleExecutable.action?.execution?.kind === 'delegate-cli', 'content title executable prompt missing delegate-cli execution');
  assert(
    contentTitleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.copy.title.appearance.color',
    'content title executable prompt patch path drifted',
  );
  assert(
    contentTitleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#333333',
    'content title executable prompt patch value drifted',
  );
  assert(contentTitleExecutable.action?.verification?.read === 'funnels export', 'content title executable prompt missing export verification');

  const paywallTitleExecutable = runCustomerPrompt([
    '--prompt',
    'Сделай цвет заголовка пейволла #111111 в Segmently для project_demo, funnel_demo, version_demo, screen_demo. Это тестовый прогон: не меняй данные, покажи dry-run CLI patch, статью с подсказками и как будет проверка.',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(paywallTitleExecutable.ok === true, 'paywall title executable prompt did not return ok=true');
  assert(paywallTitleExecutable.mode === 'do-cli', `paywall title executable prompt mode drifted to ${paywallTitleExecutable.mode}`);
  assert(
    paywallTitleExecutable.action?.actionId === 'editor.paywallBody.title.textStyle.color',
    `paywall title executable prompt resolved ${paywallTitleExecutable.action?.actionId}`,
  );
  assert(paywallTitleExecutable.action?.runnerOk === true, 'paywall title executable prompt runnerOk must be true');
  assert(paywallTitleExecutable.action?.execution?.kind === 'delegate-cli', 'paywall title executable prompt missing delegate-cli execution');
  assert(
    paywallTitleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.copy.title.appearance.color',
    'paywall title executable prompt patch path drifted',
  );
  assert(
    paywallTitleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#111111',
    'paywall title executable prompt patch value drifted',
  );
  assert(paywallTitleExecutable.action?.verification?.read === 'funnels export', 'paywall title executable prompt missing export verification');
  const paywallReference = paywallTitleExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-body-title-styles',
  );
  assert(paywallReference?.articleAlias === 'help-block-paywall-body', 'paywall title executable prompt article alias drifted');
  assert(
    paywallReference?.referencePath === 'help-block-paywall-body/screenedit-paywall-body-title-styles',
    'paywall title executable prompt reference path drifted',
  );

  const paywallFooterExecutable = runCustomerPrompt([
    '--prompt',
    'Сделай фон футера пейволла #18181b в Segmently для project_demo, funnel_demo, version_demo, screen_demo. Это тестовый прогон: не меняй данные, покажи dry-run CLI patch, статью с картинками и как будет проверка.',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(paywallFooterExecutable.ok === true, 'paywall footer executable prompt did not return ok=true');
  assert(paywallFooterExecutable.mode === 'do-cli', `paywall footer executable prompt mode drifted to ${paywallFooterExecutable.mode}`);
  assert(
    paywallFooterExecutable.action?.actionId === 'editor.paywallFooter.style.backgroundColor',
    `paywall footer executable prompt resolved ${paywallFooterExecutable.action?.actionId}`,
  );
  assert(paywallFooterExecutable.action?.runnerOk === true, 'paywall footer executable prompt runnerOk must be true');
  assert(paywallFooterExecutable.action?.execution?.kind === 'delegate-cli', 'paywall footer executable prompt missing delegate-cli execution');
  assert(
    paywallFooterExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.paywall.footerAppearance.backgroundColor',
    'paywall footer executable prompt patch path drifted',
  );
  assert(
    paywallFooterExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#18181b',
    'paywall footer executable prompt patch value drifted',
  );
  assert(paywallFooterExecutable.action?.verification?.read === 'funnels export', 'paywall footer executable prompt missing export verification');
  const paywallFooterReference = paywallFooterExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-footer-background-color',
  );
  assert(paywallFooterReference?.articleAlias === 'help-block-paywall-footer', 'paywall footer executable prompt article alias drifted');
  assert(
    paywallFooterReference?.referencePath === 'help-block-paywall-footer/screenedit-paywall-footer-background-color',
    'paywall footer executable prompt reference path drifted',
  );

  const paywallMediaHeightExecutable = runCustomerPrompt([
    '--prompt',
    'Сделай высоту медиа пейволла 65 процентов в Segmently для project_demo, funnel_demo, version_demo, screen_demo. Это тестовый прогон: не меняй данные, покажи dry-run CLI patch, статью с картинками и как будет проверка.',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(paywallMediaHeightExecutable.ok === true, 'paywall media height executable prompt did not return ok=true');
  assert(paywallMediaHeightExecutable.mode === 'do-cli', `paywall media height executable prompt mode drifted to ${paywallMediaHeightExecutable.mode}`);
  assert(
    paywallMediaHeightExecutable.action?.actionId === 'editor.paywallMedia.style.heightPercentage',
    `paywall media height executable prompt resolved ${paywallMediaHeightExecutable.action?.actionId}`,
  );
  assert(paywallMediaHeightExecutable.action?.runnerOk === true, 'paywall media height executable prompt runnerOk must be true');
  assert(paywallMediaHeightExecutable.action?.execution?.kind === 'delegate-cli', 'paywall media height executable prompt missing delegate-cli execution');
  assert(
    paywallMediaHeightExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage',
    'paywall media height executable prompt patch path drifted',
  );
  assert(
    paywallMediaHeightExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === 65,
    'paywall media height executable prompt patch value drifted',
  );
  assert(paywallMediaHeightExecutable.action?.verification?.read === 'funnels export', 'paywall media height executable prompt missing export verification');
  const paywallMediaReference = paywallMediaHeightExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-media-height-percentage',
  );
  assert(paywallMediaReference?.articleAlias === 'help-block-paywall-media', 'paywall media height executable prompt article alias drifted');
  assert(
    paywallMediaReference?.referencePath === 'help-block-paywall-media/screenedit-paywall-media-height-percentage',
    'paywall media height executable prompt reference path drifted',
  );

  const optionsSubtitleExecutable = runCustomerPrompt([
    '--prompt',
    'сделай цвет подзаголовка варианта #555555',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(optionsSubtitleExecutable.ok === true, 'options subtitle executable prompt did not return ok=true');
  assert(optionsSubtitleExecutable.mode === 'do-cli', `options subtitle executable prompt mode drifted to ${optionsSubtitleExecutable.mode}`);
  assert(
    optionsSubtitleExecutable.action?.actionId === 'editor.options.itemSubtitle.textStyle.color',
    `options subtitle executable prompt resolved ${optionsSubtitleExecutable.action?.actionId}`,
  );
  assert(optionsSubtitleExecutable.action?.runnerOk === true, 'options subtitle executable prompt runnerOk must be true');
  assert(optionsSubtitleExecutable.action?.execution?.kind === 'delegate-cli', 'options subtitle executable prompt missing delegate-cli execution');
  assert(
    optionsSubtitleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.options.items.0.subtitle.appearance.color',
    'options subtitle executable prompt patch path drifted',
  );
  assert(
    optionsSubtitleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#555555',
    'options subtitle executable prompt patch value drifted',
  );
  assert(optionsSubtitleExecutable.action?.verification?.read === 'funnels export', 'options subtitle executable prompt missing export verification');

  const optionsSelectedExecutable = runCustomerPrompt([
    '--prompt',
    'сделай фон выбранного варианта #ffee00',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(optionsSelectedExecutable.ok === true, 'options selected executable prompt did not return ok=true');
  assert(optionsSelectedExecutable.mode === 'do-cli', `options selected executable prompt mode drifted to ${optionsSelectedExecutable.mode}`);
  assert(
    optionsSelectedExecutable.action?.actionId === 'editor.options.selectedItem.style.backgroundColor',
    `options selected executable prompt resolved ${optionsSelectedExecutable.action?.actionId}`,
  );
  assert(optionsSelectedExecutable.action?.runnerOk === true, 'options selected executable prompt runnerOk must be true');
  assert(optionsSelectedExecutable.action?.execution?.kind === 'delegate-cli', 'options selected executable prompt missing delegate-cli execution');
  assert(
    optionsSelectedExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.options.selectedAppearance.backgroundColor',
    'options selected executable prompt patch path drifted',
  );
  assert(
    optionsSelectedExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#ffee00',
    'options selected executable prompt patch value drifted',
  );
  assert(optionsSelectedExecutable.action?.verification?.read === 'funnels export', 'options selected executable prompt missing export verification');

  const headerBackExecutable = runCustomerPrompt([
    '--prompt',
    'сделай размер шрифта кнопки назад в шапке 13',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(headerBackExecutable.ok === true, 'header back executable prompt did not return ok=true');
  assert(headerBackExecutable.mode === 'do-cli', `header back executable prompt mode drifted to ${headerBackExecutable.mode}`);
  assert(
    headerBackExecutable.action?.actionId === 'editor.header.backButton.textStyle.fontSize',
    `header back executable prompt resolved ${headerBackExecutable.action?.actionId}`,
  );
  assert(headerBackExecutable.action?.runnerOk === true, 'header back executable prompt runnerOk must be true');
  assert(headerBackExecutable.action?.execution?.kind === 'delegate-cli', 'header back executable prompt missing delegate-cli execution');
  assert(
    headerBackExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.header.back.content.appearance.fontSize',
    'header back executable prompt patch path drifted',
  );
  assert(
    headerBackExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === 13,
    'header back executable prompt patch value must be numeric',
  );
  assert(headerBackExecutable.action?.verification?.read === 'funnels export', 'header back executable prompt missing export verification');

  const textFieldExecutable = runCustomerPrompt([
    '--prompt',
    'сделай размер шрифта поля ввода 18',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(textFieldExecutable.ok === true, 'text field executable prompt did not return ok=true');
  assert(textFieldExecutable.mode === 'do-cli', `text field executable prompt mode drifted to ${textFieldExecutable.mode}`);
  assert(
    textFieldExecutable.action?.actionId === 'editor.textField.style.fontSize',
    `text field executable prompt resolved ${textFieldExecutable.action?.actionId}`,
  );
  assert(textFieldExecutable.action?.runnerOk === true, 'text field executable prompt runnerOk must be true');
  assert(textFieldExecutable.action?.execution?.kind === 'delegate-cli', 'text field executable prompt missing delegate-cli execution');
  assert(
    textFieldExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.textField.placeholder.appearance.fontSize',
    'text field executable prompt patch path drifted',
  );
  assert(
    textFieldExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === 18,
    'text field executable prompt patch value must be numeric',
  );
  assert(textFieldExecutable.action?.verification?.read === 'funnels export', 'text field executable prompt missing export verification');

  const rollerExecutable = runCustomerPrompt([
    '--prompt',
    'сделай цвет выбранного значения в колесе #123456',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(rollerExecutable.ok === true, 'roller executable prompt did not return ok=true');
  assert(rollerExecutable.mode === 'do-cli', `roller executable prompt mode drifted to ${rollerExecutable.mode}`);
  assert(
    rollerExecutable.action?.actionId === 'editor.roller.style.labelColor',
    `roller executable prompt resolved ${rollerExecutable.action?.actionId}`,
  );
  assert(rollerExecutable.action?.runnerOk === true, 'roller executable prompt runnerOk must be true');
  assert(rollerExecutable.action?.execution?.kind === 'delegate-cli', 'roller executable prompt missing delegate-cli execution');
  assert(
    rollerExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.roller.labelAppearance.color',
    'roller executable prompt patch path drifted',
  );
  assert(
    rollerExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#123456',
    'roller executable prompt patch value drifted',
  );
  assert(rollerExecutable.action?.verification?.read === 'funnels export', 'roller executable prompt missing export verification');

  const stepperExecutable = runCustomerPrompt([
    '--prompt',
    'сделай цвет заполнения прогресса #22c55e',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(stepperExecutable.ok === true, 'stepper executable prompt did not return ok=true');
  assert(stepperExecutable.mode === 'do-cli', `stepper executable prompt mode drifted to ${stepperExecutable.mode}`);
  assert(
    stepperExecutable.action?.actionId === 'editor.stepper.style.fillColor',
    `stepper executable prompt resolved ${stepperExecutable.action?.actionId}`,
  );
  assert(stepperExecutable.action?.runnerOk === true, 'stepper executable prompt runnerOk must be true');
  assert(stepperExecutable.action?.execution?.kind === 'delegate-cli', 'stepper executable prompt missing delegate-cli execution');
  assert(
    stepperExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.stepper.appearance.fillColor',
    'stepper executable prompt patch path drifted',
  );
  assert(
    stepperExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value === '#22c55e',
    'stepper executable prompt patch value drifted',
  );
  assert(stepperExecutable.action?.verification?.read === 'funnels export', 'stepper executable prompt missing export verification');

  const flexibleSectionExecutable = runCustomerPrompt([
    '--prompt',
    'сделай фон секции flexible layout #fef3c7 для section_demo',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(flexibleSectionExecutable.ok === true, 'flexible section executable prompt did not return ok=true');
  assert(
    flexibleSectionExecutable.mode === 'do-cli',
    `flexible section executable prompt mode drifted to ${flexibleSectionExecutable.mode}`,
  );
  assert(
    flexibleSectionExecutable.action?.actionId === 'editor.flexibleSections.section.layout.backgroundColor',
    `flexible section executable prompt resolved ${flexibleSectionExecutable.action?.actionId}`,
  );
  assert(flexibleSectionExecutable.action?.runnerOk === true, 'flexible section executable prompt runnerOk must be true');
  assert(
    flexibleSectionExecutable.action?.execution?.kind === 'delegate-cli',
    'flexible section executable prompt missing delegate-cli execution',
  );
  const flexibleSectionOperation = flexibleSectionExecutable.action?.execution?.materialize?.content?.operations?.[0];
  assert(
    flexibleSectionOperation?.op === 'setFlexibleSectionLayoutField',
    `flexible section executable prompt op drifted to ${flexibleSectionOperation?.op}`,
  );
  assert(
    flexibleSectionOperation?.sectionId === 'section_demo',
    `flexible section executable prompt sectionId drifted to ${flexibleSectionOperation?.sectionId}`,
  );
  assert(
    flexibleSectionOperation?.field === 'layout.background.color',
    `flexible section executable prompt field drifted to ${flexibleSectionOperation?.field}`,
  );
  assert(
    flexibleSectionOperation?.value === '#fef3c7',
    `flexible section executable prompt value drifted to ${flexibleSectionOperation?.value}`,
  );
  assert(
    flexibleSectionExecutable.action?.verification?.read === 'funnels export',
    'flexible section executable prompt missing export verification',
  );
  const flexibleSectionReference = flexibleSectionExecutable.guidance?.builtInArticleReferences?.find(
    ref => ref.guideKey === 'screenedit-flexible-sections-background-color',
  );
  assert(
    flexibleSectionReference?.articleAlias === 'help-block-flexible-sections',
    `flexible section executable prompt article alias drifted to ${flexibleSectionReference?.articleAlias}`,
  );
  assert(
    flexibleSectionReference?.referencePath === 'help-block-flexible-sections/screenedit-flexible-sections-background-color',
    `flexible section executable prompt reference path drifted to ${flexibleSectionReference?.referencePath}`,
  );

  const e2eExecutable = runCustomerPrompt([
    '--prompt',
    'сделай шрифт ячейки в списке 18',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--baseUrl',
    'https://app.segmently.ai',
  ]);
  assert(e2eExecutable.ok === true, 'executable E2E prompt did not return ok=true');
  assert(e2eExecutable.mode === 'do-e2e', `executable E2E prompt mode drifted to ${e2eExecutable.mode}`);
  assert(e2eExecutable.action?.runnerOk === true, 'executable E2E prompt runnerOk must be true');
  assert(e2eExecutable.action?.execution?.kind === 'playwright-bowser', 'executable E2E prompt missing browser execution');
  assert(e2eExecutable.action?.verification?.read === 'funnels export', 'executable E2E prompt missing export verification');
  assert(!containsPlaceholder(e2eExecutable.action?.verification?.argv), 'executable E2E verification argv contains placeholder');
});

check('handoff path includes verify read and refusal reason', () => {
  const plan = runRunnerExpectingRefusal([
    '--action', 'handoff.stripe.connect',
    '--projectId', 'project_demo',
  ]);
  assert(plan.ok === false, 'handoff must not report ok=true');
  assert(plan.status === 'handoff', `expected handoff status, got ${plan.status}`);
  assert(plan.reason, 'handoff missing reason');
  assert(plan.verify?.command === 'stripe account', 'handoff verify read drifted');
});

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} forward-test check(s) failed`);
  process.exit(1);
}

console.log('all codex forward checks passed');

function check(id, fn) {
  try {
    fn();
    console.log(`ok - codex-forward:${id}`);
  } catch (error) {
    failures.push(`not ok - codex-forward:${id}\n  ${(error instanceof Error ? error.message : String(error))}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertToolPreflight(preflight, options = {}) {
  assert(preflight?.requiredForExecute === true, 'toolPreflight must be required before execution');
  const checks = Array.isArray(preflight.checks) ? preflight.checks : [];
  const byId = new Map(checks.map(check => [check.id, check]));
  for (const id of ['node-runtime-version', 'npm-version', 'npx-version']) {
    assert(byId.has(id), `toolPreflight missing ${id}`);
  }
  assert(byId.get('node-runtime-version')?.argv?.join(' ') === 'node --version', 'toolPreflight missing node --version check');
  assert(byId.get('npm-version')?.argv?.join(' ') === 'npm --version', 'toolPreflight missing npm --version check');
  assert(byId.get('npx-version')?.argv?.join(' ') === 'npx --version', 'toolPreflight missing npx --version check');
  for (const id of ['segmently-cli-version', 'segmently-auth-status', 'segmently-capabilities']) {
    assert(byId.has(id), `toolPreflight missing ${id}`);
  }
  assert(byId.get('segmently-cli-version')?.argv?.join(' ').includes('--version'), 'toolPreflight missing segmently --version check');
  assert(byId.get('segmently-cli-version')?.setup?.argv?.join(' ') === 'npm install -g @segmently/cli', 'toolPreflight missing Segmently CLI install command');
  assert(byId.get('segmently-auth-status')?.argv?.join(' ').includes('auth status'), 'toolPreflight missing auth status check');
  assert(byId.get('segmently-auth-status')?.setup?.argv?.join(' ').includes('auth login'), 'toolPreflight missing auth login recovery');
  assert(byId.get('segmently-capabilities')?.argv?.join(' ').includes('capabilities'), 'toolPreflight missing Segmently capabilities check');
  if (options.segmentlyEnv) {
    assert(preflight.segmentlyEnv === options.segmentlyEnv, `toolPreflight env ${preflight.segmentlyEnv}, expected ${options.segmentlyEnv}`);
  }
  if (options.browser) {
    assert(byId.has('playwright-cli-help'), 'toolPreflight missing playwright-cli help check');
    assert(byId.has('playwright-browser-availability'), 'toolPreflight missing browser availability check');
    assert(byId.get('playwright-cli-help')?.argv?.join(' ') === 'playwright-cli --help', 'toolPreflight missing playwright-cli --help check');
    assert(byId.get('playwright-cli-help')?.setup?.argv?.join(' ') === 'npm install -g @playwright/cli@latest', 'toolPreflight missing playwright-cli install command');
    assert(byId.get('playwright-browser-availability')?.argv?.join(' ').includes('install-browser'), 'toolPreflight missing playwright install-browser check');
    assert(byId.get('playwright-browser-availability')?.setup?.fallbackArgv?.join(' ').includes('npx playwright install'), 'toolPreflight missing Playwright browser fallback install');
  } else {
    assert(!byId.has('playwright-cli-help'), 'CLI-only toolPreflight should not require playwright-cli');
    assert(!byId.has('playwright-browser-availability'), 'CLI-only toolPreflight should not require browser availability');
  }
  assert(/Before live SHOW\/DO execution/.test(preflight.agentInstruction ?? ''), 'toolPreflight missing live execution agent instruction');
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function json(rel) {
  return JSON.parse(read(rel));
}

function runRunner(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function runRunnerExpectingRefusal(args) {
  const result = spawnSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  assert(result.status === 2, `expected refusal exit code 2, got ${result.status}: ${result.stderr}`);
  assert(result.stdout, 'refusal did not emit JSON');
  return JSON.parse(result.stdout);
}

function runCliRunner(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/cli-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function runCliRunnerExpectingRefusal(args) {
  const result = spawnSync('node', [join(root, 'runtime/cli-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  assert(result.status === 2, `expected CLI refusal exit code 2, got ${result.status}: ${result.stderr}`);
  assert(result.stdout, 'CLI refusal did not emit JSON');
  return JSON.parse(result.stdout);
}

function runE2eRunner(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/e2e-do-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(stdout);
}

function runE2eRunnerExpectingRefusal(args) {
  const result = spawnSync('node', [join(root, 'runtime/e2e-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  assert(result.status === 2, `expected E2E refusal exit code 2, got ${result.status}: ${result.stderr}`);
  assert(result.stdout, 'E2E refusal did not emit JSON');
  return JSON.parse(result.stdout);
}

function runShowRunner(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/show-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, SEGMENTLY_LAUNCH_CONTEXT_FILE: defaultContextFile, ...env },
  });
  return JSON.parse(stdout);
}

function runCustomerResponse(personaId, questionId) {
  const stdout = execFileSync('node', [
    join(root, 'runtime/customer-response-runner.mjs'),
    '--persona', personaId,
    '--question', questionId,
  ], {
    encoding: 'utf8',
    env: { ...process.env, SEGMENTLY_LAUNCH_CONTEXT_FILE: defaultContextFile },
  });
  return JSON.parse(stdout);
}

function runCustomerPrompt(args, env = {}) {
  const stdout = execFileSync('node', [
    join(root, 'runtime/customer-response-runner.mjs'),
    ...args,
  ], {
    encoding: 'utf8',
    env: { ...process.env, SEGMENTLY_LAUNCH_CONTEXT_FILE: defaultContextFile, ...env },
  });
  return JSON.parse(stdout);
}

function containsPlaceholder(argv) {
  return (argv ?? []).some(item => /<[^>]+>/.test(String(item)));
}

function expectedResponseMode(expectedDo) {
  if (expectedDo.status === 'handoff') return 'handoff';
  if (expectedDo.mode === 'cli') return 'do-cli';
  if (expectedDo.mode === 'e2e') return 'do-e2e';
  return expectedDo.mode;
}

function hasExplicitActionIntent(text) {
  return /(сделай|создай|подключи|поставь|опубликуй|поменяй|измени|зацикли|скругли|включи|выключи|можешь|attach|create|publish|set|connect|apply|do it|make|change|turn\s+on|turn\s+off|enable|disable)/i.test(String(text ?? ''));
}

function sampleArgsForAction(id) {
  if (id === 'launch.funnel.create') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelName', 'Demo Funnel'];
  }
  if (id === 'launch.analytics.pixel.apply') {
    return ['--action', id, '--projectId', 'project_demo', '--pixelProvider', 'facebook', '--pixelId', '1234567890'];
  }
  if (id === 'launch.paywallProducts.create') {
    return ['--action', id, '--projectId', 'project_demo', '--productName', 'Pro Monthly', '--price', '19'];
  }
  if (id === 'editor.actionBar.primaryButton.label') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--value', 'Start'];
  }
  if (id === 'editor.actionBar.primaryButton.backgroundColor') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', '#ffc201'];
  }
  if (/^editor\.actionBar\.(primary|secondary)Button\.textStyle\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextStyleAction(id)];
  }
  if (/^editor\.setting\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedGenericScalarSettingAction(id)];
  }
  if (/^editor\.header\.(backButton|skipButton)\.textStyle\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextStyleAction(id)];
  }
  if (/^editor\.options\.item(Title|Subtitle)\.textStyle\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextStyleAction(id)];
  }
  if (/^editor\.options\.(selectedItem|unselectedItem)\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedOptionsItemStateAction(id)];
  }
  if (/^editor\.content\.(title|subtitle)\.textStyle\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextStyleAction(id)];
  }
  if (/^editor\.paywallBody\.(title|subtitle)\.textStyle\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextStyleAction(id)];
  }
  if (/^editor\.paywallHeader\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedPaywallHeaderStyleAction(id)];
  }
  if (/^editor\.paywallFooter\..*\.textStyle\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextStyleAction(id)];
  }
  if (/^editor\.paywallFooter\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', '#18181b'];
  }
  if (/^editor\.paywallMedia\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedMediaStyleAction(id)];
  }
  if (/^editor\.paywallSubscriptions\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedPaywallSubscriptionsAction(id)];
  }
  if (/^editor\.textField\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedTextFieldStyleAction(id)];
  }
  if (/^editor\.media\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedMediaStyleAction(id)];
  }
  if (/^editor\.roller\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedRollerStyleAction(id)];
  }
  if (/^editor\.stepper\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedStepperStyleAction(id)];
  }
  if (/^editor\.carousel\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedCarouselStyleAction(id)];
  }
  if (/^editor\.stickyContainer\.style\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedStickyContainerStyleAction(id)];
  }
  if (/^editor\.flexibleSections\.screen\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', sampleValueForGeneratedFlexibleSectionsStyleAction(id)];
  }
  if (/^editor\.flexibleSections\.section\.layout\./.test(id)) {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--sectionId', 'section_demo', '--value', sampleValueForGeneratedFlexibleSectionsStyleAction(id)];
  }
  if (id === 'editor.screen.backgroundColor') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', '#000000'];
  }
  if (id === 'editor.paywall.attachProduct') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--productName', 'Pro Monthly'];
  }
  if (id === 'editor.list.options.itemTitle.fontSize') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--versionId', 'version_demo', '--screenId', 'screen_demo', '--value', '18'];
  }
  if (id === 'launch.publish') {
    return ['--action', id, '--projectId', 'project_demo', '--funnelId', 'funnel_demo', '--placementName', 'Default web link'];
  }
  return null;
}

function sampleValueForGeneratedTextStyleAction(id) {
  if (id.endsWith('.fontSize')) return '20';
  if (id.endsWith('.lineHeight')) return '24';
  if (id.endsWith('.fontWeight')) return '700';
  if (id.endsWith('.color')) return '#111111';
  if (id.endsWith('.backgroundColor')) return '#f4f4f5';
  if (id.endsWith('.backgroundColorOpacity')) return '80';
  if (id.endsWith('.backgroundCornerRadius')) return '8';
  if (id.endsWith('.align')) return 'center';
  if (id.endsWith('.textAlign')) return 'center';
  return 'Inter';
}

function sampleValueForGeneratedGenericScalarSettingAction(id) {
  if (/(animation-enabled|offline-first|system-permission-enabled|countdown-enabled|auto-focus|video-repeat|media-repeat)/.test(id)) return 'true';
  if (/(color|background|border-color|text-color)/.test(id)) return '#111111';
  if (/(terms-uri|privacy-uri|uri|url|link)/.test(id)) return 'https://example.com';
  if (/scale-mode/.test(id)) return 'scaleAspectFill';
  if (/top-alignment/.test(id)) return 'top';
  if (/bottom-alignment/.test(id)) return 'contentBottom';
  if (/permission-type/.test(id)) return 'notifications';
  if (/countdown-unit/.test(id)) return 'seconds';
  if (/field-type/.test(id)) return 'text';
  if (/keyboard-type/.test(id)) return 'default';
  if (/border-type/.test(id)) return 'box';
  if (/elements-order/.test(id)) return 'purchase,terms,privacy';
  if (/(duration|font-size|font-weight|line-height|width|height|percentage|radius|opacity|border-width|delay|z-index|flex-grow|flex-shrink)/.test(id)) return '16';
  return 'value';
}

function sampleValueForGeneratedPaywallHeaderStyleAction(id) {
  if (id.endsWith('.iconColor')) return '#ffffff';
  if (id.endsWith('.alignment')) return 'end';
  if (id.endsWith('.visibility')) return 'delayedVisible';
  if (id.endsWith('.delaySeconds')) return '5';
  return sampleValueForGeneratedTextStyleAction(id);
}

function sampleValueForGeneratedOptionsItemStateAction(id) {
  if (id.endsWith('.backgroundColor')) return '#f4f4f5';
  if (id.endsWith('.borderColor')) return '#ffc201';
  if (id.endsWith('.borderWidth')) return '2';
  if (id.endsWith('.cornerRadius')) return '12';
  return 'value';
}

function sampleValueForGeneratedTextFieldStyleAction(id) {
  if (id.endsWith('.fontSize')) return '18';
  if (id.endsWith('.fontWeight')) return '400';
  if (id.endsWith('.lineHeight')) return '22';
  if (id.endsWith('.typedTextColor')) return '#111111';
  if (id.endsWith('.placeholderColor')) return '#999999';
  if (id.endsWith('.fieldBackgroundColor')) return '#ffffff';
  if (id.endsWith('.borderColor')) return '#d4d4d8';
  if (id.endsWith('.borderWidth')) return '1';
  if (id.endsWith('.borderType')) return 'box';
  if (id.endsWith('.align')) return 'left';
  return 'Inter';
}

function sampleValueForGeneratedMediaStyleAction(id) {
  if (id.endsWith('.heightPercentage')) return '65';
  if (id.endsWith('.cornerRadius')) return '14';
  if (id.endsWith('.repeat')) return 'true';
  if (id.endsWith('.topAlignment')) return 'top';
  if (id.endsWith('.bottomAlignment')) return 'contentBottom';
  if (id.endsWith('.scaleMode')) return 'scaleAspectFill';
  return 'value';
}

function sampleValueForGeneratedPaywallSubscriptionsAction(id) {
  if (id.endsWith('.viewKind')) return 'Vertical';
  if (id.endsWith('.productLayout')) return 'CheckboxLabels';
  if (id.endsWith('.startColumnWidthPercentage')) return '65';
  if (id.endsWith('.fontSize')) return '22';
  if (id.endsWith('.lineHeight')) return '26';
  if (id.endsWith('.fontWeight')) return '700';
  if (id.endsWith('.align')) return 'center';
  if (id.endsWith('.backgroundColorOpacity')) return '80';
  if (id.endsWith('.backgroundCornerRadius')) return '8';
  if (id.endsWith('.backgroundColor')) return '#f4f4f5';
  if (id.endsWith('.borderColor')) return '#ffc201';
  if (id.endsWith('.borderWidth')) return '2';
  if (id.endsWith('.cornerRadius')) return '12';
  if (id.endsWith('.checkedColor')) return '#22c55e';
  if (id.endsWith('.uncheckedColor')) return '#a1a1aa';
  if (id.endsWith('.color')) return '#111111';
  if (/^editor\.paywallSubscriptions\.(itemPadding|listPadding)\./.test(id)) return '12';
  return 'value';
}

function sampleValueForGeneratedRollerStyleAction(id) {
  if (id.endsWith('.labelFontSize')) return '22';
  if (id.endsWith('.labelFontWeight')) return '700';
  if (id.endsWith('.labelColor')) return '#123456';
  if (id.endsWith('.labelAlign')) return 'center';
  if (id.endsWith('.containerBackgroundColor')) return '#f4f4f4';
  if (id.endsWith('.containerBorderWidth')) return '2';
  if (id.endsWith('.containerBorderColor')) return '#222222';
  if (id.endsWith('.containerCornerRadius')) return '12';
  return '#123456';
}

function sampleValueForGeneratedStepperStyleAction(id) {
  if (id.endsWith('.timerDuration')) return '8';
  if (id.endsWith('.trackColor')) return '#e5e7eb';
  if (id.endsWith('.fillColor')) return '#22c55e';
  if (id.endsWith('.thickness')) return '6';
  if (id.endsWith('.trackThickness')) return '4';
  if (id.endsWith('.containerHeightPercentage')) return '55';
  if (id.endsWith('.fontSize')) return '18';
  if (id.endsWith('.fontWeight')) return '700';
  if (id.endsWith('.color')) return '#123456';
  if (id.endsWith('.align')) return 'center';
  if (id.endsWith('.lineHeight')) return '22';
  if (id.endsWith('.backgroundColor')) return '#f4f4f4';
  if (id.endsWith('.backgroundColorOpacity')) return '80';
  if (id.endsWith('.backgroundCornerRadius')) return '8';
  if (id.endsWith('.width')) return '320';
  if (id.endsWith('.height')) return '180';
  if (id.endsWith('.scaleMode')) return 'scaleAspectFill';
  if (id.endsWith('.cornerRadius')) return '12';
  return '#123456';
}

function sampleValueForGeneratedCarouselStyleAction(id) {
  if (id.endsWith('.fontSize')) return '18';
  if (id.endsWith('.fontWeight')) return '700';
  if (id.endsWith('.color')) return '#123456';
  if (id.endsWith('.align')) return 'center';
  if (id.endsWith('.lineHeight')) return '22';
  if (id.endsWith('.backgroundColor')) return '#f4f4f4';
  if (id.endsWith('.backgroundColorOpacity')) return '80';
  if (id.endsWith('.backgroundCornerRadius')) return '8';
  if (id.endsWith('.width')) return '320';
  if (id.endsWith('.height')) return '180';
  if (id.endsWith('.scaleMode')) return 'scaleAspectFill';
  if (id.endsWith('.cornerRadius')) return '12';
  if (id.endsWith('.verticalAlign')) return 'center';
  if (id.endsWith('.heightMode')) return 'percent';
  if (id.endsWith('.heightValue')) return '60';
  return '#123456';
}

function sampleValueForGeneratedStickyContainerStyleAction(id) {
  if (id.endsWith('.showBackground')) return 'true';
  if (id.endsWith('.backgroundColor')) return '#fef3c7';
  if (id.endsWith('.opacity')) return '0.85';
  if (id.endsWith('.cornerRadius')) return '18';
  if (id.endsWith('.borderWidth')) return '2';
  if (id.endsWith('.borderColor')) return '#f59e0b';
  return '#fef3c7';
}

function sampleValueForGeneratedFlexibleSectionsStyleAction(id) {
  if (id.endsWith('.screenScrollable') || id.endsWith('.sectionScrollable')) return 'true';
  if (id.endsWith('.heightMode')) return 'fixed';
  if (id.endsWith('.heightValue')) return '240';
  if (id.endsWith('.flexGrow') || id.endsWith('.flexShrink')) return '1';
  if (id.endsWith('.zIndex')) return '10';
  if (id.endsWith('.backgroundColor')) return '#fef3c7';
  if (id.endsWith('.cornerRadius')) return '16';
  if (id.endsWith('.borderWidth')) return '2';
  if (id.endsWith('.borderColor')) return '#f59e0b';
  if (id.endsWith('.verticalAlign') || id.endsWith('.horizontalAlign')) return 'center';
  return '#fef3c7';
}

function projectionFiles() {
  const out = [join(root, 'SKILL.md')];
  for (const relDir of ['references', 'runtime']) {
    const dir = join(root, relDir);
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isFile() && !entry.endsWith('.mjs')) out.push(full);
    }
  }
  return out;
}

function runIsolatedCopy() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'segmently-codex-forward-'));
  const tempSkillsRoot = join(tempRoot, 'skills');
  const sourceSkillsRoot = dirname(root);
  const launchDest = join(tempSkillsRoot, 'segmently-launch-guide');
  try {
    cpSync(root, launchDest, { recursive: true, filter: copyFilter });
    for (const skillName of companionSkills) {
      const source = join(sourceSkillsRoot, skillName);
      const dest = join(tempSkillsRoot, skillName);
      if (!existsSync(join(source, 'SKILL.md'))) {
        throw new Error(`cannot isolate: missing companion skill ${skillName} at ${source}`);
      }
      cpSync(source, dest, { recursive: true, filter: copyFilter });
    }
    const stdout = execFileSync('node', [join(launchDest, 'scripts/run-codex-forward-test.mjs')], {
      encoding: 'utf8',
      cwd: tempRoot,
      env: { ...process.env, SEGMENTLY_FORWARD_ISOLATED: '1' },
    });
    console.log(`ok - codex-forward:isolated generated skills copied to ${tempRoot}`);
    process.stdout.write(stdout);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function copyFilter(src) {
  const normalized = src.replaceAll('\\', '/');
  const parts = normalized.split('/');
  return !parts.some(part =>
    part === '.git'
    || part === 'node_modules'
    || part === '.playwright-cli'
    || part === 'test-results'
    || part === 'screenshots'
    || part === 'qa-screenshots',
  );
}

function hasUsableGuideText(guide) {
  return (guide.sections ?? []).some(section =>
    String(section.title ?? '').trim().length >= 3
    || String(section.description ?? '').trim().length >= 20,
  );
}

function hasSectionImageEvidence(guide) {
  return (guide.sections ?? []).some(section => section.hasScreenshotEvidence === true)
    || guide.screenshotSectionCount > 0;
}
