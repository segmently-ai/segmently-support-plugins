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
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolveSkillRoot();
const defaultContextFile = join(mkdtempSync(join(tmpdir(), 'segmently-launch-guide-acceptance-')), 'empty-context.json');
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

check('article-first raw prompt resolves Facebook events catalog before guide keys', () => {
  const response = runResponse(['--prompt', 'Какие события Segmently отправляет в Facebook?']);
  assert(response.ok === true, 'Facebook events article-first response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.selectedArticles?.some(article => article.articleAlias === 'facebook-events-catalog'), 'Facebook events prompt must select facebook-events-catalog from article registry');
  assert(response.guidance?.guides?.length === 0, 'Facebook events catalog prompt should not fall back to generic analytics guide keys');
  assert(response.answer?.articleReferences?.some(reference => reference.articleAlias === 'facebook-events-catalog'), 'Facebook events prompt missing article registry reference');
  assert(response.answer?.publicArticleLinks?.some(url => /facebook-events-catalog\/index\.html$/.test(url)), 'Facebook events prompt missing public article URL');
  assert(response.answer?.preferredCitation?.articleAlias === 'facebook-events-catalog', 'Facebook events preferred citation must use the article alias');
  assert(response.selectedArticles?.[0]?.relations?.scenarioIds?.includes('facebook-events-list'), 'Facebook events article must be typed to the facebook-events-list scenario');
  assert(response.selectedArticles?.[0]?.tags?.includes('facebook-events'), 'Facebook events article must carry facebook-events tag');
  assert(response.routingPolicy?.articleFirstSearch === true, 'routing policy must expose article-first search');
  assertSourceSafeCustomerAnswer(response);
});

check('direct article alias returns article-fetch contract without guide keys', () => {
  const response = runResponse([
    '--prompt',
    'Пришли полную статью про события Facebook',
    '--articleAliases',
    'facebook-events-catalog',
    '--mode',
    'article-fetch',
  ]);
  assert(response.ok === true, 'direct article alias article-fetch response did not return ok=true');
  assert(response.mode === 'article-fetch', `expected article-fetch mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'agent-selected-semantics', 'direct article alias must use selected catalog resolver');
  assert(response.selectedArticles?.some(article => article.articleAlias === 'facebook-events-catalog'), 'direct article alias missing selected article contract');
  assert(response.articleFetch?.articleAlias === 'facebook-events-catalog', 'article-fetch contract must keep selected article alias');
  assert(response.articleFetch?.fetchCommand?.configUrl?.endsWith('/facebook-events-catalog/config.json'), 'article-fetch contract missing config URL');
  assert(response.articleFetch?.fetchCommand?.publicUrl?.endsWith('/facebook-events-catalog/index.html'), 'article-fetch contract missing public article URL');
  assert(response.articleFetch?.selectedArticle?.relations?.scenarioIds?.includes('facebook-events-list'), 'article-fetch selected article missing typed scenario relation');
  assert(response.guidance?.guides?.length === 0, 'direct article alias article-fetch must not require guide keys');
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

check('Stripe subscription setup teach prompt resolves article and image links', () => {
  const response = runResponse(['--prompt', 'как настроить stripe подписки?']);
  assert(response.ok === true, 'Stripe subscription setup TEACH response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.action === null, 'Stripe subscription setup TEACH response must not attach a fake DO action');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'integrations-stripe-connect-section'), 'missing Stripe Connect setup guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'paywall-products-list'), 'missing Paywall Products guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'paywall-product-subscription-options'), 'missing subscription options guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-paywall-subscriptions-items'), 'missing Paywall Subscriptions plans guide');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles'), 'Stripe subscription setup incorrectly resolved Options guide');
  for (const alias of [
    'integrations-stripe-connect-section',
    'stripe-connect-oauth-guidance',
    'paywall-products-list',
    'paywall-product-subscription-options',
    'help-block-paywall-subscriptions',
  ]) {
    assert(response.answer?.publicArticleLinks?.some(url => new RegExp(`${alias}/index\\.html$`).test(url)), `Stripe subscription setup missing published article URL for ${alias}`);
  }
  assert(response.answer?.imageUrls?.some(url => /expand-stripe-stripe-section/.test(url)), 'Stripe subscription setup missing Stripe Connect screenshot URL');
  assert(response.answer?.imageUrls?.some(url => /open-products-products-list/.test(url)), 'Stripe subscription setup missing Paywall Products screenshot URL');
  assert(response.answer?.imageUrls?.some(url => /paywall-screen-configuration-guide/.test(url)), 'Stripe subscription setup missing Paywall Subscriptions screenshot URL');
  assert(response.answer?.customerVisibleGuideAssets?.mustShowInCustomerAnswer === true, 'Stripe subscription setup must require visible guide assets in customer answer');
  assert(response.answer?.showDoOptions?.show?.available === true, 'Stripe subscription setup missing SHOW option');
  assert(response.answer?.showDoOptions?.do?.available === 'partly-cli-and-handoff', 'Stripe subscription setup must expose CLI + handoff DO boundary');
  assert(/Stripe Connect OAuth/.test(response.answer?.showDoOptions?.do?.summary ?? ''), 'Stripe subscription setup DO boundary must mention OAuth handoff');
  assert(/Segmently CLI/.test(response.answer?.showDoOptions?.do?.summary ?? ''), 'Stripe subscription setup DO boundary must mention CLI product creation');
  assert(response.missingArticleClaimed === false, 'Stripe subscription setup must not claim the built-in articles are missing');
  assertSourceSafeCustomerAnswer(response);
});

check('agent-selected semantic guide keys resolve Stripe subscription materials', () => {
  const guideKeys = [
    'integrations-stripe-connect-section',
    'stripe-connect-oauth-guidance',
    'paywall-products-list',
    'paywall-product-subscription-options',
    'screen-editor-section-paywall-subscriptions',
    'screenedit-paywall-subscriptions-items',
  ].join(',');
  const response = runResponse([
    '--prompt',
    'я не понимаю где сделать ежемесячные платежи через страйп',
    '--guideKeys',
    guideKeys,
    '--scenarioId',
    'create-paywall-products',
  ]);
  assert(response.ok === true, 'agent-selected Stripe subscription response did not return ok=true');
  assert(response.resolver?.kind === 'agent-selected-semantics', `expected agent-selected-semantics resolver, got ${response.resolver?.kind}`);
  assert(response.resolver?.selectionSource === 'model-over-catalog', 'agent-selected resolver must record model-over-catalog source');
  assert(response.resolver?.deterministicRole === 'evidence-and-execution-contract-only', 'runner must record deterministic validation role');
  assert(response.scenarioId === 'create-paywall-products', `expected create-paywall-products scenario, got ${response.scenarioId}`);
  assert(response.answer?.publicArticleLinks?.some(url => /integrations-stripe-connect-section\/index\.html$/.test(url)), 'agent-selected Stripe response missing Stripe Connect article URL');
  assert(response.answer?.publicArticleLinks?.some(url => /paywall-product-subscription-options\/index\.html$/.test(url)), 'agent-selected Stripe response missing subscription options article URL');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-paywall-subscriptions\/index\.html$/.test(url)), 'agent-selected Stripe response missing Paywall Subscriptions article URL');
  assert(response.answer?.imageUrls?.some(url => /expand-stripe-stripe-section/.test(url)), 'agent-selected Stripe response missing Stripe screenshot URL');
  assert(response.answer?.imageUrls?.some(url => /open-products-products-list/.test(url)), 'agent-selected Stripe response missing Products screenshot URL');
  assert(response.answer?.imageUrls?.some(url => /paywall-screen-configuration-guide/.test(url)), 'agent-selected Stripe response missing Paywall Subscriptions screenshot URL');
  assert(response.answer?.customerVisibleGuideAssets?.mustShowInCustomerAnswer === true, 'agent-selected Stripe response must require visible materials');
  assert(response.answer?.showDoOptions?.do?.available === 'partly-cli-and-handoff', 'agent-selected Stripe response must expose CLI + handoff boundary');
  assert(response.missingArticleClaimed === false, 'agent-selected Stripe response must not claim articles are missing');
  assertSourceSafeCustomerAnswer(response);
});

check('Flexible Layout linked product labels resolve article and CLI delegation boundary', () => {
  const response = runResponse([
    '--prompt',
    'как в flexible layout сделать чтобы текст description и кнопка purchase брались из выбранного продукта product catalog, и можно ли это настроить через cli?',
  ]);
  assert(response.ok === true, 'Flexible Layout linked product label response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'teach', `expected teach resolver, got ${response.resolver?.kind}`);
  assert(response.resolver?.domainOperationBoundary === 'flexible-linked-product-label-domain-operation', 'Flexible Layout linked labels must use the dedicated domain boundary');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-flexible-sections-linked-product-labels'), 'missing linked product labels guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-flexible-sections-selected-product-purchase'), 'missing selected product purchase guide');
  assert(!response.guidance?.guides?.some(guide => guide.articleAlias === 'help-block-paywall-footer'), 'Flexible Layout linked labels incorrectly resolved Paywall Footer');
  assert(response.answer?.articleReferences?.some(reference => reference.articleAlias === 'help-block-flexible-sections'), 'missing help-block-flexible-sections article reference');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-flexible-sections\/index\.html$/.test(url)), 'missing Flexible Sections article URL');
  const selectedArticle = response.selectedArticles?.find(article => article.articleAlias === 'help-block-flexible-sections');
  assert(selectedArticle, 'Flexible Layout linked labels missing selected article registry contract');
  assert(selectedArticle.tags?.includes('flexible-layout'), 'Flexible Layout article missing flexible-layout tag');
  assert(selectedArticle.tags?.includes('product-catalog'), 'Flexible Layout article missing product-catalog tag');
  assert(selectedArticle.subarticles?.some(section => /selected product|linked product|purchase/i.test(`${section.title} ${section.summary}`)), 'Flexible Layout article missing linked-product subarticle material');
  assert(selectedArticle.relations?.guideKeys?.includes('screenedit-flexible-sections-linked-product-labels'), 'Flexible Layout article missing guide relation');
  const instructionText = response.answer?.instructions?.map(item => `${item.title} ${item.text}`).join('\n') ?? '';
  assert(/Product Catalog selection/.test(instructionText), 'instructions must mention Product Catalog selection');
  assert(/description label/.test(instructionText), 'instructions must mention description label');
  assert(/purchase label/.test(instructionText), 'instructions must mention purchase label');
  assert(/purchases the selected product|buys the currently selected product/.test(instructionText), 'instructions must prove selected-product purchase');
  for (const needle of [
    'link-text-to-catalog',
    'link-purchase-to-catalog',
    'default-product-labels',
    'selected-product-labels',
    'selected-product-payment-intent',
  ]) {
    assert(response.answer?.imageUrls?.some(url => url.includes(needle)), `missing Flexible Layout image URL ${needle}`);
  }
  assert(response.answer?.showDoOptions?.do?.available === 'cli-delegated', 'Flexible Layout linked labels must expose CLI delegated setup');
  assert(response.answer?.showDoOptions?.do?.owningSkill === 'segmently-cli-custom-screen-guide', 'Flexible Layout linked labels must delegate CLI to segmently-cli-custom-screen-guide');
  assert(/descriptionLabel/.test(response.answer?.showDoOptions?.do?.summary ?? ''), 'CLI summary must mention descriptionLabel');
  assert(/purchaseLabel/.test(response.answer?.showDoOptions?.do?.summary ?? ''), 'CLI summary must mention purchaseLabel');
  assert(response.missingArticleClaimed === false, 'Flexible Layout linked labels must not claim the article is missing');
  assertSourceSafeCustomerAnswer(response);
});

check('selected product text update prompt explains ordinary WebEmbed and Flexible Layout paywall paths', () => {
  const response = runResponse([
    '--prompt',
    'но хочу чтобы когда пользователь выбирает продукт чтобы тексты обновлялись согласно продукту, как это сделать?',
  ]);
  assert(response.ok === true, 'selected-product text update response did not return ok=true');
  assert(response.mode === 'teach', `expected teach mode, got ${response.mode}`);
  assert(response.resolver?.domainOperationBoundary === 'product-selection-paywall-label-domain-operation', 'selected-product text update must use product-selection paywall boundary');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'onboarding-list-create'), 'selected-product text update incorrectly resolved onboarding creation guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-paywall-subscriptions-items'), 'missing ordinary Paywall Subscriptions guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-embed-data-sources'), 'missing WebEmbed data sources guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-flexible-sections-linked-product-labels'), 'missing Flexible Layout linked labels guide');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-flexible-sections-selected-product-purchase'), 'missing Flexible Layout selected-product purchase guide');
  for (const alias of ['help-block-paywall-subscriptions', 'help-block-custom-html', 'help-block-flexible-sections']) {
    assert(response.answer?.articleReferences?.some(reference => reference.articleAlias === alias), `missing ${alias} article reference`);
    assert(response.answer?.publicArticleLinks?.some(url => new RegExp(`${alias}/index\\.html$`).test(url)), `missing ${alias} article URL`);
    assert(response.selectedArticles?.some(article => article.articleAlias === alias), `missing ${alias} selected article registry contract`);
  }
  const instructionText = response.answer?.instructions?.map(item => `${item.title} ${item.text}`).join('\n') ?? '';
  for (const needle of [
    'Ordinary Paywall Subscriptions',
    'WebEmbed/CustomEmbed paywall',
    'native Flexible Layout',
    'Product Catalog',
    'selected_product variable',
    'Linked to section',
    'descriptionLabel',
    'purchaseLabel',
    'checkout/payment intent',
  ]) {
    assert(instructionText.includes(needle), `selected-product text update instructions missing ${needle}`);
  }
  assert(response.answer?.showDoOptions?.do?.available === 'shape-dependent-cli-or-editor', 'selected-product text update must expose shape-dependent DO boundary');
  assert(response.answer?.showDoOptions?.do?.owningSkill === 'segmently-cli-custom-screen-guide', 'selected-product text update must delegate WebEmbed/Flexible CLI work');
  assert(/Ordinary Paywall Subscriptions/.test(response.answer?.nextStep ?? ''), 'next step must mention ordinary Paywall Subscriptions');
  assert(/WebEmbed\/CustomEmbed/.test(response.answer?.nextStep ?? ''), 'next step must mention WebEmbed/CustomEmbed');
  assert(/native Flexible Layout/.test(response.answer?.nextStep ?? ''), 'next step must mention native Flexible Layout');
  assert(response.missingArticleClaimed === false, 'selected-product text update must not claim articles are missing');
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

check('direct shared Media video upload request returns conditional browser DO contract', () => {
  const response = runResponse(['--prompt', 'сделай видео в списке']);
  assert(response.ok === true, 'direct shared Media video DO response did not return ok=true');
  assert(response.mode === 'do-e2e-conditional', `expected conditional browser DO mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'conditional-do', `expected conditional-do resolver, got ${response.resolver?.kind}`);
  assert(response.action?.actionId === 'browser.media.videoUpload', 'direct shared Media video DO must use the shared Media upload action');
  assert(response.action?.status === 'needs-inputs', `expected missing-inputs status, got ${response.action?.status}`);
  assert(response.action?.owningSkill === 'playwright-bowser', 'shared Media conditional upload must route to playwright-bowser');
  assert(response.action?.companionSkill === 'segmently-test-kit', 'shared Media conditional upload must include segmently-test-kit');
  assert(response.action?.supportedBoundary === 'conditional-browser-editor-upload', 'shared Media upload must not pretend a headless CLI patch exists');
  assert(response.action?.missingInputs?.includes('projectId'), 'shared Media upload must ask for projectId');
  assert(response.action?.missingInputs?.includes('funnelId'), 'shared Media upload must ask for funnelId');
  assert(response.action?.missingInputs?.includes('screenId'), 'shared Media upload must ask for screenId');
  assert(response.action?.missingInputs?.includes('videoUrl-or-local-file'), 'shared Media upload must ask for video source');
  assert(response.action?.authPreflight?.requiredForExecute === true, 'shared Media upload must include auth preflight');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-media\/index\.html$/.test(url)), 'shared Media upload must keep the article URL');
  assert(response.answer?.imageUrls?.some(url => /configure-media-section/.test(url)), 'shared Media upload must expose concrete Media image URLs');
  assert(response.answer?.customerVisibleGuideAssets?.guideReferences?.some(reference => reference.articleAlias === 'help-block-media'), 'shared Media upload visible assets missing guide alias');
  assert(response.completionClaim === 'needs-inputs-before-execution', `unexpected completion claim ${response.completionClaim}`);
  assertSourceSafeCustomerAnswer(response);
});

