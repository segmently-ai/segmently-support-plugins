#!/usr/bin/env node
/**
 * Customer-surface acceptance gate for installed Segmently launch skills.
 *
 * This is stricter than the low-level dispatch checks: it starts from raw
 * customer phrasing, reads only shipped skill artifacts, and verifies that the
 * customer-facing answer stays source-safe while DO contracts expose executable
 * CLI/E2E packages and verification plans.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolveSkillRoot();
const failures = [];

check('teach prompt stays source-safe and screenshot-backed', () => {
  const response = runResponse(['--prompt', 'что значит шрифт ячейки в списке как настроить']);
  assert(response.ok === true, 'TEACH response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.action === null, 'TEACH response must not attach a DO action');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles'), 'missing title-styles guide');
  assert(response.answer?.instructions?.some(item => item.visualEvidence === true), 'missing screenshot-backed visual evidence marker');
  assertSourceSafeCustomerAnswer(response);
});

check('button font teach prompt resolves Action Bar article reference', () => {
  const response = runResponse(['--prompt', 'как настроить шрифты в кнопке']);
  assert(response.ok === true, 'button font TEACH response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.action === null, 'button font TEACH response must not attach a DO action');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-action-bar-primary-text-styles'), 'missing primary button text style guide');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles'), 'button font prompt incorrectly resolved options title style guide');
  assert(response.answer?.articleReferences?.some(reference => reference.articleAlias === 'help-block-action-bar'), 'missing help-block-action-bar article reference');
  const articleAvailability = response.answer?.articleAvailability?.find(reference => reference.articleAlias === 'help-block-action-bar');
  assert(articleAvailability?.hasBuiltInArticleReference === true, 'button font prompt did not mark built-in Action Bar article as available');
  assert(articleAvailability?.publicArticleUrlStatus === 'published', 'button font prompt must expose published article URL status');
  assert(!/not\s+published/i.test(articleAvailability?.customerSafeMessage ?? ''), 'button font prompt customer-safe message invites a missing public-link answer');
  assert(articleAvailability?.referencePath === 'help-block-action-bar/screenedit-action-bar-primary-text-styles', 'button font prompt missing stable Action Bar reference path');
  const builtInReference = response.answer?.builtInArticleReferences?.find(reference => reference.articleAlias === 'help-block-action-bar');
  assert(builtInReference?.status === 'public-url-available', 'button font prompt missing published Action Bar reference status');
  assert(builtInReference?.referencePath === 'help-block-action-bar/screenedit-action-bar-primary-text-styles', 'button font built-in reference missing stable path');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-action-bar\/index\.html$/.test(url)), 'button font prompt missing published Action Bar article URL');
  assert(response.answer?.preferredCitation?.referencePath === 'help-block-action-bar/screenedit-action-bar-primary-text-styles', 'button font preferred citation missing stable path');
  assert(/built-in Segmently guide\/article is available/i.test(response.answer?.customerAnswerStarter ?? ''), 'button font starter must positively state built-in article availability');
  assert(
    /Built-in guide\/article references are available/.test(response.answer?.articleReferenceSummary ?? '')
      && !/no public web URL|not published|no-public-url/i.test(response.answer?.articleReferenceSummary ?? ''),
    'button font prompt missing positive built-in article summary',
  );
  const guideContract = response.guidance?.guides?.find(guide => guide.articleAlias === 'help-block-action-bar');
  assert(guideContract, 'guide contract missing help-block-action-bar article alias');
  assert(guideContract.referencePath === 'help-block-action-bar/screenedit-action-bar-primary-text-styles', 'guide contract missing stable reference path');
  assert(guideContract.textSections?.some(section => section.referencePath), 'guide contract text section missing stable section reference path');
  assert(response.missingArticleClaimed === false, 'button font prompt must explicitly avoid missing-article claim');
  assertSourceSafeCustomerAnswer(response);
});

check('list video teach prompt resolves Media article and offers SHOW/DO boundary', () => {
  const response = runResponse(['--prompt', 'как добавить видео к списку']);
  assert(response.ok === true, 'list video TEACH response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.action === null, 'list video TEACH response must not attach a fake DO action');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-media'), 'missing Media section guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-media-video-upload'), 'missing media video upload guide');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'onboarding-list-create'), 'list video prompt incorrectly resolved onboarding creation guide');
  assert(response.answer?.articleReferences?.some(reference => reference.articleAlias === 'help-block-media'), 'missing help-block-media article reference');
  assert(response.answer?.preferredCitation?.articleAlias === 'help-block-media', 'list video preferred citation must use help-block-media');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-media\/index\.html$/.test(url)), 'list video prompt missing published Media article URL');
  assert(response.answer?.imageUrls?.some(url => /configure-media-section/.test(url)), 'list video prompt missing concrete Media section image URL');
  assert(/SHOW/.test(response.answer?.nextStep ?? '') && /DO/.test(response.answer?.nextStep ?? ''), 'list video prompt must offer SHOW and DO boundary');
  assert(/video URL|local file|asset/i.test(response.answer?.nextStep ?? ''), 'list video DO boundary must ask for video source');
  assert(response.answer?.showDoOptions?.show?.available === true, 'list video prompt missing SHOW option');
  assert(response.answer?.showDoOptions?.do?.available === 'conditional', 'list video prompt must mark DO as conditional');
  assert(response.missingArticleClaimed === false, 'list video prompt must not claim the built-in article is missing');
  assertSourceSafeCustomerAnswer(response);
});

check('paywall video teach prompt resolves Paywall Media article and exposes visible assets', () => {
  const response = runResponse(['--prompt', 'добавить видео в пейвол']);
  assert(response.ok === true, 'paywall video TEACH response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.action === null, 'paywall video TEACH response must not attach a fake DO action');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-paywall-media'), 'missing Paywall Media section guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-paywall-media-video'), 'missing paywall media video upload guide');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'onboarding-list-create'), 'paywall video prompt incorrectly resolved onboarding creation guide');
  assert(response.answer?.articleReferences?.some(reference => reference.articleAlias === 'help-block-paywall-media'), 'missing help-block-paywall-media article reference');
  assert(response.answer?.preferredCitation?.articleAlias === 'help-block-paywall-media', 'paywall video preferred citation must use help-block-paywall-media');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-paywall-media\/index\.html$/.test(url)), 'paywall video prompt missing published Paywall Media article URL');
  assert(response.answer?.imageUrls?.some(url => /configure-paywall-media-section|paywall-screen-configuration-guide/.test(url)), 'paywall video prompt missing concrete Paywall Media image URL');
  assert(response.answer?.customerVisibleGuideAssets?.mustShowInCustomerAnswer === true, 'paywall video prompt must require visible guide assets in customer answer');
  assert(response.answer?.customerVisibleGuideAssets?.imageUrls?.some(url => /configure-paywall-media-section|paywall-screen-configuration-guide/.test(url)), 'paywall video visible assets missing image URL');
  assert(response.answer?.customerVisibleGuideAssets?.guideReferences?.some(reference => reference.articleAlias === 'help-block-paywall-media'), 'paywall video visible assets missing guide alias');
  assert(/SHOW/.test(response.answer?.nextStep ?? '') && /DO/.test(response.answer?.nextStep ?? ''), 'paywall video prompt must offer SHOW and DO boundary');
  assert(/video URL|local file|asset/i.test(response.answer?.nextStep ?? ''), 'paywall video DO boundary must ask for video source');
  assert(response.answer?.showDoOptions?.show?.available === true, 'paywall video prompt missing SHOW option');
  assert(response.answer?.showDoOptions?.do?.available === 'conditional', 'paywall video prompt must mark DO as conditional');
  assert(response.missingArticleClaimed === false, 'paywall video prompt must not claim the built-in article is missing');
  assertSourceSafeCustomerAnswer(response);
});

check('direct video upload request returns conditional browser DO contract', () => {
  const response = runResponse(['--prompt', 'сделай видео в пейволе']);
  assert(response.ok === true, 'direct paywall video DO response did not return ok=true');
  assert(response.mode === 'do-e2e-conditional', `expected conditional browser DO mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'conditional-do', `expected conditional-do resolver, got ${response.resolver?.kind}`);
  assert(response.action?.actionId === 'browser.paywallMedia.videoUpload', 'direct paywall video DO must use the conditional paywall media upload action');
  assert(response.action?.status === 'needs-inputs', `expected missing-inputs status, got ${response.action?.status}`);
  assert(response.action?.owningSkill === 'playwright-bowser', 'conditional media upload must route to playwright-bowser');
  assert(response.action?.companionSkill === 'segmently-test-kit', 'conditional media upload must include segmently-test-kit');
  assert(response.action?.supportedBoundary === 'conditional-browser-editor-upload', 'conditional media upload must not pretend a headless CLI patch exists');
  assert(response.action?.missingInputs?.includes('projectId'), 'conditional media upload must ask for projectId');
  assert(response.action?.missingInputs?.includes('funnelId'), 'conditional media upload must ask for funnelId');
  assert(response.action?.missingInputs?.includes('screenId'), 'conditional media upload must ask for screenId');
  assert(response.action?.missingInputs?.includes('videoUrl-or-local-file'), 'conditional media upload must ask for video source');
  assert(response.action?.authPreflight?.requiredForExecute === true, 'conditional media upload must include auth preflight');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-paywall-media\/index\.html$/.test(url)), 'conditional media upload must keep the article URL');
  assert(response.completionClaim === 'needs-inputs-before-execution', `unexpected completion claim ${response.completionClaim}`);
  assertSourceSafeCustomerAnswer(response);
});

check('button font full article prompt delegates read-only article fetch', () => {
  const response = runResponse(['--prompt', 'дай полную статью как настроить шрифты в кнопке']);
  assert(response.ok === true, 'button font full-article response did not return ok=true');
  assert(response.mode === 'article-fetch', `expected article-fetch mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'article-fetch', `expected article-fetch resolver, got ${response.resolver?.kind}`);
  assert(response.action === null, 'article-fetch response must not attach a DO action');
  assert(response.show === null, 'article-fetch response must not attach a SHOW browser plan');
  assert(response.articleFetch?.owningSkill === 'segmently-cli-articles', 'article fetch must delegate to segmently-cli-articles');
  assert(response.articleFetch?.mutation === false, 'article fetch must be non-mutating');
  assert(response.articleFetch?.readOnly === true, 'article fetch must be read-only');
  assert(response.articleFetch?.articleAlias === 'help-block-action-bar', 'article fetch must use help-block-action-bar');
  assert(
    response.articleFetch?.referencePath === 'help-block-action-bar/screenedit-action-bar-primary-text-styles',
    'article fetch missing stable Action Bar reference path',
  );
  assert(response.articleFetch?.fetchCommand?.resolveFirst?.match?.equals === 'help-block-action-bar', 'article fetch must resolve alias through articles list before get');
  assert(response.articleFetch?.fetchCommand?.argv?.includes('<resolvedArticleId>'), 'article fetch command must get resolved articleId, not alias');
  assert(response.completionClaim === 'article-fetch-plan-not-executed', 'article fetch must not claim execution');
  assert(response.missingArticleClaimed === false, 'article fetch must not claim the built-in article is missing');
  assertSourceSafeCustomerAnswer(response);
});

check('show prompt is non-mutating and asks only for target inputs', () => {
  const response = runResponse(['--prompt', 'покажи где поменять цвет кнопки продолжить']);
  assert(response.ok === true, 'SHOW response did not return ok=true');
  assert(response.mode === 'show', `expected show mode, got ${response.mode}`);
  assert(response.action === null, 'SHOW response must not attach a DO action');
  assert(response.show?.mutation === false, 'SHOW response must be non-mutating');
  assert(response.show?.executeWith?.skill === 'playwright-bowser', 'SHOW response missing playwright-bowser route');
  assert(response.show?.executeWith?.companionSkill === 'segmently-test-kit', 'SHOW response missing segmently-test-kit companion');
  assert(response.show?.missingInputs?.includes('projectId'), 'SHOW response must ask for projectId before live navigation');
  assert(response.completionClaim === 'show-needs-target-before-browser', 'SHOW response claimed browser evidence before target inputs');
  assertSourceSafeCustomerAnswer(response);

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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged SHOW runner dry-run failed');
  assert(dryRun.mutation === false, 'packaged SHOW runner dry-run must be non-mutating');
  assert(dryRun.liveBrowserReady === true, 'packaged SHOW runner should be browser-ready with ids/baseUrl');
  assert(dryRun.browser === 'chrome', 'packaged SHOW runner should default to Chrome');
  assert(dryRun.wouldOpen?.join(' ').includes('--browser=chrome'), 'packaged SHOW runner missing Chrome browser selector');
  assert(String(dryRun.driverScript ?? '').includes('waitForSelector'), 'SHOW driver must wait for canvas/editor readiness before inspecting nodes');
  assert(dryRun.authPreflight?.requiredForExecute === true, 'packaged SHOW runner missing auth preflight');
  assert(dryRun.authPreflight?.authEnv === 'prod', 'SHOW auth preflight must infer prod for app.segmently.ai');
  assert(dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status'), 'SHOW auth preflight missing safe status probe');
  assert(dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login'), 'SHOW auth preflight missing login command');
  assert(dryRun.authPreflight?.tokenProbe?.safeToShowOutput === false, 'SHOW auth preflight must mark token probe output unsafe');
  assert(dryRun.authPreflight?.retry?.argv?.includes('--execute'), 'SHOW auth preflight retry must execute the live runner');
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
  const authFailure = runShowRunnerExpectingExit([
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
    '--execute',
    '--segmentlyBin',
    '/usr/bin/false',
  ], 2);
  assert(authFailure.completionClaim === 'show-auth-preflight-required', 'SHOW auth failure must return recoverable auth preflight claim');
  assert(authFailure.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status'), 'SHOW auth failure missing status probe');
  assert(authFailure.authPreflight?.login?.argv?.join(' ').includes('auth login'), 'SHOW auth failure missing login command');
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
  assert(envDryRun.liveBrowserReady === true, 'packaged SHOW runner should accept baseUrl from live harness env');
  assert(
    envDryRun.wouldOpen?.join(' ').includes('https://env.segmently.example/login'),
    'packaged SHOW runner did not use LIVE_SEGMENTLY_BASE_URL for browser open URL',
  );
  assert(dryRun.wouldScreenshot?.join(' ').includes('screenshot'), 'packaged SHOW runner missing screenshot argv');
  assert(dryRun.completionClaim === 'show-not-completed-until-browser-screenshot', 'packaged SHOW runner claimed completion');
});

check('show prompt with screenshot wording and target ids stays SHOW', () => {
  const prompt = 'Покажи где поменять цвет кнопки продолжить в Segmently для проекта project_demo, воронки funnel_demo, версии version_demo, экрана screen_demo. Ничего не меняй, только покажи и сделай скриншот.';
  const response = runResponse([
    '--prompt',
    prompt,
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
    '--baseUrl',
    'https://app.segmently.ai',
  ]);
  assert(response.ok === true, 'SHOW response with screenshot wording did not return ok=true');
  assert(response.mode === 'show', `expected show mode for screenshot wording, got ${response.mode}`);
  assert(response.action === null, 'SHOW screenshot wording must not attach a DO action');
  assert(response.show?.liveBrowserReady === true, 'SHOW screenshot wording should be browser-ready with target ids/baseUrl');
  assert(response.show?.mutation === false, 'SHOW screenshot wording must be non-mutating');
  assert(response.completionClaim === 'show-plan-not-executed', 'SHOW screenshot wording claimed completion before screenshot');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runShowRunner([
    '--prompt',
    prompt,
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--screenId',
    'screen_demo',
    '--baseUrl',
    'https://app.segmently.ai',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged SHOW runner dry-run failed for screenshot wording');
  assert(dryRun.mode === 'show', `packaged SHOW runner returned wrong mode ${dryRun.mode}`);
  assert(dryRun.mutation === false, 'packaged SHOW runner screenshot wording must be non-mutating');
  assert(dryRun.liveBrowserReady === true, 'packaged SHOW runner should be browser-ready for screenshot wording');
  assert(dryRun.browser === 'chrome', 'packaged SHOW runner screenshot wording should default to Chrome');
});

check('CLI do prompt returns executable patch contract and verification', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.runnerOk === true, 'CLI DO runnerOk must be true');
  assert(response.action?.execution?.kind === 'delegate-cli', 'CLI DO missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.actionBar.primary.appearance.backgroundColor', 'CLI DO patch path drifted');
  assert(response.action?.verification?.read === 'funnels export', 'CLI DO missing funnels export verification');
  assert(!containsPlaceholder(response.action?.verification?.argv), 'CLI DO verification argv contains placeholder');
  assert(response.completionClaim === 'not-completed-until-verification', 'CLI DO claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.actionBar.primary.appearance.backgroundColor', 'packaged CLI patch path drifted');
});

check('CLI screen background prompt returns generic field patch contract', () => {
  const response = runResponse([
    '--prompt',
    'сделай фон экрана черным',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'screen background CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.screen.backgroundColor', 'screen background prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'screen background action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.canvas.background.content.color', 'screen background patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#000000', 'screen background inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'screen background action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'screen background action claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged screen background CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.canvas.background.content.color', 'packaged screen background CLI patch path drifted');
});

check('CLI button text-style prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'button text-style CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.actionBar.primaryButton.textStyle.fontSize', 'button text-style prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'button text-style action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.actionBar.primary.content.styles.fontSize', 'button text-style patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 20, 'button text-style inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'button text-style action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'button text-style action claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged button text-style CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.actionBar.primary.content.styles.fontSize', 'packaged button text-style CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 20, 'packaged button text-style CLI patch value must be numeric');
});

check('CLI options title text-style prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'options title text-style CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.options.itemTitle.textStyle.color', 'options title text-style prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'options title text-style action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.options.items.0.title.appearance.color', 'options title text-style patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#222222', 'options title text-style inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'options title text-style action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'options title text-style action claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged options title text-style CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.options.items.0.title.appearance.color', 'packaged options title text-style CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#222222', 'packaged options title text-style CLI patch value drifted');
});

check('CLI options subtitle text-style prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'options subtitle text-style CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.options.itemSubtitle.textStyle.color', 'options subtitle text-style prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'options subtitle text-style action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.options.items.0.subtitle.appearance.color', 'options subtitle text-style patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#555555', 'options subtitle text-style inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'options subtitle text-style action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'options subtitle text-style action claimed completion before verification');
  const subtitleGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-options-subtitle-styles');
  assert(subtitleGuide, 'options subtitle text-style response missing subtitle guide contract');
  assert(subtitleGuide.hasText === true, 'options subtitle text-style guide must include shipped text');
  assert(subtitleGuide.hasScreenshotEvidence === false, 'options subtitle text-style guide image coverage should stay explicit until a screenshot binding exists');
  assert(!response.missingArticleClaimed, 'options subtitle text-style response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged options subtitle text-style CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.options.items.0.subtitle.appearance.color', 'packaged options subtitle text-style CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#555555', 'packaged options subtitle text-style CLI patch value drifted');
});

check('CLI options selected-item style prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'options selected-item CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.options.selectedItem.style.backgroundColor', 'options selected-item prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'options selected-item action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.options.selectedAppearance.backgroundColor', 'options selected-item patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#ffee00', 'options selected-item inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'options selected-item action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'options selected-item action claimed completion before verification');
  const selectedGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-options-selected-item');
  assert(selectedGuide, 'options selected-item response missing selected-item guide contract');
  assert(selectedGuide.hasText === true, 'options selected-item guide must include shipped text');
  assert(selectedGuide.hasScreenshotEvidence === true, 'options selected-item guide must include screenshot-backed evidence');
  assert(!response.missingArticleClaimed, 'options selected-item response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.options.selectedItem.style.backgroundColor',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#ffee00',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged options selected-item CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.options.selectedAppearance.backgroundColor', 'packaged options selected-item CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#ffee00', 'packaged options selected-item CLI patch value drifted');
});

check('CLI header back button text-style prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'header back font-size CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.header.backButton.textStyle.fontSize', 'header back font-size prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'header back font-size action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.header.back.content.appearance.fontSize', 'header back font-size patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 13, 'header back font-size inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'header back font-size action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'header back font-size action claimed completion before verification');
  const headerGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-header-back-styles');
  assert(headerGuide, 'header back font-size response missing header back-styles guide contract');
  assert(headerGuide.hasText === true, 'header back-styles guide must include shipped text');
  assert(!response.missingArticleClaimed, 'header back font-size response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged header back font-size CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.header.back.content.appearance.fontSize', 'packaged header back font-size CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 13, 'packaged header back font-size CLI patch value must be numeric');
});

check('CLI content title text-style prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'content title text-style CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.content.title.textStyle.color', 'content title text-style prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'content title text-style action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.copy.title.appearance.color', 'content title text-style patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#333333', 'content title text-style inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'content title text-style action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'content title text-style action claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged content title text-style CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.copy.title.appearance.color', 'packaged content title text-style CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#333333', 'packaged content title text-style CLI patch value drifted');
});

check('CLI paywall body title text-style prompt returns article-backed field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'paywall title text-style CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.paywallBody.title.textStyle.color', 'paywall title text-style prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'paywall title text-style action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.copy.title.appearance.color', 'paywall title text-style patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#111111', 'paywall title text-style inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'paywall title text-style action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'paywall title text-style action claimed completion before verification');
  assert(response.missingArticleClaimed === false, 'paywall title text-style response claimed the article is missing');
  const reference = response.guidance?.builtInArticleReferences?.find(
    item => item.guideKey === 'screenedit-paywall-body-title-styles',
  );
  assert(reference?.articleAlias === 'help-block-paywall-body', 'paywall title text-style response missing paywall body article alias');
  assert(reference?.referencePath === 'help-block-paywall-body/screenedit-paywall-body-title-styles', 'paywall title text-style reference path drifted');
  assert(reference?.status === 'built-in-reference' || reference?.status === 'public-url-available', 'paywall title text-style reference status invalid');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged paywall title text-style CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.copy.title.appearance.color', 'packaged paywall title text-style CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#111111', 'packaged paywall title text-style CLI patch value drifted');
});

check('CLI paywall footer background prompt returns article-backed field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'paywall footer background CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.paywallFooter.style.backgroundColor', 'paywall footer background prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'paywall footer background action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.paywall.footerAppearance.backgroundColor', 'paywall footer background patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#18181b', 'paywall footer background inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'paywall footer background action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'paywall footer background action claimed completion before verification');
  assert(response.missingArticleClaimed === false, 'paywall footer background response claimed the article is missing');
  const reference = response.guidance?.builtInArticleReferences?.find(
    item => item.guideKey === 'screenedit-paywall-footer-background-color',
  );
  assert(reference?.articleAlias === 'help-block-paywall-footer', 'paywall footer background response missing paywall footer article alias');
  assert(reference?.referencePath === 'help-block-paywall-footer/screenedit-paywall-footer-background-color', 'paywall footer background reference path drifted');
  assert(reference?.status === 'built-in-reference' || reference?.status === 'public-url-available', 'paywall footer background reference status invalid');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged paywall footer background CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.paywall.footerAppearance.backgroundColor', 'packaged paywall footer background CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#18181b', 'packaged paywall footer background CLI patch value drifted');
});

check('CLI text field font-size prompt returns generated field patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'text field font-size CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.textField.style.fontSize', 'text field font-size prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'text field font-size action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.textField.placeholder.appearance.fontSize', 'text field font-size patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 18, 'text field font-size inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'text field font-size action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'text field font-size action claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged text field font-size CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.textField.placeholder.appearance.fontSize', 'packaged text field font-size CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 18, 'packaged text field font-size CLI patch value must be numeric');
});

check('CLI media height prompt returns generated field patch contract', () => {
  const response = runResponse([
    '--prompt',
    'сделай высоту картинки 65 процентов',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'media height CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.media.style.heightPercentage', 'media height prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'media height action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage', 'media height patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 65, 'media height inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'media height action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'media height action claimed completion before verification');
  const mediaGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-media-height-percentage');
  assert(mediaGuide, 'media height response missing media height guide contract');
  assert(mediaGuide.articleAlias === 'help-block-media', 'media height guide must link the built-in Media article');
  assert(mediaGuide.referencePath === 'help-block-media/screenedit-media-height-percentage', 'media height guide missing stable reference path');
  assert(mediaGuide.hasText === true, 'media height guide must include shipped text');
  assert(!response.missingArticleClaimed, 'media height response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.media.style.heightPercentage',
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged media height CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage', 'packaged media height CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 65, 'packaged media height CLI patch value must be numeric');
});

check('CLI paywall media height prompt returns paywall field guide patch contract', () => {
  const response = runResponse([
    '--prompt',
    'Сделай высоту медиа пейволла 65 процентов',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'paywall media height CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.paywallMedia.style.heightPercentage', 'paywall media height prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'paywall media height action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage', 'paywall media height patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 65, 'paywall media height inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'paywall media height action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'paywall media height action claimed completion before verification');
  const mediaGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-paywall-media-height-percentage');
  assert(mediaGuide, 'paywall media height response missing paywall media height guide contract');
  assert(mediaGuide.articleAlias === 'help-block-paywall-media', 'paywall media height guide must link the built-in Paywall Media article');
  assert(mediaGuide.referencePath === 'help-block-paywall-media/screenedit-paywall-media-height-percentage', 'paywall media height guide missing stable reference path');
  assert(mediaGuide.hasText === true, 'paywall media height guide must include shipped text');
  assert(!response.missingArticleClaimed, 'paywall media height response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged paywall media height CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.featuredMedia.appearance.dimensions.heightPercentage', 'packaged paywall media height CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 65, 'packaged paywall media height CLI patch value must be numeric');
});

check('CLI paywall subscription price font-size prompt returns subscription guide patch contract', () => {
  const response = runResponse([
    '--prompt',
    'Сделай цену тарифа на пейволле размером 22',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'paywall subscription price font-size CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.paywallSubscriptions.price.textStyle.fontSize', 'paywall subscription price font-size prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'paywall subscription price font-size action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.paywall.products.items.0.topEndLabel.appearance.fontSize', 'paywall subscription price font-size patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 22, 'paywall subscription price font-size inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'paywall subscription price font-size action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'paywall subscription price font-size action claimed completion before verification');
  const guide = response.guidance?.guides?.find(item => item.guideKey === 'screenedit-paywall-subscriptions-top-end-label');
  assert(guide, 'paywall subscription price font-size response missing price label guide contract');
  assert(guide.articleAlias === 'help-block-paywall-subscriptions', 'paywall subscription price guide must link the built-in Paywall Subscriptions article');
  assert(guide.referencePath === 'help-block-paywall-subscriptions/screenedit-paywall-subscriptions-top-end-label', 'paywall subscription price guide missing stable reference path');
  assert(guide.hasText === true, 'paywall subscription price guide must include shipped text');
  assert(!response.missingArticleClaimed, 'paywall subscription price response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.paywallSubscriptions.price.textStyle.fontSize',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '22',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged paywall subscription price font-size CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.paywall.products.items.0.topEndLabel.appearance.fontSize', 'packaged paywall subscription price font-size CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 22, 'packaged paywall subscription price font-size CLI patch value must be numeric');
});

check('CLI paywall header restore font-size prompt returns header guide patch contract', () => {
  const response = runResponse([
    '--prompt',
    'Сделай размер шрифта restore ссылки в шапке пейволла 13',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'paywall header restore font-size CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.paywallHeader.restoreLink.style.fontSize', 'paywall header restore font-size prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'paywall header restore action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.paywall.restoreLabel.appearance.fontSize', 'paywall header restore font-size patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === 13, 'paywall header restore font-size inferred value must be numeric');
  assert(response.action?.verification?.read === 'funnels export', 'paywall header restore font-size action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'paywall header restore font-size action claimed completion before verification');
  const guide = response.guidance?.guides?.find(item => item.guideKey === 'screenedit-paywall-header-restore-font-size');
  assert(guide, 'paywall header restore font-size response missing restore font-size guide contract');
  assert(guide.articleAlias === 'help-block-paywall-header', 'paywall header restore guide must link the built-in Paywall Header article');
  assert(guide.referencePath === 'help-block-paywall-header/screenedit-paywall-header-restore-font-size', 'paywall header restore guide missing stable reference path');
  assert(guide.hasText === true, 'paywall header restore guide must include shipped text');
  assert(!response.missingArticleClaimed, 'paywall header restore response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.paywallHeader.restoreLink.style.fontSize',
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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged paywall header restore font-size CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.paywall.restoreLabel.appearance.fontSize', 'packaged paywall header restore font-size CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === 13, 'packaged paywall header restore font-size CLI patch value must be numeric');
});

check('CLI carousel title text-style prompt returns generated field patch contract', () => {
  const response = runResponse([
    '--prompt',
    'сделай цвет заголовка карусели #123456',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'carousel title text-style CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.carousel.title.textStyle.color', 'carousel title text-style prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'carousel title text-style action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.carousel.items.0.content.title.appearance.color', 'carousel title text-style patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#123456', 'carousel title text-style inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'carousel title text-style action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'carousel title text-style action claimed completion before verification');
  const carouselGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-carousel-title-styles');
  assert(carouselGuide, 'carousel title response missing title-styles guide contract');
  assert(carouselGuide.articleAlias === 'help-block-carousel', 'carousel title guide must link the built-in Carousel article');
  assert(carouselGuide.referencePath === 'help-block-carousel/screenedit-carousel-title-styles', 'carousel title guide missing stable reference path');
  assert(carouselGuide.hasText === true, 'carousel title guide must include shipped text');
  assert(!response.missingArticleClaimed, 'carousel title response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.carousel.title.textStyle.color',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#123456',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged carousel title CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.carousel.items.0.content.title.appearance.color', 'packaged carousel title CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#123456', 'packaged carousel title CLI patch value drifted');
});

check('CLI sticky container background prompt returns generated field patch contract', () => {
  const response = runResponse([
    '--prompt',
    'сделай фон липкой нижней панели #fef3c7',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'sticky container background CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.stickyContainer.style.backgroundColor', 'sticky container prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'sticky container action missing delegate-cli execution');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.path === 'content.flexibleLayout.stickyContainer.backgroundColor', 'sticky container patch path drifted');
  assert(response.action?.execution?.materialize?.content?.operations?.[0]?.value === '#fef3c7', 'sticky container inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'sticky container action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'sticky container action claimed completion before verification');
  const stickyGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-sticky-container-background-color');
  assert(stickyGuide, 'sticky container response missing background-color guide contract');
  assert(stickyGuide.articleAlias === 'help-block-sticky-container', 'sticky container guide must link the built-in Sticky Container article');
  assert(stickyGuide.referencePath === 'help-block-sticky-container/screenedit-sticky-container-background-color', 'sticky container guide missing stable reference path');
  assert(stickyGuide.hasText === true, 'sticky container guide must include shipped text');
  assert(!response.missingArticleClaimed, 'sticky container response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.stickyContainer.style.backgroundColor',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    '#fef3c7',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged sticky container CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.flexibleLayout.stickyContainer.backgroundColor', 'packaged sticky container CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === '#fef3c7', 'packaged sticky container CLI patch value drifted');
});

check('CLI flexible section background prompt returns generated section patch contract', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'flexible section background CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.flexibleSections.section.layout.backgroundColor', 'flexible section prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'flexible section action missing delegate-cli execution');
  const operation = response.action?.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFlexibleSectionLayoutField', 'flexible section patch op drifted');
  assert(operation?.sectionId === 'section_demo', 'flexible section patch sectionId drifted');
  assert(operation?.field === 'layout.background.color', 'flexible section patch field drifted');
  assert(operation?.value === '#fef3c7', 'flexible section inferred value drifted');
  assert(response.action?.verification?.read === 'funnels export', 'flexible section action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'flexible section action claimed completion before verification');
  const flexGuide = response.guidance?.guides?.find(guide => guide.guideKey === 'screenedit-flexible-sections-background-color');
  assert(flexGuide, 'flexible section response missing background-color guide contract');
  assert(flexGuide.articleAlias === 'help-block-flexible-sections', 'flexible section guide must link the built-in Flexible Sections article');
  assert(flexGuide.referencePath === 'help-block-flexible-sections/screenedit-flexible-sections-background-color', 'flexible section guide missing stable reference path');
  assert(flexGuide.hasText === true, 'flexible section guide must include shipped text');
  assert(!response.missingArticleClaimed, 'flexible section response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.flexibleSections.section.layout.backgroundColor',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--sectionId',
    'section_demo',
    '--value',
    '#fef3c7',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged flexible section CLI runner dry-run failed');
  const dryRunOperation = dryRun.materializedFiles?.[0]?.content?.operations?.[0];
  assert(dryRunOperation?.op === 'setFlexibleSectionLayoutField', 'packaged flexible section CLI patch op drifted');
  assert(dryRunOperation?.sectionId === 'section_demo', 'packaged flexible section CLI patch sectionId drifted');
  assert(dryRunOperation?.field === 'layout.background.color', 'packaged flexible section CLI patch field drifted');
  assert(dryRunOperation?.value === '#fef3c7', 'packaged flexible section CLI patch value drifted');
});

check('E2E do prompt returns browser contract and verification-ready package', () => {
  const response = runResponse([
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
  assert(response.ok === true, 'E2E DO response did not return ok=true');
  assert(response.mode === 'do-e2e', `expected do-e2e mode, got ${response.mode}`);
  assert(response.action?.runnerOk === true, 'E2E DO runnerOk must be true');
  assert(response.action?.execution?.kind === 'playwright-bowser', 'E2E DO missing playwright-bowser execution');
  assert(response.action?.executeWith?.companionSkill === 'segmently-test-kit', 'E2E DO missing segmently-test-kit companion');
  assert(response.action?.verification?.read === 'funnels export', 'E2E DO missing funnels export verification');
  assert(!containsPlaceholder(response.action?.verification?.argv), 'E2E DO verification argv contains placeholder');
  assert(response.completionClaim === 'not-completed-until-verification', 'E2E DO claimed completion before verification');
  assertSourceSafeCustomerAnswer(response);

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
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged E2E runner dry-run failed');
  assert(dryRun.browser === 'chrome', 'packaged E2E runner should default to Chrome');
  assert(dryRun.wouldOpen?.join(' ').includes('--browser=chrome'), 'packaged E2E runner missing Chrome browser selector');
  assert(dryRun.authPreflight?.requiredForExecute === true, 'packaged E2E runner missing auth preflight');
  assert(dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status'), 'E2E auth preflight missing safe status probe');
  assert(dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login'), 'E2E auth preflight missing login command');
  assert(dryRun.authPreflight?.tokenProbe?.safeToShowOutput === false, 'E2E auth preflight must mark token probe output unsafe');
  assert(dryRun.verifyReady === true, 'packaged E2E runner should be verification-ready');
  assert(dryRun.blockedExecuteReason === null, 'packaged E2E runner should not be blocked with baseUrl/versionId');
  assert(String(dryRun.driverScript ?? '').includes('input-style-title-styles-font-size'), 'packaged E2E runner driverScript missing font-size input');
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
  assert(envDryRun.blockedExecuteReason === null, 'packaged E2E runner should accept baseUrl from live harness env');
  assert(
    envDryRun.wouldOpen?.join(' ').includes('https://env.segmently.example/login'),
    'packaged E2E runner did not use LIVE_SEGMENTLY_BASE_URL for browser open URL',
  );
});

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} customer-surface acceptance check(s) failed`);
  process.exit(1);
}

console.log('customer-surface acceptance passed');

function check(id, fn) {
  try {
    fn();
    console.log(`ok - customer-surface:${id}`);
  } catch (error) {
    failures.push(`not ok - customer-surface:${id}\n  ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runResponse(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/customer-response-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function resolveSkillRoot() {
  const overrideRoot = process.env.SEGMENTLY_LAUNCH_GUIDE_ROOT;
  if (overrideRoot && hasShippedReferences(overrideRoot)) return overrideRoot;

  const localRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (hasShippedReferences(localRoot)) return localRoot;

  return localRoot;
}

function hasShippedReferences(skillRoot) {
  return existsSync(join(skillRoot, 'references/guide-evidence.json'))
    && existsSync(join(skillRoot, 'references/help-article-reference.json'))
    && existsSync(join(skillRoot, 'references/teach-reference.json'));
}

function runCliRunner(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/cli-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function runE2eRunner(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/e2e-do-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(stdout);
}

function runShowRunner(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/show-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(stdout);
}

function runShowRunnerExpectingExit(args, expectedStatus) {
  const result = spawnSync('node', [join(root, 'runtime/show-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus) {
    throw new Error(`expected SHOW runner exit ${expectedStatus}, got ${result.status}: ${result.stderr}`);
  }
  if (!result.stdout) throw new Error('SHOW runner did not emit JSON');
  return JSON.parse(result.stdout);
}

function assertSourceSafeCustomerAnswer(response) {
  const answerText = JSON.stringify({
    answer: response.answer,
    mode: response.mode,
    completionClaim: response.completionClaim,
  });
  for (const pattern of [
    /src\/modules/i,
    /\.claude/i,
    /\.agents/i,
    /data-testid/i,
    /getByTestId/i,
    /driverScript/i,
    /input-style/i,
    /editor-do-runner/i,
    /cli-do-runner/i,
    /e2e-do-runner/i,
  ]) {
    assert(!pattern.test(answerText), `customer answer leaks ${pattern}`);
  }
  for (const url of response.answer?.imageUrls ?? []) {
    assert(String(url).startsWith('https://'), `imageUrl is not https: ${url}`);
  }
  for (const url of [
    ...(response.answer?.articleLinks ?? []),
    ...(response.answer?.publicArticleLinks ?? []),
  ]) {
    assert(String(url).startsWith('https://'), `articleLink is not https: ${url}`);
  }
  const bannedCustomerPhrases = [
    /готовой статьи[-\s]?ссылки/i,
    /нет\s+готовой\s+статьи/i,
    /no\s+ready\s+article/i,
    /no\s+article\s+(exists|link)/i,
    /explicitly\s+asks?\s+for\s+a\s+web\s+link/i,
    /only\s+if\s+(the\s+)?customer\s+asks?/i,
    /only\s+if\s+.*full\s+web\s+article/i,
  ];
  for (const pattern of bannedCustomerPhrases) {
    assert(!pattern.test(answerText), `customer answer hides built-in article reference with ${pattern}`);
  }
}

function containsPlaceholder(argv) {
  return (argv ?? []).some(item => /<[^>]+>/.test(String(item)));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
