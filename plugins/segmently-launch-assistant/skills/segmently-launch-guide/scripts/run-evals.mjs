#!/usr/bin/env node
/**
 * Eval runner for segmently-launch-guide.
 *
 * Thirteen gates, all must pass:
 *  1. Corpus evals (evals/evals.json) — substring mustContain / mustNotContain,
 *     same harness convention as segmently-cli-guide.
 *  2. Meta-guard — every customer scenario in references/scenarios.matrix.json
 *     MUST carry sampleQueries (ru+en), a backend, a verify (unless handoff/teach),
 *     and an evals list including 'routing' and 'no-leak'. No scenario ships
 *     without evals.
 *  3. Leak-guard — scan ALL shipped files for operational leaks (internal/admin
 *     skills, internal CLI flags, non-prod env flags, source-tree markers).
 *     Plugins are plaintext, so the file set is the trust boundary.
 *  4. Teach-reference guard — the shipped field-level help corpus exists and can
 *     answer the customer-surface probe without reading project source.
 *  5. DO-action guard — the shipped action registry exists, covers CLI + E2E,
 *     and only represents editor writes as supported when they have an execution
 *     and verification contract.
 *  6. Codex dispatch guard — each shipped supported DO action returns a concrete
 *     execution + verification contract through editor-do-runner.mjs.
 *  7. CLI DO runner guard — shipped CLI actions can produce a dry-run execution
 *     package with materialized JSON and verification, while non-CLI actions are
 *     refused by the CLI runner.
 *  8. E2E DO runner guard — shipped E2E actions can produce a dry-run browser
 *     execution package with driverScript and verification, while non-E2E
 *     actions are refused by the E2E runner.
 *  9. SHOW runner guard — shipped SHOW prompts can produce a read-only
 *     browser/screenshot execution package without mutating customer data.
 * 10. Coverage audit guard — the shipped artifacts can report exactly where
 *     text, article links, screenshot evidence, and concrete image URLs exist,
 *     and screen-editor setting questions are fully covered by article text.
 * 11. Persona flow guard — three novice personas ask imprecise end-to-end launch
 *     questions; each question must have shipped text guidance, screenshot-backed
 *     evidence, a customer-facing response contract, and a DO/handoff contract
 *     where the question asks the agent to act.
 * 12. Raw customer prompt guard — free-form customer prompts resolve to
 *     TEACH/SHOW/missing-input/DO contracts without source-tree access.
 * 13. Customer-surface acceptance guard — representative raw novice prompts
 *     prove source-safe TEACH/SHOW/CLI DO/E2E DO answers and packaged runners.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_TOKENS } from './forbidden-tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const requiredCodexRuntimeSkills = Object.freeze([
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
const internalOnlySkillNames = Object.freeze([
  'support-flow-author',
  'cli-admin-guide',
  'deployweblocal',
  'worktree-local-dev',
  'plugin-creator',
]);
const skillMarkdown = read('SKILL.md');
const matrixRaw = read('references/scenarios.matrix.json');
const teachReferenceRaw = read('references/teach-reference.json');
const guideEvidenceRaw = read('references/guide-evidence.json');
const helpArticleReferenceRaw = read('references/help-article-reference.json');
const doActionReferenceRaw = read('runtime/do-action-reference.json');
const personaFlowRaw = read('evals/persona-flow-evals.json');

const corpus = {
  skill: skillMarkdown,
  description: extractDescription(skillMarkdown),
  scenarios: read('references/scenarios.md'),
  backends: read('references/backends.md'),
  status: read('references/project-status.md'),
  teach: read('references/teach.md'),
  teachReference: teachReferenceRaw,
  guideEvidence: guideEvidenceRaw,
  helpArticleReference: helpArticleReferenceRaw,
  doActionReference: doActionReferenceRaw,
  personaFlow: personaFlowRaw,
  matrix: matrixRaw,
};
corpus.all = Object.values(corpus).join('\n');

let failures = 0;

// ---- Gate 1: corpus evals -------------------------------------------------
const evals = JSON.parse(read('evals/evals.json'));
for (const item of evals.evals) {
  const failed = [];
  for (const assertion of item.assertions) {
    const source = corpus[assertion.corpus || 'all'];
    if (source === undefined) {
      failed.push(`${assertion.name}: unknown corpus ${assertion.corpus}`);
      continue;
    }
    const lower = source.toLowerCase();
    const missing = (assertion.mustContain || []).filter((n) => !lower.includes(String(n).toLowerCase()));
    const forbidden = (assertion.mustNotContain || []).filter((n) => lower.includes(String(n).toLowerCase()));
    if (missing.length) failed.push(`${assertion.name}: missing ${missing.map((e) => JSON.stringify(e)).join(', ')}`);
    if (forbidden.length) failed.push(`${assertion.name}: forbidden ${forbidden.map((e) => JSON.stringify(e)).join(', ')}`);
  }
  report(item.id, failed);
}

// ---- Gate 2: meta-guard over the scenario matrix --------------------------
const matrix = JSON.parse(matrixRaw);
const metaFailures = [];
for (const scenario of matrix.scenarios) {
  if (scenario.audience !== 'customer') continue;
  const id = scenario.id || '(unnamed)';
  const ru = scenario.sampleQueries?.ru ?? [];
  const en = scenario.sampleQueries?.en ?? [];
  if (!ru.length) metaFailures.push(`${id}: no Russian sampleQueries`);
  if (!en.length) metaFailures.push(`${id}: no English sampleQueries`);
  if (!scenario.backend) metaFailures.push(`${id}: no backend`);
  const isHandoffOrTeach = scenario.backend === 'handoff' || scenario.backend === 'teach';
  if (!scenario.verify && !isHandoffOrTeach) metaFailures.push(`${id}: no verify (and not handoff/teach)`);
  const evalsList = scenario.evals ?? [];
  if (!evalsList.includes('routing')) metaFailures.push(`${id}: missing 'routing' eval`);
  if (!evalsList.includes('no-leak')) metaFailures.push(`${id}: missing 'no-leak' eval`);
}
report('meta-guard:every-customer-scenario-has-queries-and-evals', metaFailures);

// ---- Gate 3: leak-guard over all shipped files ----------------------------
// Forbidden-token vocabulary is shared with the sync codegen (see
// scripts/forbidden-tokens.mjs) so the two gates can never diverge.
const FORBIDDEN = FORBIDDEN_TOKENS;
// Scan the CUSTOMER-FACING projection only — SKILL.md + references/. The CI
// tooling (scripts/, evals/) legitimately lists the forbidden tokens as guard
// data and is never surfaced to a customer, so it is excluded by design.
const leakFailures = [];
for (const file of listProjectionFiles(root)) {
  const text = readFileSync(file, 'utf8');
  for (const token of FORBIDDEN) {
    if (text.includes(token)) {
      leakFailures.push(`${relative(root, file)} contains forbidden token ${JSON.stringify(token)}`);
    }
  }
}
report('leak-guard:no-internal-tokens-in-customer-projection', leakFailures);

const internalSkillLeakFailures = [];
for (const file of listProjectionFiles(root)) {
  const text = readFileSync(file, 'utf8');
  for (const skillName of internalOnlySkillNames) {
    if (text.includes(skillName)) {
      internalSkillLeakFailures.push(`${relative(root, file)} references internal-only skill ${skillName}`);
    }
  }
}
report('codex-no-internal-skill-leak:customer-projection-uses-only-customer-skills', internalSkillLeakFailures);

// ---- Gate 3b: Codex runtime dependencies ----------------------------------
const dependencyFailures = [];
for (const skillName of requiredCodexRuntimeSkills) {
  if (!findInstalledSkill(skillName)) {
    dependencyFailures.push(`${skillName}: missing from sibling skills, repo .agents/skills, or CODEX_HOME skills`);
  }
}
for (const skillName of requiredCodexRuntimeSkills) {
  if (!skillMarkdown.includes(skillName)) {
    dependencyFailures.push(`${skillName}: missing from SKILL.md Required companion skills section`);
  }
}
report('codex-skill-dependencies:runtime-companions-present', dependencyFailures);

// ---- Gate 4: field-level teach corpus -------------------------------------
const teachReference = JSON.parse(teachReferenceRaw);
const teachFailures = [];
if (teachReference.schemaVersion !== 1) teachFailures.push('teach-reference schemaVersion must be 1');
if (!Array.isArray(teachReference.screens) || teachReference.screens.length === 0) {
  teachFailures.push('teach-reference has no screens');
}
if (!teachReference.blocksByAlias || typeof teachReference.blocksByAlias !== 'object') {
  teachFailures.push('teach-reference has no blocksByAlias map');
}
const probe = teachReference.fieldQuestionProbes?.find((item) => item.query === 'как настроить шрифт ячейки в списке');
if (!probe) {
  teachFailures.push('missing field-level probe for "как настроить шрифт ячейки в списке"');
} else {
  const expected = [
    probe.expected?.screenType,
    probe.expected?.block,
    probe.expected?.articleAlias,
    probe.expected?.field,
    probe.expected?.leaf,
  ].filter(Boolean).join(' ').toLowerCase();
  for (const needle of ['list', 'options', 'font', 'help-options']) {
    if (!expected.includes(needle)) teachFailures.push(`field-level probe does not resolve to ${needle}`);
  }
}
report('teach-reference:field-level-help-is-self-contained', teachFailures);

// ---- Gate 5: DO action registry ------------------------------------------
const doActionReference = JSON.parse(doActionReferenceRaw);
const doActionFailures = [];
if (doActionReference.schemaVersion !== 1) doActionFailures.push('do-action-reference schemaVersion must be 1');
if (!Array.isArray(doActionReference.actions) || doActionReference.actions.length === 0) {
  doActionFailures.push('do-action-reference has no actions');
}
const actionIds = new Set((doActionReference.actions ?? []).map((action) => action.id));
for (const id of [
  'launch.funnel.create',
  'editor.actionBar.primaryButton.label',
  'editor.actionBar.primaryButton.backgroundColor',
  'editor.actionBar.primaryButton.textStyle.fontSize',
  'editor.actionBar.primaryButton.textStyle.fontFamily',
  'editor.actionBar.primaryButton.textStyle.color',
  'editor.actionBar.secondaryButton.textStyle.fontSize',
  'editor.header.backButton.textStyle.fontSize',
  'editor.header.backButton.textStyle.color',
  'editor.header.skipButton.textStyle.fontSize',
  'editor.header.skipButton.textStyle.color',
  'editor.options.itemTitle.textStyle.fontSize',
  'editor.options.itemTitle.textStyle.color',
  'editor.options.itemTitle.textStyle.backgroundColor',
  'editor.options.itemSubtitle.textStyle.fontSize',
  'editor.options.itemSubtitle.textStyle.color',
  'editor.options.itemSubtitle.textStyle.backgroundColor',
  'editor.content.title.textStyle.fontSize',
  'editor.content.title.textStyle.color',
  'editor.content.subtitle.textStyle.fontSize',
  'editor.paywallBody.title.textStyle.color',
  'editor.paywallBody.subtitle.textStyle.fontSize',
  'editor.paywallHeader.closeButton.style.iconColor',
  'editor.paywallHeader.closeButton.style.delaySeconds',
  'editor.paywallHeader.restoreLink.style.fontSize',
  'editor.paywallHeader.restoreLink.style.color',
  'editor.paywallMedia.style.heightPercentage',
  'editor.paywallMedia.style.cornerRadius',
  'editor.paywallMedia.style.bottomAlignment',
  'editor.paywallSubscriptions.layout.viewKind',
  'editor.paywallSubscriptions.layout.productLayout',
  'editor.paywallSubscriptions.layout.startColumnWidthPercentage',
  'editor.paywallSubscriptions.selectedItem.style.backgroundColor',
  'editor.paywallSubscriptions.unselectedItem.style.borderColor',
  'editor.paywallSubscriptions.itemPadding.top',
  'editor.paywallSubscriptions.listPadding.bottom',
  'editor.paywallSubscriptions.planName.textStyle.fontSize',
  'editor.paywallSubscriptions.planNote.textStyle.color',
  'editor.paywallSubscriptions.price.textStyle.fontSize',
  'editor.paywallSubscriptions.billingPeriod.textStyle.color',
  'editor.paywallSubscriptions.checkbox.style.checkedColor',
  'editor.textField.style.fontSize',
  'editor.textField.style.typedTextColor',
  'editor.textField.style.placeholderColor',
  'editor.roller.style.labelColor',
  'editor.roller.style.containerCornerRadius',
  'editor.screen.backgroundColor',
  'editor.paywall.attachProduct',
  'editor.list.options.itemTitle.fontSize',
]) {
  if (!actionIds.has(id)) doActionFailures.push(`missing action ${id}`);
}
const primaryButtonFontSizeAction = doActionReference.actions?.find(
  action => action.id === 'editor.actionBar.primaryButton.textStyle.fontSize',
);
if (primaryButtonFontSizeAction?.cliPatch?.path !== 'content.actionBar.primary.content.styles.fontSize') {
  doActionFailures.push('primary button font-size action patch path drifted');
}
if (primaryButtonFontSizeAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('primary button font-size action must declare numeric cliPatch.valueType');
}
const headerBackFontSizeAction = doActionReference.actions?.find(
  action => action.id === 'editor.header.backButton.textStyle.fontSize',
);
if (headerBackFontSizeAction?.cliPatch?.path !== 'content.header.back.content.appearance.fontSize') {
  doActionFailures.push('header back button font-size action patch path drifted');
}
if (headerBackFontSizeAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('header back button font-size action must declare numeric cliPatch.valueType');
}
const optionsTitleColorAction = doActionReference.actions?.find(
  action => action.id === 'editor.options.itemTitle.textStyle.color',
);
if (optionsTitleColorAction?.cliPatch?.path !== 'content.options.items.0.title.appearance.color') {
  doActionFailures.push('options title color action patch path drifted');
}
const optionsSubtitleColorAction = doActionReference.actions?.find(
  action => action.id === 'editor.options.itemSubtitle.textStyle.color',
);
if (optionsSubtitleColorAction?.cliPatch?.path !== 'content.options.items.0.subtitle.appearance.color') {
  doActionFailures.push('options subtitle color action patch path drifted');
}
const contentTitleColorAction = doActionReference.actions?.find(
  action => action.id === 'editor.content.title.textStyle.color',
);
if (contentTitleColorAction?.cliPatch?.path !== 'content.copy.title.appearance.color') {
  doActionFailures.push('content title color action patch path drifted');
}
const paywallTitleColorAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallBody.title.textStyle.color',
);
if (paywallTitleColorAction?.cliPatch?.path !== 'content.copy.title.appearance.color') {
  doActionFailures.push('paywall title color action patch path drifted');
}
if (paywallTitleColorAction?.teachFallback?.articleAlias !== 'screenedit-paywall-body-title-styles') {
  doActionFailures.push('paywall title color action teach fallback guide alias drifted');
}
const textFieldFontSizeAction = doActionReference.actions?.find(
  action => action.id === 'editor.textField.style.fontSize',
);
if (textFieldFontSizeAction?.cliPatch?.path !== 'content.textField.placeholder.appearance.fontSize') {
  doActionFailures.push('text field font-size action patch path drifted');
}
if (textFieldFontSizeAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('text field font-size action must declare numeric cliPatch.valueType');
}
const mediaHeightAction = doActionReference.actions?.find(
  action => action.id === 'editor.media.style.heightPercentage',
);
if (mediaHeightAction?.cliPatch?.path !== 'content.featuredMedia.appearance.dimensions.heightPercentage') {
  doActionFailures.push('media height action patch path drifted');
}
if (mediaHeightAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('media height action must declare numeric cliPatch.valueType');
}
const mediaRepeatAction = doActionReference.actions?.find(
  action => action.id === 'editor.media.style.repeat',
);
if (mediaRepeatAction?.cliPatch?.path !== 'content.featuredMedia.appearance.repeat') {
  doActionFailures.push('media repeat action patch path drifted');
}
if (mediaRepeatAction?.cliPatch?.valueType !== 'boolean') {
  doActionFailures.push('media repeat action must declare boolean cliPatch.valueType');
}
const paywallMediaHeightAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallMedia.style.heightPercentage',
);
if (paywallMediaHeightAction?.cliPatch?.path !== 'content.featuredMedia.appearance.dimensions.heightPercentage') {
  doActionFailures.push('paywall media height action patch path drifted');
}
if (paywallMediaHeightAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('paywall media height action must declare numeric cliPatch.valueType');
}
if (paywallMediaHeightAction?.teachFallback?.articleAlias !== 'help-block-paywall-media') {
  doActionFailures.push('paywall media height action teach fallback article alias drifted');
}
const paywallMediaBottomAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallMedia.style.bottomAlignment',
);
if (paywallMediaBottomAction?.cliPatch?.path !== 'content.featuredMedia.appearance.bottomAlignment') {
  doActionFailures.push('paywall media bottom alignment action patch path drifted');
}
const paywallHeaderRestoreFontSizeAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallHeader.restoreLink.style.fontSize',
);
if (paywallHeaderRestoreFontSizeAction?.cliPatch?.path !== 'content.paywall.restoreLabel.appearance.fontSize') {
  doActionFailures.push('paywall header restore font-size action patch path drifted');
}
if (paywallHeaderRestoreFontSizeAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('paywall header restore font-size action must declare numeric cliPatch.valueType');
}
if (paywallHeaderRestoreFontSizeAction?.teachFallback?.articleAlias !== 'help-block-paywall-header') {
  doActionFailures.push('paywall header restore font-size action teach fallback article alias drifted');
}
const paywallSubscriptionsViewKindAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallSubscriptions.layout.viewKind',
);
if (paywallSubscriptionsViewKindAction?.cliPatch?.path !== 'content.paywall.products.viewKind') {
  doActionFailures.push('paywall subscriptions view-kind action patch path drifted');
}
if (paywallSubscriptionsViewKindAction?.teachFallback?.articleAlias !== 'help-block-paywall-subscriptions') {
  doActionFailures.push('paywall subscriptions view-kind action teach fallback article alias drifted');
}
const paywallSubscriptionsPriceFontSizeAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallSubscriptions.price.textStyle.fontSize',
);
if (paywallSubscriptionsPriceFontSizeAction?.cliPatch?.path !== 'content.paywall.products.items.0.topEndLabel.appearance.fontSize') {
  doActionFailures.push('paywall subscriptions price font-size action patch path drifted');
}
if (paywallSubscriptionsPriceFontSizeAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('paywall subscriptions price font-size action must declare numeric cliPatch.valueType');
}
const paywallSubscriptionsSelectedBackgroundAction = doActionReference.actions?.find(
  action => action.id === 'editor.paywallSubscriptions.selectedItem.style.backgroundColor',
);
if (paywallSubscriptionsSelectedBackgroundAction?.cliPatch?.path !== 'content.paywall.products.selectedAppearance.backgroundColor') {
  doActionFailures.push('paywall subscriptions selected-card background action patch path drifted');
}
const rollerLabelColorAction = doActionReference.actions?.find(
  action => action.id === 'editor.roller.style.labelColor',
);
if (rollerLabelColorAction?.cliPatch?.path !== 'content.roller.labelAppearance.color') {
  doActionFailures.push('roller label color action patch path drifted');
}
if (rollerLabelColorAction?.cliPatch?.valueType !== 'string') {
  doActionFailures.push('roller label color action must declare string cliPatch.valueType');
}
const rollerCornerRadiusAction = doActionReference.actions?.find(
  action => action.id === 'editor.roller.style.containerCornerRadius',
);
if (rollerCornerRadiusAction?.cliPatch?.path !== 'content.roller.appearance.borders.radius.uniform') {
  doActionFailures.push('roller corner radius action patch path drifted');
}
if (rollerCornerRadiusAction?.cliPatch?.valueType !== 'number') {
  doActionFailures.push('roller corner radius action must declare numeric cliPatch.valueType');
}
if (!doActionReference.actions?.some((action) => action.mode === 'cli' && action.status === 'supported' && action.owningSkill)) {
  doActionFailures.push('missing supported CLI action with owningSkill');
}
if (!doActionReference.actions?.some((action) => action.mode === 'e2e' && action.status === 'supported' && action.runner)) {
  doActionFailures.push('missing supported E2E action with runner');
}
for (const needle of ['playwright-bowser', 'segmently-test-kit', 'editor-do-runner.mjs']) {
  if (!doActionReferenceRaw.includes(needle)) doActionFailures.push(`do-action-reference missing ${needle}`);
}
if (!skillMarkdown.includes('runtime/cli-do-runner.mjs')) {
  doActionFailures.push('SKILL.md missing runtime/cli-do-runner.mjs execution path');
}
if (!existsSync(join(root, 'runtime/cli-do-runner.mjs'))) {
  doActionFailures.push('missing runtime/cli-do-runner.mjs');
}
if (!skillMarkdown.includes('runtime/e2e-do-runner.mjs')) {
  doActionFailures.push('SKILL.md missing runtime/e2e-do-runner.mjs execution path');
}
if (!existsSync(join(root, 'runtime/e2e-do-runner.mjs'))) {
  doActionFailures.push('missing runtime/e2e-do-runner.mjs');
}
try {
  const cliPlan = runRunner(sampleArgsForAction('launch.funnel.create'));
  if (cliPlan.execution?.kind !== 'delegate-cli') doActionFailures.push('CLI runner output missing delegate-cli execution object');
  if (cliPlan.verification?.read !== 'funnels list') doActionFailures.push('CLI runner output missing funnels list verification object');
  const e2ePlan = runRunner(sampleArgsForAction('editor.actionBar.primaryButton.label'));
  if (e2ePlan.execution?.kind !== 'playwright-bowser') doActionFailures.push('E2E runner output missing playwright-bowser execution object');
  if (!String(e2ePlan.execution?.runCodeCommand ?? '').includes('run-code')) doActionFailures.push('E2E runner output missing run-code command');
  if (e2ePlan.verification?.read !== 'funnels export') doActionFailures.push('E2E runner output missing funnels export verification object');
} catch (error) {
  doActionFailures.push(`runner execution contract probe failed: ${error instanceof Error ? error.message : String(error)}`);
}
report('do-action-reference:cli-e2e-and-unsupported-actions-present', doActionFailures);

const dispatchFailures = [];
for (const action of doActionReference.actions ?? []) {
  if (action.status !== 'supported') continue;
  const args = sampleArgsForAction(action.id);
  if (!args) {
    dispatchFailures.push(`${action.id}: missing eval sample inputs`);
    continue;
  }
  let plan;
  try {
    plan = runRunner(args);
  } catch (error) {
    dispatchFailures.push(`${action.id}: runner failed: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (plan.ok !== true) dispatchFailures.push(`${action.id}: runner did not return ok=true`);
  if (plan.actionId !== action.id) dispatchFailures.push(`${action.id}: runner returned actionId ${plan.actionId}`);
  if (plan.executeWith?.skill !== action.owningSkill) {
    dispatchFailures.push(`${action.id}: executeWith.skill mismatch (${plan.executeWith?.skill ?? 'missing'})`);
  }
  if (!plan.execution || typeof plan.execution !== 'object') {
    dispatchFailures.push(`${action.id}: missing execution object`);
  }
  if (!plan.verification || typeof plan.verification !== 'object') {
    dispatchFailures.push(`${action.id}: missing verification object`);
  }
  if (action.mode === 'cli') {
    if (plan.execution?.kind !== 'delegate-cli') dispatchFailures.push(`${action.id}: CLI action must return delegate-cli execution`);
    if (!plan.execution?.owningSkill) dispatchFailures.push(`${action.id}: CLI execution missing owningSkill`);
    if (!Array.isArray(plan.execution?.argvTemplate)) dispatchFailures.push(`${action.id}: CLI execution missing argvTemplate`);
  }
  if (action.mode === 'e2e') {
    if (plan.execution?.kind !== 'playwright-bowser') dispatchFailures.push(`${action.id}: E2E action must return playwright-bowser execution`);
    if (!String(plan.execution?.runCodeCommand ?? '').includes('run-code')) dispatchFailures.push(`${action.id}: E2E execution missing run-code command`);
    if (!String(plan.execution?.driverScript ?? '').includes('async')) dispatchFailures.push(`${action.id}: E2E execution missing async driverScript`);
    if (plan.executeWith?.companionSkill !== 'segmently-test-kit') dispatchFailures.push(`${action.id}: E2E execution missing segmently-test-kit companion`);
  }
  if (!plan.verification?.read) dispatchFailures.push(`${action.id}: verification missing read command`);
}
report('codex-dispatch-contract:supported-actions-return-execution-and-verification', dispatchFailures);

// ---- Gate 7: executable CLI runner dry-run contract -----------------------
const cliRunnerFailures = [];
try {
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
  if (dryRun.ok !== true) cliRunnerFailures.push('CLI dry-run did not return ok=true');
  if (dryRun.dryRun !== true) cliRunnerFailures.push('CLI dry-run must not execute without --execute');
  if (dryRun.mode !== 'cli') cliRunnerFailures.push(`CLI dry-run mode ${dryRun.mode}, expected cli`);
  if (!Array.isArray(dryRun.wouldRun) || !dryRun.wouldRun.join(' ').includes('funnels screens patch')) {
    cliRunnerFailures.push('CLI dry-run did not expose funnels screens patch argv');
  }
  const materializedPatch = dryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (materializedPatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (materializedPatch?.path !== 'content.actionBar.primary.appearance.backgroundColor') {
    cliRunnerFailures.push('CLI dry-run patch path drifted');
  }
  if (materializedPatch?.value !== '#ffc201') {
    cliRunnerFailures.push('CLI dry-run patch value drifted');
  }
  if (dryRun.verification?.read !== 'funnels export') {
    cliRunnerFailures.push('CLI dry-run missing funnels export verification contract');
  }
  if (!Array.isArray(dryRun.wouldVerify) || !dryRun.wouldVerify.join(' ').includes('funnels export')) {
    cliRunnerFailures.push('CLI dry-run did not expose verification argv');
  }

  const screenBackgroundDryRun = runCliRunner([
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
  if (screenBackgroundDryRun.ok !== true) cliRunnerFailures.push('screen background CLI dry-run did not return ok=true');
  if (screenBackgroundDryRun.mode !== 'cli') cliRunnerFailures.push('screen background CLI dry-run did not remain cli mode');
  const screenBackgroundPatch = screenBackgroundDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (screenBackgroundPatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('screen background CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (screenBackgroundPatch?.path !== 'content.canvas.background.content.color') {
    cliRunnerFailures.push('screen background CLI dry-run patch path drifted');
  }
  if (screenBackgroundPatch?.value !== '#000000') {
    cliRunnerFailures.push('screen background CLI dry-run patch value drifted');
  }

  const buttonTextStyleDryRun = runCliRunner([
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
  if (buttonTextStyleDryRun.ok !== true) cliRunnerFailures.push('button text-style CLI dry-run did not return ok=true');
  if (buttonTextStyleDryRun.mode !== 'cli') cliRunnerFailures.push('button text-style CLI dry-run did not remain cli mode');
  const buttonTextStylePatch = buttonTextStyleDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (buttonTextStylePatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('button text-style CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (buttonTextStylePatch?.path !== 'content.actionBar.primary.content.styles.fontSize') {
    cliRunnerFailures.push('button text-style CLI dry-run patch path drifted');
  }
  if (buttonTextStylePatch?.value !== 20) {
    cliRunnerFailures.push('button text-style CLI dry-run patch value must be numeric');
  }

  const optionsTitleColorDryRun = runCliRunner([
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
  if (optionsTitleColorDryRun.ok !== true) cliRunnerFailures.push('options title color CLI dry-run did not return ok=true');
  if (optionsTitleColorDryRun.mode !== 'cli') cliRunnerFailures.push('options title color CLI dry-run did not remain cli mode');
  const optionsTitleColorPatch = optionsTitleColorDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (optionsTitleColorPatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('options title color CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (optionsTitleColorPatch?.path !== 'content.options.items.0.title.appearance.color') {
    cliRunnerFailures.push('options title color CLI dry-run patch path drifted');
  }
  if (optionsTitleColorPatch?.value !== '#222222') {
    cliRunnerFailures.push('options title color CLI dry-run patch value drifted');
  }

  const optionsSubtitleColorDryRun = runCliRunner([
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
  if (optionsSubtitleColorDryRun.ok !== true) cliRunnerFailures.push('options subtitle color CLI dry-run did not return ok=true');
  if (optionsSubtitleColorDryRun.mode !== 'cli') cliRunnerFailures.push('options subtitle color CLI dry-run did not remain cli mode');
  const optionsSubtitleColorPatch = optionsSubtitleColorDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (optionsSubtitleColorPatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('options subtitle color CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (optionsSubtitleColorPatch?.path !== 'content.options.items.0.subtitle.appearance.color') {
    cliRunnerFailures.push('options subtitle color CLI dry-run patch path drifted');
  }
  if (optionsSubtitleColorPatch?.value !== '#555555') {
    cliRunnerFailures.push('options subtitle color CLI dry-run patch value drifted');
  }

  const contentTitleColorDryRun = runCliRunner([
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
  if (contentTitleColorDryRun.ok !== true) cliRunnerFailures.push('content title color CLI dry-run did not return ok=true');
  if (contentTitleColorDryRun.mode !== 'cli') cliRunnerFailures.push('content title color CLI dry-run did not remain cli mode');
  const contentTitleColorPatch = contentTitleColorDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (contentTitleColorPatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('content title color CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (contentTitleColorPatch?.path !== 'content.copy.title.appearance.color') {
    cliRunnerFailures.push('content title color CLI dry-run patch path drifted');
  }
  if (contentTitleColorPatch?.value !== '#333333') {
    cliRunnerFailures.push('content title color CLI dry-run patch value drifted');
  }

  const paywallTitleColorDryRun = runCliRunner([
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
  if (paywallTitleColorDryRun.ok !== true) cliRunnerFailures.push('paywall title color CLI dry-run did not return ok=true');
  if (paywallTitleColorDryRun.mode !== 'cli') cliRunnerFailures.push('paywall title color CLI dry-run did not remain cli mode');
  const paywallTitleColorPatch = paywallTitleColorDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (paywallTitleColorPatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('paywall title color CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (paywallTitleColorPatch?.path !== 'content.copy.title.appearance.color') {
    cliRunnerFailures.push('paywall title color CLI dry-run patch path drifted');
  }
  if (paywallTitleColorPatch?.value !== '#111111') {
    cliRunnerFailures.push('paywall title color CLI dry-run patch value drifted');
  }

  const headerBackFontSizeDryRun = runCliRunner([
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
  if (headerBackFontSizeDryRun.ok !== true) cliRunnerFailures.push('header back font-size CLI dry-run did not return ok=true');
  if (headerBackFontSizeDryRun.mode !== 'cli') cliRunnerFailures.push('header back font-size CLI dry-run did not remain cli mode');
  const headerBackFontSizePatch = headerBackFontSizeDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (headerBackFontSizePatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('header back font-size CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (headerBackFontSizePatch?.path !== 'content.header.back.content.appearance.fontSize') {
    cliRunnerFailures.push('header back font-size CLI dry-run patch path drifted');
  }
  if (headerBackFontSizePatch?.value !== 13) {
    cliRunnerFailures.push('header back font-size CLI dry-run patch value must be numeric');
  }

  const textFieldFontSizeDryRun = runCliRunner([
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
  if (textFieldFontSizeDryRun.ok !== true) cliRunnerFailures.push('text field font-size CLI dry-run did not return ok=true');
  if (textFieldFontSizeDryRun.mode !== 'cli') cliRunnerFailures.push('text field font-size CLI dry-run did not remain cli mode');
  const textFieldFontSizePatch = textFieldFontSizeDryRun.materializedFiles?.[0]?.content?.operations?.[0];
  if (textFieldFontSizePatch?.op !== 'setFieldValue') {
    cliRunnerFailures.push('text field font-size CLI dry-run did not materialize setFieldValue patch operation');
  }
  if (textFieldFontSizePatch?.path !== 'content.textField.placeholder.appearance.fontSize') {
    cliRunnerFailures.push('text field font-size CLI dry-run patch path drifted');
  }
  if (textFieldFontSizePatch?.value !== 18) {
    cliRunnerFailures.push('text field font-size CLI dry-run patch value must be numeric');
  }

  const refused = runCliRunnerExpectingExit([
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
  ], 2);
  if (refused.ok !== false) cliRunnerFailures.push('CLI runner must refuse E2E actions');
  if (refused.requiredRunner !== 'playwright-bowser') {
    cliRunnerFailures.push(`CLI runner refusal requiredRunner ${refused.requiredRunner}, expected playwright-bowser`);
  }
} catch (error) {
  cliRunnerFailures.push(`CLI runner dry-run probe failed: ${error instanceof Error ? error.message : String(error)}`);
}
report('cli-do-runner:dry-run-materializes-patch-and-refuses-non-cli', cliRunnerFailures);

// ---- Gate 8: executable E2E runner dry-run contract -----------------------
const e2eRunnerFailures = [];
try {
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
  if (dryRun.ok !== true) e2eRunnerFailures.push('E2E dry-run did not return ok=true');
  if (dryRun.dryRun !== true) e2eRunnerFailures.push('E2E runner must not execute without --execute');
  if (dryRun.mode !== 'e2e') e2eRunnerFailures.push(`E2E dry-run mode ${dryRun.mode}, expected e2e`);
  if (dryRun.owningSkill !== 'playwright-bowser') {
    e2eRunnerFailures.push(`E2E dry-run owningSkill ${dryRun.owningSkill}, expected playwright-bowser`);
  }
  if (dryRun.companionSkill !== 'segmently-test-kit') {
    e2eRunnerFailures.push(`E2E dry-run companionSkill ${dryRun.companionSkill}, expected segmently-test-kit`);
  }
  if (!Array.isArray(dryRun.wouldOpen) || !dryRun.wouldOpen.join(' ').includes('playwright-cli')) {
    e2eRunnerFailures.push('E2E dry-run did not expose playwright-cli open argv');
  }
  if (dryRun.browser !== 'chrome' || !dryRun.wouldOpen?.join(' ').includes('--browser=chrome')) {
    e2eRunnerFailures.push('E2E dry-run must default to Chrome so live runs do not depend on WebKit');
  }
  if (dryRun.authPreflight?.requiredForExecute !== true) {
    e2eRunnerFailures.push('E2E dry-run missing auth preflight for live execution');
  }
  if (!dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status')) {
    e2eRunnerFailures.push('E2E auth preflight missing safe auth status probe');
  }
  if (!dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login')) {
    e2eRunnerFailures.push('E2E auth preflight missing login command');
  }
  if (dryRun.authPreflight?.tokenProbe?.safeToShowOutput !== false) {
    e2eRunnerFailures.push('E2E auth preflight must mark token probe output unsafe');
  }
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
  if (envDryRun.blockedExecuteReason !== null) {
    e2eRunnerFailures.push(`E2E dry-run should accept baseUrl from live harness env, got ${envDryRun.blockedExecuteReason}`);
  }
  if (!envDryRun.wouldOpen?.join(' ').includes('https://env.segmently.example/login')) {
    e2eRunnerFailures.push('E2E dry-run did not use LIVE_SEGMENTLY_BASE_URL for browser open URL');
  }
  if (!Array.isArray(dryRun.wouldRunCode) || !dryRun.wouldRunCode.join(' ').includes('<driverScript>')) {
    e2eRunnerFailures.push('E2E dry-run did not expose run-code argv preview');
  }
  if (!String(dryRun.driverScript ?? '').includes('input-style-title-styles-font-size')) {
    e2eRunnerFailures.push('E2E dry-run driverScript missing title font-size input');
  }
  if (dryRun.verification?.read !== 'funnels export') {
    e2eRunnerFailures.push('E2E dry-run missing funnels export verification contract');
  }
  if (dryRun.verifyReady !== true) {
    e2eRunnerFailures.push('E2E dry-run should be verification-ready when versionId is supplied');
  }
  if (!Array.isArray(dryRun.wouldVerify) || !dryRun.wouldVerify.join(' ').includes('funnels export')) {
    e2eRunnerFailures.push('E2E dry-run did not expose verification argv');
  }
  if (dryRun.blockedExecuteReason !== null) {
    e2eRunnerFailures.push(`E2E dry-run should be execute-ready with baseUrl/versionId, got ${dryRun.blockedExecuteReason}`);
  }
  if (dryRun.completionClaim !== 'not-completed-until-execute-and-verification') {
    e2eRunnerFailures.push('E2E dry-run claimed completion before execution/verification');
  }

  const refused = runE2eRunnerExpectingExit([
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
  ], 2);
  if (refused.ok !== false) e2eRunnerFailures.push('E2E runner must refuse CLI actions');
  if (refused.requiredRunner !== 'segmently-cli-guide') {
    e2eRunnerFailures.push(`E2E runner refusal requiredRunner ${refused.requiredRunner}, expected segmently-cli-guide`);
  }
} catch (error) {
  e2eRunnerFailures.push(`E2E runner dry-run probe failed: ${error instanceof Error ? error.message : String(error)}`);
}
report('e2e-do-runner:dry-run-exposes-browser-package-and-refuses-non-e2e', e2eRunnerFailures);

// ---- Gate 9: executable SHOW runner dry-run contract ----------------------
const showRunnerFailures = [];
try {
  if (!skillMarkdown.includes('runtime/show-runner.mjs')) {
    showRunnerFailures.push('SKILL.md missing runtime/show-runner.mjs SHOW execution path');
  }
  if (!existsSync(join(root, 'runtime/show-runner.mjs'))) {
    showRunnerFailures.push('missing runtime/show-runner.mjs');
  } else {
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
    if (dryRun.ok !== true) showRunnerFailures.push('SHOW dry-run did not return ok=true');
    if (dryRun.dryRun !== true) showRunnerFailures.push('SHOW runner must not execute without --execute');
    if (dryRun.mode !== 'show') showRunnerFailures.push(`SHOW dry-run mode ${dryRun.mode}, expected show`);
    if (dryRun.mutation !== false) showRunnerFailures.push('SHOW dry-run must be non-mutating');
    if (dryRun.liveBrowserReady !== true) showRunnerFailures.push('SHOW dry-run should be browser-ready with target ids/baseUrl');
    if (!Array.isArray(dryRun.wouldOpen) || !dryRun.wouldOpen.join(' ').includes('playwright-cli')) {
      showRunnerFailures.push('SHOW dry-run did not expose playwright-cli open argv');
    }
    if (dryRun.browser !== 'chrome' || !dryRun.wouldOpen?.join(' ').includes('--browser=chrome')) {
      showRunnerFailures.push('SHOW dry-run must default to Chrome so live runs do not depend on WebKit');
    }
    if (dryRun.authPreflight?.requiredForExecute !== true) {
      showRunnerFailures.push('SHOW dry-run missing auth preflight for live execution');
    }
    if (!dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status')) {
      showRunnerFailures.push('SHOW auth preflight missing safe auth status probe');
    }
    if (!dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login')) {
      showRunnerFailures.push('SHOW auth preflight missing login command');
    }
    if (dryRun.authPreflight?.tokenProbe?.safeToShowOutput !== false) {
      showRunnerFailures.push('SHOW auth preflight must mark token probe output unsafe');
    }
    if (!dryRun.authPreflight?.retry?.argv?.includes('--execute')) {
      showRunnerFailures.push('SHOW auth preflight retry must execute the live runner');
    }
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
    if (envDryRun.liveBrowserReady !== true) {
      showRunnerFailures.push('SHOW dry-run should be browser-ready when baseUrl is supplied by live harness env');
    }
    if (!envDryRun.wouldOpen?.join(' ').includes('https://env.segmently.example/login')) {
      showRunnerFailures.push('SHOW dry-run did not use LIVE_SEGMENTLY_BASE_URL for the browser open URL');
    }
    if (!Array.isArray(dryRun.wouldRunCode) || !dryRun.wouldRunCode.join(' ').includes('<showDriverScript>')) {
      showRunnerFailures.push('SHOW dry-run did not expose show driver run-code preview');
    }
    if (!Array.isArray(dryRun.wouldScreenshot) || !dryRun.wouldScreenshot.join(' ').includes('screenshot')) {
      showRunnerFailures.push('SHOW dry-run did not expose screenshot argv');
    }
    if (!String(dryRun.driverScript ?? '').includes("mode: 'show'")) {
      showRunnerFailures.push('SHOW dry-run driverScript missing show result marker');
    }
    if (!String(dryRun.screenshot?.path ?? '').includes('qa-screenshots')) {
      showRunnerFailures.push('SHOW dry-run screenshot path must point at qa-screenshots by default');
    }
    if (dryRun.completionClaim !== 'show-not-completed-until-browser-screenshot') {
      showRunnerFailures.push('SHOW dry-run claimed completion before browser screenshot evidence');
    }
  }
} catch (error) {
  showRunnerFailures.push(`SHOW runner dry-run probe failed: ${error instanceof Error ? error.message : String(error)}`);
}
report('show-runner:dry-run-exposes-read-only-browser-screenshot-package', showRunnerFailures);

// ---- Gate 10: coverage audit over shipped guide/settings artifacts ---------
const coverageAuditFailures = [];
try {
  const audit = JSON.parse(execFileSync('node', [
    join(root, 'scripts/audit-guide-coverage.mjs'),
    '--json',
    '--strict',
  ], {
    encoding: 'utf8',
  }));
  if (audit.ok !== true) {
    coverageAuditFailures.push(...(audit.strictFailures ?? ['coverage audit returned ok=false']));
  }
  if (audit.screenSettings?.allScreenSettingQuestionsCovered !== true) {
    coverageAuditFailures.push('screen setting article/text coverage is incomplete');
  }
  if (!(audit.screenSettings?.fieldCount > 0)) {
    coverageAuditFailures.push('screen setting field coverage count must be > 0');
  }
  if (!(audit.screenSettings?.leafCount > 0)) {
    coverageAuditFailures.push('screen setting leaf coverage count must be > 0');
  }
  if (!(audit.screenSettings?.articleAliasCorpusCount > 0)) {
    coverageAuditFailures.push('screen setting article alias corpus count must be > 0');
  }
  if (!(audit.screenSettings?.fieldQuestionProbeCount > 0)) {
    coverageAuditFailures.push('screen setting resolver probe count must be > 0');
  }
  if (!(audit.guideEvidence?.missingConcreteImageUrlCount >= 0)) {
    coverageAuditFailures.push('guide image URL inventory is missing');
  }
  if (!(audit.guideEvidence?.missingSectionConcreteImageUrlCount >= 0)) {
    coverageAuditFailures.push('guide section image URL inventory is missing');
  }
  if (!(audit.guideEvidence?.missingArticleLinkCount >= 0)) {
    coverageAuditFailures.push('guide article-link inventory is missing');
  }
  if (audit.policy?.missingArticleLinksAreReportedNotStrict !== true) {
    coverageAuditFailures.push('coverage audit policy must keep missing article links report-only until release mode is requested');
  }
  if (!Array.isArray(audit.guideEvidence?.coverageRows)) {
    coverageAuditFailures.push('guide image/link coverage rows are missing');
  } else {
    if (audit.guideEvidence.coverageRows.length !== audit.guideEvidence.totalGuides) {
      coverageAuditFailures.push('guide image/link coverage rows do not cover every guide');
    }
    const rowWithoutSections = audit.guideEvidence.coverageRows.find(row => !Array.isArray(row.sections));
    if (rowWithoutSections) {
      coverageAuditFailures.push(`guide image/link coverage row ${rowWithoutSections.guideKey ?? '<unknown>'} has no section inventory`);
    }
  }
  if (!audit.helpArticles || !(audit.helpArticles.totalArticles > 0)) {
    coverageAuditFailures.push('coverage audit helpArticles inventory is missing');
  } else {
    if (audit.helpArticles.requiredMissing?.length) {
      coverageAuditFailures.push(`coverage audit missing required help article aliases: ${audit.helpArticles.requiredMissing.map(item => item.alias).join(', ')}`);
    }
    if (audit.helpArticles.withPublishedUrl !== audit.helpArticles.totalArticles) {
      coverageAuditFailures.push('coverage audit helpArticles has articles without publishedUrl');
    }
  }
  const auditHelp = execFileSync('node', [
    join(root, 'scripts/audit-guide-coverage.mjs'),
    '--help',
  ], { encoding: 'utf8' });
  if (!auditHelp.includes('--fail-on-missing-article-links')) {
    coverageAuditFailures.push('coverage audit help is missing --fail-on-missing-article-links release mode');
  }
  if (!auditHelp.includes('--fail-on-url-gaps')) {
    coverageAuditFailures.push('coverage audit help is missing --fail-on-url-gaps release mode');
  }
} catch (error) {
  const e = error;
  coverageAuditFailures.push(`coverage audit failed: ${e instanceof Error ? e.message : String(e)}`);
}
report('coverage-audit:guide-image-inventory-and-screen-settings-coverage', coverageAuditFailures);

// ---- Gate 11: persona/customer-surface naive question evals ---------------
const personaFailures = [];
const guideEvidence = JSON.parse(guideEvidenceRaw);
const helpArticleReference = JSON.parse(helpArticleReferenceRaw);
const personaFlow = JSON.parse(personaFlowRaw);
const scenariosById = new Map((matrix.scenarios ?? []).map(scenario => [scenario.id, scenario]));
const guidesByKey = new Map((guideEvidence.guides ?? []).map(guide => [guide.guideKey, guide]));
const actionsById = new Map((doActionReference.actions ?? []).map(action => [action.id, action]));
const shippedSectionImageUrls = (guideEvidence.guides ?? [])
  .flatMap(guide => guide.sections ?? [])
  .map(section => section.imageUrl)
  .filter(Boolean);

if (personaFlow.schemaVersion !== 1) personaFailures.push('persona-flow schemaVersion must be 1');
if (guideEvidence.policy?.articleHtmlRequired !== false) {
  personaFailures.push('guide-evidence policy must keep articleHtmlRequired=false');
}
if (guideEvidence.policy?.textInstructionRequired !== true) {
  personaFailures.push('guide-evidence policy must require text instructions');
}
if (guideEvidence.policy?.imageUrlPreferred !== true) {
  personaFailures.push('guide-evidence policy must mark imageUrlPreferred=true');
}
if (shippedSectionImageUrls.length === 0) {
  personaFailures.push('guide-evidence must propagate at least one authored section imageUrl when available');
}
if (helpArticleReference.schemaVersion !== 1) {
  personaFailures.push('help-article-reference schemaVersion must be 1');
}
const helpArticlesByAlias = new Map((helpArticleReference.articles ?? []).map(article => [article.alias, article]));
for (const alias of ['help-block-media', 'help-block-paywall-media', 'help-block-action-bar', 'help-options-list-single']) {
  const article = helpArticlesByAlias.get(alias);
  if (!article) {
    personaFailures.push(`help-article-reference missing ${alias}`);
    continue;
  }
  if (!String(article.publishedUrl ?? '').startsWith('https://')) {
    personaFailures.push(`help-article-reference ${alias} missing https publishedUrl`);
  }
}
for (const [alias, guideKey] of [
  ['help-block-media', 'screenedit-media-video-upload'],
  ['help-block-paywall-media', 'screenedit-paywall-media-video'],
]) {
  const article = helpArticlesByAlias.get(alias);
  const setting = article?.settings?.find(item => item.guideKey === guideKey);
  if (!setting?.imageUrl?.startsWith('https://')) {
    personaFailures.push(`help-article-reference ${alias}/${guideKey} missing setting imageUrl`);
  }
  if (!setting?.articleSectionUrl?.startsWith('https://')) {
    personaFailures.push(`help-article-reference ${alias}/${guideKey} missing articleSectionUrl`);
  }
}
for (const imageUrl of shippedSectionImageUrls) {
  if (!String(imageUrl).startsWith('https://')) {
    personaFailures.push(`guide-evidence imageUrl must be https: ${imageUrl}`);
  }
}
if (!Array.isArray(personaFlow.personas) || personaFlow.personas.length !== personaFlow.policy?.personaCount) {
  personaFailures.push(`expected ${personaFlow.policy?.personaCount ?? 3} personas`);
}

for (const persona of personaFlow.personas ?? []) {
  const questions = persona.questions ?? [];
  if (!Array.isArray(persona.virtualFlow) || persona.virtualFlow.length < 5) {
    personaFailures.push(`${persona.id}: virtualFlow must cover the main launch path`);
  }
  if (questions.length < (personaFlow.policy?.minimumQuestionsPerPersona ?? 10)) {
    personaFailures.push(`${persona.id}: expected at least ${personaFlow.policy?.minimumQuestionsPerPersona ?? 10} questions`);
  }
  for (const question of questions) {
    const prefix = `${persona.id}/${question.id}`;
    if (!question.text || question.text.length < 12) personaFailures.push(`${prefix}: question text is too weak`);
    if (question.expectedScenarioId && !scenariosById.has(question.expectedScenarioId)) {
      personaFailures.push(`${prefix}: unknown expectedScenarioId ${question.expectedScenarioId}`);
    }
    const guideKeys = question.guidance?.guideKeys ?? [];
    if (!guideKeys.length) {
      personaFailures.push(`${prefix}: no guideKeys for text/image guidance`);
    }
    for (const guideKey of guideKeys) {
      const guide = guidesByKey.get(guideKey);
      if (!guide) {
        personaFailures.push(`${prefix}: guide ${guideKey} missing from guide-evidence`);
        continue;
      }
      if (question.guidance?.requiresText && !guide.hasAuthoredText) {
        personaFailures.push(`${prefix}: guide ${guideKey} has no authored text`);
      }
      if (question.guidance?.requiresText && !hasUsableGuideText(guide)) {
        personaFailures.push(`${prefix}: guide ${guideKey} has no shipped title/description text`);
      }
      if (question.guidance?.requiresImage && !guide.hasScreenshotEvidence) {
        personaFailures.push(`${prefix}: guide ${guideKey} has no screenshot-backed evidence`);
      }
      if (question.guidance?.requiresImage && !(guide.screenshotSectionCount > 0)) {
        personaFailures.push(`${prefix}: guide ${guideKey} screenshotSectionCount must be > 0`);
      }
      if (question.guidance?.requiresImage && !hasSectionImageEvidence(guide)) {
        personaFailures.push(`${prefix}: guide ${guideKey} has no section-level image evidence`);
      }
    }
    if (question.expectedDo) {
      if (!hasExplicitActionIntent(question.text)) {
        personaFailures.push(`${prefix}: expectedDo requires an explicit customer action intent in the question text`);
      }
      const action = actionsById.get(question.expectedDo.actionId);
      if (!action) {
        personaFailures.push(`${prefix}: expected action ${question.expectedDo.actionId} missing from do-action-reference`);
        continue;
      }
      if (action.status !== question.expectedDo.status) {
        personaFailures.push(`${prefix}: action ${action.id} status ${action.status}, expected ${question.expectedDo.status}`);
      }
      if (action.mode !== question.expectedDo.mode) {
        personaFailures.push(`${prefix}: action ${action.id} mode ${action.mode}, expected ${question.expectedDo.mode}`);
      }
      if (!Array.isArray(question.expectedDo.sampleArgs)) {
        personaFailures.push(`${prefix}: expectedDo.sampleArgs is required`);
        continue;
      }
      if (action.status === 'supported') {
        try {
          const plan = runRunner(question.expectedDo.sampleArgs);
          if (plan.ok !== true) personaFailures.push(`${prefix}: supported action runner did not return ok=true`);
          if (plan.actionId !== action.id) personaFailures.push(`${prefix}: runner actionId drifted to ${plan.actionId}`);
          if (!plan.execution) personaFailures.push(`${prefix}: runner missing execution object`);
          if (!plan.verification?.read) personaFailures.push(`${prefix}: runner missing verification read`);
        } catch (error) {
          personaFailures.push(`${prefix}: supported action runner failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else if (action.status === 'handoff') {
        const plan = runRunnerExpectingExit(question.expectedDo.sampleArgs, 2);
        if (plan.ok !== false) personaFailures.push(`${prefix}: handoff runner must return ok=false`);
        if (!plan.reason) personaFailures.push(`${prefix}: handoff runner missing reason`);
        if (!plan.verify?.command) personaFailures.push(`${prefix}: handoff runner missing verify command`);
      }
    }
    try {
      const response = runCustomerResponse(persona.id, question.id);
      if (response.ok !== true) personaFailures.push(`${prefix}: customer response runner did not return ok=true`);
      if (!response.answer?.instructions?.length) personaFailures.push(`${prefix}: customer response missing instructions`);
      if (!response.answer?.instructions?.some(item => item.visualEvidence === true)) {
        personaFailures.push(`${prefix}: customer response missing visual evidence marker`);
      }
      for (const imageUrl of response.answer?.imageUrls ?? []) {
        if (!String(imageUrl).startsWith('https://')) {
          personaFailures.push(`${prefix}: customer response imageUrl must be https: ${imageUrl}`);
        }
      }
      if (question.expectedDo) {
        const expectedMode = expectedResponseMode(question.expectedDo);
        if (response.mode !== expectedMode) {
          personaFailures.push(`${prefix}: customer response mode ${response.mode}, expected ${expectedMode}`);
        }
        if (!response.action) personaFailures.push(`${prefix}: customer response missing action contract`);
        if (question.expectedDo.status === 'supported') {
          if (!response.action?.execution) personaFailures.push(`${prefix}: customer response missing execution object`);
          if (!response.action?.verification) personaFailures.push(`${prefix}: customer response missing verification object`);
          if (response.completionClaim !== 'not-completed-until-verification') {
            personaFailures.push(`${prefix}: supported response must not claim completion before verification`);
          }
        }
        if (question.expectedDo.status === 'handoff') {
          if (response.completionClaim !== 'handoff-not-done') {
            personaFailures.push(`${prefix}: handoff response must not claim completion`);
          }
          if (!response.action?.reason) personaFailures.push(`${prefix}: handoff response missing reason`);
          if (!response.action?.verification) personaFailures.push(`${prefix}: handoff response missing verification`);
        }
      } else if (response.mode !== 'teach') {
        personaFailures.push(`${prefix}: non-action question should use teach mode`);
      }
    } catch (error) {
      personaFailures.push(`${prefix}: customer response runner failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
report('persona-flow:naive-main-flow-questions-have-text-image-response-and-do-contracts', personaFailures);

// ---- Gate 12: raw customer prompt surface ---------------------------------
const promptFailures = [];
try {
  const teach = runCustomerPrompt(['--prompt', 'как настроить шрифт ячейки в списке']);
  if (teach.ok !== true) promptFailures.push('teach prompt did not return ok=true');
  if (teach.source !== 'prompt') promptFailures.push('teach prompt source must be prompt');
  if (teach.mode !== 'teach') promptFailures.push(`teach prompt mode ${teach.mode}, expected teach`);
  if (!teach.answer?.instructions?.length) promptFailures.push('teach prompt missing instructions');
  if (!teach.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles')) {
    promptFailures.push('teach prompt did not resolve list title styles guide');
  }
  const buttonFont = runCustomerPrompt(['--prompt', 'как настроить шрифты в кнопке']);
  if (buttonFont.ok !== true) promptFailures.push('button-font teach prompt did not return ok=true');
  if (buttonFont.mode !== 'teach') promptFailures.push(`button-font prompt mode ${buttonFont.mode}, expected teach`);
  if (!buttonFont.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-action-bar-primary-text-styles')) {
    promptFailures.push('button-font prompt did not resolve primary button text style guide');
  }
  if (buttonFont.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles')) {
    promptFailures.push('button-font prompt incorrectly resolved list/options title style guide');
  }
  if (!buttonFont.answer?.articleReferences?.some(reference => reference.articleAlias === 'help-block-action-bar')) {
    promptFailures.push('button-font prompt missing help-block-action-bar article reference');
  }
  const buttonFontArticle = buttonFont.answer?.articleAvailability?.find(reference => reference.articleAlias === 'help-block-action-bar');
  if (!buttonFontArticle?.hasBuiltInArticleReference) {
    promptFailures.push('button-font prompt did not mark built-in Action Bar article reference as available');
  }
  if (buttonFontArticle?.publicArticleUrlStatus !== 'published') {
    promptFailures.push(`button-font prompt article URL status ${buttonFontArticle?.publicArticleUrlStatus}, expected published`);
  }
  if (/not\s+published/i.test(buttonFontArticle?.customerSafeMessage ?? '')) {
    promptFailures.push('button-font prompt customer-safe message must not invite a missing public-link answer');
  }
  const buttonFontBuiltIn = buttonFont.answer?.builtInArticleReferences?.find(reference => reference.articleAlias === 'help-block-action-bar');
  if (buttonFontBuiltIn?.status !== 'public-url-available') {
    promptFailures.push(`button-font prompt built-in reference status ${buttonFontBuiltIn?.status}, expected public-url-available`);
  }
  if (!buttonFont.answer?.publicArticleLinks?.some(url => /help-block-action-bar\/index\.html$/.test(url))) {
    promptFailures.push('button-font prompt missing published help-block-action-bar article URL');
  }
  if (buttonFont.answer?.preferredCitation?.referencePath !== 'help-block-action-bar/screenedit-action-bar-primary-text-styles') {
    promptFailures.push('button-font prompt preferred citation missing stable Action Bar reference path');
  }
  if (!/built-in Segmently guide\/article is available/i.test(buttonFont.answer?.customerAnswerStarter ?? '')) {
    promptFailures.push('button-font prompt starter must positively state built-in article availability');
  }
  if (!/Built-in guide\/article references are available/.test(buttonFont.answer?.articleReferenceSummary ?? '')
    || /no public web URL|not published|no-public-url/i.test(buttonFont.answer?.articleReferenceSummary ?? '')) {
    promptFailures.push('button-font prompt missing positive built-in article summary');
  }
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
    if (pattern.test(buttonFontAnswerText)) {
      promptFailures.push(`button-font prompt hides built-in article reference with ${pattern}`);
    }
  }
  const buttonFontFullArticle = runCustomerPrompt(['--prompt', 'дай полную статью как настроить шрифты в кнопке']);
  if (buttonFontFullArticle.ok !== true) promptFailures.push('button-font full-article prompt did not return ok=true');
  if (buttonFontFullArticle.mode !== 'article-fetch') {
    promptFailures.push(`button-font full-article prompt mode ${buttonFontFullArticle.mode}, expected article-fetch`);
  }
  if (buttonFontFullArticle.resolver?.kind !== 'article-fetch') {
    promptFailures.push(`button-font full-article resolver kind ${buttonFontFullArticle.resolver?.kind}, expected article-fetch`);
  }
  if (buttonFontFullArticle.articleFetch?.owningSkill !== 'segmently-cli-articles') {
    promptFailures.push('button-font full-article prompt did not delegate to segmently-cli-articles');
  }
  if (buttonFontFullArticle.articleFetch?.mutation !== false || buttonFontFullArticle.articleFetch?.readOnly !== true) {
    promptFailures.push('button-font full-article fetch must be read-only and non-mutating');
  }
  if (buttonFontFullArticle.articleFetch?.articleAlias !== 'help-block-action-bar') {
    promptFailures.push(`button-font full-article article alias ${buttonFontFullArticle.articleFetch?.articleAlias}, expected help-block-action-bar`);
  }
  if (buttonFontFullArticle.articleFetch?.referencePath !== 'help-block-action-bar/screenedit-action-bar-primary-text-styles') {
    promptFailures.push('button-font full-article prompt missing stable Action Bar reference path');
  }
  if (buttonFontFullArticle.articleFetch?.fetchCommand?.resolveFirst?.match?.equals !== 'help-block-action-bar') {
    promptFailures.push('button-font full-article prompt must resolve articleAlias through articles list before get');
  }
  if (!buttonFontFullArticle.articleFetch?.fetchCommand?.argv?.includes('<resolvedArticleId>')) {
    promptFailures.push('button-font full-article prompt fetch command must get the resolved articleId, not the alias');
  }
  if (buttonFontFullArticle.completionClaim !== 'article-fetch-plan-not-executed') {
    promptFailures.push(`button-font full-article completion claim ${buttonFontFullArticle.completionClaim}, expected article-fetch-plan-not-executed`);
  }
  if (buttonFontFullArticle.missingArticleClaimed === true) {
    promptFailures.push('button-font full-article prompt incorrectly claimed the built-in article is missing');
  }
  for (const [label, prompt, alias, guideKey] of [
    ['list-video', 'как добавить видео к списку', 'help-block-media', 'screenedit-media-video-upload'],
    ['paywall-video', 'добавить видео в пейвол', 'help-block-paywall-media', 'screenedit-paywall-media-video'],
  ]) {
    const response = runCustomerPrompt(['--prompt', prompt]);
    if (response.ok !== true) promptFailures.push(`${label} prompt did not return ok=true`);
    if (response.mode !== 'teach') promptFailures.push(`${label} prompt mode ${response.mode}, expected teach`);
    if (!response.guidance?.guides?.some(guide => guide.guideKey === guideKey)) {
      promptFailures.push(`${label} prompt missing expected guide ${guideKey}`);
    }
    if (!response.answer?.publicArticleLinks?.some(url => new RegExp(`${alias}/index\\.html$`).test(url))) {
      promptFailures.push(`${label} prompt missing published article URL for ${alias}`);
    }
    if (!response.answer?.imageUrls?.some(url => String(url).startsWith('https://'))) {
      promptFailures.push(`${label} prompt missing concrete image URL`);
    }
    const answerText = JSON.stringify(response.answer ?? {});
    for (const pattern of [/explicitly\s+asks?\s+for\s+a\s+web\s+link/i, /only\s+if\s+(the\s+)?customer\s+asks?/i, /only\s+if\s+.*full\s+web\s+article/i]) {
      if (pattern.test(answerText)) {
        promptFailures.push(`${label} prompt incorrectly makes published article URL conditional with ${pattern}`);
      }
    }
    const matchingGuide = response.guidance?.guides?.find(guide => guide.guideKey === guideKey);
    if (!matchingGuide?.textSections?.some(section => String(section.imageUrl ?? '').startsWith('https://'))) {
      promptFailures.push(`${label} prompt missing setting-level screenshot image`);
    }
    if (response.answer?.showDoOptions?.show?.available !== true) {
      promptFailures.push(`${label} prompt must offer SHOW`);
    }
    if (response.answer?.showDoOptions?.do?.available !== 'conditional') {
      promptFailures.push(`${label} prompt must offer conditional DO boundary for video upload`);
    }
  }
  for (const [label, prompt, actionId, alias] of [
    ['list-video-do', 'сделай видео в списке', 'browser.media.videoUpload', 'help-block-media'],
    ['paywall-video-do', 'сделай видео в пейволе', 'browser.paywallMedia.videoUpload', 'help-block-paywall-media'],
  ]) {
    const response = runCustomerPrompt(['--prompt', prompt]);
    if (response.ok !== true) promptFailures.push(`${label} prompt did not return ok=true`);
    if (response.mode !== 'do-e2e-conditional') {
      promptFailures.push(`${label} prompt mode ${response.mode}, expected do-e2e-conditional`);
    }
    if (response.resolver?.kind !== 'conditional-do') {
      promptFailures.push(`${label} resolver kind ${response.resolver?.kind}, expected conditional-do`);
    }
    if (response.action?.actionId !== actionId) {
      promptFailures.push(`${label} action id ${response.action?.actionId}, expected ${actionId}`);
    }
    if (response.action?.owningSkill !== 'playwright-bowser') {
      promptFailures.push(`${label} must route conditional DO to playwright-bowser`);
    }
    if (response.action?.companionSkill !== 'segmently-test-kit') {
      promptFailures.push(`${label} must include segmently-test-kit companion`);
    }
    if (response.action?.supportedBoundary !== 'conditional-browser-editor-upload') {
      promptFailures.push(`${label} must mark browser upload as conditional boundary`);
    }
    if (!response.action?.missingInputs?.includes('videoUrl-or-local-file')) {
      promptFailures.push(`${label} must ask for videoUrl-or-local-file`);
    }
    if (response.action?.authPreflight?.requiredForExecute !== true) {
      promptFailures.push(`${label} must include auth preflight`);
    }
    if (!response.answer?.publicArticleLinks?.some(url => new RegExp(`${alias}/index\\.html$`).test(url))) {
      promptFailures.push(`${label} prompt missing published article URL for ${alias}`);
    }
    if (response.completionClaim !== 'needs-inputs-before-execution') {
      promptFailures.push(`${label} completion claim ${response.completionClaim}, expected needs-inputs-before-execution`);
    }
  }
  const show = runCustomerPrompt(['--prompt', 'покажи где поменять цвет кнопки продолжить']);
  if (show.ok !== true) promptFailures.push('show prompt did not return ok=true');
  if (show.mode !== 'show') promptFailures.push(`show prompt mode ${show.mode}, expected show`);
  if (show.resolver?.kind !== 'show') promptFailures.push(`show prompt resolver kind ${show.resolver?.kind}, expected show`);
  if (show.action !== null) promptFailures.push('show prompt must not attach a DO action contract');
  if (show.show?.mutation !== false) promptFailures.push('show prompt must be explicitly non-mutating');
  if (show.show?.executeWith?.skill !== 'playwright-bowser') {
    promptFailures.push('show prompt must route live navigation to playwright-bowser');
  }
  if (show.show?.executeWith?.companionSkill !== 'segmently-test-kit') {
    promptFailures.push('show prompt must include segmently-test-kit companion');
  }
  if (!['screenshot-flag', 'concrete-image-url'].includes(show.show?.evidenceLevel)) {
    promptFailures.push(`show prompt evidence level ${show.show?.evidenceLevel}, expected screenshot-backed evidence`);
  }
  if (!Array.isArray(show.show?.browserPlan) || show.show.browserPlan.length < 5) {
    promptFailures.push('show prompt must include a browser plan');
  }
  if (!show.show?.browserPlan?.join(' ').includes('Do not change field values')) {
    promptFailures.push('show prompt browser plan must explicitly forbid mutation');
  }
  if (!Array.isArray(show.show?.missingInputs) || !show.show.missingInputs.includes('projectId')) {
    promptFailures.push('show prompt without ids must ask for projectId before live browser navigation');
  }
  if (show.completionClaim !== 'show-needs-target-before-browser') {
    promptFailures.push('show prompt without ids must not claim a completed live show');
  }
  if (!show.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-action-bar-primary-container')) {
    promptFailures.push('show prompt did not resolve primary button container guide');
  }
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
  if (showReady.ok !== true) promptFailures.push('show-ready prompt did not return ok=true');
  if (showReady.mode !== 'show') promptFailures.push(`show-ready prompt mode ${showReady.mode}, expected show`);
  if (showReady.show?.liveBrowserReady !== true) promptFailures.push('show-ready prompt must be ready for live browser navigation');
  if (showReady.show?.missingInputs?.length !== 0) promptFailures.push('show-ready prompt should have no missing inputs');
  if (showReady.completionClaim !== 'show-plan-not-executed') {
    promptFailures.push('show-ready prompt must not claim screenshot completion before browser execution');
  }
  const missing = runCustomerPrompt(['--prompt', 'сделай главную кнопку желтой']);
  if (missing.ok !== true) promptFailures.push('missing-input DO prompt did not return ok=true');
  if (missing.mode !== 'do-cli') promptFailures.push(`missing-input DO prompt mode ${missing.mode}, expected do-cli`);
  if (missing.action?.actionId !== 'editor.actionBar.primaryButton.backgroundColor') {
    promptFailures.push(`missing-input DO prompt resolved ${missing.action?.actionId}, expected primary button background`);
  }
  if (!Array.isArray(missing.action?.missingInputs) || !missing.action.missingInputs.includes('projectId')) {
    promptFailures.push('missing-input DO prompt did not ask for required projectId');
  }
  if (missing.completionClaim !== 'needs-inputs-before-execution') {
    promptFailures.push('missing-input DO prompt must not claim execution before inputs');
  }
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
  if (executable.ok !== true) promptFailures.push('executable DO prompt did not return ok=true');
  if (executable.action?.runnerOk !== true) promptFailures.push('executable DO prompt runnerOk must be true');
  if (executable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('executable DO prompt missing delegate-cli execution');
  }
  if (executable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('executable DO prompt missing funnels export verification');
  }
  const buttonTextStyleExecutable = runCustomerPrompt([
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
  if (buttonTextStyleExecutable.ok !== true) promptFailures.push('button text-style DO prompt did not return ok=true');
  if (buttonTextStyleExecutable.mode !== 'do-cli') {
    promptFailures.push(`button text-style DO prompt mode ${buttonTextStyleExecutable.mode}, expected do-cli`);
  }
  if (buttonTextStyleExecutable.action?.actionId !== 'editor.actionBar.primaryButton.textStyle.fontSize') {
    promptFailures.push(`button text-style DO prompt resolved ${buttonTextStyleExecutable.action?.actionId}, expected primary button text style font size`);
  }
  if (buttonTextStyleExecutable.action?.runnerOk !== true) {
    promptFailures.push('button text-style DO prompt runnerOk must be true');
  }
  if (buttonTextStyleExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('button text-style DO prompt missing delegate-cli execution');
  }
  if (buttonTextStyleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.actionBar.primary.content.styles.fontSize') {
    promptFailures.push('button text-style DO prompt patch path drifted');
  }
  if (buttonTextStyleExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== 20) {
    promptFailures.push('button text-style DO prompt patch value must be numeric');
  }
  if (buttonTextStyleExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('button text-style DO prompt missing funnels export verification');
  }
  const optionsTitleColorExecutable = runCustomerPrompt([
    '--prompt',
    'сделай цвет заголовка варианта #222222',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  if (optionsTitleColorExecutable.ok !== true) promptFailures.push('options title color DO prompt did not return ok=true');
  if (optionsTitleColorExecutable.mode !== 'do-cli') {
    promptFailures.push(`options title color DO prompt mode ${optionsTitleColorExecutable.mode}, expected do-cli`);
  }
  if (optionsTitleColorExecutable.action?.actionId !== 'editor.options.itemTitle.textStyle.color') {
    promptFailures.push(`options title color DO prompt resolved ${optionsTitleColorExecutable.action?.actionId}, expected options title color`);
  }
  if (optionsTitleColorExecutable.action?.runnerOk !== true) {
    promptFailures.push('options title color DO prompt runnerOk must be true');
  }
  if (optionsTitleColorExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('options title color DO prompt missing delegate-cli execution');
  }
  if (optionsTitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.options.items.0.title.appearance.color') {
    promptFailures.push('options title color DO prompt patch path drifted');
  }
  if (optionsTitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#222222') {
    promptFailures.push('options title color DO prompt patch value drifted');
  }
  if (optionsTitleColorExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('options title color DO prompt missing funnels export verification');
  }
  const optionsSubtitleColorExecutable = runCustomerPrompt([
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
  if (optionsSubtitleColorExecutable.ok !== true) promptFailures.push('options subtitle color DO prompt did not return ok=true');
  if (optionsSubtitleColorExecutable.mode !== 'do-cli') {
    promptFailures.push(`options subtitle color DO prompt mode ${optionsSubtitleColorExecutable.mode}, expected do-cli`);
  }
  if (optionsSubtitleColorExecutable.action?.actionId !== 'editor.options.itemSubtitle.textStyle.color') {
    promptFailures.push(`options subtitle color DO prompt resolved ${optionsSubtitleColorExecutable.action?.actionId}, expected options subtitle color`);
  }
  if (optionsSubtitleColorExecutable.action?.runnerOk !== true) {
    promptFailures.push('options subtitle color DO prompt runnerOk must be true');
  }
  if (optionsSubtitleColorExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('options subtitle color DO prompt missing delegate-cli execution');
  }
  if (optionsSubtitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.options.items.0.subtitle.appearance.color') {
    promptFailures.push('options subtitle color DO prompt patch path drifted');
  }
  if (optionsSubtitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#555555') {
    promptFailures.push('options subtitle color DO prompt patch value drifted');
  }
  if (optionsSubtitleColorExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('options subtitle color DO prompt missing funnels export verification');
  }
  const optionsSelectedBackgroundExecutable = runCustomerPrompt([
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
  if (optionsSelectedBackgroundExecutable.ok !== true) promptFailures.push('options selected background DO prompt did not return ok=true');
  if (optionsSelectedBackgroundExecutable.mode !== 'do-cli') {
    promptFailures.push(`options selected background DO prompt mode ${optionsSelectedBackgroundExecutable.mode}, expected do-cli`);
  }
  if (optionsSelectedBackgroundExecutable.action?.actionId !== 'editor.options.selectedItem.style.backgroundColor') {
    promptFailures.push(`options selected background DO prompt resolved ${optionsSelectedBackgroundExecutable.action?.actionId}, expected selected option background`);
  }
  if (optionsSelectedBackgroundExecutable.action?.runnerOk !== true) {
    promptFailures.push('options selected background DO prompt runnerOk must be true');
  }
  if (optionsSelectedBackgroundExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('options selected background DO prompt missing delegate-cli execution');
  }
  if (optionsSelectedBackgroundExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.options.selectedAppearance.backgroundColor') {
    promptFailures.push('options selected background DO prompt patch path drifted');
  }
  if (optionsSelectedBackgroundExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#ffee00') {
    promptFailures.push('options selected background DO prompt patch value drifted');
  }
  if (optionsSelectedBackgroundExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('options selected background DO prompt missing funnels export verification');
  }
  const contentTitleColorExecutable = runCustomerPrompt([
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
  if (contentTitleColorExecutable.ok !== true) promptFailures.push('content title color DO prompt did not return ok=true');
  if (contentTitleColorExecutable.mode !== 'do-cli') {
    promptFailures.push(`content title color DO prompt mode ${contentTitleColorExecutable.mode}, expected do-cli`);
  }
  if (contentTitleColorExecutable.action?.actionId !== 'editor.content.title.textStyle.color') {
    promptFailures.push(`content title color DO prompt resolved ${contentTitleColorExecutable.action?.actionId}, expected content title color`);
  }
  if (contentTitleColorExecutable.action?.runnerOk !== true) {
    promptFailures.push('content title color DO prompt runnerOk must be true');
  }
  if (contentTitleColorExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('content title color DO prompt missing delegate-cli execution');
  }
  if (contentTitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.copy.title.appearance.color') {
    promptFailures.push('content title color DO prompt patch path drifted');
  }
  if (contentTitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#333333') {
    promptFailures.push('content title color DO prompt patch value drifted');
  }
  if (contentTitleColorExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('content title color DO prompt missing funnels export verification');
  }
  const paywallTitleColorExecutable = runCustomerPrompt([
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
  if (paywallTitleColorExecutable.ok !== true) promptFailures.push('paywall title color DO prompt did not return ok=true');
  if (paywallTitleColorExecutable.mode !== 'do-cli') {
    promptFailures.push(`paywall title color DO prompt mode ${paywallTitleColorExecutable.mode}, expected do-cli`);
  }
  if (paywallTitleColorExecutable.action?.actionId !== 'editor.paywallBody.title.textStyle.color') {
    promptFailures.push(`paywall title color DO prompt resolved ${paywallTitleColorExecutable.action?.actionId}, expected paywall title color`);
  }
  if (paywallTitleColorExecutable.action?.runnerOk !== true) {
    promptFailures.push('paywall title color DO prompt runnerOk must be true');
  }
  if (paywallTitleColorExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('paywall title color DO prompt missing delegate-cli execution');
  }
  if (paywallTitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.copy.title.appearance.color') {
    promptFailures.push('paywall title color DO prompt patch path drifted');
  }
  if (paywallTitleColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#111111') {
    promptFailures.push('paywall title color DO prompt patch value drifted');
  }
  if (paywallTitleColorExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('paywall title color DO prompt missing funnels export verification');
  }
  const paywallReference = paywallTitleColorExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-body-title-styles',
  );
  if (paywallReference?.articleAlias !== 'help-block-paywall-body') {
    promptFailures.push('paywall title color DO prompt did not attach paywall body built-in article alias');
  }
  if (paywallReference?.referencePath !== 'help-block-paywall-body/screenedit-paywall-body-title-styles') {
    promptFailures.push('paywall title color DO prompt guide reference path drifted');
  }
  const paywallFooterBackgroundExecutable = runCustomerPrompt([
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
  if (paywallFooterBackgroundExecutable.ok !== true) promptFailures.push('paywall footer background DO prompt did not return ok=true');
  if (paywallFooterBackgroundExecutable.mode !== 'do-cli') {
    promptFailures.push(`paywall footer background DO prompt mode ${paywallFooterBackgroundExecutable.mode}, expected do-cli`);
  }
  if (paywallFooterBackgroundExecutable.action?.actionId !== 'editor.paywallFooter.style.backgroundColor') {
    promptFailures.push(`paywall footer background DO prompt resolved ${paywallFooterBackgroundExecutable.action?.actionId}, expected paywall footer background`);
  }
  if (paywallFooterBackgroundExecutable.action?.runnerOk !== true) {
    promptFailures.push('paywall footer background DO prompt runnerOk must be true');
  }
  if (paywallFooterBackgroundExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('paywall footer background DO prompt missing delegate-cli execution');
  }
  if (paywallFooterBackgroundExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.paywall.footerAppearance.backgroundColor') {
    promptFailures.push('paywall footer background DO prompt patch path drifted');
  }
  if (paywallFooterBackgroundExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#18181b') {
    promptFailures.push('paywall footer background DO prompt patch value drifted');
  }
  if (paywallFooterBackgroundExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('paywall footer background DO prompt missing funnels export verification');
  }
  const paywallFooterReference = paywallFooterBackgroundExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-footer-background-color',
  );
  if (paywallFooterReference?.articleAlias !== 'help-block-paywall-footer') {
    promptFailures.push('paywall footer background DO prompt did not attach paywall footer built-in article alias');
  }
  if (paywallFooterReference?.referencePath !== 'help-block-paywall-footer/screenedit-paywall-footer-background-color') {
    promptFailures.push('paywall footer background DO prompt guide reference path drifted');
  }
  const paywallHeaderRestoreExecutable = runCustomerPrompt([
    '--prompt',
    'Сделай размер шрифта restore ссылки в шапке пейволла 13 в Segmently для project_demo, funnel_demo, version_demo, screen_demo. Это тестовый прогон: не меняй данные, покажи dry-run CLI patch, статью с картинками и как будет проверка.',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  if (paywallHeaderRestoreExecutable.ok !== true) promptFailures.push('paywall header restore font-size DO prompt did not return ok=true');
  if (paywallHeaderRestoreExecutable.mode !== 'do-cli') {
    promptFailures.push(`paywall header restore font-size DO prompt mode ${paywallHeaderRestoreExecutable.mode}, expected do-cli`);
  }
  if (paywallHeaderRestoreExecutable.action?.actionId !== 'editor.paywallHeader.restoreLink.style.fontSize') {
    promptFailures.push(`paywall header restore font-size DO prompt resolved ${paywallHeaderRestoreExecutable.action?.actionId}, expected paywall header restore font size`);
  }
  if (paywallHeaderRestoreExecutable.action?.runnerOk !== true) {
    promptFailures.push('paywall header restore font-size DO prompt runnerOk must be true');
  }
  if (paywallHeaderRestoreExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('paywall header restore font-size DO prompt missing delegate-cli execution');
  }
  if (paywallHeaderRestoreExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.paywall.restoreLabel.appearance.fontSize') {
    promptFailures.push('paywall header restore font-size DO prompt patch path drifted');
  }
  if (paywallHeaderRestoreExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== 13) {
    promptFailures.push('paywall header restore font-size DO prompt patch value drifted');
  }
  if (paywallHeaderRestoreExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('paywall header restore font-size DO prompt missing funnels export verification');
  }
  const paywallHeaderReference = paywallHeaderRestoreExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-header-restore-font-size',
  );
  if (paywallHeaderReference?.articleAlias !== 'help-block-paywall-header') {
    promptFailures.push('paywall header restore font-size DO prompt did not attach paywall header built-in article alias');
  }
  if (paywallHeaderReference?.referencePath !== 'help-block-paywall-header/screenedit-paywall-header-restore-font-size') {
    promptFailures.push('paywall header restore font-size DO prompt guide reference path drifted');
  }
  if (paywallHeaderRestoreExecutable.missingArticleClaimed === true) {
    promptFailures.push('paywall header restore font-size DO prompt incorrectly claimed article missing');
  }
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
  if (paywallMediaHeightExecutable.ok !== true) promptFailures.push('paywall media height DO prompt did not return ok=true');
  if (paywallMediaHeightExecutable.mode !== 'do-cli') {
    promptFailures.push(`paywall media height DO prompt mode ${paywallMediaHeightExecutable.mode}, expected do-cli`);
  }
  if (paywallMediaHeightExecutable.action?.actionId !== 'editor.paywallMedia.style.heightPercentage') {
    promptFailures.push(`paywall media height DO prompt resolved ${paywallMediaHeightExecutable.action?.actionId}, expected paywall media height`);
  }
  if (paywallMediaHeightExecutable.action?.runnerOk !== true) {
    promptFailures.push('paywall media height DO prompt runnerOk must be true');
  }
  if (paywallMediaHeightExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('paywall media height DO prompt missing delegate-cli execution');
  }
  if (paywallMediaHeightExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.featuredMedia.appearance.dimensions.heightPercentage') {
    promptFailures.push('paywall media height DO prompt patch path drifted');
  }
  if (paywallMediaHeightExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== 65) {
    promptFailures.push('paywall media height DO prompt patch value drifted');
  }
  if (paywallMediaHeightExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('paywall media height DO prompt missing funnels export verification');
  }
  const paywallMediaReference = paywallMediaHeightExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-media-height-percentage',
  );
  if (paywallMediaReference?.articleAlias !== 'help-block-paywall-media') {
    promptFailures.push('paywall media height DO prompt did not attach paywall media built-in article alias');
  }
  if (paywallMediaReference?.referencePath !== 'help-block-paywall-media/screenedit-paywall-media-height-percentage') {
    promptFailures.push('paywall media height DO prompt guide reference path drifted');
  }
  const paywallSubscriptionsPriceExecutable = runCustomerPrompt([
    '--prompt',
    'Сделай цену тарифа на пейволле размером 22 в Segmently для project_demo, funnel_demo, version_demo, screen_demo. Это тестовый прогон: не меняй данные, покажи dry-run CLI patch, статью с картинками и как будет проверка.',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  if (paywallSubscriptionsPriceExecutable.ok !== true) promptFailures.push('paywall subscriptions price font-size DO prompt did not return ok=true');
  if (paywallSubscriptionsPriceExecutable.mode !== 'do-cli') {
    promptFailures.push(`paywall subscriptions price font-size DO prompt mode ${paywallSubscriptionsPriceExecutable.mode}, expected do-cli`);
  }
  if (paywallSubscriptionsPriceExecutable.action?.actionId !== 'editor.paywallSubscriptions.price.textStyle.fontSize') {
    promptFailures.push(`paywall subscriptions price font-size DO prompt resolved ${paywallSubscriptionsPriceExecutable.action?.actionId}, expected price font size`);
  }
  if (paywallSubscriptionsPriceExecutable.action?.runnerOk !== true) {
    promptFailures.push('paywall subscriptions price font-size DO prompt runnerOk must be true');
  }
  if (paywallSubscriptionsPriceExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('paywall subscriptions price font-size DO prompt missing delegate-cli execution');
  }
  if (paywallSubscriptionsPriceExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.paywall.products.items.0.topEndLabel.appearance.fontSize') {
    promptFailures.push('paywall subscriptions price font-size DO prompt patch path drifted');
  }
  if (paywallSubscriptionsPriceExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== 22) {
    promptFailures.push('paywall subscriptions price font-size DO prompt patch value drifted');
  }
  if (paywallSubscriptionsPriceExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('paywall subscriptions price font-size DO prompt missing funnels export verification');
  }
  const paywallSubscriptionsReference = paywallSubscriptionsPriceExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-subscriptions-top-end-label',
  );
  if (paywallSubscriptionsReference?.articleAlias !== 'help-block-paywall-subscriptions') {
    promptFailures.push('paywall subscriptions price font-size DO prompt did not attach built-in article alias');
  }
  if (paywallSubscriptionsReference?.referencePath !== 'help-block-paywall-subscriptions/screenedit-paywall-subscriptions-top-end-label') {
    promptFailures.push('paywall subscriptions price font-size DO prompt guide reference path drifted');
  }
  const paywallSubscriptionsSelectedExecutable = runCustomerPrompt([
    '--prompt',
    'Поменяй фон выбранного тарифа пейволла на #ffc201 в Segmently для project_demo, funnel_demo, version_demo, screen_demo. Это тестовый прогон: не меняй данные, покажи dry-run CLI patch, статью с картинками и как будет проверка.',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  if (paywallSubscriptionsSelectedExecutable.ok !== true) promptFailures.push('paywall subscriptions selected background DO prompt did not return ok=true');
  if (paywallSubscriptionsSelectedExecutable.mode !== 'do-cli') {
    promptFailures.push(`paywall subscriptions selected background DO prompt mode ${paywallSubscriptionsSelectedExecutable.mode}, expected do-cli`);
  }
  if (paywallSubscriptionsSelectedExecutable.action?.actionId !== 'editor.paywallSubscriptions.selectedItem.style.backgroundColor') {
    promptFailures.push(`paywall subscriptions selected background DO prompt resolved ${paywallSubscriptionsSelectedExecutable.action?.actionId}, expected selected item background`);
  }
  if (paywallSubscriptionsSelectedExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.paywall.products.selectedAppearance.backgroundColor') {
    promptFailures.push('paywall subscriptions selected background DO prompt patch path drifted');
  }
  if (paywallSubscriptionsSelectedExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#ffc201') {
    promptFailures.push('paywall subscriptions selected background DO prompt patch value drifted');
  }
  const paywallSubscriptionsSelectedReference = paywallSubscriptionsSelectedExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-paywall-subscriptions-selected-state',
  );
  if (paywallSubscriptionsSelectedReference?.articleAlias !== 'help-block-paywall-subscriptions') {
    promptFailures.push('paywall subscriptions selected background DO prompt did not attach built-in article alias');
  }
  const headerBackFontSizeExecutable = runCustomerPrompt([
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
  if (headerBackFontSizeExecutable.ok !== true) promptFailures.push('header back font-size DO prompt did not return ok=true');
  if (headerBackFontSizeExecutable.mode !== 'do-cli') {
    promptFailures.push(`header back font-size DO prompt mode ${headerBackFontSizeExecutable.mode}, expected do-cli`);
  }
  if (headerBackFontSizeExecutable.action?.actionId !== 'editor.header.backButton.textStyle.fontSize') {
    promptFailures.push(`header back font-size DO prompt resolved ${headerBackFontSizeExecutable.action?.actionId}, expected header back font size`);
  }
  if (headerBackFontSizeExecutable.action?.runnerOk !== true) {
    promptFailures.push('header back font-size DO prompt runnerOk must be true');
  }
  if (headerBackFontSizeExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('header back font-size DO prompt missing delegate-cli execution');
  }
  if (headerBackFontSizeExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.header.back.content.appearance.fontSize') {
    promptFailures.push('header back font-size DO prompt patch path drifted');
  }
  if (headerBackFontSizeExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== 13) {
    promptFailures.push('header back font-size DO prompt patch value must be numeric');
  }
  if (headerBackFontSizeExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('header back font-size DO prompt missing funnels export verification');
  }
  const textFieldFontSizeExecutable = runCustomerPrompt([
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
  if (textFieldFontSizeExecutable.ok !== true) promptFailures.push('text field font-size DO prompt did not return ok=true');
  if (textFieldFontSizeExecutable.mode !== 'do-cli') {
    promptFailures.push(`text field font-size DO prompt mode ${textFieldFontSizeExecutable.mode}, expected do-cli`);
  }
  if (textFieldFontSizeExecutable.action?.actionId !== 'editor.textField.style.fontSize') {
    promptFailures.push(`text field font-size DO prompt resolved ${textFieldFontSizeExecutable.action?.actionId}, expected text field font size`);
  }
  if (textFieldFontSizeExecutable.action?.runnerOk !== true) {
    promptFailures.push('text field font-size DO prompt runnerOk must be true');
  }
  if (textFieldFontSizeExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('text field font-size DO prompt missing delegate-cli execution');
  }
  if (textFieldFontSizeExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.textField.placeholder.appearance.fontSize') {
    promptFailures.push('text field font-size DO prompt patch path drifted');
  }
  if (textFieldFontSizeExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== 18) {
    promptFailures.push('text field font-size DO prompt patch value must be numeric');
  }
  if (textFieldFontSizeExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('text field font-size DO prompt missing funnels export verification');
  }
  const rollerLabelColorExecutable = runCustomerPrompt([
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
  if (rollerLabelColorExecutable.ok !== true) promptFailures.push('roller label color DO prompt did not return ok=true');
  if (rollerLabelColorExecutable.mode !== 'do-cli') {
    promptFailures.push(`roller label color DO prompt mode ${rollerLabelColorExecutable.mode}, expected do-cli`);
  }
  if (rollerLabelColorExecutable.action?.actionId !== 'editor.roller.style.labelColor') {
    promptFailures.push(`roller label color DO prompt resolved ${rollerLabelColorExecutable.action?.actionId}, expected roller label color`);
  }
  if (rollerLabelColorExecutable.action?.runnerOk !== true) {
    promptFailures.push('roller label color DO prompt runnerOk must be true');
  }
  if (rollerLabelColorExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('roller label color DO prompt missing delegate-cli execution');
  }
  if (rollerLabelColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.roller.labelAppearance.color') {
    promptFailures.push('roller label color DO prompt patch path drifted');
  }
  if (rollerLabelColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#123456') {
    promptFailures.push('roller label color DO prompt patch value drifted');
  }
  if (rollerLabelColorExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('roller label color DO prompt missing funnels export verification');
  }
  const stepperFillColorExecutable = runCustomerPrompt([
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
  if (stepperFillColorExecutable.ok !== true) promptFailures.push('stepper fill color DO prompt did not return ok=true');
  if (stepperFillColorExecutable.mode !== 'do-cli') {
    promptFailures.push(`stepper fill color DO prompt mode ${stepperFillColorExecutable.mode}, expected do-cli`);
  }
  if (stepperFillColorExecutable.action?.actionId !== 'editor.stepper.style.fillColor') {
    promptFailures.push(`stepper fill color DO prompt resolved ${stepperFillColorExecutable.action?.actionId}, expected stepper fill color`);
  }
  if (stepperFillColorExecutable.action?.runnerOk !== true) {
    promptFailures.push('stepper fill color DO prompt runnerOk must be true');
  }
  if (stepperFillColorExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('stepper fill color DO prompt missing delegate-cli execution');
  }
  if (stepperFillColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.path !== 'content.stepper.appearance.fillColor') {
    promptFailures.push('stepper fill color DO prompt patch path drifted');
  }
  if (stepperFillColorExecutable.action?.execution?.materialize?.content?.operations?.[0]?.value !== '#22c55e') {
    promptFailures.push('stepper fill color DO prompt patch value drifted');
  }
  if (stepperFillColorExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('stepper fill color DO prompt missing funnels export verification');
  }
  const flexibleSectionBackgroundExecutable = runCustomerPrompt([
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
  if (flexibleSectionBackgroundExecutable.ok !== true) promptFailures.push('flexible section background DO prompt did not return ok=true');
  if (flexibleSectionBackgroundExecutable.mode !== 'do-cli') {
    promptFailures.push(`flexible section background DO prompt mode ${flexibleSectionBackgroundExecutable.mode}, expected do-cli`);
  }
  if (flexibleSectionBackgroundExecutable.action?.actionId !== 'editor.flexibleSections.section.layout.backgroundColor') {
    promptFailures.push(`flexible section background DO prompt resolved ${flexibleSectionBackgroundExecutable.action?.actionId}, expected flexible section background`);
  }
  if (flexibleSectionBackgroundExecutable.action?.runnerOk !== true) {
    promptFailures.push('flexible section background DO prompt runnerOk must be true');
  }
  if (flexibleSectionBackgroundExecutable.action?.execution?.kind !== 'delegate-cli') {
    promptFailures.push('flexible section background DO prompt missing delegate-cli execution');
  }
  const flexibleOperation = flexibleSectionBackgroundExecutable.action?.execution?.materialize?.content?.operations?.[0];
  if (flexibleOperation?.op !== 'setFlexibleSectionLayoutField') {
    promptFailures.push('flexible section background DO prompt patch op drifted');
  }
  if (flexibleOperation?.sectionId !== 'section_demo') {
    promptFailures.push('flexible section background DO prompt sectionId drifted');
  }
  if (flexibleOperation?.field !== 'layout.background.color') {
    promptFailures.push('flexible section background DO prompt field drifted');
  }
  if (flexibleOperation?.value !== '#fef3c7') {
    promptFailures.push('flexible section background DO prompt patch value drifted');
  }
  if (flexibleSectionBackgroundExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('flexible section background DO prompt missing funnels export verification');
  }
  const flexibleReference = flexibleSectionBackgroundExecutable.guidance?.builtInArticleReferences?.find(
    reference => reference.guideKey === 'screenedit-flexible-sections-background-color',
  );
  if (flexibleReference?.articleAlias !== 'help-block-flexible-sections') {
    promptFailures.push('flexible section background DO prompt did not attach built-in Flexible Sections article alias');
  }
  if (flexibleReference?.referencePath !== 'help-block-flexible-sections/screenedit-flexible-sections-background-color') {
    promptFailures.push('flexible section background DO prompt reference path drifted');
  }
  const e2eMissing = runCustomerPrompt(['--prompt', 'сделай шрифт ячейки в списке 18']);
  if (e2eMissing.ok !== true) promptFailures.push('missing-input E2E prompt did not return ok=true');
  if (e2eMissing.mode !== 'do-e2e') promptFailures.push(`missing-input E2E prompt mode ${e2eMissing.mode}, expected do-e2e`);
  if (e2eMissing.action?.actionId !== 'editor.list.options.itemTitle.fontSize') {
    promptFailures.push(`missing-input E2E prompt resolved ${e2eMissing.action?.actionId}, expected list title font size`);
  }
  if (!Array.isArray(e2eMissing.action?.missingInputs) || !e2eMissing.action.missingInputs.includes('projectId')) {
    promptFailures.push('missing-input E2E prompt did not ask for required projectId');
  }
  if (e2eMissing.completionClaim !== 'needs-inputs-before-execution') {
    promptFailures.push('missing-input E2E prompt must not claim execution before inputs');
  }
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
  if (e2eExecutable.ok !== true) promptFailures.push('executable E2E prompt did not return ok=true');
  if (e2eExecutable.action?.runnerOk !== true) promptFailures.push('executable E2E prompt runnerOk must be true');
  if (e2eExecutable.action?.execution?.kind !== 'playwright-bowser') {
    promptFailures.push('executable E2E prompt missing playwright-bowser execution');
  }
  if (e2eExecutable.action?.executeWith?.companionSkill !== 'segmently-test-kit') {
    promptFailures.push('executable E2E prompt missing segmently-test-kit companion');
  }
  if (e2eExecutable.action?.verification?.read !== 'funnels export') {
    promptFailures.push('executable E2E prompt missing funnels export verification');
  }
  if (containsPlaceholder(e2eExecutable.action?.verification?.argv)) {
    promptFailures.push('executable E2E prompt verification argv contains unresolved placeholder');
  }
} catch (error) {
  promptFailures.push(`customer prompt surface failed: ${error instanceof Error ? error.message : String(error)}`);
}
report('customer-surface-prompt:freeform-teach-show-inputs-and-execution-contracts', promptFailures);

// ---- Gate 13: customer-surface acceptance runner -------------------------
const customerSurfaceFailures = [];
try {
  const out = execFileSync('node', [join(root, 'scripts/run-customer-surface-acceptance.mjs')], { encoding: 'utf8' });
  if (!out.includes('customer-surface acceptance passed')) {
    customerSurfaceFailures.push('acceptance runner did not report success');
  }
} catch (error) {
  const e = error;
  customerSurfaceFailures.push(`customer-surface acceptance runner failed: ${e instanceof Error ? e.message : String(e)}`);
}
report('customer-surface-acceptance:raw-prompts-source-safe-and-do-contracts', customerSurfaceFailures);

// ---- finish ---------------------------------------------------------------
if (failures > 0) {
  console.error(`${failures} gate(s) failed`);
  process.exit(1);
}
console.log(`all gates passed (${evals.evals.length} eval(s) + meta-guard + leak-guard + teach-reference + do-action-reference + codex-dispatch-contract + cli-do-runner + e2e-do-runner + show-runner + coverage-audit + persona-flow + customer-surface-prompt-with-show + customer-surface-acceptance)`);

// ---- helpers --------------------------------------------------------------
function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}
function report(id, failedMessages) {
  if (failedMessages.length) {
    failures += 1;
    console.error(`not ok - ${id}`);
    for (const m of failedMessages) console.error(`  ${m}`);
  } else {
    console.log(`ok - ${id}`);
  }
}
function extractDescription(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  const line = match[1].split('\n').find((l) => l.startsWith('description:'));
  return line ? line.slice('description:'.length).trim() : '';
}
function listProjectionFiles(dir) {
  // SKILL.md + references/ + customer-safe action registry. Runtime scripts and
  // eval data are excluded because they contain guard vocabulary.
  const out = [join(dir, 'SKILL.md')];
  const referencesDir = join(dir, 'references');
  for (const entry of readdirSync(referencesDir)) {
    if (entry.startsWith('.')) continue;
    const full = join(referencesDir, entry);
    if (statSync(full).isFile()) out.push(full);
  }
  const actionReference = join(dir, 'runtime/do-action-reference.json');
  if (existsSync(actionReference)) out.push(actionReference);
  return out;
}
function findInstalledSkill(skillName) {
  for (const skillsDir of candidateSkillDirs()) {
    if (existsSync(join(skillsDir, skillName, 'SKILL.md'))) return join(skillsDir, skillName);
  }
  return null;
}
function candidateSkillDirs() {
  const dirs = [dirname(root)];
  const repoRoot = findRepoRoot(root);
  if (repoRoot) dirs.push(join(repoRoot, '.agents/skills'));
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  dirs.push(join(codexHome, 'skills'));
  return [...new Set(dirs)];
}
function findRepoRoot(start) {
  let current = start;
  while (current && current !== dirname(current)) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'modules/support-flow/MODULE.md'))) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

function runRunner(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function runRunnerExpectingExit(args, expectedStatus) {
  const result = spawnSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus) {
    throw new Error(`expected exit ${expectedStatus}, got ${result.status}: ${result.stderr}`);
  }
  if (!result.stdout) throw new Error('runner did not emit JSON');
  return JSON.parse(result.stdout);
}

function runCliRunner(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/cli-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function runCliRunnerExpectingExit(args, expectedStatus) {
  const result = spawnSync('node', [join(root, 'runtime/cli-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus) {
    throw new Error(`expected exit ${expectedStatus}, got ${result.status}: ${result.stderr}`);
  }
  if (!result.stdout) throw new Error('CLI runner did not emit JSON');
  return JSON.parse(result.stdout);
}

function runE2eRunner(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/e2e-do-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(stdout);
}

function runE2eRunnerExpectingExit(args, expectedStatus) {
  const result = spawnSync('node', [join(root, 'runtime/e2e-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus) {
    throw new Error(`expected exit ${expectedStatus}, got ${result.status}: ${result.stderr}`);
  }
  if (!result.stdout) throw new Error('E2E runner did not emit JSON');
  return JSON.parse(result.stdout);
}

function runShowRunner(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/show-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
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
  });
  return JSON.parse(stdout);
}

function runCustomerPrompt(args) {
  const stdout = execFileSync('node', [
    join(root, 'runtime/customer-response-runner.mjs'),
    ...args,
  ], {
    encoding: 'utf8',
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
  return /(сделай|создай|подключи|поставь|опубликуй|поменяй|измени|зацикли|скругли|включи|выключи|можешь|attach|create|publish|set|connect|apply|do it|make|change|enable|disable)/i.test(String(text ?? ''));
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
  if (id.endsWith('.viewKind')) return 'Horizontal';
  if (id.endsWith('.productLayout')) return 'LabelsCheckbox';
  if (id.endsWith('.startColumnWidthPercentage')) return '65';
  if (/\.itemPadding\.|\.listPadding\./.test(id)) return '16';
  if (id.endsWith('.fontSize')) return '20';
  if (id.endsWith('.lineHeight')) return '24';
  if (id.endsWith('.fontWeight')) return '700';
  if (id.endsWith('.backgroundColor')) return '#ffc201';
  if (id.endsWith('.borderColor')) return '#52525b';
  if (id.endsWith('.borderWidth')) return '2';
  if (id.endsWith('.cornerRadius')) return '12';
  if (id.endsWith('.color')) return '#111111';
  if (id.endsWith('.checkedColor')) return '#22c55e';
  if (id.endsWith('.uncheckedColor')) return '#a1a1aa';
  if (id.endsWith('.align')) return 'center';
  if (id.endsWith('.backgroundColorOpacity')) return '80';
  if (id.endsWith('.backgroundCornerRadius')) return '8';
  return 'Inter';
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