check('mixed dry-run shared Media video request stays conditional browser DO', () => {
  const response = runResponse([
    '--prompt',
    'Сделай видео в списке Segmently. Я не знаю точные id, это тестовый прогон: не меняй данные, покажи статью с картинкой и какие inputs нужны чтобы сделать это через браузер.',
  ]);
  assert(response.ok === true, 'mixed shared Media video DO response did not return ok=true');
  assert(response.mode === 'do-e2e-conditional', `expected conditional browser DO mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'conditional-do', `expected conditional-do resolver, got ${response.resolver?.kind}`);
  assert(response.resolver?.scenarioId === 'change-setting', `expected change-setting scenario, got ${response.resolver?.scenarioId}`);
  assert(response.action?.actionId === 'browser.media.videoUpload', `mixed shared Media prompt resolved wrong action ${response.action?.actionId}`);
  assert(response.action?.owningSkill === 'playwright-bowser', 'mixed shared Media prompt must route to playwright-bowser');
  assert(response.action?.companionSkill === 'segmently-test-kit', 'mixed shared Media prompt must include segmently-test-kit');
  assert(response.action?.supportedBoundary === 'conditional-browser-editor-upload', 'mixed shared Media upload must not pretend a headless CLI patch exists');
  assert(response.action?.missingInputs?.includes('projectId'), 'mixed shared Media upload must ask for projectId');
  assert(response.action?.missingInputs?.includes('funnelId'), 'mixed shared Media upload must ask for funnelId');
  assert(response.action?.missingInputs?.includes('screenId'), 'mixed shared Media upload must ask for screenId');
  assert(response.action?.missingInputs?.includes('videoUrl-or-local-file'), 'mixed shared Media upload must ask for video source');
  assert(response.action?.authPreflight?.requiredForExecute === true, 'mixed shared Media upload must include auth preflight');
  assertToolPreflight(response.action?.toolPreflight, { browser: true });
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-media\/index\.html$/.test(url)), 'mixed shared Media upload must keep the article URL');
  assert(response.answer?.imageUrls?.some(url => /configure-media-section/.test(url)), 'mixed shared Media upload must expose concrete Media image URLs');
  assert(response.answer?.customerVisibleGuideAssets?.guideReferences?.some(reference => reference.articleAlias === 'help-block-media'), 'mixed shared Media visible assets missing guide alias');
  assert(!response.answer?.articleReferences?.some(reference => reference.articleAlias === 'paywall-products-list'), 'mixed shared Media prompt must not resolve Paywall Products article');
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
  assert(dryRun.wouldOpen?.join(' ').includes('--headed'), 'packaged SHOW runner must open a headed browser for visible customer guidance');
  assert(dryRun.visibleBrowser === true && dryRun.headed === true, 'packaged SHOW runner must expose visible headed browser contract');
  assert(dryRun.keepOpen === true, 'packaged SHOW runner must keep the browser open for the customer by default');
  assert(dryRun.closePolicy === 'keep-visible-browser-open-for-customer', 'packaged SHOW runner close policy must keep the window visible');
  assert(dryRun.wouldClose === null, 'packaged SHOW runner must not close the browser unless explicitly requested');
  assert(String(dryRun.driverScript ?? '').includes('waitForSelector'), 'SHOW driver must wait for canvas/editor readiness before inspecting nodes');
  assert(dryRun.authPreflight?.requiredForExecute === true, 'packaged SHOW runner missing auth preflight');
  assert(dryRun.authPreflight?.authEnv === 'prod', 'SHOW auth preflight must infer prod for app.segmently.ai');
  assert(dryRun.authPreflight?.statusProbe?.argv?.join(' ').includes('auth status'), 'SHOW auth preflight missing safe status probe');
  assert(dryRun.authPreflight?.login?.argv?.join(' ').includes('auth login'), 'SHOW auth preflight missing login command');
  assert(dryRun.authPreflight?.tokenProbe?.safeToShowOutput === false, 'SHOW auth preflight must mark token probe output unsafe');
  assert(dryRun.authPreflight?.retry?.argv?.includes('--execute'), 'SHOW auth preflight retry must execute the live runner');
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
  assert(dryRun.completionClaim === 'show-not-completed-until-visible-browser-and-screenshot', 'packaged SHOW runner claimed completion');
});

check('session context supplies current project without hiding remaining target inputs', () => {
  const contextFile = join(mkdtempSync(join(tmpdir(), 'segmently-launch-guide-context-')), 'context.json');
  const saved = JSON.parse(execFileSync('node', [
    join(root, 'runtime/session-context.mjs'),
    'set-current-project',
    '--projectId',
    'project_ctx',
    '--projectName',
    'Context Project',
    '--contextFile',
    contextFile,
  ], { encoding: 'utf8' }));
  assert(saved.ok === true, 'session-context set-current-project failed');
  assert(saved.context?.currentProject?.id === 'project_ctx', 'session-context did not persist project id');

  const response = runResponse([
    '--prompt',
    'покажи где поменять цвет кнопки продолжить',
  ], {
    SEGMENTLY_LAUNCH_CONTEXT_FILE: contextFile,
  });
  assert(response.ok === true, 'context-backed SHOW response did not return ok=true');
  assert(response.sessionContext?.usingCurrentProject === true, 'context-backed SHOW did not use current project');
  assert(response.sessionContext?.currentProject?.id === 'project_ctx', 'context-backed SHOW current project id drifted');
  assert(!response.show?.missingInputs?.includes('projectId'), 'context-backed SHOW must not ask for projectId again');
  assert(response.show?.missingInputs?.includes('funnelId'), 'context-backed SHOW must still ask for funnelId');
  assert(response.show?.missingInputs?.includes('screenId'), 'context-backed SHOW must still ask for screenId');
  assert(response.show?.providedInputs?.projectId === 'project_ctx', 'context-backed SHOW must pass projectId as provided input');
  assert(/Context Project/.test(response.answer?.contextNotice ?? ''), 'context-backed SHOW must tell the customer which project is being used');
  assertSourceSafeCustomerAnswer(response);

  const cliDoResponse = runResponse([
    '--prompt',
    'сделай главную кнопку желтой',
  ], {
    SEGMENTLY_LAUNCH_CONTEXT_FILE: contextFile,
  });
  assert(cliDoResponse.ok === true, 'context-backed CLI DO response did not return ok=true');
  assert(cliDoResponse.mode === 'do-cli', `expected context-backed do-cli mode, got ${cliDoResponse.mode}`);
  assert(cliDoResponse.sessionContext?.usingCurrentProject === true, 'context-backed CLI DO did not use current project');
  assert(cliDoResponse.action?.actionId === 'editor.actionBar.primaryButton.backgroundColor', 'context-backed CLI DO resolved wrong action');
  assert(!cliDoResponse.action?.missingInputs?.includes('projectId'), 'context-backed CLI DO must not ask for projectId again');
  assert(cliDoResponse.action?.missingInputs?.includes('funnelId'), 'context-backed CLI DO must still ask for funnelId');
  assert(cliDoResponse.action?.missingInputs?.includes('versionId'), 'context-backed CLI DO must still ask for versionId');
  assert(cliDoResponse.action?.missingInputs?.includes('screenId'), 'context-backed CLI DO must still ask for screenId');
  assert(/Context Project/.test(cliDoResponse.answer?.contextNotice ?? ''), 'context-backed CLI DO must tell the customer which project is being used');
  assert(cliDoResponse.completionClaim === 'needs-inputs-before-execution', 'context-backed CLI DO must not claim execution before target inputs');
  assertSourceSafeCustomerAnswer(cliDoResponse);

  const e2eDoResponse = runResponse([
    '--prompt',
    'сделай шрифт ячейки в списке 18',
  ], {
    SEGMENTLY_LAUNCH_CONTEXT_FILE: contextFile,
  });
  assert(e2eDoResponse.ok === true, 'context-backed E2E DO response did not return ok=true');
  assert(e2eDoResponse.mode === 'do-e2e', `expected context-backed do-e2e mode, got ${e2eDoResponse.mode}`);
  assert(e2eDoResponse.sessionContext?.usingCurrentProject === true, 'context-backed E2E DO did not use current project');
  assert(e2eDoResponse.action?.actionId === 'editor.list.options.itemTitle.fontSize', 'context-backed E2E DO resolved wrong action');
  assert(!e2eDoResponse.action?.missingInputs?.includes('projectId'), 'context-backed E2E DO must not ask for projectId again');
  assert(e2eDoResponse.action?.missingInputs?.includes('funnelId'), 'context-backed E2E DO must still ask for funnelId');
  assert(e2eDoResponse.action?.missingInputs?.includes('screenId'), 'context-backed E2E DO must still ask for screenId');
  assert(/Context Project/.test(e2eDoResponse.answer?.contextNotice ?? ''), 'context-backed E2E DO must tell the customer which project is being used');
  assert(e2eDoResponse.completionClaim === 'needs-inputs-before-execution', 'context-backed E2E DO must not claim execution before target inputs');
  assertSourceSafeCustomerAnswer(e2eDoResponse);

  const directCliDo = runCliRunner([
    '--contextFile',
    contextFile,
    '--action',
    'editor.screen.backgroundColor',
    '--funnelId',
    'funnel_ctx',
    '--versionId',
    'version_ctx',
    '--screenId',
    'screen_ctx',
    '--value',
    '#000000',
  ]);
  assert(directCliDo.ok === true && directCliDo.dryRun === true, 'direct CLI DO runner with saved current project failed');
  assert(directCliDo.sessionContext?.usingCurrentProject === true, 'direct CLI DO runner did not use saved current project');
  assert(directCliDo.sessionContext?.currentProject?.id === 'project_ctx', 'direct CLI DO runner current project id drifted');
  assert(directCliDo.wouldRun?.includes('project_ctx'), 'direct CLI DO runner did not pass saved projectId to wouldRun');
  assert(directCliDo.wouldVerify?.includes('project_ctx'), 'direct CLI DO runner did not pass saved projectId to wouldVerify');
  assert(directCliDo.interactionPolicy?.multiStepActionTool === 'todo-list', 'direct CLI DO runner missing todo-list interaction policy');
  assert(directCliDo.interactionPolicy?.askUserQuestionTool === 'ask-user-question', 'direct CLI DO runner missing ask-user-question interaction policy');

  const directE2eDo = runE2eRunner([
    '--contextFile',
    contextFile,
    '--action',
    'editor.list.options.itemTitle.fontSize',
    '--funnelId',
    'funnel_ctx',
    '--screenId',
    'screen_ctx',
    '--value',
    '18',
    '--baseUrl',
    'https://app.segmently.ai',
  ]);
  assert(directE2eDo.ok === true && directE2eDo.dryRun === true, 'direct E2E DO runner with saved current project failed');
  assert(directE2eDo.sessionContext?.usingCurrentProject === true, 'direct E2E DO runner did not use saved current project');
  assert(directE2eDo.sessionContext?.currentProject?.id === 'project_ctx', 'direct E2E DO runner current project id drifted');
  assert(String(directE2eDo.driverScript ?? '').includes('"projectId":"project_ctx"'), 'direct E2E DO runner did not pass saved projectId into driverScript');
  assert(directE2eDo.wouldVerify?.includes('project_ctx'), 'direct E2E DO runner did not pass saved projectId to wouldVerify');
  assert(directE2eDo.interactionPolicy?.multiStepActionTool === 'todo-list', 'direct E2E DO runner missing todo-list interaction policy');
  assert(directE2eDo.interactionPolicy?.askUserQuestionTool === 'ask-user-question', 'direct E2E DO runner missing ask-user-question interaction policy');

  const articleFetchResponse = runResponse([
    '--prompt',
    'дай полную статью как настроить шрифты в кнопке',
  ], {
    SEGMENTLY_LAUNCH_CONTEXT_FILE: contextFile,
  });
  assert(articleFetchResponse.ok === true, 'context-backed article-fetch response did not return ok=true');
  assert(articleFetchResponse.mode === 'article-fetch', `expected context-backed article-fetch mode, got ${articleFetchResponse.mode}`);
  assert(articleFetchResponse.sessionContext?.usingCurrentProject === true, 'context-backed article-fetch did not use current project');
  assert(articleFetchResponse.articleFetch?.articleAlias === 'help-block-action-bar', 'context-backed article-fetch resolved wrong article alias');
  assert(Array.isArray(articleFetchResponse.articleFetch?.missingInputs) && articleFetchResponse.articleFetch.missingInputs.length === 0, 'context-backed article-fetch must not require target ids');
  assert(articleFetchResponse.articleFetch?.fetchCommand?.optionalArgs?.includes('projectId when the article is project-scoped'), 'context-backed article-fetch must keep projectId optional for project-scoped articles');
  assert(/Context Project/.test(articleFetchResponse.answer?.contextNotice ?? ''), 'context-backed article-fetch must tell the customer which project is being used');
  assert(articleFetchResponse.completionClaim === 'article-fetch-plan-not-executed', 'context-backed article-fetch must not claim execution');
  assertSourceSafeCustomerAnswer(articleFetchResponse);
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
  assert(dryRun.wouldOpen?.join(' ').includes('--headed'), 'packaged SHOW runner screenshot wording must still open a headed browser');
  assert(dryRun.keepOpen === true, 'packaged SHOW runner screenshot wording must keep browser open by default');
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
  assertToolPreflight(response.action?.toolPreflight, { browser: false });
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
  assertToolPreflight(dryRun.toolPreflight, { browser: false });
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

check('content title copy text prompt stays article-backed and refuses blind generic CLI mutation', () => {
  const response = runResponse([
    '--prompt',
    'поменяй текст заголовка экрана на Welcome Back',
  ]);
  assert(response.ok === true, 'content title copy text response did not return ok=true');
  assert(response.mode === 'teach', `expected teach/domain-boundary mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'teach', `expected teach resolver, got ${response.resolver?.kind}`);
  assert(response.action === null, 'copy text value prompt must not attach a generic CLI action');
  assert(response.show === null, 'copy text value prompt must not pretend a live SHOW was already run');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-copy-block-title-text'), 'copy text prompt missing headline text guide');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-copy-block-title-styles'), 'copy text prompt incorrectly resolved style guide');
  assert(response.answer?.preferredCitation?.articleAlias === 'help-block-content', 'copy text prompt missing Content article alias');
  assert(response.answer?.preferredCitation?.referencePath === 'help-block-content/screenedit-copy-block-title-text', 'copy text prompt missing exact title-text reference path');
  assert(response.answer?.publicArticleLinks?.some(url => /help-block-content\/index\.html$/.test(url)), 'copy text prompt missing published Content article URL');
  assert(response.answer?.imageUrls?.some(url => /open-section-title-text\.png$/.test(url)), 'copy text prompt missing concrete title text screenshot URL');
  assert(response.answer?.showDoOptions?.show?.available === true, 'copy text prompt must offer SHOW');
  assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', 'copy text prompt must mark DO as requiring a domain operation');
  assert(/locale-aware copy\/label domain operation|browser flow/.test(response.answer?.nextStep ?? ''), 'copy text prompt missing locale-aware domain/browser boundary');
  assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), 'copy text prompt must explicitly forbid generic setFieldValue mutation');
  assert(response.completionClaim === 'guidance-only', 'copy text prompt must not claim mutation or verification');
  assertSourceSafeCustomerAnswer(response);
});

