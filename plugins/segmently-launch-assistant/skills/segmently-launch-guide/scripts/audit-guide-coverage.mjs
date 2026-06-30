#!/usr/bin/env node
/**
 * Audits the shipped Segmently launch-guide coverage surface.
 *
 * This script intentionally reads only generated skill artifacts. It answers two
 * separate questions:
 *   1. Which SHOW/TEACH guide rows have text, article links, screenshot
 *      bindings, and concrete image URLs?
 *   2. Are all screen-editor setting questions answerable from the shipped
 *      field/article corpus?
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const guideEvidence = readJson('references/guide-evidence.json');
  const teachReference = readJson('references/teach-reference.json');
  const helpArticleReference = readJson('references/help-article-reference.json');
  const report = buildReport(guideEvidence, teachReference, helpArticleReference);

  if (args.json) {
    writeJson(report);
  } else {
    writeText(report, args);
  }

  if (args.strict && report.strictFailures.length > 0) {
    process.exitCode = 1;
  }
  if (args.failOnMissingImages && report.urlGaps.imageIssueCount > 0) {
    process.exitCode = 1;
  }
  if (args.failOnMissingArticleLinks && report.urlGaps.articleIssueCount > 0) {
    process.exitCode = 1;
  }
}

function buildReport(guideEvidence, teachReference, helpArticleReference) {
  const guideRows = guideEvidence.guides ?? [];
  const guideSummary = {
    totalGuides: guideRows.length,
    withAuthoredText: 0,
    withScreenshotEvidence: 0,
    withSectionScreenshotEvidence: 0,
    withConcreteImageUrl: 0,
    withArticleLink: 0,
    withStableArticleReference: 0,
  };
  const missingConcreteImageUrls = [];
  const missingSectionConcreteImageUrls = [];
  const missingArticleLinks = [];
  const textOnlyGuides = [];
  const coverageRows = [];
  let totalSections = 0;
  let sectionsWithScreenshotEvidence = 0;
  let sectionsWithConcreteImageUrl = 0;

  for (const guide of guideRows) {
    const sections = (guide.sections ?? []).map(section => {
      const hasConcreteImageUrl = isHttps(section.imageUrl);
      const hasScreenshotEvidence = section.hasScreenshotEvidence === true;
      totalSections += 1;
      if (hasScreenshotEvidence) sectionsWithScreenshotEvidence += 1;
      if (hasConcreteImageUrl) sectionsWithConcreteImageUrl += 1;
      if (hasScreenshotEvidence && !hasConcreteImageUrl) {
        missingSectionConcreteImageUrls.push({
          guideKey: guide.guideKey,
          sectionKey: section.sectionKey ?? null,
          title: section.title ?? null,
        });
      }
      return {
        id: section.id ?? null,
        sectionKey: section.sectionKey ?? null,
        referencePath: section.referencePath ?? null,
        title: section.title ?? null,
        hasAuthoredText: nonEmpty(section.title) && nonEmpty(section.description),
        hasScreenshotEvidence,
        hasConcreteImageUrl,
        imageUrl: hasConcreteImageUrl ? section.imageUrl : null,
      };
    });
    const guideHasConcreteImageUrl = sections.some(section => section.hasConcreteImageUrl);
    const guideHasScreenshotEvidence = guide.hasScreenshotEvidence === true
      || sections.some(section => section.hasScreenshotEvidence === true);
    const guideHasArticleLink = isHttps(guide.fullArticleLink);
    const guideHasStableArticleReference = nonEmpty(guide.articleId)
      || nonEmpty(guide.articleAlias)
      || nonEmpty(guide.localArticlePath);
    const visualCoverageStatus = guideHasConcreteImageUrl
      ? 'image-url-available'
      : guideHasScreenshotEvidence
        ? 'screenshot-evidence-missing-image-url'
        : 'text-only-no-screenshot-evidence';
    coverageRows.push({
      guideKey: guide.guideKey,
      articleId: guide.articleId ?? guide.guideKey,
      articleAlias: guide.articleAlias ?? null,
      referencePath: guide.referencePath ?? null,
      localArticlePath: guide.localArticlePath ?? null,
      name: guide.name,
      hasAuthoredText: guide.hasAuthoredText === true,
      hasScreenshotEvidence: guideHasScreenshotEvidence,
      hasConcreteImageUrl: guideHasConcreteImageUrl,
      visualCoverageStatus,
      hasStableArticleReference: guideHasStableArticleReference,
      fullArticleLink: guideHasArticleLink ? guide.fullArticleLink : null,
      missingConcreteImageUrl: guideHasScreenshotEvidence && !guideHasConcreteImageUrl,
      missingArticleLink: !guideHasArticleLink,
      sections,
    });
    if (guide.hasAuthoredText) guideSummary.withAuthoredText += 1;
    if (guideHasScreenshotEvidence) guideSummary.withScreenshotEvidence += 1;
    if (sections.some(section => section.hasScreenshotEvidence === true)) {
      guideSummary.withSectionScreenshotEvidence += 1;
    }
    if (guideHasConcreteImageUrl) {
      guideSummary.withConcreteImageUrl += 1;
    }
    if (guideHasStableArticleReference) {
      guideSummary.withStableArticleReference += 1;
    }
    if (guideHasArticleLink) {
      guideSummary.withArticleLink += 1;
    } else {
      missingArticleLinks.push({ guideKey: guide.guideKey, name: guide.name });
    }
    if (guideHasScreenshotEvidence && !guideHasConcreteImageUrl) {
      missingConcreteImageUrls.push({
        guideKey: guide.guideKey,
        name: guide.name,
        screenshotSectionCount: guide.screenshotSectionCount ?? 0,
      });
    }
    if (guide.hasAuthoredText === true && !guideHasScreenshotEvidence && !guideHasConcreteImageUrl) {
      textOnlyGuides.push({
        guideKey: guide.guideKey,
        name: guide.name,
        articleAlias: guide.articleAlias ?? null,
        referencePath: guide.referencePath ?? null,
        fullArticleLink: guideHasArticleLink ? guide.fullArticleLink : null,
        reason: 'authored-text-without-screenshot-binding',
      });
    }
  }

  const screenSettings = auditScreenSettings(teachReference);
  const helpArticles = auditHelpArticles(helpArticleReference, teachReference);
  const strictFailures = [
    ...screenSettings.blocksWithoutArticleCorpus.map(item => `screen block ${item.alias} article ${item.articleAlias} is missing from articleAliases corpus`),
    ...screenSettings.blocksWithoutArticleAlias.map(item => `screen block ${item.alias} has no articleAlias`),
    ...screenSettings.blocksWithoutArticleSummary.map(item => `screen block ${item.alias} has no article summary`),
    ...screenSettings.blocksWithoutFields.map(item => `screen block ${item.alias} has no field guidance`),
    ...screenSettings.fieldsWithoutDescription.map(item => `${item.alias} / ${item.field}: missing field description`),
    ...screenSettings.leavesWithoutDescription.map(item => `${item.alias} / ${item.field} / ${item.leaf}: missing leaf description`),
    ...screenSettings.screensWithDanglingBlockRefs.map(item => `${item.screenType}: dangling block article ${item.articleAlias}`),
    ...screenSettings.fieldQuestionProbesWithoutArticleCorpus.map(item => `field question probe ${item.query}: missing article corpus ${item.articleAlias}`),
    ...screenSettings.fieldQuestionProbesWithoutFieldCorpus.map(item => `field question probe ${item.query}: missing field corpus ${item.articleAlias} / ${item.field}`),
    ...helpArticles.requiredMissing.map(item => `published help article ${item.alias} is missing from help-article-reference`),
  ];

  const urlGaps = {
    articleIssueCount: missingArticleLinks.length + helpArticles.missingPublishedUrl.length,
    imageIssueCount:
      missingConcreteImageUrls.length
      + missingSectionConcreteImageUrls.length
      + helpArticles.missingSettingImageUrl.length,
    missingGuideArticleLinks: missingArticleLinks,
    missingGuideConcreteImageUrls: missingConcreteImageUrls,
    missingGuideSectionConcreteImageUrls: missingSectionConcreteImageUrls,
    missingHelpArticlePublishedUrls: helpArticles.missingPublishedUrl,
    missingHelpArticleSettingImageUrls: helpArticles.missingSettingImageUrl,
  };

  return {
    ok: strictFailures.length === 0,
    policy: {
      articleHtmlRequired: guideEvidence.policy?.articleHtmlRequired === true,
      textInstructionRequired: guideEvidence.policy?.textInstructionRequired === true,
      screenshotEvidenceRequiredForPersonaEval: guideEvidence.policy?.screenshotEvidenceRequiredForPersonaEval === true,
      articleLinkPreferred: guideEvidence.policy?.articleLinkPreferred === true,
      imageUrlPreferred: guideEvidence.policy?.imageUrlPreferred === true,
      missingImageUrlsAreReportedNotStrict: true,
      missingArticleLinksAreReportedNotStrict: true,
    },
    guideEvidence: {
      ...guideSummary,
      totalSections,
      sectionsWithScreenshotEvidence,
      sectionsWithConcreteImageUrl,
      missingConcreteImageUrlCount: missingConcreteImageUrls.length,
      missingSectionConcreteImageUrlCount: missingSectionConcreteImageUrls.length,
      missingArticleLinkCount: missingArticleLinks.length,
      textOnlyGuideCount: textOnlyGuides.length,
      coverageRows,
      missingConcreteImageUrls,
      missingSectionConcreteImageUrls,
      missingArticleLinks,
      textOnlyGuides,
    },
    helpArticles,
    screenSettings,
    urlGaps,
    strictFailures,
  };
}

function auditScreenSettings(teachReference) {
  const blocksByAlias = teachReference.blocksByAlias ?? {};
  const articleAliases = new Set(Object.keys(blocksByAlias));
  const articleAliasCorpus = new Set(teachReference.articleAliases ?? []);
  const blocksWithoutArticleAlias = [];
  const blocksWithoutArticleCorpus = [];
  const blocksWithoutArticleSummary = [];
  const blocksWithoutFields = [];
  const fieldsWithoutDescription = [];
  const leavesWithoutDescription = [];
  const screensWithDanglingBlockRefs = [];
  const fieldQuestionProbesWithoutArticleCorpus = [];
  const fieldQuestionProbesWithoutFieldCorpus = [];
  let fieldCount = 0;
  let leafCount = 0;

  for (const [alias, block] of Object.entries(blocksByAlias)) {
    if (!nonEmpty(block.articleAlias)) {
      blocksWithoutArticleAlias.push({ alias, title: block.title ?? alias });
    } else if (!articleAliasCorpus.has(block.articleAlias)) {
      blocksWithoutArticleCorpus.push({ alias, title: block.title ?? alias, articleAlias: block.articleAlias });
    }
    if (!nonEmpty(block.title) || !longEnough(block.summary, 20)) {
      blocksWithoutArticleSummary.push({ alias, title: block.title ?? alias, articleAlias: block.articleAlias ?? null });
    }
    if (!Array.isArray(block.fields) || block.fields.length === 0) {
      blocksWithoutFields.push({ alias, title: block.title ?? alias });
      continue;
    }
    for (const field of block.fields) {
      fieldCount += 1;
      if (!nonEmpty(field.label) || !longEnough(field.description, 20)) {
        fieldsWithoutDescription.push({
          alias,
          field: field.label ?? '<unnamed>',
        });
      }
      for (const leaf of field.leaves ?? []) {
        leafCount += 1;
        if (!nonEmpty(leaf.label) || !longEnough(leaf.description, 10)) {
          leavesWithoutDescription.push({
            alias,
            field: field.label ?? '<unnamed>',
            leaf: leaf.label ?? '<unnamed>',
          });
        }
      }
    }
  }

  for (const screen of teachReference.screens ?? []) {
    for (const block of screen.blocks ?? []) {
      if (!articleAliases.has(block.articleAlias)) {
        screensWithDanglingBlockRefs.push({
          screenType: screen.screenType,
          displayName: screen.displayName,
          articleAlias: block.articleAlias,
        });
      }
    }
  }

  for (const probe of teachReference.fieldQuestionProbes ?? []) {
    const expected = probe.expected ?? {};
    const articleAlias = expected.articleAlias;
    const field = expected.field;
    const block = nonEmpty(articleAlias) ? blocksByAlias[articleAlias] : null;
    if (!block) {
      fieldQuestionProbesWithoutArticleCorpus.push({
        query: probe.query ?? '<unnamed>',
        articleAlias: articleAlias ?? '<missing>',
      });
      continue;
    }
    const hasExpectedField = (block.fields ?? []).some(item => {
      if (item.label === field) return true;
      return (item.leaves ?? []).some(leaf => leaf.label === expected.leaf);
    });
    if (!hasExpectedField) {
      fieldQuestionProbesWithoutFieldCorpus.push({
        query: probe.query ?? '<unnamed>',
        articleAlias,
        field: field ?? '<missing>',
        leaf: expected.leaf ?? null,
      });
    }
  }

  return {
    articleAliasCorpusCount: articleAliasCorpus.size,
    blockArticleCount: Object.keys(blocksByAlias).length,
    screenCount: (teachReference.screens ?? []).length,
    fieldCount,
    leafCount,
    fieldQuestionProbeCount: (teachReference.fieldQuestionProbes ?? []).length,
    blocksWithoutArticleCorpus,
    blocksWithoutArticleAlias,
    blocksWithoutArticleSummary,
    blocksWithoutFields,
    fieldsWithoutDescription,
    leavesWithoutDescription,
    screensWithDanglingBlockRefs,
    fieldQuestionProbesWithoutArticleCorpus,
    fieldQuestionProbesWithoutFieldCorpus,
    allScreenSettingQuestionsCovered:
      blocksWithoutArticleCorpus.length === 0
      && blocksWithoutArticleAlias.length === 0
      && blocksWithoutArticleSummary.length === 0
      && blocksWithoutFields.length === 0
      && fieldsWithoutDescription.length === 0
      && leavesWithoutDescription.length === 0
      && screensWithDanglingBlockRefs.length === 0
      && fieldQuestionProbesWithoutArticleCorpus.length === 0
      && fieldQuestionProbesWithoutFieldCorpus.length === 0,
  };
}

function auditHelpArticles(helpArticleReference, teachReference) {
  const articles = helpArticleReference.articles ?? [];
  const byAlias = new Map(articles.map(article => [article.alias, article]));
  const blockAliases = Object.keys(teachReference.blocksByAlias ?? {});
  const requiredAliases = new Set([
    'help-block-media',
    'help-block-paywall-media',
    'help-block-action-bar',
    'help-options-list-single',
    ...blockAliases,
  ]);
  const requiredMissing = [...requiredAliases]
    .filter(alias => !byAlias.has(alias))
    .map(alias => ({ alias }));
  const missingPublishedUrl = [];
  const missingSettingImageUrl = [];
  let totalSettings = 0;
  let settingsWithImageUrl = 0;

  for (const article of articles) {
    if (!isHttps(article.publishedUrl)) {
      missingPublishedUrl.push({ alias: article.alias, title: article.title ?? article.alias });
    }
    for (const setting of article.settings ?? []) {
      totalSettings += 1;
      if (isHttps(setting.imageUrl)) settingsWithImageUrl += 1;
      else missingSettingImageUrl.push({
        alias: article.alias,
        guideKey: setting.guideKey,
        title: setting.title,
      });
    }
  }

  return {
    environment: helpArticleReference.environment ?? null,
    projectId: helpArticleReference.projectId ?? null,
    totalArticles: articles.length,
    withPublishedUrl: articles.filter(article => isHttps(article.publishedUrl)).length,
    totalSettings,
    settingsWithImageUrl,
    missingPublishedUrl,
    missingSettingImageUrl,
    requiredMissing,
    productionBackfill: helpArticleReference.productionBackfill ?? null,
  };
}

function parseArgs(argv) {
  const args = {
    json: false,
    strict: false,
    failOnMissingImages: false,
    failOnMissingArticleLinks: false,
    details: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--fail-on-missing-images') args.failOnMissingImages = true;
    else if (arg === '--fail-on-missing-article-links') args.failOnMissingArticleLinks = true;
    else if (arg === '--fail-on-url-gaps') {
      args.failOnMissingImages = true;
      args.failOnMissingArticleLinks = true;
    }
    else if (arg === '--details') args.details = true;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage:',
        '  node scripts/audit-guide-coverage.mjs [--json] [--details] [--strict] [--fail-on-missing-images] [--fail-on-missing-article-links] [--fail-on-url-gaps]',
        '',
        '--details prints every guide and section image/link coverage row.',
        '--strict fails only when shipped screen-setting text/article coverage is incomplete.',
        '--fail-on-missing-images also fails when screenshot-backed guides lack concrete image URLs.',
        '--fail-on-missing-article-links also fails when guides lack published article URLs.',
        '--fail-on-url-gaps enables both missing image and missing article-link failure modes.',
      ].join('\n'));
      process.exit(0);
    }
  }
  return args;
}

function readJson(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    throw new Error(`Missing generated artifact ${rel}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isHttps(value) {
  return typeof value === 'string' && value.startsWith('https://');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function longEnough(value, min) {
  return typeof value === 'string' && value.trim().length >= min;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeText(report, args) {
  const lines = [
    'Segmently launch-guide coverage audit',
    '',
    `Guide rows: ${report.guideEvidence.totalGuides}`,
    `- sections: ${report.guideEvidence.totalSections}`,
    `- with text: ${report.guideEvidence.withAuthoredText}`,
    `- with screenshot evidence: ${report.guideEvidence.withScreenshotEvidence}`,
    `- sections with screenshot evidence: ${report.guideEvidence.sectionsWithScreenshotEvidence}`,
    `- with concrete image URL: ${report.guideEvidence.withConcreteImageUrl}`,
    `- sections with concrete image URL: ${report.guideEvidence.sectionsWithConcreteImageUrl}`,
    `- with stable article reference: ${report.guideEvidence.withStableArticleReference}`,
    `- with article link: ${report.guideEvidence.withArticleLink}`,
    `- missing image URL despite screenshot evidence: ${report.guideEvidence.missingConcreteImageUrlCount}`,
    `- missing section image URL despite screenshot evidence: ${report.guideEvidence.missingSectionConcreteImageUrlCount}`,
    `- missing article link: ${report.guideEvidence.missingArticleLinkCount}`,
    `- text-only guides without screenshot evidence: ${report.guideEvidence.textOnlyGuideCount}`,
    '',
    'Published help articles:',
    `- environment: ${report.helpArticles.environment ?? 'unknown'}`,
    `- project: ${report.helpArticles.projectId ?? 'unknown'}`,
    `- articles: ${report.helpArticles.totalArticles}`,
    `- with published URL: ${report.helpArticles.withPublishedUrl}`,
    `- settings: ${report.helpArticles.totalSettings}`,
    `- settings with image URL: ${report.helpArticles.settingsWithImageUrl}`,
    `- missing published URL: ${report.helpArticles.missingPublishedUrl.length}`,
    `- missing setting image URL: ${report.helpArticles.missingSettingImageUrl.length}`,
    `- missing required aliases: ${report.helpArticles.requiredMissing.length}`,
    `- production backfill: ${report.helpArticles.productionBackfill?.status ?? 'unknown'}`,
    '',
    'Screen settings corpus:',
    `- article aliases: ${report.screenSettings.articleAliasCorpusCount}`,
    `- block articles: ${report.screenSettings.blockArticleCount}`,
    `- screens: ${report.screenSettings.screenCount}`,
    `- fields: ${report.screenSettings.fieldCount}`,
    `- leaves: ${report.screenSettings.leafCount}`,
    `- resolver probes: ${report.screenSettings.fieldQuestionProbeCount}`,
    `- all screen-setting questions covered: ${report.screenSettings.allScreenSettingQuestionsCovered ? 'yes' : 'no'}`,
  ];
  if (report.strictFailures.length > 0) {
    lines.push('', 'Strict failures:');
    for (const failure of report.strictFailures.slice(0, 50)) lines.push(`- ${failure}`);
  }
  if (report.guideEvidence.missingConcreteImageUrls.length > 0) {
    lines.push('', 'Missing concrete image URLs (first 25):');
    for (const item of report.guideEvidence.missingConcreteImageUrls.slice(0, 25)) {
      lines.push(`- ${item.guideKey} (${item.screenshotSectionCount} screenshot section(s))`);
    }
  }
  if (report.guideEvidence.missingSectionConcreteImageUrls.length > 0) {
    lines.push('', 'Missing section concrete image URLs (first 25):');
    for (const item of report.guideEvidence.missingSectionConcreteImageUrls.slice(0, 25)) {
      lines.push(`- ${item.guideKey} / ${item.sectionKey ?? '<section>'}: ${item.title ?? '<untitled>'}`);
    }
  }
  if (report.guideEvidence.textOnlyGuides.length > 0) {
    lines.push('', 'Text-only guide rows without screenshot evidence (first 25):');
    for (const item of report.guideEvidence.textOnlyGuides.slice(0, 25)) {
      lines.push(`- ${item.guideKey}: ${item.reason}`);
    }
  }
  if (report.helpArticles.requiredMissing.length > 0) {
    lines.push('', 'Missing required help article aliases (first 25):');
    for (const item of report.helpArticles.requiredMissing.slice(0, 25)) {
      lines.push(`- ${item.alias}`);
    }
  }
  if (args.details) {
    lines.push('', 'Guide image/link coverage rows:');
    for (const row of report.guideEvidence.coverageRows) {
      lines.push(
        `- ${row.guideKey}: article=${row.articleAlias ?? row.articleId ?? 'none'}, `
        + `ref=${row.referencePath ?? 'none'}, `
        + `path=${row.localArticlePath ?? 'none'}, `
        + `image=${row.hasConcreteImageUrl ? 'yes' : 'no'}, `
        + `screenshot=${row.hasScreenshotEvidence ? 'yes' : 'no'}, `
        + `visual=${row.visualCoverageStatus ?? 'unknown'}, `
        + `articleLink=${row.fullArticleLink ? 'yes' : 'no'}`,
      );
      for (const section of row.sections) {
        lines.push(
          `  - ${section.id ?? section.sectionKey ?? '<section>'}: ref=${section.referencePath ?? 'none'}, `
          + `image=${section.hasConcreteImageUrl ? 'yes' : 'no'}, `
          + `screenshot=${section.hasScreenshotEvidence ? 'yes' : 'no'}, `
          + `text=${section.hasAuthoredText ? 'yes' : 'no'}`,
        );
      }
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
