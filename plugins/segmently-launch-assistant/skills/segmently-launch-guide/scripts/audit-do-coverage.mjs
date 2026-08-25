#!/usr/bin/env node
/**
 * Audits shipped DO coverage from installed skill artifacts only.
 *
 * This is intentionally an inventory gate, not a claim that every setting can
 * be mutated. It answers:
 *   1. Which published help settings have an exact, block-level, or conditional
 *      DO contract?
 *   2. Which article/settings remain teach/show-only and need a future safe
 *      CLI/E2E/domain operation?
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONDITIONAL_PROBES = Object.freeze([
  {
    id: 'shared-media-video-upload',
    prompt: 'сделай видео в списке',
    expectedMode: 'do-e2e-conditional',
    expectedActionId: 'browser.media.videoUpload',
    expectedArticleAlias: 'help-block-media',
    coveredGuideKeys: ['screenedit-media-video-upload'],
  },
  {
    id: 'paywall-media-video-upload',
    prompt: 'сделай видео в пейволе',
    expectedMode: 'do-e2e-conditional',
    expectedActionId: 'browser.paywallMedia.videoUpload',
    expectedArticleAlias: 'help-block-paywall-media',
    coveredGuideKeys: ['screenedit-paywall-media-video'],
  },
]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    writeText(report, args);
  }

  if (args.strict && report.strictFailures.length > 0) {
    process.exitCode = 1;
  }
  if (args.failOnDoGaps && report.settings.teachOnlySettingCount > 0) {
    process.exitCode = 1;
  }
}

function buildReport(args) {
  const {
    corpusSchemaVersion,
    helpArticleReference,
    guideEvidence,
    teachReference,
  } = loadAuditCorpusInputs();
  const doActionReference = readJson('runtime/do-action-reference.json');
  const supportedActions = (doActionReference.actions ?? []).filter(action => action.status === 'supported');
  const conditionalProbeResults = runConditionalProbes(corpusSchemaVersion);
  const conditionalByGuideKey = new Map();
  for (const probe of conditionalProbeResults) {
    if (!probe.ok) continue;
    for (const guideKey of probe.coveredGuideKeys) {
      conditionalByGuideKey.set(guideKey, probe);
    }
  }

  const knownReferences = buildKnownReferenceSet(helpArticleReference, guideEvidence, teachReference);
  const actionsByFallback = groupActionsByFallback(supportedActions);
  const settings = buildSettingRows(helpArticleReference, actionsByFallback, conditionalByGuideKey);
  const gapTaxonomy = buildGapTaxonomy(settings.coverageRows.filter(row => row.coverageKind === 'teach-show-only'));
  const articleCoverage = buildArticleCoverage(helpArticleReference, settings, supportedActions, actionsByFallback);
  const actionRegistry = buildActionRegistry(doActionReference, supportedActions, knownReferences);
  const strictFailures = buildStrictFailures({
    args,
    corpusSchemaVersion,
    actionRegistry,
    settings,
    gapTaxonomy,
    articleCoverage,
    conditionalProbeResults,
  });

  return {
    schemaVersion: 1,
    corpusSchemaVersion,
    ok: strictFailures.length === 0,
    policy: {
      everySettingDoRequired: false,
      teachOnlyRowsAreInventory: true,
      failOnDoGapsAvailable: true,
      exactSettingDoPreferred: true,
      blockLevelDoIsActionableButNeedsResolverSpecificity: true,
      conditionalBrowserDoCountedSeparately: true,
    },
    actionRegistry,
    settings,
    gapTaxonomy,
    articleCoverage,
    conditionalActions: {
      probes: conditionalProbeResults,
      coveredGuideKeys: [...conditionalByGuideKey.keys()].sort(),
    },
    strictFailures,
  };
}

function loadAuditCorpusInputs() {
  if (existsSync(join(root, 'references/help-article-reference.json'))) {
    return {
      corpusSchemaVersion: 1,
      helpArticleReference: readJson('references/help-article-reference.json'),
      guideEvidence: readJson('references/guide-evidence.json'),
      teachReference: readJson('references/teach-reference.json'),
    };
  }

  const directory = readJson('references/corpus-v2/article-directory.json');
  const bindings = readJson('references/corpus-v2/guide-bindings.json');
  const sections = readJsonLines('references/corpus-v2/article-section-index.jsonl');
  const sectionsByArticle = new Map();
  for (const section of sections) {
    const bucket = sectionsByArticle.get(section.articleAlias) ?? [];
    for (const guideKey of section.guideKeys ?? []) {
      bucket.push({
        guideKey,
        title: section.title,
        sectionType: 'article-section',
        group: section.productArea ?? null,
        articleSectionUrl: `https://help.segmently.ai/${section.articleAlias}#${section.sectionId}`,
        imageUrl: null,
      });
    }
    sectionsByArticle.set(section.articleAlias, bucket);
  }
  return {
    corpusSchemaVersion: 2,
    helpArticleReference: {
      schemaVersion: 2,
      articles: (directory.articles ?? []).map((article) => ({
        alias: article.articleAlias,
        title: article.title,
        publishedUrl: article.publishedUrl,
        settings: sectionsByArticle.get(article.articleAlias) ?? [],
      })),
    },
    guideEvidence: {
      schemaVersion: 2,
      guides: (bindings.guides ?? []).map((guide) => ({
        guideKey: guide.guideKey,
        articleAlias: guide.articleBindings?.[0]?.articleAlias ?? null,
      })),
    },
    teachReference: {
      schemaVersion: 2,
      articleAliases: (directory.articles ?? []).map((article) => article.articleAlias),
      blocksByAlias: {},
    },
  };
}

const GAP_FAMILY_RULES = Object.freeze([
  {
    family: 'variable-binding-and-scoring',
    label: 'Variable binding and answer scoring',
    match: /variable-binding|score-effect|stored answer|answer is saved|points this answer/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Variable binding domain command with explicit variable creation, option mapping, and scoring operations.',
    requiredRunner: 'cli-do-runner domain operation with readback from funnels export and variable registry.',
    requiredLiveCases: ['do-cli-variable-binding-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'These rows create or connect variable structures; direct scalar field patches would be unsafe.',
  },
  {
    family: 'custom-html-and-webembed-data',
    label: 'Custom HTML, iframe isolation, and WebEmbed data sources',
    match: /screenedit-embed|custom screen code|iframe|html|data sources/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Custom-screen/WebEmbed apply command that validates HTML/data payloads and sandbox settings.',
    requiredRunner: 'segmently-cli-custom-screen-guide plus cli-do-runner verification.',
    requiredLiveCases: ['do-cli-custom-html-apply-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Custom code and data-source edits need payload validation and are not generic screen scalar settings.',
  },
  {
    family: 'media-assets-and-image-layout',
    label: 'Images, uploaded assets, and media sizing',
    match: /hero-url|slide-image|image itself|picture|featured image|image fills|fixed image|image by screen|image-layout|image layout|image sits|image area|image look|bullet image|hero-width|hero-height|height-percentage|scale-mode|corner-radius/i,
    recommendedExecution: 'conditional-browser-e2e',
    requiredBackendPolicy: 'Asset upload/link command or browser upload flow with CDN readback.',
    requiredRunner: 'playwright-bowser + segmently-test-kit for uploads, or segmently-cli-image-upload when a stable asset command exists.',
    requiredLiveCases: ['do-e2e-media-image-upload-live'],
    releaseGateStatus: 'planned-conditional-browser-flow',
    rationale: 'Customer asks often include local files or URLs; the flow must prove upload/CDN state, not just patch a URL-looking field.',
  },
  {
    family: 'options-structure-and-items',
    label: 'Options/list item structure, limits, order, and cell layout',
    match: /screenedit-options|shuffle item|cap on multi|choice shows|grid cell|choice|checkbox|item layout|vertical alignment of items|max selections|items-spacing|cell-dimensions/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Options domain operation for item arrays, limits, randomization, checkbox/image/text containers, and safe defaults.',
    requiredRunner: 'cli-do-runner domain operation plus optional browser verification for visual layout.',
    requiredLiveCases: ['do-cli-options-structure-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Options settings often mutate arrays or coordinated layout objects, so exact intent and target item semantics are required.',
  },
  {
    family: 'paywall-body-benefits',
    label: 'Paywall body copy and benefit checklist structure',
    match: /paywall-body|benefit checklist|feature bullets|bullet titles|bullet subtitles|bullet icons/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Paywall body domain operation for title/subtitle copy, feature list items, and bullet style structures.',
    requiredRunner: 'cli-do-runner with Paywall screen validation and funnels export readback.',
    requiredLiveCases: ['do-cli-paywall-body-benefits-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Benefit lists combine copy, item arrays, and nested style objects; scalar patches cover only a subset today.',
  },
  {
    family: 'paywall-footer-links-and-legal-copy',
    label: 'Paywall footer purchase, restore, and legal links',
    match: /paywall-footer|terms|privacy|restore purchases|auto-renew|purchase button text|legal/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Paywall footer domain operation for localized copy, legal URLs, restore link, and element ordering.',
    requiredRunner: 'cli-do-runner with Paywall screen validation and URL/readback verification.',
    requiredLiveCases: ['do-cli-paywall-footer-links-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Footer edits mix copy, URLs, ordering, and platform-specific legal behavior.',
  },
  {
    family: 'header-navigation-progress',
    label: 'Header buttons, progress indicator, and header bar layout',
    match: /screenedit-header|progress bar|back button|skip button|header bar|header icon|progress text/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Header domain operation for navigation labels, progress kind, colors, alignment, insets, and bar appearance.',
    requiredRunner: 'cli-do-runner with screen-kind support checks and funnels export readback.',
    requiredLiveCases: ['do-cli-header-progress-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Header settings are coordinated across buttons, progress indicator, and container layout.',
  },
  {
    family: 'carousel-slides-and-timing',
    label: 'Carousel slide content and timing',
    match: /carousel|slide content|slide headline|slide supporting|slide extra|total play time|slide shows/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Carousel slide domain operation for slide arrays, content templates, media, and timing ranges.',
    requiredRunner: 'cli-do-runner with carousel screen validation and browser preview verification when timing/media changes.',
    requiredLiveCases: ['do-cli-carousel-slides-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Carousel changes are array/timing operations, not isolated scalar field edits.',
  },
  {
    family: 'basic-config-object-toggles',
    label: 'Basic Config object toggles',
    match: /basic-config.*(permission|countdown)|device permission|auto-advance/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Basic Config domain operation that safely creates/removes nullable objects before setting scalar leaves.',
    requiredRunner: 'cli-do-runner with backend dry-run preflight and funnels export verification.',
    requiredLiveCases: ['do-cli-basic-config-object-toggle-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'The current generic scalar pass excludes nullable object creation/removal by design.',
  },
  {
    family: 'spacing-and-insets',
    label: 'Padding, margin, spacing, insets, and dimensions',
    match: /padding|paddings|margin|spacing|insets|space around|space inside|height|width|dimensions|rounded|corner/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Layout domain operation for responsive spacing/dimension objects with unit and screen-kind validation.',
    requiredRunner: 'cli-do-runner plus optional browser verification for visual layout.',
    requiredLiveCases: ['do-cli-layout-spacing-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Spacing and dimensions are usually nested responsive objects; backend policy must validate units and defaults.',
  },
  {
    family: 'visual-effects-icons-and-rich-styles',
    label: 'Gradients, shadows, motion effects, icons, and rich visual styles',
    match: /gradient|shadow|motion|effects|icon|container|shape and fill|background|opacity|see-through|color|style the|styles/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Visual style domain operation for gradients, shadows, effects, icons, and coordinated style objects.',
    requiredRunner: 'cli-do-runner with visual preview verification when style object semantics are complex.',
    requiredLiveCases: ['do-cli-rich-visual-style-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Rich visual styles require structured object validation and sometimes uploaded assets, not blind scalar patches.',
  },
  {
    family: 'copy-and-label-text',
    label: 'Customer-facing copy and labels',
    match: /label|text|headline|subtitle|title|supporting line|extra line|main button|secondary button|write the|configure .* text|line under/i,
    recommendedExecution: 'cli-domain-operation',
    requiredBackendPolicy: 'Copy/text domain operation with locale awareness and screen-kind specific paths.',
    requiredRunner: 'cli-do-runner with funnels export readback and optional preview verification.',
    requiredLiveCases: ['do-cli-copy-text-live'],
    releaseGateStatus: 'planned-domain-operation',
    rationale: 'Copy changes look scalar but need locale, block, and screen-kind semantics before broad customer mutation.',
  },
]);

function buildKnownReferenceSet(helpArticleReference, guideEvidence, teachReference) {
  const known = new Set();
  for (const article of helpArticleReference.articles ?? []) {
    if (article.alias) known.add(article.alias);
    for (const setting of article.settings ?? []) {
      if (setting.guideKey) known.add(setting.guideKey);
    }
  }
  for (const guide of guideEvidence.guides ?? []) {
    if (guide.guideKey) known.add(guide.guideKey);
    if (guide.articleAlias) known.add(guide.articleAlias);
    if (guide.articleId) known.add(guide.articleId);
  }
  for (const alias of teachReference.articleAliases ?? []) known.add(alias);
  for (const alias of Object.keys(teachReference.blocksByAlias ?? {})) known.add(alias);
  return known;
}

function groupActionsByFallback(actions) {
  const byFallback = new Map();
  for (const action of actions) {
    const fallback = action.teachFallback?.articleAlias;
    if (!fallback) continue;
    const bucket = byFallback.get(fallback) ?? [];
    bucket.push(toActionSummary(action));
    byFallback.set(fallback, bucket);
  }
  return byFallback;
}

function buildSettingRows(helpArticleReference, actionsByFallback, conditionalByGuideKey) {
  const coverageRows = [];
  for (const article of helpArticleReference.articles ?? []) {
    for (const setting of article.settings ?? []) {
      const exactActions = actionsByFallback.get(setting.guideKey) ?? [];
      const blockLevelActions = actionsByFallback.get(article.alias) ?? [];
      const conditional = conditionalByGuideKey.get(setting.guideKey) ?? null;
      const coverageKind = conditional
        ? 'conditional-browser-do'
        : exactActions.length > 0
          ? 'exact-do'
          : blockLevelActions.length > 0
            ? 'block-level-do'
            : 'teach-show-only';
      coverageRows.push({
        articleAlias: article.alias,
        articleTitle: article.title ?? null,
        guideKey: setting.guideKey,
        title: setting.title ?? null,
        sectionType: setting.sectionType ?? null,
        group: setting.group ?? null,
        articleSectionUrl: setting.articleSectionUrl ?? null,
        imageUrl: setting.imageUrl ?? null,
        coverageKind,
        exactActions,
        blockLevelActions,
        conditionalAction: conditional
          ? {
              id: conditional.expectedActionId,
              prompt: conditional.prompt,
              mode: conditional.mode,
              supportedBoundary: conditional.supportedBoundary,
            }
          : null,
      });
    }
  }

  const exactSettingCount = coverageRows.filter(row => row.exactActions.length > 0).length;
  const blockLevelSettingCount = coverageRows.filter(row => row.exactActions.length === 0 && row.blockLevelActions.length > 0).length;
  const conditionalSettingCount = coverageRows.filter(row => row.conditionalAction).length;
  const teachOnly = coverageRows.filter(row => row.coverageKind === 'teach-show-only');
  return {
    totalPublishedSettings: coverageRows.length,
    exactDoSettingCount: exactSettingCount,
    blockLevelDoSettingCount: blockLevelSettingCount,
    conditionalDoSettingCount: conditionalSettingCount,
    anyDoSettingCount: coverageRows.length - teachOnly.length,
    teachOnlySettingCount: teachOnly.length,
    anyDoCoverageRatio: ratio(coverageRows.length - teachOnly.length, coverageRows.length),
    exactOrConditionalCoverageRatio: ratio(exactSettingCount + conditionalSettingCount, coverageRows.length),
    coverageRows,
    teachOnlySettings: teachOnly.map(row => ({
      articleAlias: row.articleAlias,
      guideKey: row.guideKey,
      title: row.title,
      articleSectionUrl: row.articleSectionUrl,
      imageUrl: row.imageUrl,
    })),
  };
}

function buildArticleCoverage(helpArticleReference, settings, supportedActions, actionsByFallback) {
  const rows = [];
  const settingsByArticle = new Map();
  for (const setting of settings.coverageRows) {
    const bucket = settingsByArticle.get(setting.articleAlias) ?? [];
    bucket.push(setting);
    settingsByArticle.set(setting.articleAlias, bucket);
  }
  for (const article of helpArticleReference.articles ?? []) {
    const articleSettings = settingsByArticle.get(article.alias) ?? [];
    const exactSettings = articleSettings.filter(row => row.exactActions.length > 0);
    const blockSettings = articleSettings.filter(row => row.exactActions.length === 0 && row.blockLevelActions.length > 0);
    const conditionalSettings = articleSettings.filter(row => row.conditionalAction);
    const teachOnlySettings = articleSettings.filter(row => row.coverageKind === 'teach-show-only');
    const blockActions = actionsByFallback.get(article.alias) ?? [];
    rows.push({
      articleAlias: article.alias,
      title: article.title ?? null,
      publishedUrl: article.publishedUrl ?? null,
      totalSettings: articleSettings.length,
      exactDoSettingCount: exactSettings.length,
      blockLevelDoSettingCount: blockSettings.length,
      conditionalDoSettingCount: conditionalSettings.length,
      teachOnlySettingCount: teachOnlySettings.length,
      directBlockActionCount: blockActions.length,
      status: articleSettings.length === 0
        ? 'article-only'
        : teachOnlySettings.length === 0
          ? 'all-settings-have-do-or-conditional'
          : (exactSettings.length + blockSettings.length + conditionalSettings.length) > 0
            ? 'partial-do'
            : 'teach-show-only',
      topTeachOnlySettings: teachOnlySettings.slice(0, 8).map(row => ({
        guideKey: row.guideKey,
        title: row.title,
      })),
    });
  }
  return {
    totalArticles: rows.length,
    articlesWithAnyDo: rows.filter(row => row.exactDoSettingCount + row.blockLevelDoSettingCount + row.conditionalDoSettingCount > 0).length,
    articlesTeachOnly: rows.filter(row => row.status === 'teach-show-only').length,
    rows,
    topGapArticles: rows
      .filter(row => row.teachOnlySettingCount > 0)
      .sort((a, b) => b.teachOnlySettingCount - a.teachOnlySettingCount)
      .slice(0, 20),
  };
}

function buildGapTaxonomy(teachOnlyRows) {
  const grouped = new Map();
  const unclassifiedSettings = [];
  for (const row of teachOnlyRows) {
    const classification = classifyGap(row);
    if (!classification) {
      unclassifiedSettings.push(toGapSettingSummary(row));
      continue;
    }
    const bucket = grouped.get(classification.family) ?? {
      family: classification.family,
      label: classification.label,
      recommendedExecution: classification.recommendedExecution,
      requiredBackendPolicy: classification.requiredBackendPolicy,
      requiredRunner: classification.requiredRunner,
      requiredLiveCases: classification.requiredLiveCases,
      releaseGateStatus: classification.releaseGateStatus,
      rationale: classification.rationale,
      settingCount: 0,
      uniqueGuideKeyCount: 0,
      articleAliases: [],
      guideKeys: [],
      sampleSettings: [],
    };
    bucket.settingCount += 1;
    if (!bucket.articleAliases.includes(row.articleAlias)) bucket.articleAliases.push(row.articleAlias);
    if (!bucket.guideKeys.includes(row.guideKey)) bucket.guideKeys.push(row.guideKey);
    if (bucket.sampleSettings.length < 12) bucket.sampleSettings.push(toGapSettingSummary(row));
    grouped.set(classification.family, bucket);
  }

  const gapGroups = [...grouped.values()]
    .map(group => ({
      ...group,
      uniqueGuideKeyCount: group.guideKeys.length,
      articleAliases: group.articleAliases.sort(),
      guideKeys: group.guideKeys.sort(),
    }))
    .sort((a, b) => b.settingCount - a.settingCount || a.family.localeCompare(b.family));

  return {
    schemaVersion: 1,
    totalTeachOnlySettings: teachOnlyRows.length,
    classifiedSettingCount: teachOnlyRows.length - unclassifiedSettings.length,
    unclassifiedSettingCount: unclassifiedSettings.length,
    groupCount: gapGroups.length,
    gapGroups,
    topGroups: gapGroups.slice(0, 12).map(group => ({
      family: group.family,
      label: group.label,
      settingCount: group.settingCount,
      uniqueGuideKeyCount: group.uniqueGuideKeyCount,
      recommendedExecution: group.recommendedExecution,
      releaseGateStatus: group.releaseGateStatus,
      articleAliases: group.articleAliases.slice(0, 10),
      sampleSettings: group.sampleSettings.slice(0, 5),
    })),
    unclassifiedSettings,
  };
}

function classifyGap(row) {
  const text = [
    row.articleAlias,
    row.guideKey,
    row.title,
    row.sectionType,
    row.group,
  ].filter(Boolean).join(' ');
  return GAP_FAMILY_RULES.find(rule => rule.match.test(text)) ?? null;
}

function toGapSettingSummary(row) {
  return {
    articleAlias: row.articleAlias,
    guideKey: row.guideKey,
    title: row.title,
    articleSectionUrl: row.articleSectionUrl,
    imageUrl: row.imageUrl,
  };
}

function buildActionRegistry(doActionReference, supportedActions, knownReferences) {
  const byMode = {};
  const byStatus = {};
  let cliPatchActionCount = 0;
  let actionsWithTeachFallback = 0;
  const danglingTeachFallbacks = [];
  for (const action of doActionReference.actions ?? []) {
    byMode[action.mode ?? '<missing>'] = (byMode[action.mode ?? '<missing>'] ?? 0) + 1;
    byStatus[action.status ?? '<missing>'] = (byStatus[action.status ?? '<missing>'] ?? 0) + 1;
    if (action.cliPatch) cliPatchActionCount += 1;
    const fallback = action.teachFallback?.articleAlias;
    if (fallback) {
      actionsWithTeachFallback += 1;
      if (!knownReferences.has(fallback)) {
        danglingTeachFallbacks.push({
          actionId: action.id,
          teachFallback: fallback,
        });
      }
    }
  }
  return {
    schemaVersion: doActionReference.schemaVersion ?? null,
    totalActions: (doActionReference.actions ?? []).length,
    supportedActionCount: supportedActions.length,
    cliPatchActionCount,
    actionsWithTeachFallback,
    byMode,
    byStatus,
    danglingTeachFallbacks,
  };
}

function buildStrictFailures({ args, corpusSchemaVersion, actionRegistry, settings, gapTaxonomy, articleCoverage, conditionalProbeResults }) {
  const failures = [];
  const minSupportedSettings = Number(args.minSupportedSettings ?? 150);
  if (actionRegistry.schemaVersion !== 1) failures.push('do-action-reference schemaVersion must be 1');
  if (actionRegistry.totalActions < 300) failures.push(`expected at least 300 shipped actions, got ${actionRegistry.totalActions}`);
  if (actionRegistry.supportedActionCount < 300) failures.push(`expected at least 300 supported actions, got ${actionRegistry.supportedActionCount}`);
  if (actionRegistry.cliPatchActionCount < 250) failures.push(`expected at least 250 CLI patch actions, got ${actionRegistry.cliPatchActionCount}`);
  if (actionRegistry.danglingTeachFallbacks.length > 0) {
    failures.push(`actions with dangling teachFallback aliases: ${actionRegistry.danglingTeachFallbacks.map(item => `${item.actionId}:${item.teachFallback}`).join(', ')}`);
  }
  if (settings.totalPublishedSettings < 400) failures.push(`expected at least 400 published help settings, got ${settings.totalPublishedSettings}`);
  if (settings.anyDoSettingCount < minSupportedSettings) {
    failures.push(`expected at least ${minSupportedSettings} settings with exact/block/conditional DO coverage, got ${settings.anyDoSettingCount}`);
  }
  if (settings.exactDoSettingCount + settings.conditionalDoSettingCount < 25) {
    failures.push(`expected at least 25 exact-or-conditional setting DO rows, got ${settings.exactDoSettingCount + settings.conditionalDoSettingCount}`);
  }
  const minimumArticlesWithAnyDo = corpusSchemaVersion === 2 ? 15 : 20;
  if (articleCoverage.articlesWithAnyDo < minimumArticlesWithAnyDo) {
    failures.push(`expected at least ${minimumArticlesWithAnyDo} articles with some DO coverage, got ${articleCoverage.articlesWithAnyDo}`);
  }
  if (gapTaxonomy.schemaVersion !== 1) failures.push('DO gap taxonomy schemaVersion must be 1');
  if (gapTaxonomy.totalTeachOnlySettings !== settings.teachOnlySettingCount) {
    failures.push(`DO gap taxonomy count mismatch: ${gapTaxonomy.totalTeachOnlySettings} taxonomy rows vs ${settings.teachOnlySettingCount} teach-only settings`);
  }
  if (corpusSchemaVersion !== 2 && gapTaxonomy.unclassifiedSettingCount > 0) {
    failures.push(`DO gap taxonomy has ${gapTaxonomy.unclassifiedSettingCount} unclassified settings`);
  }
  if (gapTaxonomy.groupCount < 5) {
    failures.push(`expected at least 5 DO gap taxonomy groups, got ${gapTaxonomy.groupCount}`);
  }
  for (const group of gapTaxonomy.gapGroups) {
    if (!group.family || !group.recommendedExecution || !group.requiredBackendPolicy || !group.requiredRunner || !group.releaseGateStatus) {
      failures.push(`DO gap taxonomy group ${group.family ?? '<missing>'} is missing required execution metadata`);
    }
    if (!Array.isArray(group.requiredLiveCases) || group.requiredLiveCases.length === 0) {
      failures.push(`DO gap taxonomy group ${group.family ?? '<missing>'} is missing required live cases`);
    }
  }
  for (const probe of conditionalProbeResults) {
    if (!probe.ok) failures.push(`${probe.id}: ${probe.failure ?? 'conditional probe failed'}`);
  }
  return failures;
}

function runConditionalProbes(corpusSchemaVersion) {
  return CONDITIONAL_PROBES.map(probe => {
    let response;
    try {
      response = JSON.parse(execFileSync('node', [
        join(root, 'runtime/customer-response-runner.mjs'),
        '--corpus-version',
        corpusSchemaVersion === 1 ? 'v1' : 'v2',
        '--prompt',
        probe.prompt,
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SEGMENTLY_LAUNCH_CONTEXT_FILE: join(mkdtempSync(join(tmpdir(), 'segmently-launch-guide-do-audit-')), 'empty-context.json'),
        },
      }));
    } catch (error) {
      return {
        ...probe,
        ok: false,
        failure: `runner failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const failures = [];
    if (response.ok !== true) failures.push('response ok must be true');
    const corpusV2 = response.corpusSchemaVersion === 2;
    if (response.mode !== (corpusV2 ? 'do' : probe.expectedMode)) failures.push(`mode ${response.mode}, expected ${corpusV2 ? 'do' : probe.expectedMode}`);
    if (response.resolver?.kind !== 'conditional-do') failures.push(`resolver.kind ${response.resolver?.kind}, expected conditional-do`);
    if (response.action?.actionId !== probe.expectedActionId) failures.push(`actionId ${response.action?.actionId}, expected ${probe.expectedActionId}`);
    if (response.action?.owningSkill !== 'playwright-bowser') failures.push('owningSkill must be playwright-bowser');
    if (response.action?.companionSkill !== 'segmently-test-kit') failures.push('companionSkill must be segmently-test-kit');
    if (response.action?.supportedBoundary !== 'conditional-browser-editor-upload') failures.push('supportedBoundary must be conditional-browser-editor-upload');
    if (!response.action?.missingInputs?.includes('videoUrl-or-local-file')) failures.push('missing videoUrl-or-local-file input');
    const articleReferences = response.answer?.articleReferences ?? response.selectedArticles ?? [];
    if (!articleReferences.some(reference => reference.articleAlias === probe.expectedArticleAlias)) {
      failures.push(`missing article reference ${probe.expectedArticleAlias}`);
    }
    return {
      ...probe,
      ok: failures.length === 0,
      failure: failures.join('; ') || null,
      mode: response.mode ?? null,
      actionId: response.action?.actionId ?? null,
      supportedBoundary: response.action?.supportedBoundary ?? null,
      guideKeys: response.guidance?.guides?.map(guide => guide.guideKey).filter(Boolean) ?? [],
    };
  });
}

function toActionSummary(action) {
  return {
    id: action.id,
    mode: action.mode,
    label: action.label ?? null,
    commandFamily: action.commandFamily ?? null,
    cliPatchOperation: action.cliPatch?.operation ?? null,
    cliPatchPath: action.cliPatch?.path ?? null,
  };
}

function ratio(value, total) {
  if (!total) return 0;
  return Number((value / total).toFixed(4));
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function readJsonLines(rel) {
  return readFileSync(join(root, rel), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseArgs(argv) {
  const args = {
    json: false,
    details: false,
    strict: false,
    failOnDoGaps: false,
    minSupportedSettings: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--details') args.details = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--fail-on-do-gaps') args.failOnDoGaps = true;
    else if (arg === '--min-supported-settings') args.minSupportedSettings = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write([
        'Usage:',
        '  node scripts/audit-do-coverage.mjs [--json] [--details] [--strict] [--min-supported-settings N] [--fail-on-do-gaps]',
        '',
        'Reads only shipped skill artifacts and reports exact, block-level, conditional, teach-only, and typed remaining-gap DO coverage.',
        '--strict validates inventory integrity and minimum current coverage; it does not require every setting to be mutable.',
        '--fail-on-do-gaps is reserved for a future full-DO release gate.',
        '',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function writeText(report, args) {
  const lines = [
    'Segmently launch assistant DO coverage audit',
    '',
    `Actions: ${report.actionRegistry.totalActions} total, ${report.actionRegistry.supportedActionCount} supported, ${report.actionRegistry.cliPatchActionCount} CLI patch actions`,
    `Published settings: ${report.settings.totalPublishedSettings}`,
    `Settings with any DO coverage: ${report.settings.anyDoSettingCount} (${Math.round(report.settings.anyDoCoverageRatio * 100)}%)`,
    `  exact: ${report.settings.exactDoSettingCount}`,
    `  block-level: ${report.settings.blockLevelDoSettingCount}`,
    `  conditional browser: ${report.settings.conditionalDoSettingCount}`,
    `Teach/show-only settings: ${report.settings.teachOnlySettingCount}`,
    `Typed remaining gap groups: ${report.gapTaxonomy.groupCount} (${report.gapTaxonomy.unclassifiedSettingCount} unclassified)`,
    `Articles with any DO coverage: ${report.articleCoverage.articlesWithAnyDo}/${report.articleCoverage.totalArticles}`,
    `Conditional probes: ${report.conditionalActions.probes.filter(probe => probe.ok).length}/${report.conditionalActions.probes.length}`,
  ];
  if (report.strictFailures.length > 0) {
    lines.push('', 'Strict failures:');
    for (const failure of report.strictFailures) lines.push(`- ${failure}`);
  }
  if (args.details) {
    lines.push('', 'Top typed remaining DO gap groups:');
    for (const group of report.gapTaxonomy.topGroups.slice(0, 12)) {
      lines.push(`- ${group.family}: ${group.settingCount} setting rows, ${group.uniqueGuideKeyCount} unique guide keys (${group.recommendedExecution}; ${group.releaseGateStatus})`);
      for (const setting of group.sampleSettings.slice(0, 4)) {
        lines.push(`  - ${setting.guideKey}: ${setting.title}`);
      }
    }
    lines.push('', 'Top articles with teach/show-only settings:');
    for (const article of report.articleCoverage.topGapArticles.slice(0, 15)) {
      lines.push(`- ${article.articleAlias}: ${article.teachOnlySettingCount}/${article.totalSettings} teach/show-only (${article.status})`);
      for (const setting of article.topTeachOnlySettings) {
        lines.push(`  - ${setting.guideKey}: ${setting.title}`);
      }
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