check('content subtitle copy text prompt stays article-backed and refuses blind generic CLI mutation', () => {
  const response = runResponse([
    '--prompt',
    'поменяй текст подзаголовка экрана на Start now',
  ]);
  assert(response.ok === true, 'content subtitle copy text response did not return ok=true');
  assert(response.mode === 'teach', `expected teach/domain-boundary mode, got ${response.mode}`);
  assert(response.resolver?.kind === 'teach', `expected teach resolver, got ${response.resolver?.kind}`);
  assert(response.action === null, 'subtitle copy text value prompt must not attach a generic CLI action');
  assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-copy-block-subtitle-text'), 'copy text prompt missing subtitle text guide');
  assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-copy-block-subtitle-styles'), 'copy text prompt incorrectly resolved subtitle style guide');
  assert(response.answer?.preferredCitation?.referencePath === 'help-block-content/screenedit-copy-block-subtitle-text', 'copy text prompt missing exact subtitle-text reference path');
  assert(response.answer?.imageUrls?.some(url => /open-section-subtitle-text\.png$/.test(url)), 'copy text prompt missing concrete subtitle text screenshot URL');
  assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', 'subtitle copy text prompt must mark DO as requiring a domain operation');
  assert(response.completionClaim === 'guidance-only', 'subtitle copy text prompt must not claim mutation or verification');
  assertSourceSafeCustomerAnswer(response);
});

check('options copy text prompts stay article-backed and refuse blind generic CLI mutation', () => {
  for (const prompt of [
    'поменяй текст варианта ответа на Да',
    'переименуй option label на Yes',
  ]) {
    const response = runResponse(['--prompt', prompt]);
    assert(response.ok === true, `options copy text response did not return ok=true for ${prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.copyTextValueBoundary === true, `options copy prompt missing resolver copyTextValueBoundary for ${prompt}`);
    assert(response.action === null, `options copy text prompt must not attach a generic CLI action for ${prompt}`);
    assert(response.show === null, `options copy text prompt must not pretend a live SHOW was already run for ${prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-options'), `options copy prompt missing Options article guide for ${prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-options-title-styles'), `options copy prompt incorrectly resolved title style guide for ${prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-options', `options copy prompt missing Options article alias for ${prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === 'help-block-options/screen-editor-section-options', `options copy prompt missing stable Options reference path for ${prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-options\/index\.html$/.test(url)), `options copy prompt missing published Options article URL for ${prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-options-section/.test(url)), `options copy prompt missing concrete Options screenshot URL for ${prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `options copy prompt must offer SHOW for ${prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `options copy prompt must mark DO as requiring a domain operation for ${prompt}`);
    assert(/locale-aware copy\/label domain operation|browser flow/.test(response.answer?.nextStep ?? ''), `options copy prompt missing locale-aware domain/browser boundary for ${prompt}`);
    assert(/option\/block identity|target-copy-or-label-identity/.test([
      response.answer?.nextStep ?? '',
      ...(response.answer?.showDoOptions?.do?.missingInputs ?? []),
    ].join(' ')), `options copy prompt missing option identity requirement for ${prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `options copy prompt must explicitly forbid generic setFieldValue mutation for ${prompt}`);
    assert(response.completionClaim === 'guidance-only', `options copy prompt must not claim mutation or verification for ${prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }
});

check('variable binding prompts resolve exact article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'поменяй название переменной списка на goal',
      expectedGuideKey: 'screenedit-variable-binding-create-variable-name',
      expectedReferencePath: 'help-block-variable-binding/screenedit-variable-binding-create-variable-name',
      forbiddenGuideKey: 'screenedit-paywall-subscriptions-list-padding',
    },
    {
      prompt: 'как привязать варианты списка к переменной',
      expectedGuideKey: 'screenedit-variable-binding-apply-items-to-variable',
      expectedReferencePath: 'help-block-variable-binding/screenedit-variable-binding-apply-items-to-variable',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'измени label option variable на premium',
      expectedGuideKey: 'screenedit-variable-binding-option-label',
      expectedReferencePath: 'help-block-variable-binding/screenedit-variable-binding-option-label',
      forbiddenGuideKey: 'screen-editor-section-options',
    },
    {
      prompt: 'как настроить score effect для варианта',
      expectedGuideKey: 'screenedit-variable-binding-score-effects',
      expectedReferencePath: 'help-block-variable-binding/screenedit-variable-binding-score-effects',
      forbiddenGuideKey: 'screenedit-options-title-styles',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `variable binding response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'variable-binding-domain-operation', `variable binding prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `variable binding prompt must not attach a generic CLI action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-variable-binding'), `variable binding prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `variable binding prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `variable binding prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-variable-binding', `variable binding prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `variable binding prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-variable-binding\/index\.html$/.test(url)), `variable binding prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-variable-binding/.test(url)), `variable binding prompt missing concrete image URL for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `variable binding prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `variable binding prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('variable-or-option-identity'), `variable binding prompt missing variable identity input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `variable binding prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Variable Binding section/.test(response.answer?.nextStep ?? ''), `variable binding prompt nextStep must point to Variable Binding for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `variable binding prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }
});

check('Basic Config object toggle prompts refuse blind scalar child mutation', () => {
  const cases = [
    {
      prompt: 'включи countdown на экране',
      expectedGuideKey: 'screenedit-basic-config-countdown-enabled',
      expectedReferencePath: 'help-block-basic-config/screenedit-basic-config-countdown-enabled',
      forbiddenGuideKey: 'screenedit-copy-block-title-text',
    },
    {
      prompt: 'добавь таймер обратного отсчета на экран',
      expectedGuideKey: 'screenedit-basic-config-countdown-enabled',
      expectedReferencePath: 'help-block-basic-config/screenedit-basic-config-countdown-enabled',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'включи system permission prompt',
      expectedGuideKey: 'screenedit-basic-config-system-permission-enabled',
      expectedReferencePath: 'help-block-basic-config/screenedit-basic-config-system-permission-enabled',
      forbiddenGuideKey: 'screenedit-basic-config-permission-type',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Basic Config object-toggle response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'basic-config-object-toggle-domain-operation', `Basic Config object-toggle prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Basic Config object-toggle prompt must not attach a scalar CLI action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-basic-config'), `Basic Config object-toggle prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Basic Config object-toggle prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Basic Config object-toggle prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-basic-config', `Basic Config object-toggle prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Basic Config object-toggle prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-basic-config\/index\.html$/.test(url)), `Basic Config object-toggle prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /basic-config|paywall-background-basic-config/.test(url)), `Basic Config object-toggle prompt missing concrete image URL for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Basic Config object-toggle prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Basic Config object-toggle prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-toggle-state'), `Basic Config object-toggle prompt missing desired-toggle-state input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Basic Config object-toggle prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Basic Config/.test(response.answer?.nextStep ?? ''), `Basic Config object-toggle prompt nextStep must point to Basic Config for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Basic Config object-toggle prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const scalarDuration = runResponse(['--prompt', 'поставь duration countdown 10']);
  assert(scalarDuration.mode === 'do-cli', 'countdown duration scalar prompt must remain supported CLI DO');
  assert(scalarDuration.action?.actionId === 'editor.setting.screenedit-basic-config-countdown-duration-value', 'countdown duration scalar prompt resolved wrong action');
  assert(scalarDuration.resolver?.domainOperationBoundary === null, 'countdown duration scalar prompt must not be object-toggle boundary');

  const scalarPermissionType = runResponse(['--prompt', 'set permission type notification']);
  assert(scalarPermissionType.mode === 'do-cli', 'permission type scalar prompt must remain supported CLI DO');
  assert(scalarPermissionType.action?.actionId === 'editor.setting.screenedit-basic-config-permission-type', 'permission type scalar prompt resolved wrong action');
  assert(scalarPermissionType.resolver?.domainOperationBoundary === null, 'permission type scalar prompt must not be object-toggle boundary');
});

check('Options structure prompts resolve exact article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'сделай максимум 2 выбора в списке',
      expectedGuideKey: 'screenedit-options-max-selections',
      expectedReferencePath: 'help-block-options/screenedit-options-max-selections',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'перемешай варианты в случайном порядке',
      expectedGuideKey: 'screenedit-options-randomize-order',
      expectedReferencePath: 'help-block-options/screenedit-options-randomize-order',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'сделай варианты в две колонки',
      expectedGuideKey: 'screenedit-options-cell-dimensions',
      expectedReferencePath: 'help-block-options/screenedit-options-cell-dimensions',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'поменяй расстояние между вариантами',
      expectedGuideKey: 'screenedit-options-items-spacing',
      expectedReferencePath: 'help-block-options/screenedit-options-items-spacing',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'поменяй цвет чекбокса варианта',
      expectedGuideKey: 'screenedit-options-checkbox-styles',
      expectedReferencePath: 'help-block-options/screenedit-options-checkbox-styles',
      forbiddenGuideKey: 'screenedit-options-title-styles',
    },
    {
      prompt: 'сделай padding у вариантов 12',
      expectedGuideKey: 'screenedit-options-item-paddings',
      expectedReferencePath: 'help-block-options/screenedit-options-item-paddings',
      forbiddenGuideKey: 'screenedit-paywall-subscriptions-item-padding',
    },
    {
      prompt: 'сделай высоту ячейки списка 120',
      expectedGuideKey: 'screenedit-options-max-cell-height',
      expectedReferencePath: 'help-block-options/screenedit-options-max-cell-height',
      forbiddenGuideKey: 'screenedit-options-title-styles',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Options structure response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'options-structure-domain-operation', `Options structure prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Options structure prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-options'), `Options structure prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Options structure prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Options structure prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-options', `Options structure prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Options structure prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-options\/index\.html$/.test(url)), `Options structure prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-options-section/.test(url)), `Options structure prompt missing concrete Options image URL for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Options structure prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Options structure prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('options-structure-setting'), `Options structure prompt missing options-structure-setting input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-options-structure-value'), `Options structure prompt missing desired value input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Options structure prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Options section/.test(response.answer?.nextStep ?? ''), `Options structure prompt nextStep must point to Options for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Options structure prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const selectedStateStyle = runResponse(['--prompt', 'сделай фон выбранного варианта #ffee00']);
  assert(selectedStateStyle.mode === 'do-cli', 'Options selected-state style prompt must remain supported CLI DO');
  assert(selectedStateStyle.action?.actionId === 'editor.options.selectedItem.style.backgroundColor', 'Options selected-state style prompt resolved wrong action');
  assert(selectedStateStyle.resolver?.domainOperationBoundary === null, 'Options selected-state style prompt must not become structure boundary');

  const titleStyle = runResponse(['--prompt', 'сделай цвет заголовка варианта #222222']);
  assert(titleStyle.mode === 'do-cli', 'Options title style prompt must remain supported CLI DO');
  assert(titleStyle.action?.actionId === 'editor.options.itemTitle.textStyle.color', 'Options title style prompt resolved wrong action');
  assert(titleStyle.resolver?.domainOperationBoundary === null, 'Options title style prompt must not become structure boundary');
});

check('Header navigation and progress prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'включи кнопку назад в шапке',
      expectedGuideKey: 'screenedit-header-back-button',
      expectedReferencePath: 'help-block-header/screenedit-header-back-button',
      forbiddenGuideKey: 'screenedit-header-back-styles',
    },
    {
      prompt: 'сделай прогресс бар сверху',
      expectedGuideKey: 'screenedit-header-progress-indicator-kind',
      expectedReferencePath: 'help-block-header/screenedit-header-progress-indicator-kind',
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'поменяй тип progress indicator на dots',
      expectedGuideKey: 'screenedit-header-progress-indicator-kind',
      expectedReferencePath: 'help-block-header/screenedit-header-progress-indicator-kind',
      forbiddenGuideKey: 'screenedit-stepper-timer-duration',
    },
    {
      prompt: 'сделай progress full width',
      expectedGuideKey: 'screenedit-header-progress-full-width',
      expectedReferencePath: 'help-block-header/screenedit-header-progress-full-width',
      forbiddenGuideKey: 'screenedit-stepper-timer-duration',
    },
    {
      prompt: 'сделай цвет активного прогресса #22c55e',
      expectedGuideKey: 'screenedit-header-progress-active-color',
      expectedReferencePath: 'help-block-header/screenedit-header-progress-active-color',
      forbiddenGuideKey: 'screenedit-stepper-fill-color',
    },
    {
      prompt: 'поставь иконку прогресса в шапке',
      expectedGuideKey: 'screenedit-header-progress-icon',
      expectedReferencePath: 'help-block-header/screenedit-header-progress-icon',
      forbiddenGuideKey: 'screenedit-header-back-styles',
    },
    {
      prompt: 'поменяй высоту header 64',
      expectedGuideKey: 'screenedit-header-appearance-height',
      expectedReferencePath: 'help-block-header/screenedit-header-appearance-height',
      forbiddenGuideKey: 'screenedit-header-back-styles',
    },
    {
      prompt: 'поменяй отступы header',
      expectedGuideKey: 'screenedit-header-insets',
      expectedReferencePath: 'help-block-header/screenedit-header-insets',
      forbiddenGuideKey: 'screenedit-header-back-styles',
    },
    {
      prompt: 'выровняй progress indicator по центру',
      expectedGuideKey: 'screenedit-header-progress-content-alignment',
      expectedReferencePath: 'help-block-header/screenedit-header-progress-content-alignment',
      forbiddenGuideKey: 'screenedit-header-progress-track-color',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Header response did not return ok=true for ${item.prompt}`);
    assert(['teach', 'show'].includes(response.mode), `expected teach/show domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(['teach', 'show'].includes(response.resolver?.kind), `expected teach/show resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'header-navigation-domain-operation', `Header prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Header prompt must not attach a generic CLI action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-header'), `Header prompt missing Header section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Header prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Header prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-header', `Header prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Header prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-header\/index\.html$/.test(url)), `Header prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-header/.test(url)), `Header prompt missing concrete Header image URL for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Header prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Header prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('header-or-progress-setting'), `Header prompt missing header-or-progress-setting input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-header-or-progress-value'), `Header prompt missing desired value input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Header prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Header section/.test(response.answer?.nextStep ?? ''), `Header prompt nextStep must point to Header for ${item.prompt}`);
    if (response.mode === 'teach') {
      assert(response.completionClaim === 'guidance-only', `Header teach prompt must not claim mutation or verification for ${item.prompt}`);
    }
    assertSourceSafeCustomerAnswer(response);
  }

  const backButtonStyle = runResponse(['--prompt', 'сделай цвет кнопки назад в header #111111']);
  assert(backButtonStyle.mode === 'do-cli', 'Header back-button text style prompt must remain supported CLI DO');
  assert(backButtonStyle.action?.actionId === 'editor.header.backButton.textStyle.color', 'Header back-button text style prompt resolved wrong action');
  assert(backButtonStyle.resolver?.domainOperationBoundary === null, 'Header back-button text style prompt must not become navigation boundary');

  const skipButtonStyle = runResponse(['--prompt', 'сделай шрифт skip button header 14']);
  assert(skipButtonStyle.mode === 'do-cli', 'Header skip-button text style prompt must remain supported CLI DO');
  assert(skipButtonStyle.action?.actionId === 'editor.header.skipButton.textStyle.fontSize', 'Header skip-button text style prompt resolved wrong action');
  assert(skipButtonStyle.resolver?.domainOperationBoundary === null, 'Header skip-button text style prompt must not become navigation boundary');

  const stepperFillStyle = runResponse(['--prompt', 'сделай цвет заполнения прогресса #22c55e']);
  assert(stepperFillStyle.mode === 'do-cli', 'Stepper fill color prompt must remain supported CLI DO');
  assert(stepperFillStyle.action?.actionId === 'editor.stepper.style.fillColor', 'Stepper fill color prompt resolved wrong action');
  assert(stepperFillStyle.resolver?.domainOperationBoundary === null, 'Stepper fill color prompt must not become Header boundary');
});

check('Content spacing prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'поменяй отступ заголовка экрана',
      expectedGuideKey: 'screenedit-copy-block-title-padding',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-title-padding',
      forbiddenGuideKey: 'screenedit-copy-block-title-styles',
    },
    {
      prompt: 'сделай padding title 20',
      expectedGuideKey: 'screenedit-copy-block-title-padding',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-title-padding',
      forbiddenGuideKey: 'screenedit-paywall-subscriptions-item-padding',
    },
    {
      prompt: 'увеличь space around subtitle',
      expectedGuideKey: 'screenedit-copy-block-subtitle-padding',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-subtitle-padding',
      forbiddenGuideKey: 'screenedit-stepper-subtitle-padding',
    },
    {
      prompt: 'сделай отступы hero image',
      expectedGuideKey: 'screenedit-copy-block-hero-padding',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-hero-padding',
      forbiddenGuideKey: 'screenedit-stepper-image-styles',
    },
    {
      prompt: 'поменяй padding картинки сверху',
      expectedGuideKey: 'screenedit-copy-block-hero-padding',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-hero-padding',
      forbiddenGuideKey: 'screenedit-media-top-alignment',
    },
    {
      prompt: 'поставь margin around hero image 16',
      expectedGuideKey: 'screenedit-copy-block-hero-padding',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-hero-padding',
      forbiddenGuideKey: 'screenedit-media-height-percentage',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Content spacing response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'layout-spacing-domain-operation', `Content spacing prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Content spacing prompt must not attach a generic CLI action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-content'), `Content spacing prompt missing Content section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Content spacing prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Content spacing prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-content', `Content spacing prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Content spacing prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-content\/index\.html$/.test(url)), `Content spacing prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-copy-block-section/.test(url)), `Content spacing prompt missing Content section image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Content spacing prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Content spacing prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('layout-spacing-target'), `Content spacing prompt missing layout-spacing-target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-spacing-values-or-sides'), `Content spacing prompt missing desired spacing input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Content spacing prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Content section/.test(response.answer?.nextStep ?? ''), `Content spacing prompt nextStep must point to Content for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Content spacing prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const contentTitleStyle = runResponse(['--prompt', 'сделай цвет заголовка экрана #333333']);
  assert(contentTitleStyle.mode === 'do-cli', 'Content title style prompt must remain supported CLI DO');
  assert(contentTitleStyle.action?.actionId === 'editor.content.title.textStyle.color', 'Content title style prompt resolved wrong action');
  assert(contentTitleStyle.resolver?.domainOperationBoundary === null, 'Content title style prompt must not become spacing boundary');

  const mediaHeightStyle = runResponse(['--prompt', 'сделай высоту медиа 65 процентов']);
  assert(mediaHeightStyle.mode === 'do-cli', 'Media height prompt must remain supported CLI DO');
  assert(mediaHeightStyle.action?.actionId === 'editor.media.style.heightPercentage', 'Media height prompt resolved wrong action');
  assert(mediaHeightStyle.resolver?.domainOperationBoundary === null, 'Media height prompt must not become spacing boundary');

  const headerInsets = runResponse(['--prompt', 'поменяй отступы header']);
  assert(headerInsets.resolver?.domainOperationBoundary === 'header-navigation-domain-operation', 'Header insets prompt must remain Header boundary');

  const optionsPadding = runResponse(['--prompt', 'сделай padding у вариантов 12']);
  assert(optionsPadding.resolver?.domainOperationBoundary === 'options-structure-domain-operation', 'Options padding prompt must remain Options boundary');
});

check('Media asset and image layout prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'добавь картинку в hero image',
      expectedArticleAlias: 'help-block-content',
      expectedArticleUrl: /help-block-content\/index\.html$/,
      expectedGuideKey: 'screenedit-copy-block-hero-url',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-hero-url',
      expectedImagePattern: /configure-copy-block-section/,
      forbiddenGuideKey: 'screenedit-stepper-image-styles',
    },
    {
      prompt: 'сделай ширину hero image 300',
      expectedArticleAlias: 'help-block-content',
      expectedArticleUrl: /help-block-content\/index\.html$/,
      expectedGuideKey: 'screenedit-copy-block-hero-width',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-hero-width',
      expectedImagePattern: /configure-copy-block-section/,
      forbiddenGuideKey: 'screenedit-media-height-percentage',
    },
    {
      prompt: 'поставь высоту hero image 50 процентов',
      expectedArticleAlias: 'help-block-content',
      expectedArticleUrl: /help-block-content\/index\.html$/,
      expectedGuideKey: 'screenedit-copy-block-hero-height-percentage',
      expectedReferencePath: 'help-block-content/screenedit-copy-block-hero-height-percentage',
      expectedImagePattern: /configure-copy-block-section/,
      forbiddenGuideKey: 'screenedit-media-height-percentage',
    },
    {
      prompt: 'добавь картинку к варианту списка',
      expectedArticleAlias: 'help-block-options',
      expectedArticleUrl: /help-block-options\/index\.html$/,
      expectedGuideKey: 'screenedit-options-image-styles',
      expectedReferencePath: 'help-block-options/screenedit-options-image-styles',
      expectedImagePattern: /configure-options-section/,
      forbiddenGuideKey: 'onboarding-list-create',
    },
    {
      prompt: 'поменяй картинку в карточке option',
      expectedArticleAlias: 'help-block-options',
      expectedArticleUrl: /help-block-options\/index\.html$/,
      expectedGuideKey: 'screenedit-options-image-styles',
      expectedReferencePath: 'help-block-options/screenedit-options-image-styles',
      expectedImagePattern: /configure-options-section/,
      forbiddenGuideKey: 'screenedit-variable-binding-option-label',
    },
    {
      prompt: 'сделай фото в списке вместо видео',
      expectedArticleAlias: 'help-block-media',
      expectedArticleUrl: /help-block-media\/index\.html$/,
      expectedGuideKey: 'screenedit-media-image-upload',
      expectedReferencePath: 'help-block-media/screenedit-media-kind',
      expectedImagePattern: /configure-media-section/,
      forbiddenGuideKey: 'screenedit-media-video-upload',
    },
    {
      prompt: 'добавь image в carousel slide',
      expectedArticleAlias: 'help-block-carousel',
      expectedArticleUrl: /help-block-carousel\/index\.html$/,
      expectedGuideKey: 'screenedit-carousel-slide-image',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-slide-image',
      expectedImagePattern: /configure-carousel-section/,
      forbiddenGuideKey: 'screenedit-carousel-image-styles',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Media asset response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'media-asset-layout-domain-operation', `Media asset prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Media asset prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Media asset prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Media asset prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === item.expectedArticleAlias, `Media asset prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Media asset prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => item.expectedArticleUrl.test(url)), `Media asset prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => item.expectedImagePattern.test(url)), `Media asset prompt missing concrete image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Media asset prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Media asset prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('media-or-image-target'), `Media asset prompt missing media-or-image-target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('image-url-local-file-or-asset-id'), `Media asset prompt missing image asset input for ${item.prompt}`);
    assert(/video upload runner/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Media asset prompt must forbid reusing the video upload runner for ${item.prompt}`);
    assert(/image|media/i.test(response.answer?.nextStep ?? ''), `Media asset prompt nextStep must mention image/media target for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Media asset prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const mediaHeightStyle = runResponse(['--prompt', 'сделай высоту медиа 65 процентов']);
  assert(mediaHeightStyle.mode === 'do-cli', 'Media height prompt must remain supported CLI DO after media asset boundary');
  assert(mediaHeightStyle.action?.actionId === 'editor.media.style.heightPercentage', 'Media height prompt resolved wrong action after media asset boundary');
  assert(mediaHeightStyle.answer?.showDoOptions?.do?.available === 'when-action-resolver-matches-supported-action', 'Media height prompt must not expose video upload conditional DO');

  const mediaScaleStyle = runResponse(['--prompt', 'измени режим картинки на cover']);
  assert(mediaScaleStyle.mode === 'do-cli', 'Media scale prompt must remain supported CLI DO');
  assert(mediaScaleStyle.action?.actionId === 'editor.media.style.scaleMode', 'Media scale prompt resolved wrong action');
  assert(mediaScaleStyle.answer?.showDoOptions?.do?.available === 'when-action-resolver-matches-supported-action', 'Media scale prompt must not expose video upload conditional DO');

  const sharedVideo = runResponse(['--prompt', 'сделай видео в списке']);
  assert(sharedVideo.mode === 'do-e2e-conditional', 'Shared Media video prompt must remain conditional browser DO');
  assert(sharedVideo.action?.actionId === 'browser.media.videoUpload', 'Shared Media video prompt resolved wrong action after media asset boundary');
  assert(sharedVideo.action?.missingInputs?.includes('videoUrl-or-local-file'), 'Shared Media video prompt must still ask for video source');

  const paywallVideo = runResponse(['--prompt', 'сделай видео в пейволе']);
  assert(paywallVideo.mode === 'do-e2e-conditional', 'Paywall Media video prompt must remain conditional browser DO');
  assert(paywallVideo.action?.actionId === 'browser.paywallMedia.videoUpload', 'Paywall Media video prompt resolved wrong action after media asset boundary');
});

check('Carousel slide content and timing prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'поменяй заголовок слайда carousel на Welcome',
      expectedGuideKey: 'screenedit-carousel-slide-title',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-slide-title',
      forbiddenGuideKey: 'screenedit-carousel-title-styles',
      forbiddenActionId: 'editor.carousel.title.textStyle.fontSize',
    },
    {
      prompt: 'измени subtitle carousel slide на Try it',
      expectedGuideKey: 'screenedit-carousel-slide-subtitle',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-slide-subtitle',
      forbiddenGuideKey: 'screenedit-carousel-subtitle-styles',
      forbiddenActionId: 'editor.carousel.subtitle.textStyle.fontSize',
    },
    {
      prompt: 'поменяй detail в carousel slide',
      expectedGuideKey: 'screenedit-carousel-slide-detail',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-slide-detail',
      forbiddenGuideKey: 'screenedit-carousel-detail-styles',
      forbiddenActionId: 'editor.carousel.detail.textStyle.color',
    },
    {
      prompt: 'сделай slide duration 3 seconds',
      expectedGuideKey: 'screenedit-carousel-slide-duration-range',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-slide-duration-range',
      forbiddenGuideKey: 'screenedit-carousel-slide-image',
      forbiddenActionId: null,
    },
    {
      prompt: 'поменяй total duration carousel 10',
      expectedGuideKey: 'screenedit-carousel-duration',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-duration',
      forbiddenGuideKey: 'screenedit-carousel-slide-image',
      forbiddenActionId: null,
    },
    {
      prompt: 'сделай тип слайда carousel image',
      expectedGuideKey: 'screenedit-carousel-slide-type',
      expectedReferencePath: 'help-block-carousel/screenedit-carousel-slide-type',
      forbiddenGuideKey: 'screenedit-carousel-slide-image',
      forbiddenActionId: null,
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Carousel response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'carousel-slides-and-timing-domain-operation', `Carousel prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Carousel prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    if (item.forbiddenActionId) {
      assert(response.resolver?.actionId !== item.forbiddenActionId, `Carousel prompt resolved forbidden action ${item.forbiddenActionId} for ${item.prompt}`);
    }
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-carousel'), `Carousel prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Carousel prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Carousel prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-carousel', `Carousel prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Carousel prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-carousel\/index\.html$/.test(url)), `Carousel prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-carousel-section/.test(url)), `Carousel prompt missing concrete image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Carousel prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Carousel prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('carousel-slide-or-timing-target'), `Carousel prompt missing target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-carousel-content-or-timing-value'), `Carousel prompt missing desired value input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Carousel prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Carousel section/.test(response.answer?.nextStep ?? ''), `Carousel prompt nextStep must point to Carousel section for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Carousel prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const titleColor = runResponse(['--prompt', 'Сделай цвет заголовка carousel #123456']);
  assert(titleColor.mode === 'do-cli', 'Carousel title color prompt must remain supported CLI DO');
  assert(titleColor.action?.actionId === 'editor.carousel.title.textStyle.color', 'Carousel title color prompt resolved wrong action after slide/timing boundary');
  assert(titleColor.resolver?.domainOperationBoundary === null, 'Carousel title color prompt must not become slide/timing boundary');

  const slideImage = runResponse(['--prompt', 'добавь image в carousel slide']);
  assert(slideImage.mode === 'teach', 'Carousel slide image prompt must remain media asset boundary teach mode');
  assert(slideImage.resolver?.domainOperationBoundary === 'media-asset-layout-domain-operation', 'Carousel slide image prompt must remain media asset boundary');
  assert(slideImage.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-carousel-slide-image'), 'Carousel slide image prompt must keep slide image guide');
});

check('Custom HTML and WebEmbed prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'вставь iframe в web embed',
      expectedGuideKey: 'screenedit-embed-html-editor',
      expectedReferencePath: 'help-block-custom-html/screenedit-embed-html-editor',
      forbiddenGuideKey: 'onboarding-wizard-basic-info',
    },
    {
      prompt: 'добавь data source для custom html',
      expectedGuideKey: 'screenedit-embed-data-sources',
      expectedReferencePath: 'help-block-custom-html/screenedit-embed-data-sources',
      forbiddenGuideKey: 'analytics-provider-config',
    },
    {
      prompt: 'настрой sandbox iframe isolation custom html',
      expectedGuideKey: 'screenedit-embed-iframe-isolation',
      expectedReferencePath: 'help-block-custom-html/screenedit-embed-iframe-isolation',
      forbiddenGuideKey: 'integrations-custom-domain-section',
    },
    {
      prompt: 'как добавить custom html на экран',
      expectedGuideKey: 'screenedit-embed-html-editor',
      expectedReferencePath: 'help-block-custom-html/screenedit-embed-html-editor',
      forbiddenGuideKey: 'integrations-custom-domain-section',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Custom HTML response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'custom-html-webembed-domain-operation', `Custom HTML prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Custom HTML prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-embed'), `Custom HTML prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Custom HTML prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Custom HTML prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-custom-html', `Custom HTML prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Custom HTML prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-custom-html\/index\.html$/.test(url)), `Custom HTML prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /webembed/.test(url)), `Custom HTML prompt missing concrete WebEmbed image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Custom HTML prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Custom HTML prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('custom-html-or-webembed-target'), `Custom HTML prompt missing target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-html-code-iframe-or-data-source'), `Custom HTML prompt missing desired value input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Custom HTML prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Custom HTML section/.test(response.answer?.nextStep ?? ''), `Custom HTML prompt nextStep must point to Custom HTML section for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Custom HTML prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const customDomain = runResponse(['--prompt', 'как настроить custom domain dns']);
  assert(customDomain.resolver?.domainOperationBoundary !== 'custom-html-webembed-domain-operation', 'Custom domain DNS prompt must not become Custom HTML/WebEmbed boundary');
  assert(customDomain.answer?.showDoOptions?.do?.missingInputs?.includes('custom-html-or-webembed-target') !== true, 'Custom domain DNS prompt must not ask for Custom HTML target');

  const analyticsCustomScript = runResponse(['--prompt', 'как добавить custom script analytics']);
  assert(analyticsCustomScript.resolver?.domainOperationBoundary !== 'custom-html-webembed-domain-operation', 'Analytics custom script prompt must not become Custom HTML/WebEmbed boundary');
  assert(analyticsCustomScript.answer?.showDoOptions?.do?.missingInputs?.includes('custom-html-or-webembed-target') !== true, 'Analytics custom script prompt must not ask for Custom HTML target');
});

check('Integrations custom-domain and analytics prompts resolve exact article-backed guidance', () => {
  const domainCases = [
    {
      prompt: 'как настроить custom domain dns',
      expectedGuideKey: 'custom-domain-dns-setup',
      expectedReferencePath: 'custom-domain-dns-setup/custom-domain-dns-setup',
      expectedArticleAlias: 'custom-domain-dns-setup',
    },
    {
      prompt: 'что прописать в dns для домена',
      expectedGuideKey: 'custom-domain-dns-setup',
      expectedReferencePath: 'custom-domain-dns-setup/custom-domain-dns-setup',
      expectedArticleAlias: 'custom-domain-dns-setup',
    },
    {
      prompt: 'как проверить домен',
      expectedGuideKey: 'custom-domain-verification',
      expectedReferencePath: 'custom-domain-verification/custom-domain-verification',
      expectedArticleAlias: 'custom-domain-verification',
    },
  ];
  for (const item of domainCases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `custom-domain response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected custom-domain teach mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.domainOperationBoundary === null, `custom-domain prompt must not become a screen-setting domain boundary for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `custom-domain prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-options'), `custom-domain prompt drifted into Options for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'onboarding-list-create'), `custom-domain prompt drifted into onboarding creation for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-embed'), `custom-domain prompt drifted into Custom HTML for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === item.expectedArticleAlias, `custom-domain prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `custom-domain prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => new RegExp(`${item.expectedArticleAlias}/index\\.html$`).test(url)), `custom-domain prompt missing published article URL for ${item.prompt}`);
    assert(Array.isArray(response.answer?.imageUrls) && response.answer.imageUrls.length === 0, `custom-domain prompt must not invent image URLs for text-only guide ${item.prompt}`);
    assert(response.answer?.customerVisibleGuideAssets?.visualCoverage?.status === 'text-only-no-screenshot-evidence', `custom-domain prompt must expose text-only visual coverage for ${item.prompt}`);
    assert(response.answer?.customerVisibleGuideAssets?.guideReferences?.some(reference => reference.articleAlias === item.expectedArticleAlias && reference.visualCoverageStatus === 'text-only-no-screenshot-evidence'), `custom-domain prompt missing text-only guide reference status for ${item.prompt}`);
    assert(response.answer?.articleAvailability?.some(reference => reference.articleAlias === item.expectedArticleAlias && reference.visualCoverageStatus === 'text-only-no-screenshot-evidence'), `custom-domain prompt missing text-only article availability status for ${item.prompt}`);
    assert(/text-only|no shipped screenshot image URL|no concrete screenshot image URL/i.test(response.answer?.articleReferenceSummary ?? ''), `custom-domain prompt must state missing visual coverage honestly for ${item.prompt}`);
    assert(!/screenshot-backed guidance/i.test(response.answer?.customerAnswerStarter ?? ''), `custom-domain prompt must not claim screenshot-backed guidance for ${item.prompt}`);
    assert(!/text and (?:concrete )?screenshot|screenshot-backed guidance/i.test(response.answer?.articleReferenceSummary ?? ''), `custom-domain prompt must not imply screenshot-backed evidence for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `custom-domain prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const domainHandoff = runResponse(['--prompt', 'подключить кастомный домен']);
  assert(domainHandoff.ok === true, 'custom-domain handoff response did not return ok=true');
  assert(domainHandoff.mode === 'handoff', `expected custom-domain handoff mode, got ${domainHandoff.mode}`);
  assert(domainHandoff.action?.actionId === 'handoff.domain.dns', `custom-domain handoff resolved wrong action ${domainHandoff.action?.actionId}`);
  assert(domainHandoff.action?.status === 'handoff', 'custom-domain DNS setup must remain handoff because DNS changes happen at the registrar');
  assert(domainHandoff.action?.missingInputs?.includes('projectId'), 'custom-domain handoff must ask for projectId');
  assert(domainHandoff.action?.missingInputs?.includes('domain'), 'custom-domain handoff must ask for domain');
  assert(domainHandoff.answer?.preferredCitation?.articleAlias === 'integrations-custom-domain-section', 'custom-domain handoff must cite integrations custom domain guide');
  assert(domainHandoff.answer?.publicArticleLinks?.some(url => /integrations-custom-domain-section\/index\.html$/.test(url)), 'custom-domain handoff missing integrations custom domain URL');
  assert(domainHandoff.answer?.customerVisibleGuideAssets?.visualCoverage?.status === 'text-only-no-screenshot-evidence', 'custom-domain handoff must expose text-only visual coverage');
  assert(!/screenshot-backed guidance/i.test(domainHandoff.answer?.customerAnswerStarter ?? ''), 'custom-domain handoff must not claim screenshot-backed guidance');
  assert(!domainHandoff.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-options'), 'custom-domain handoff drifted into Options');
  assert(domainHandoff.completionClaim === 'handoff-not-done', 'custom-domain handoff must not claim completion');
  assertSourceSafeCustomerAnswer(domainHandoff);

  const analyticsCases = [
    'как добавить custom script analytics',
    'добавить google analytics',
    'как настроить amplitude analytics',
  ];
  for (const prompt of analyticsCases) {
    const response = runResponse(['--prompt', prompt]);
    assert(response.ok === true, `analytics response did not return ok=true for ${prompt}`);
    assert(response.mode === 'teach', `expected analytics teach mode for ${prompt}, got ${response.mode}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'analytics-provider-config'), `analytics prompt missing provider config guide for ${prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'analytics-add-provider'), `analytics prompt missing add provider guide for ${prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-embed'), `analytics prompt drifted into Custom HTML for ${prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screenedit-carousel-image-container'), `analytics prompt drifted into Carousel for ${prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-options'), `analytics prompt drifted into Options for ${prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'analytics-provider-config', `analytics prompt missing provider-config article alias for ${prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === 'analytics-provider-config/analytics-provider-config', `analytics prompt missing exact provider-config reference path for ${prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /analytics-provider-config\/index\.html$/.test(url)), `analytics prompt missing provider-config article URL for ${prompt}`);
    assert(response.answer?.imageUrls?.some(url => /open-add-dialog-add-integration-dialog|expand-analytics-analytics-section/.test(url)), `analytics prompt missing concrete analytics image evidence for ${prompt}`);
    assert(response.completionClaim === 'guidance-only', `analytics teach prompt must not claim mutation or verification for ${prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const pixelDo = runResponse(['--prompt', 'добавь facebook pixel']);
  assert(pixelDo.ok === true, 'facebook pixel DO response did not return ok=true');
  assert(pixelDo.mode === 'do-cli', `expected facebook pixel do-cli mode, got ${pixelDo.mode}`);
  assert(pixelDo.action?.actionId === 'launch.analytics.pixel.apply', `facebook pixel prompt resolved wrong action ${pixelDo.action?.actionId}`);
  assert(pixelDo.action?.status === 'supported', 'facebook pixel prompt must use the supported CLI action');
  assert(pixelDo.action?.owningSkill === 'segmently-cli-guide', 'facebook pixel prompt must route through segmently-cli-guide');
  assert(pixelDo.action?.missingInputs?.includes('projectId'), 'facebook pixel prompt must ask for projectId');
  assert(pixelDo.action?.missingInputs?.includes('pixelId'), 'facebook pixel prompt must ask for pixelId');
  assert(!pixelDo.action?.missingInputs?.includes('pixelProvider'), 'facebook pixel prompt should infer pixelProvider');
  assert(pixelDo.answer?.preferredCitation?.articleAlias === 'analytics-add-provider', 'facebook pixel prompt must cite analytics add provider guide');
  assert(pixelDo.answer?.publicArticleLinks?.some(url => /analytics-add-provider\/index\.html$/.test(url)), 'facebook pixel prompt missing analytics add provider article URL');
  assert(pixelDo.answer?.imageUrls?.some(url => /open-add-dialog-add-integration-dialog/.test(url)), 'facebook pixel prompt missing concrete analytics image evidence');
  assert(pixelDo.completionClaim === 'needs-inputs-before-execution', 'facebook pixel prompt must not claim execution before inputs and verification');
  assertSourceSafeCustomerAnswer(pixelDo);
});

check('Action Bar rich visual style prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'сделай градиент на главной кнопке',
      expectedGuideKey: 'screenedit-action-bar-primary-gradient',
      expectedReferencePath: 'help-block-action-bar/screenedit-action-bar-primary-gradient',
      forbiddenActionId: 'editor.actionBar.primaryButton.textStyle.fontSize',
    },
    {
      prompt: 'добавь иконку в кнопку continue',
      expectedGuideKey: 'screenedit-action-bar-primary-icon',
      expectedReferencePath: 'help-block-action-bar/screenedit-action-bar-primary-icon',
      forbiddenActionId: 'editor.actionBar.primaryButton.label',
    },
    {
      prompt: 'сделай тень под secondary button',
      expectedGuideKey: 'screenedit-action-bar-secondary-shadow',
      expectedReferencePath: 'help-block-action-bar/screenedit-action-bar-secondary-shadow',
      forbiddenActionId: 'editor.actionBar.secondaryButton.textStyle.fontFamily',
    },
    {
      prompt: 'поменяй фон второй кнопки на #ffee00',
      expectedGuideKey: 'screenedit-action-bar-secondary-container',
      expectedReferencePath: 'help-block-action-bar/screenedit-action-bar-secondary-container',
      forbiddenActionId: 'editor.actionBar.secondaryButton.textStyle.fontFamily',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Action Bar rich style response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'rich-visual-style-domain-operation', `Action Bar rich style prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Action Bar rich style prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    assert(response.resolver?.actionId !== item.forbiddenActionId, `Action Bar rich style prompt resolved forbidden action ${item.forbiddenActionId} for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-action-bar'), `Action Bar rich style prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Action Bar rich style prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-action-bar', `Action Bar rich style prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Action Bar rich style prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-action-bar\/index\.html$/.test(url)), `Action Bar rich style prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /configure-action-bar-section/.test(url)), `Action Bar rich style prompt missing concrete image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Action Bar rich style prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Action Bar rich style prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('action-bar-rich-style-target'), `Action Bar rich style prompt missing target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-rich-style-value-or-asset'), `Action Bar rich style prompt missing rich style value/asset input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Action Bar rich style prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Action Bar style/.test(response.answer?.nextStep ?? ''), `Action Bar rich style prompt nextStep must point to Action Bar style for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Action Bar rich style prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const primaryBackground = runResponse(['--prompt', 'сделай главную кнопку желтой']);
  assert(primaryBackground.mode === 'do-cli', 'Primary button background color prompt must remain supported CLI DO');
  assert(primaryBackground.action?.actionId === 'editor.actionBar.primaryButton.backgroundColor', 'Primary button background color prompt resolved wrong action after rich style boundary');
  assert(primaryBackground.resolver?.domainOperationBoundary === null, 'Primary button background color prompt must not become rich visual style boundary');
});

check('Paywall Body benefits and copy prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'поменяй заголовок пейволла на Pro Plan',
      expectedGuideKey: 'screenedit-paywall-body-title',
      expectedReferencePath: 'help-block-paywall-body/screenedit-paywall-body-title',
      forbiddenGuideKey: 'screenedit-paywall-subscriptions-view-kind',
    },
    {
      prompt: 'измени subtitle paywall на Start today',
      expectedGuideKey: 'screenedit-paywall-body-subtitle',
      expectedReferencePath: 'help-block-paywall-body/screenedit-paywall-body-subtitle',
      forbiddenGuideKey: 'screenedit-paywall-body-subtitle-styles',
    },
    {
      prompt: 'добавь benefit bullet в paywall',
      expectedGuideKey: 'screenedit-paywall-body-features',
      expectedReferencePath: 'help-block-paywall-body/screenedit-paywall-body-features',
      forbiddenGuideKey: 'screen-editor-section-paywall-header',
    },
    {
      prompt: 'поменяй текст буллета paywall',
      expectedGuideKey: 'screenedit-paywall-body-features',
      expectedReferencePath: 'help-block-paywall-body/screenedit-paywall-body-features',
      forbiddenGuideKey: 'screenedit-action-bar-primary-label',
    },
    {
      prompt: 'сделай padding benefits paywall 12',
      expectedGuideKey: 'screenedit-paywall-body-item-padding',
      expectedReferencePath: 'help-block-paywall-body/screenedit-paywall-body-item-padding',
      forbiddenGuideKey: 'screenedit-paywall-subscriptions-item-padding',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Paywall Body response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'paywall-body-benefits-domain-operation', `Paywall Body prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Paywall Body prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-paywall-body'), `Paywall Body prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Paywall Body prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Paywall Body prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-paywall-body', `Paywall Body prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Paywall Body prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-paywall-body\/index\.html$/.test(url)), `Paywall Body prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /paywall-screen-configuration-guide|paywall-body|native-content/.test(url)), `Paywall Body prompt missing concrete image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Paywall Body prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Paywall Body prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('paywall-body-target'), `Paywall Body prompt missing paywall-body-target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-copy-benefit-or-layout-value'), `Paywall Body prompt missing desired body value input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Paywall Body prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Paywall Body section/.test(response.answer?.nextStep ?? ''), `Paywall Body prompt nextStep must point to Paywall Body for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Paywall Body prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const titleColor = runResponse(['--prompt', 'сделай цвет заголовка пейволла #111111']);
  assert(titleColor.mode === 'do-cli', 'Paywall Body title color prompt must remain supported CLI DO');
  assert(titleColor.action?.actionId === 'editor.paywallBody.title.textStyle.color', 'Paywall Body title color prompt resolved wrong action');
  assert(titleColor.resolver?.domainOperationBoundary === null, 'Paywall Body title color prompt must not become body copy boundary');
});

check('Paywall Footer legal links and copy prompts resolve article-backed domain-operation boundary', () => {
  const cases = [
    {
      prompt: 'поменяй порядок кнопки и текста auto-renew',
      expectedGuideKey: 'screenedit-paywall-footer-elements-order',
      expectedReferencePath: 'help-block-paywall-footer/screenedit-paywall-footer-elements-order',
      forbiddenGuideKey: 'screenedit-action-bar-primary-label',
    },
    {
      prompt: 'поменяй terms link в footer paywall',
      expectedGuideKey: 'screenedit-paywall-footer-terms-uri',
      expectedReferencePath: 'help-block-paywall-footer/screenedit-paywall-footer-terms-uri',
      forbiddenGuideKey: 'screenedit-paywall-footer-terms-text-styles',
    },
    {
      prompt: 'поставь privacy url на https://example.com/privacy',
      expectedGuideKey: 'screenedit-paywall-footer-privacy-uri',
      expectedReferencePath: 'help-block-paywall-footer/screenedit-paywall-footer-privacy-uri',
      forbiddenGuideKey: 'screenedit-paywall-footer-privacy-text-styles',
    },
    {
      prompt: 'измени текст restore purchases',
      expectedGuideKey: 'screenedit-paywall-footer-restore-text',
      expectedReferencePath: 'help-block-paywall-footer/screenedit-paywall-footer-restore-text',
      forbiddenGuideKey: 'screenedit-paywall-header-restore-background-color',
    },
    {
      prompt: 'поменяй текст auto-renew disclosure',
      expectedGuideKey: 'screenedit-paywall-footer-autorenew-text',
      expectedReferencePath: 'help-block-paywall-footer/screenedit-paywall-footer-autorenew-text',
      forbiddenGuideKey: 'screenedit-action-bar-primary-label',
    },
  ];
  for (const item of cases) {
    const response = runResponse(['--prompt', item.prompt]);
    assert(response.ok === true, `Paywall Footer response did not return ok=true for ${item.prompt}`);
    assert(response.mode === 'teach', `expected teach/domain-boundary mode for ${item.prompt}, got ${response.mode}`);
    assert(response.resolver?.kind === 'teach', `expected teach resolver for ${item.prompt}, got ${response.resolver?.kind}`);
    assert(response.resolver?.domainOperationBoundary === 'paywall-footer-links-domain-operation', `Paywall Footer prompt missing domain boundary for ${item.prompt}`);
    assert(response.action === null, `Paywall Footer prompt must not attach a generic CLI/E2E action for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === 'screen-editor-section-paywall-footer'), `Paywall Footer prompt missing section guide for ${item.prompt}`);
    assert(response.guidance?.guides?.some(guide => guide.guideKey === item.expectedGuideKey), `Paywall Footer prompt missing expected guide ${item.expectedGuideKey} for ${item.prompt}`);
    assert(!response.guidance?.guides?.some(guide => guide.guideKey === item.forbiddenGuideKey), `Paywall Footer prompt resolved forbidden guide ${item.forbiddenGuideKey} for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.articleAlias === 'help-block-paywall-footer', `Paywall Footer prompt missing article alias for ${item.prompt}`);
    assert(response.answer?.preferredCitation?.referencePath === item.expectedReferencePath, `Paywall Footer prompt missing exact reference path for ${item.prompt}`);
    assert(response.answer?.publicArticleLinks?.some(url => /help-block-paywall-footer\/index\.html$/.test(url)), `Paywall Footer prompt missing published article URL for ${item.prompt}`);
    assert(response.answer?.imageUrls?.some(url => /paywall-screen-configuration-guide|paywall-footer|native-footer/.test(url)), `Paywall Footer prompt missing concrete image evidence for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.show?.available === true, `Paywall Footer prompt must offer SHOW for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.available === 'requires-domain-operation', `Paywall Footer prompt must require domain operation for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('paywall-footer-target'), `Paywall Footer prompt missing paywall-footer-target input for ${item.prompt}`);
    assert(response.answer?.showDoOptions?.do?.missingInputs?.includes('desired-text-url-or-order-value'), `Paywall Footer prompt missing desired footer value input for ${item.prompt}`);
    assert(/generic setFieldValue patch/.test(response.answer?.showDoOptions?.do?.summary ?? ''), `Paywall Footer prompt must forbid generic setFieldValue mutation for ${item.prompt}`);
    assert(/Paywall Footer section/.test(response.answer?.nextStep ?? ''), `Paywall Footer prompt nextStep must point to Paywall Footer for ${item.prompt}`);
    assert(response.completionClaim === 'guidance-only', `Paywall Footer prompt must not claim mutation or verification for ${item.prompt}`);
    assertSourceSafeCustomerAnswer(response);
  }

  const footerBackground = runResponse(['--prompt', 'Сделай фон футера пейволла #18181b']);
  assert(footerBackground.mode === 'do-cli', 'Paywall Footer background prompt must remain supported CLI DO');
  assert(footerBackground.action?.actionId === 'editor.paywallFooter.style.backgroundColor', 'Paywall Footer background prompt resolved wrong action');
  assert(footerBackground.resolver?.domainOperationBoundary === null, 'Paywall Footer background prompt must not become footer legal/copy boundary');

  const purchaseButtonFont = runResponse(['--prompt', 'Поставь размер шрифта кнопки покупки на пейволле 18']);
  assert(purchaseButtonFont.mode === 'do-cli', 'Paywall Footer purchase button font prompt must remain supported CLI DO');
  assert(purchaseButtonFont.action?.actionId === 'editor.paywallFooter.purchaseButton.textStyle.fontSize', 'Paywall Footer purchase button font prompt resolved wrong action');
  assert(purchaseButtonFont.resolver?.domainOperationBoundary === null, 'Paywall Footer purchase button font prompt must not become footer legal/copy boundary');
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

check('CLI generic scalar Basic Config prompt returns generated setting patch contract', () => {
  const response = runResponse([
    '--prompt',
    'turn on Play Screen Animations',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
  ]);
  assert(response.ok === true, 'generic Basic Config CLI DO response did not return ok=true');
  assert(response.mode === 'do-cli', `expected do-cli mode, got ${response.mode}`);
  assert(response.action?.actionId === 'editor.setting.screenedit-basic-config-animation-enabled', 'generic Basic Config prompt resolved to the wrong action');
  assert(response.action?.execution?.kind === 'delegate-cli', 'generic Basic Config action missing delegate-cli execution');
  const operation = response.action?.execution?.materialize?.content?.operations?.[0];
  assert(operation?.op === 'setFieldValue', 'generic Basic Config patch op drifted');
  assert(operation?.path === 'content.animated', 'generic Basic Config patch path drifted');
  assert(operation?.value === true, 'generic Basic Config inferred value must be boolean true');
  assert(response.action?.verification?.read === 'funnels export', 'generic Basic Config action missing funnels export verification');
  assert(response.completionClaim === 'not-completed-until-verification', 'generic Basic Config action claimed completion before verification');
  const guide = response.guidance?.guides?.find(item => item.guideKey === 'screenedit-basic-config-animation-enabled');
  assert(guide, 'generic Basic Config response missing animation guide contract');
  assert(guide.articleAlias === 'help-block-basic-config', 'generic Basic Config guide must link the built-in Basic Config article');
  assert(guide.referencePath === 'help-block-basic-config/screenedit-basic-config-animation-enabled', 'generic Basic Config guide missing stable reference path');
  assert(guide.fullArticleLink && /help-block-basic-config\/index\.html$/.test(guide.fullArticleLink), 'generic Basic Config guide missing public article URL');
  assert(guide.imageUrls?.some(url => /^https:\/\//.test(url)), 'generic Basic Config guide missing concrete image URL');
  assert(!response.missingArticleClaimed, 'generic Basic Config response incorrectly claimed the built-in guide/article is missing');
  assertSourceSafeCustomerAnswer(response);

  const dryRun = runCliRunner([
    '--action',
    'editor.setting.screenedit-basic-config-animation-enabled',
    '--projectId',
    'project_demo',
    '--funnelId',
    'funnel_demo',
    '--versionId',
    'version_demo',
    '--screenId',
    'screen_demo',
    '--value',
    'true',
  ]);
  assert(dryRun.ok === true && dryRun.dryRun === true, 'packaged generic Basic Config CLI runner dry-run failed');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.path === 'content.animated', 'packaged generic Basic Config CLI patch path drifted');
  assert(dryRun.materializedFiles?.[0]?.content?.operations?.[0]?.value === true, 'packaged generic Basic Config CLI patch value must be boolean true');
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
  assertToolPreflight(response.action?.toolPreflight, { browser: true });
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
  assertToolPreflight(dryRun.toolPreflight, { browser: true, segmentlyEnv: 'prod' });
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

check('launch progress prompt routes to the launch-progress scenario contract', () => {
  const matrix = JSON.parse(readFileSync(join(root, 'references/scenarios.matrix.json'), 'utf8'));
  const scenario = matrix.scenarios.find(item => item.id === 'launch-progress');
  assert(scenario, 'scenarios.matrix.json missing launch-progress scenario');
  assert(scenario.backend === 'cli', `launch-progress backend must be cli, got ${scenario.backend}`);
  assert(scenario.verify === 'launch preflight', `launch-progress verify must be launch preflight, got ${scenario.verify}`);
  assert(scenario.sampleQueries.ru.includes('что осталось до запуска'), 'launch-progress missing RU status phrasing');
  assert(scenario.article === 'launch-paid-funnel-overview', 'launch-progress must cite the launch overview article');
});

check('launch progress runner returns honest read-only contract without target inputs', () => {
  const result = runLaunchProgressRunner(['--contextFile', defaultContextFile]);
  assert(result.ok === false, 'runner without inputs must not return ok=true');
  assert(result.mode === 'launch-progress', `expected launch-progress mode, got ${result.mode}`);
  assert(Array.isArray(result.missingInputs) && result.missingInputs.includes('funnel'), 'runner must report missing funnel input');
  assert(result.discoveryReads?.some(read => read.includes('funnels list')), 'runner must offer funnels list discovery read');
  assert(result.completionClaim === 'launch-progress-not-executed', 'runner must not claim execution');
  assert(result.sessionContext?.schemaVersion === 1, 'runner missing session context contract');
  const helpText = String(execFileSync('node', [join(root, 'runtime/launch-progress-runner.mjs'), '--help'], { encoding: 'utf8' }));
  assert(helpText.includes('not checked automatically'), 'runner help must state the not-checked-automatically honesty rule');
  assert(helpText.includes('launch preflight'), 'runner help must name the wrapped preflight read');
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

function runLaunchProgressRunner(args, env = {}) {
  const spawned = spawnSync('node', [join(root, 'runtime/launch-progress-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const stdout = spawned.stdout ?? '';
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`launch-progress-runner did not return JSON: ${stdout.slice(0, 400)}`);
  }
}

function runResponse(args, env = {}) {
  const stdout = execFileSync('node', [join(root, 'runtime/customer-response-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, SEGMENTLY_LAUNCH_CONTEXT_FILE: defaultContextFile, ...env },
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
    env: { ...process.env, SEGMENTLY_LAUNCH_CONTEXT_FILE: defaultContextFile, ...env },
  });
  return JSON.parse(stdout);
}

function runShowRunnerExpectingExit(args, expectedStatus) {
  const result = spawnSync('node', [join(root, 'runtime/show-runner.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, SEGMENTLY_LAUNCH_CONTEXT_FILE: defaultContextFile },
  });
  if (result.status !== expectedStatus) {
    throw new Error(`expected SHOW runner exit ${expectedStatus}, got ${result.status}: ${result.stderr}`);
  }
  if (!result.stdout) throw new Error('SHOW runner did not emit JSON');
  return JSON.parse(result.stdout);
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
