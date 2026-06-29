#!/usr/bin/env node
/**
 * Customer-surface response contract runner for installed Segmently launch skills.
 *
 * This script intentionally reads only shipped skill files. It proves a clean
 * Codex/Claude delivery can answer persona-style beginner questions from
 * references/guide-evidence.json and route "do it" requests through
 * runtime/editor-do-runner.mjs without touching project source.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.prompt && (!args.persona || !args.question))) {
    printHelp();
    return;
  }

  const personaFlow = readJson('evals/persona-flow-evals.json');
  const guideEvidence = readJson('references/guide-evidence.json');
  const helpArticleReference = readJson('references/help-article-reference.json');
  const teachReference = readJson('references/teach-reference.json');
  const scenarios = readJson('references/scenarios.matrix.json');
  const actions = readJson('runtime/do-action-reference.json');
  const helpArticlesByAlias = new Map((helpArticleReference.articles ?? []).map(article => [article.alias, article]));

  const promptResolution = args.prompt
    ? resolvePromptQuestion(args.prompt, args, { guideEvidence, teachReference, scenarios, actions })
    : null;
  const question = promptResolution?.question ?? findQuestion(personaFlow, args.persona, args.question);
  if (!question) {
    fail(`Unknown persona question ${args.persona ?? '<persona>'}/${args.question ?? '<question>'}.`);
  }

  const guidesByKey = new Map((guideEvidence.guides ?? []).map(guide => [guide.guideKey, guide]));
  const scenarioById = new Map((scenarios.scenarios ?? []).map(scenario => [scenario.id, scenario]));
  const actionById = new Map((actions.actions ?? []).map(action => [action.id, action]));
  const guideContracts = (question.guidance?.guideKeys ?? []).map(guideKey => {
    const guide = guidesByKey.get(guideKey);
    if (!guide) fail(`Question ${question.id} references missing guide ${guideKey}.`);
    return guideContract(guide, helpArticlesByAlias);
  });

  const scenario = question.expectedScenarioId ? scenarioById.get(question.expectedScenarioId) : null;
  const isShow = Boolean(question.expectedShow);
  const isArticleFetch = Boolean(question.expectedArticleFetch);
  const response = {
    ok: true,
    source: args.prompt ? 'prompt' : 'persona',
    personaId: args.persona ?? null,
    questionId: question.id,
    customerQuestion: question.text,
    resolver: promptResolution?.resolver ?? null,
    scenarioId: scenario?.id ?? question.expectedScenarioId ?? null,
    mode: question.expectedDo
      ? modeForExpectedDo(question.expectedDo)
      : question.expectedConditionalDo
        ? 'do-e2e-conditional'
        : isShow
          ? 'show'
          : isArticleFetch
            ? 'article-fetch'
            : 'teach',
    answer: buildAnswer(question, guideContracts, scenario),
    guidance: {
      minimum: 'text-plus-screenshot-evidence',
      articleHtmlRequired: false,
      publicArticleLinks: guideContracts.map(guide => guide.fullArticleLink).filter(Boolean),
      builtInArticleReferences: builtInArticleReferences(guideContracts),
      guides: guideContracts,
    },
    action: null,
    show: null,
    articleFetch: null,
    missingArticleClaimed: false,
    completionClaim: question.expectedDo
      ? 'not-completed-until-verification'
      : isShow
        ? 'show-plan-not-executed'
        : isArticleFetch
          ? 'article-fetch-plan-not-executed'
          : 'guidance-only',
  };

  if (question.expectedShow) {
    response.show = showContract(question.expectedShow, guideContracts, args);
    response.answer.browserPlan = response.show.browserPlan;
    response.answer.evidenceLevel = response.show.evidenceLevel;
    response.answer.nextStep = response.show.nextStep;
    response.completionClaim = response.show.missingInputs.length > 0
      ? 'show-needs-target-before-browser'
      : 'show-plan-not-executed';
  }

  if (question.expectedDo) {
    const action = actionById.get(question.expectedDo.actionId);
    if (!action) fail(`Question ${question.id} references missing action ${question.expectedDo.actionId}.`);
    response.action = args.prompt
      ? actionContractForPrompt(question.expectedDo, action)
      : actionContract(question.expectedDo, action);
    response.answer.nextStep = response.action.nextStep;
    response.answer.verification = response.action.verification ?? response.action.verify ?? null;
    if (response.action.status === 'handoff') {
      response.completionClaim = 'handoff-not-done';
    } else if (response.action.missingInputs?.length > 0) {
      response.completionClaim = 'needs-inputs-before-execution';
    }
  }

  if (question.expectedConditionalDo) {
    response.action = conditionalBrowserDoContract(question.expectedConditionalDo, guideContracts, args);
    response.answer.nextStep = response.action.nextStep;
    response.answer.verification = response.action.verification ?? null;
    response.completionClaim = response.action.missingInputs?.length > 0
      ? 'needs-inputs-before-execution'
      : 'conditional-browser-do-plan-not-executed';
  }

  if (question.expectedArticleFetch) {
    response.articleFetch = articleFetchContract(question.expectedArticleFetch, guideContracts);
    response.answer.articleFetch = response.articleFetch;
    response.answer.nextStep = response.articleFetch.nextStep;
    response.completionClaim = response.articleFetch.status === 'ready'
      ? 'article-fetch-plan-not-executed'
      : 'article-fetch-needs-reference';
  }

  writeJson(response);
}

function resolvePromptQuestion(prompt, args, context) {
  const action = resolveActionFromPrompt(prompt, context.actions.actions ?? []);
  const scenarioId = scenarioIdForPrompt(prompt, action);
  const explicitActionIntent = hasExplicitActionIntent(prompt);
  const articleFetchIntent = hasArticleFetchIntent(prompt) && !explicitActionIntent;
  const showIntent = hasShowIntent(prompt) && !explicitActionIntent && !articleFetchIntent;
  const guideKeys = action && (explicitActionIntent || showIntent)
    ? guideKeysForAction(action.id)
    : resolveGuideKeysFromPrompt(prompt, context.guideEvidence, context.teachReference);
  const conditionalDo = !action && explicitActionIntent
    ? conditionalBrowserDoForGuideKeys(guideKeys)
    : null;
  const expectedDo = action && explicitActionIntent
    ? {
        actionId: action.id,
        status: action.status,
        mode: action.mode,
        sampleArgs: runnerArgsForPromptAction(action, prompt, args),
      }
    : null;
  const expectedConditionalDo = !expectedDo && conditionalDo
    ? {
        actionId: conditionalDo.actionId,
        label: conditionalDo.label,
        guideKeys,
        requiredInputs: [...requiredInputsForShow(guideKeys), conditionalDo.valueInput],
        valueInput: conditionalDo.valueInput,
        targetLabel: conditionalDo.targetLabel,
      }
    : null;
  const expectedShow = showIntent
    ? {
        guideKeys,
        requiredInputs: requiredInputsForShow(guideKeys),
        mutation: false,
      }
    : null;
  const expectedArticleFetch = articleFetchIntent
    ? {
        guideKeys,
        requiredInputs: [],
        mutation: false,
      }
    : null;
  return {
    question: {
      id: 'prompt',
      phase: scenarioId ?? 'customer-prompt',
      text: prompt,
      expectedScenarioId: scenarioId,
      guidance: {
        guideKeys,
        requiresText: true,
        requiresImage: showIntent,
      },
      expectedDo,
      expectedConditionalDo,
      expectedShow,
      expectedArticleFetch,
    },
    resolver: {
      kind: expectedDo ? 'action' : expectedConditionalDo ? 'conditional-do' : expectedShow ? 'show' : expectedArticleFetch ? 'article-fetch' : 'teach',
      actionId: expectedDo?.actionId ?? expectedConditionalDo?.actionId ?? null,
      guideKeys,
      scenarioId,
      conditionalDo: expectedConditionalDo
        ? {
            requiredInputs: expectedConditionalDo.requiredInputs,
            mutation: true,
            owningSkill: 'playwright-bowser',
            companionSkill: 'segmently-test-kit',
          }
        : null,
      show: expectedShow
        ? {
            requiredInputs: expectedShow.requiredInputs,
            mutation: false,
          }
        : null,
      articleFetch: expectedArticleFetch
        ? {
            requiredInputs: expectedArticleFetch.requiredInputs,
            mutation: false,
          }
        : null,
    },
  };
}

function findQuestion(personaFlow, personaId, questionId) {
  for (const persona of personaFlow.personas ?? []) {
    if (personaId && persona.id !== personaId) continue;
    const question = (persona.questions ?? []).find(item => item.id === questionId);
    if (question) return question;
  }
  return null;
}

function guideContract(guide, helpArticlesByAlias = new Map()) {
  const helpArticle = guide.articleAlias ? helpArticlesByAlias.get(guide.articleAlias) ?? null : null;
  const settingReference = (helpArticle?.settings ?? []).find(setting => setting.guideKey === guide.guideKey) ?? null;
  const textSections = (guide.sections ?? [])
    .filter(section => String(section.title ?? '').trim() || String(section.description ?? '').trim())
    .map(section => ({
      id: section.id ?? section.sectionKey ?? null,
      referencePath: section.referencePath ?? null,
      title: section.title ?? '',
      description: section.description ?? '',
      hasScreenshotEvidence: section.hasScreenshotEvidence === true,
      imageUrl: section.imageUrl ?? settingReference?.imageUrl ?? null,
    }));
  if (settingReference && textSections.length > 0 && !textSections.some(section => section.imageUrl === settingReference.imageUrl)) {
    textSections[0].imageUrl = textSections[0].imageUrl ?? settingReference.imageUrl ?? null;
  }
  const imageUrls = textSections.map(section => section.imageUrl).filter(Boolean);
  const publicArticleUrl = guide.fullArticleLink ?? helpArticle?.publishedUrl ?? null;
  return {
    guideKey: guide.guideKey,
    articleId: guide.articleId ?? guide.guideKey,
    articleAlias: guide.articleAlias ?? null,
    helpArticleTitle: helpArticle?.title ?? null,
    helpArticleProjectId: helpArticle?.projectId ?? null,
    helpArticleConfigUrl: helpArticle?.configUrl ?? null,
    articleSectionId: settingReference?.articleSectionId ?? null,
    articleSectionUrl: settingReference?.articleSectionUrl ?? null,
    settingRoute: settingReference?.route ?? [],
    referencePath: guide.referencePath ?? null,
    name: guide.name,
    journeyStep: guide.journeyStep,
    userNeed: guide.userNeed,
    fullArticleLink: publicArticleUrl,
    guideFullArticleLink: guide.fullArticleLink ?? null,
    publishedHelpArticleUrl: helpArticle?.publishedUrl ?? null,
    sourceRecipeKey: guide.sourceRecipeKey ?? null,
    localArticlePath: guide.localArticlePath ?? null,
    textSections,
    imageUrls,
    hasText: textSections.length > 0,
    hasBuiltInArticleReference: Boolean(guide.articleId || guide.articleAlias || guide.localArticlePath),
    hasScreenshotEvidence: guide.hasScreenshotEvidence === true,
    sectionScreenshotEvidence: textSections.some(section => section.hasScreenshotEvidence),
    hasImageUrl: imageUrls.length > 0,
  };
}

function modeForExpectedDo(expectedDo) {
  if (expectedDo.status === 'handoff') return 'handoff';
  if (expectedDo.mode === 'cli') return 'do-cli';
  if (expectedDo.mode === 'e2e') return 'do-e2e';
  return expectedDo.mode ?? 'teach';
}

function actionContract(expectedDo, action) {
  const base = {
    actionId: action.id,
    status: action.status,
    mode: action.mode,
    label: action.label,
    requiredInputs: action.requiredInputs ?? [],
    owningSkill: action.owningSkill ?? null,
    verify: action.verify ?? null,
  };
  if (action.status === 'supported') {
    const plan = runEditorDoRunner(expectedDo.sampleArgs);
    return {
      ...base,
      runnerOk: plan.ok === true,
      executeWith: plan.executeWith ?? null,
      execution: plan.execution ?? null,
      verification: plan.verification ?? null,
      nextStep: plan.nextStep ?? 'Execute the returned action, then run verification.',
    };
  }
  const refusal = runEditorDoRunnerRefusal(expectedDo.sampleArgs);
  return {
    ...base,
    runnerOk: refusal.ok === false,
    reason: refusal.reason,
    teachFallback: refusal.teachFallback ?? null,
    verification: refusal.verify ?? null,
    nextStep: refusal.nextStep ?? 'Guide the customer through the handoff, then verify.',
  };
}

function actionContractForPrompt(expectedDo, action) {
  const base = {
    actionId: action.id,
    status: action.status,
    mode: action.mode,
    label: action.label,
    requiredInputs: action.requiredInputs ?? [],
    owningSkill: action.owningSkill ?? null,
    verify: action.verify ?? null,
  };
  const result = spawnSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...expectedDo.sampleArgs], {
    encoding: 'utf8',
  });
  if (!result.stdout) {
    throw new Error(`editor-do-runner emitted no JSON: ${result.stderr}`);
  }
  const plan = JSON.parse(result.stdout);
  if (result.status === 0 && plan.ok === true) {
    return {
      ...base,
      runnerOk: true,
      missingInputs: [],
      executeWith: plan.executeWith ?? null,
      execution: plan.execution ?? null,
      verification: plan.verification ?? null,
      nextStep: plan.nextStep ?? 'Execute the returned action, then run verification.',
    };
  }
  if (result.status === 2 && plan.ok === false) {
    return {
      ...base,
      runnerOk: false,
      missingInputs: plan.missingInputs ?? [],
      reason: plan.reason,
      teachFallback: plan.teachFallback ?? null,
      verification: plan.verification ?? plan.verify ?? null,
      nextStep: plan.nextStep ?? 'Ask for the missing inputs, then run the action again.',
    };
  }
  throw new Error(`editor-do-runner failed with exit ${result.status}: ${result.stderr || result.stdout}`);
}

function conditionalBrowserDoContract(expectedConditionalDo, guideContracts, args) {
  const targetInputs = requiredInputsForShow(expectedConditionalDo.guideKeys ?? guideContracts.map(guide => guide.guideKey));
  const valueInput = expectedConditionalDo.valueInput ?? 'videoUrl-or-local-file';
  const missingTargetInputs = targetInputs.filter(name => !hasArg(args, name));
  const hasVideoSource = hasVideoSourceArg(args);
  const missingInputs = [
    ...missingTargetInputs,
    ...(hasVideoSource ? [] : [valueInput]),
  ];
  const providedInputs = Object.fromEntries(
    targetInputs
      .filter(name => hasArg(args, name))
      .map(name => [name, String(args[name])]),
  );
  if (hasVideoSource) {
    providedInputs.videoSource = String(args.videoUrl ?? args.videoFile ?? args.localFile ?? args.file ?? args.assetUrl);
  }

  return {
    actionId: expectedConditionalDo.actionId,
    status: missingInputs.length > 0 ? 'needs-inputs' : 'ready',
    mode: 'e2e',
    mutation: true,
    label: expectedConditionalDo.label,
    owningSkill: 'playwright-bowser',
    companionSkill: 'segmently-test-kit',
    supportedBoundary: 'conditional-browser-editor-upload',
    guideKeys: expectedConditionalDo.guideKeys ?? guideContracts.map(guide => guide.guideKey),
    requiredInputs: [...targetInputs, valueInput],
    missingInputs,
    providedInputs,
    executeWith: {
      skill: 'playwright-bowser',
      companionSkill: 'segmently-test-kit',
      purpose: 'open-the-editor-upload-or-set-video-media-and-verify',
      runnerBoundary: 'Use browser/editor automation; do not claim a headless CLI patch exists for media file upload.',
    },
    authPreflight: {
      requiredForExecute: true,
      statusProbe: 'segmently --env <env> auth status',
      login: 'segmently --env <env> auth login',
      browserSeed: 'runtime/show-runner.mjs seeds browser auth from the authorized CLI credential before opening the editor',
      agentInstruction: 'Do not stop at auth_required. Run status, run login if needed, re-check status, then retry the browser DO flow. Ask the customer only if browser login approval is required.',
    },
    verification: {
      kind: 'browser-read',
      evidence: `After execution, reopen ${expectedConditionalDo.targetLabel} and confirm the video control contains the provided asset/source; capture a screenshot and do not claim completion without verification.`,
    },
    nextStep: missingInputs.length > 0
      ? `Ask for ${missingInputs.join(', ')}, then run auth preflight and use playwright-bowser to open ${expectedConditionalDo.targetLabel}, upload/set the video, save, and verify with screenshot evidence.`
      : `Run auth preflight, use playwright-bowser to open ${expectedConditionalDo.targetLabel}, upload/set the provided video, save, then verify with screenshot evidence before claiming completion.`,
  };
}

function buildAnswer(question, guideContracts, scenario) {
  const firstGuide = guideContracts[0];
  const firstSection = firstGuide?.textSections?.[0];
  const references = builtInArticleReferences(guideContracts);
  const preferredReference = references.find(reference => reference.articleAlias) ?? references[0] ?? null;
  const customerVisibleGuideAssets = buildCustomerVisibleGuideAssets(guideContracts);
  return {
    goal: scenario?.title ?? question.phase ?? question.id,
    whereToStart: firstGuide
      ? `${firstGuide.journeyStep}: ${firstGuide.userNeed}`
      : 'Start from the matched Segmently area.',
    customerAnswerStarter: preferredReference
      ? `The built-in Segmently guide/article is available: ${preferredReference.name} (${preferredReference.articleAlias ?? preferredReference.articleId}, reference ${preferredReference.referencePath}). Use its text and screenshot-backed guidance.`
      : 'Use the matched Segmently guide text and ask one clarifying question if the exact screen is unclear.',
    instructions: guideContracts.flatMap(guide =>
      guide.textSections.slice(0, 2).map(section => ({
        title: section.title,
        text: section.description,
        visualEvidence: section.hasScreenshotEvidence || guide.hasScreenshotEvidence,
        imageUrl: section.imageUrl ?? null,
      })),
    ),
    primaryInstruction: firstSection?.description ?? firstGuide?.userNeed ?? question.text,
    publicArticleLinks: customerVisibleGuideAssets.publicArticleLinks,
    builtInArticleReferences: references,
    preferredCitation: preferredReference
      ? {
          name: preferredReference.name,
          articleAlias: preferredReference.articleAlias,
          articleId: preferredReference.articleId,
          referencePath: preferredReference.referencePath,
          publicArticleUrl: preferredReference.publicArticleUrl,
          status: preferredReference.status,
        }
      : null,
    articleReferenceSummary: references.length > 0
      ? 'Built-in guide/article references are available; answer from the shipped text and screenshot evidence. Cite preferredCitation.referencePath or articleAlias when a locator is useful.'
      : 'No built-in guide/article reference matched this prompt.',
    missingArticleClaimed: false,
    articleReferences: guideContracts.map(guide => ({
      guideKey: guide.guideKey,
      articleId: guide.articleId,
      articleAlias: guide.articleAlias,
      referencePath: guide.referencePath,
      fullArticleLink: guide.fullArticleLink,
      publishedHelpArticleUrl: guide.publishedHelpArticleUrl,
      articleSectionUrl: guide.articleSectionUrl,
      localArticlePath: guide.localArticlePath,
    })),
    articleAvailability: guideContracts.map(guide => ({
      guideKey: guide.guideKey,
      articleId: guide.articleId,
      articleAlias: guide.articleAlias,
      referencePath: guide.referencePath,
      hasBuiltInArticleReference: Boolean(guide.articleId || guide.articleAlias || guide.localArticlePath),
      publicArticleUrlStatus: guide.fullArticleLink ? 'published' : 'built-in-reference',
      customerSafeMessage: guide.fullArticleLink
        ? 'A public article URL is available and should be included in the customer answer together with the relevant screenshot URLs.'
        : 'Built-in guide/article text is available with screenshot-backed guidance; do not describe the article as missing.',
    })),
    imageUrls: customerVisibleGuideAssets.imageUrls,
    customerVisibleGuideAssets,
    verification: scenario?.verify ?? null,
    nextStep: teachNextStepForGuides(guideContracts),
    showDoOptions: teachShowDoOptionsForGuides(guideContracts),
  };
}

function buildCustomerVisibleGuideAssets(guideContracts) {
  const publicArticleLinks = uniqueStrings(guideContracts.map(guide => guide.fullArticleLink).filter(Boolean));
  const imageUrls = uniqueStrings(guideContracts.flatMap(guide => guide.imageUrls ?? []).filter(Boolean));
  const guideReferences = guideContracts
    .filter(guide => guide.articleId || guide.articleAlias || guide.referencePath)
    .map(guide => ({
      name: guide.name,
      articleAlias: guide.articleAlias ?? null,
      articleId: guide.articleId ?? null,
      referencePath: guide.referencePath ?? null,
      publicArticleUrl: guide.fullArticleLink ?? null,
      articleSectionUrl: guide.articleSectionUrl ?? null,
      hasPublicArticleUrl: Boolean(guide.fullArticleLink),
      imageUrls: uniqueStrings(guide.imageUrls ?? []),
    }));
  return {
    mustShowInCustomerAnswer: true,
    publicArticleLinks,
    imageUrls,
    guideReferences,
    instruction: 'In the customer answer, include the public article URL when present and include concrete image URLs when present. If no public article URL is present, cite the guide name plus articleAlias/referencePath and still show the image URL(s); do not merely say screenshots exist.',
  };
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value)).filter(Boolean))];
}

function teachNextStepForGuides(guideContracts) {
  const guideKeys = guideContracts.map(guide => guide.guideKey);
  const requiredInputs = requiredInputsForShow(guideKeys);
  if (isPaywallMediaVideoGuide(guideContracts)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Paywall Media section without changing data.',
      'Offer DO with boundary: to add the paywall video for the customer, ask for the same target plus a direct video URL or a local file/asset the browser editor can upload. Do not claim the video was uploaded before browser/editor execution and verification.',
      `Missing target inputs before live SHOW/DO: ${requiredInputs.join(', ')}.`,
    ].join(' ');
  }
  if (isMediaVideoGuide(guideContracts)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Media section without changing data.',
      'Offer DO with boundary: to add the video for the customer, ask for the same target plus a direct video URL or a local file/asset the browser editor can upload. Do not claim a headless CLI upload/write is available unless the shipped action registry returns one.',
      `Missing target inputs before live SHOW/DO: ${requiredInputs.join(', ')}.`,
    ].join(' ');
  }
  return [
    'Offer SHOW for the exact customer screen when they provide an editor URL or project/funnel/screen target.',
    'Offer verified DO only when the packaged action resolver returns a supported action and the customer provides the concrete value.',
    `Typical missing target inputs: ${requiredInputs.join(', ')}.`,
  ].join(' ');
}

function teachShowDoOptionsForGuides(guideContracts) {
  const guideKeys = guideContracts.map(guide => guide.guideKey);
  const requiredInputs = requiredInputsForShow(guideKeys);
  return {
    show: {
      available: true,
      mutation: false,
      missingInputs: requiredInputs,
      runner: 'runtime/show-runner.mjs',
      summary: 'Navigate to the matched editor section and capture/read the relevant control without changing data.',
    },
    do: isMediaVideoGuide(guideContracts) || isPaywallMediaVideoGuide(guideContracts)
      ? {
          available: 'conditional',
          mutation: true,
          missingInputs: [...requiredInputs, 'videoUrl-or-local-file'],
          summary: 'Can be done through the editor/browser path after the customer provides the target screen and the video asset/source. Do not present it as completed before execution and verification.',
        }
      : {
          available: 'when-action-resolver-matches-supported-action',
          mutation: true,
          missingInputs: [...requiredInputs, 'value'],
          summary: 'Use the packaged DO runner only for supported actions, then verify through the returned read-back contract.',
        },
  };
}

function isMediaVideoGuide(guideContracts) {
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screen-editor-section-media|screenedit-media-(kind|video-upload|video-repeat)/.test(keys);
}

function isPaywallMediaVideoGuide(guideContracts) {
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screen-editor-section-paywall-media|screenedit-paywall-media-(enable|kind|video|repeat)/.test(keys);
}

function conditionalBrowserDoForGuideKeys(guideKeys) {
  const keys = guideKeys.join(' ');
  if (/screen-editor-section-paywall-media|screenedit-paywall-media-(enable|kind|video)/.test(keys)) {
    return {
      actionId: 'browser.paywallMedia.videoUpload',
      label: 'Add or change the Paywall featured video through the editor',
      targetLabel: 'the Paywall Media section',
      valueInput: 'videoUrl-or-local-file',
    };
  }
  if (/screen-editor-section-media|screenedit-media-(kind|video-upload)/.test(keys)) {
    return {
      actionId: 'browser.media.videoUpload',
      label: 'Add or change the screen Media video through the editor',
      targetLabel: 'the Media section',
      valueInput: 'videoUrl-or-local-file',
    };
  }
  return null;
}

function builtInArticleReferences(guideContracts) {
  return guideContracts
    .filter(guide => guide.articleId || guide.articleAlias || guide.localArticlePath)
    .map(guide => ({
      guideKey: guide.guideKey,
      name: guide.name,
      articleId: guide.articleId,
      articleAlias: guide.articleAlias,
      referencePath: guide.referencePath,
      publicArticleUrl: guide.fullArticleLink ?? null,
      articleSectionUrl: guide.articleSectionUrl ?? null,
      localArticlePath: guide.localArticlePath,
      status: guide.fullArticleLink ? 'public-url-available' : 'built-in-reference',
      customerSafeInstruction: guide.fullArticleLink
        ? 'Include the public URL in the customer answer and cite the section URL when it points to the exact setting.'
        : 'Say the built-in guide/article is available with text and screenshot-backed guidance; cite referencePath or articleAlias when a locator is useful.',
    }));
}

function showContract(expectedShow, guideContracts, args) {
  const requiredInputs = expectedShow.requiredInputs ?? requiredInputsForShow(guideContracts.map(guide => guide.guideKey));
  const missingInputs = requiredInputs.filter(name => !hasArg(args, name));
  const providedInputs = Object.fromEntries(
    requiredInputs
      .filter(name => hasArg(args, name))
      .map(name => [name, String(args[name])]),
  );
  const evidenceLevel = evidenceLevelForGuides(guideContracts);
  const area = showAreaForGuides(guideContracts);
  const browserPlan = buildShowBrowserPlan(area, providedInputs, missingInputs);
  return {
    status: missingInputs.length > 0 ? 'needs-target' : 'ready',
    mode: 'show',
    mutation: false,
    guideKeys: guideContracts.map(guide => guide.guideKey),
    evidenceLevel,
    liveBrowserReady: missingInputs.length === 0,
    missingInputs,
    providedInputs,
    executeWith: {
      skill: 'playwright-bowser',
      companionSkill: 'segmently-test-kit',
      purpose: 'navigate-and-capture-screenshot-without-mutation',
    },
    authPreflight: {
      requiredForExecute: true,
      statusProbe: 'segmently --env <env> auth status',
      login: 'segmently --env <env> auth login',
      browserSeed: 'runtime/show-runner.mjs seeds browser auth from the authorized CLI credential before opening the editor',
      agentInstruction: 'Do not stop at auth_required. Run status, run login if needed, re-check status, then retry the same SHOW runner. Ask the customer only if browser login approval is required.',
    },
    browserPlan,
    screenshotTarget: 'qa-screenshots/segmently-launch-guide/show-target.png',
    nextStep: missingInputs.length > 0
      ? `Ask for ${missingInputs.join(', ')}, then open the target in the browser and capture a screenshot without changing data.`
      : 'Use playwright-bowser to open the target, navigate to the matched setting, and capture a screenshot without clicking Save or changing values.',
  };
}

function articleFetchContract(expectedArticleFetch, guideContracts) {
  const references = builtInArticleReferences(guideContracts);
  const preferredReference = references.find(reference => reference.articleAlias) ?? references[0] ?? null;
  const publicArticleLinks = guideContracts.map(guide => guide.fullArticleLink).filter(Boolean);
  const articleAlias = preferredReference?.articleAlias ?? null;
  const articleId = preferredReference && !articleAlias ? preferredReference.articleId : null;
  const articleLookup = articleAlias ?? articleId ?? null;
  const missingInputs = articleLookup ? [] : ['articleAlias'];
  const preferredGuide = guideContracts.find(guide => guide.articleAlias === articleAlias)
    ?? guideContracts.find(guide => guide.articleId === articleId)
    ?? guideContracts[0]
    ?? null;
  return {
    status: missingInputs.length > 0 ? 'needs-reference' : 'ready',
    mode: 'article-fetch',
    mutation: false,
    readOnly: true,
    owningSkill: 'segmently-cli-articles',
    companionSkill: 'segmently-cli-content-plan-guide',
    guideKeys: expectedArticleFetch.guideKeys ?? guideContracts.map(guide => guide.guideKey),
    articleAlias: preferredReference?.articleAlias ?? null,
    articleId: preferredReference?.articleId ?? null,
    referencePath: preferredReference?.referencePath ?? null,
    publicArticleLinks,
    preferredReference,
    missingInputs,
    fetchCommand: articleLookup
      ? {
          skill: 'segmently-cli-articles',
          commandFamily: articleAlias ? 'content-plan articles list -> get resolved articleId' : 'content-plan articles get',
          tool: 'segmently',
          argv: articleAlias
            ? ['content-plan', 'articles', 'get', '<resolvedArticleId>']
            : ['content-plan', 'articles', 'get', articleId],
          resolveFirst: articleAlias
            ? {
                argv: ['content-plan', 'articles', 'list', '--status', 'published', '--limit', '200'],
                match: { field: 'alias', equals: articleAlias, prefer: 'most-recent-updatedAt' },
              }
            : null,
          publicUrl: preferredGuide?.fullArticleLink ?? null,
          configUrl: preferredGuide?.helpArticleConfigUrl ?? null,
          optionalArgs: ['projectId when the article is project-scoped'],
          readOnly: true,
        }
      : null,
    nextStep: articleLookup
      ? 'Use segmently-cli-articles read-only. If articleAlias is provided, list published articles, resolve the matching alias to an articleId, then fetch that id. Include the public article URL when present and include setting screenshot URLs from the shipped reference.'
      : 'Ask which Segmently guide/article to fetch, then call segmently-cli-articles read-only.',
  };
}

function buildShowBrowserPlan(area, providedInputs, missingInputs) {
  const plan = [
    'Run auth preflight before opening the browser: segmently auth status; if it reports auth_required or not logged in, run segmently auth login, re-check status, then retry the same SHOW runner.',
    'Use the runner browser-auth bridge to seed the browser session from the authorized CLI credential; do not ask for passwords and do not paste token output.',
    providedInputs.projectId
      ? `Open the customer project ${providedInputs.projectId}.`
      : 'Ask for the project id before live browser navigation.',
  ];
  if (area.requiresFunnel) {
    plan.push(providedInputs.funnelId
      ? `Open funnel/onboarding ${providedInputs.funnelId}.`
      : 'Ask which funnel/onboarding to show.');
  }
  if (area.requiresScreen) {
    plan.push(providedInputs.screenId
      ? `Open screen ${providedInputs.screenId} in the editor.`
      : 'Ask which screen to show in the editor.');
  }
  plan.push(`Navigate to ${area.label}.`);
  plan.push('Capture a screenshot in qa-screenshots/segmently-launch-guide/ and point out the exact visible control.');
  plan.push('Do not change field values, do not click Save, and do not run any DO runner in SHOW mode.');
  if (missingInputs.length > 0) {
    plan.push(`Live browser execution waits for missing inputs: ${missingInputs.join(', ')}.`);
  }
  return plan;
}

function evidenceLevelForGuides(guideContracts) {
  if (guideContracts.some(guide => guide.hasImageUrl)) return 'concrete-image-url';
  if (guideContracts.some(guide => guide.sectionScreenshotEvidence || guide.hasScreenshotEvidence)) return 'screenshot-flag';
  return 'text-only';
}

function showAreaForGuides(guideContracts) {
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  if (/canvas-(overview|add-screen|connect-screens)/.test(keys)) {
    return {
      label: guideContracts[0]?.name ?? 'the V2 canvas',
      requiresFunnel: true,
      requiresScreen: false,
    };
  }
  if (/options|title-styles/.test(keys)) {
    return {
      label: 'the screen editor Options section, then the item title text style controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/action-button|action-bar/.test(keys)) {
    return {
      label: 'the screen editor Action Bar section, then the primary button text/container style controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/paywall-header/.test(keys)) {
    return {
      label: 'the screen editor Paywall Header section, then the close button or restore link controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/media/.test(keys)) {
    return {
      label: 'the screen editor Media section, then the media appearance controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/stepper/.test(keys)) {
    return {
      label: 'the screen editor Progress Steps section, then the progress bar, step text, or step image style controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/paywall-subscriptions/.test(keys)) {
    return {
      label: 'the screen editor Paywall Subscriptions section, then the plan arrangement, plan card style, label typography, or checkbox controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/paywall-footer/.test(keys)) {
    return {
      label: 'the screen editor Paywall Footer section, then the purchase button, auto-renew note, legal links, or footer background controls',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/background|backdrop/.test(keys)) {
    return {
      label: 'the screen editor Background section',
      requiresFunnel: true,
      requiresScreen: true,
    };
  }
  if (/webplacement|publish/.test(keys)) {
    return {
      label: 'the Web Placement publish and URL controls',
      requiresFunnel: true,
      requiresScreen: false,
    };
  }
  if (/onboarding|wizard/.test(keys)) {
    return {
      label: 'the Onboardings list and creation wizard',
      requiresFunnel: false,
      requiresScreen: false,
    };
  }
  return {
    label: guideContracts[0]?.name ?? 'the matched Segmently area',
    requiresFunnel: true,
    requiresScreen: false,
  };
}

function requiredInputsForShow(guideKeys) {
  const joined = (guideKeys ?? []).join(' ');
  if (/canvas-(overview|add-screen|connect-screens)/.test(joined)) {
    return ['projectId', 'funnelId'];
  }
  if (/screen|screenedit|action-bar|action-button|options|backdrop|background|paywall|stepper/.test(joined)) {
    return ['projectId', 'funnelId', 'screenId'];
  }
  if (/webplacement|publish/.test(joined)) {
    return ['projectId', 'funnelId'];
  }
  return ['projectId'];
}

function hasArg(args, key) {
  return args[key] !== undefined && args[key] !== true && String(args[key]).trim() !== '';
}

function readJson(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) fail(`Missing shipped file ${rel}.`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runEditorDoRunner(args) {
  const stdout = execFileSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

function runEditorDoRunnerRefusal(args) {
  const result = spawnSync('node', [join(root, 'runtime/editor-do-runner.mjs'), ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 2) {
    throw new Error(`Expected editor-do-runner refusal exit 2, got ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h') {
      out.help = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'help' || arg === '-h') {
      out.help = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node runtime/customer-response-runner.mjs --persona <personaId> --question <questionId>',
    '  node runtime/customer-response-runner.mjs --prompt "<customer request>" [--projectId <id> ...]',
    '',
    'Returns a customer-facing response contract built only from shipped skill files.',
    'Prompt mode resolves free-form customer text to TEACH or DO, then returns missing inputs or execution+verification.',
  ].join('\n'));
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  writeJson({ ok: false, reason: message });
  process.exit(2);
}

main();

function resolveActionFromPrompt(prompt, actions) {
  const text = normalize(prompt);
  const rules = [
    { id: 'editor.flexibleSections.screen.screenScrollable', re: /(?=.*(flexible|гибк|секц|section))(?=.*(screen|экран))(?=.*(скролл|scroll|прокрут))/ },
    { id: 'editor.flexibleSections.section.layout.backgroundColor', re: /(?=.*(flexible|гибк|секц|section))(?=.*(фон|background|залив|fill))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.flexibleSections.section.layout.heightValue', re: /(?=.*(flexible|гибк|секц|section))(?=.*(высот|height))(?=.*(\b\d{1,3}\b|px|пикс|процент|%))/ },
    { id: 'editor.flexibleSections.section.layout.heightMode', re: /(?=.*(flexible|гибк|секц|section))(?=.*(режим|mode|fixed|auto|percent|фикс|авто|процент))(?=.*(высот|height))/ },
    { id: 'editor.flexibleSections.section.layout.sectionScrollable', re: /(?=.*(flexible|гибк|секц|section))(?=.*(скролл|scroll|прокрут))/ },
    { id: 'editor.flexibleSections.section.layout.cornerRadius', re: /(?=.*(flexible|гибк|секц|section))(?=.*(скруг|radius|round|угл|corner|\b\d{1,3}\b))/ },
    { id: 'editor.flexibleSections.section.layout.borderColor', re: /(?=.*(flexible|гибк|секц|section))(?=.*(рамк|border|outline))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.flexibleSections.section.layout.borderWidth', re: /(?=.*(flexible|гибк|секц|section))(?=.*(рамк|border|outline))(?=.*(толщ|width|\b\d{1,3}\b))/ },
    { id: 'editor.flexibleSections.section.layout.verticalAlign', re: /(?=.*(flexible|гибк|секц|section))(?=.*(вертик|vertical|top|bottom|сверху|снизу|центр|center))(?=.*(align|выравн))/ },
    { id: 'editor.flexibleSections.section.layout.horizontalAlign', re: /(?=.*(flexible|гибк|секц|section))(?=.*(гориз|horizontal|left|right|слева|справа|центр|center))(?=.*(align|выравн))/ },
    { id: 'editor.flexibleSections.section.layout.zIndex', re: /(?=.*(flexible|гибк|секц|section))(?=.*(z.?index|слой|поверх|передний|позади))(?=.*\b\d{1,3}\b)/ },
    { id: 'editor.screen.backgroundColor', re: /(фон|background).*(экран|screen).*(цвет|желт|yellow|черн|black|бел|white|#[0-9a-f]{3,8})|(экран|screen).*(фон|background).*(желт|yellow|черн|black|бел|white|#[0-9a-f]{3,8})/ },
    { id: 'editor.paywallHeader.restoreLink.style.fontSize', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(шрифт|font|размер|size|крупн|\b\d{1,3}\b))/ },
    { id: 'editor.paywallHeader.restoreLink.style.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(текст|link|ссыл|цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallHeader.restoreLink.style.backgroundColor', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(фон|background|залив|fill|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallHeader.restoreLink.style.fontWeight', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(жирн|bold|font weight|weight|\b[1-9]00\b))/ },
    { id: 'editor.paywallHeader.restoreLink.style.fontFamily', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(шрифт|font family|гарнитур|inter|roboto|arial))/ },
    { id: 'editor.paywallHeader.restoreLink.style.align', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(выравн|align|центр|center|слева|справа|left|right))/ },
    { id: 'editor.paywallHeader.closeButton.style.iconColor', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(close|закры|крест|x\b))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallHeader.closeButton.style.alignment', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(close|закры|крест|x\b))(?=.*(сторон|side|align|выравн|слева|справа|left|right|start|end))/ },
    { id: 'editor.paywallHeader.closeButton.style.visibility', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(close|закры|крест|x\b))(?=.*(visible|visibility|покажи|скрой|таймер|timer|задерж|секунд|delay))/ },
    { id: 'editor.paywallHeader.closeButton.style.delaySeconds', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(close|закры|крест|x\b))(?=.*(delay|задерж|таймер|timer|секунд|\b\d{1,3}\b))/ },
    { id: 'editor.paywallSubscriptions.layout.viewKind', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(тариф|plan|subscription|card|карточ|план))(?=.*(вертик|vertical|горизонт|horizontal|ряд|спис|stack|side.?by.?side))/ },
    { id: 'editor.paywallSubscriptions.layout.productLayout', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(checkbox|чекбокс|галоч|выбор))(?=.*(left|right|hide|hidden|слева|справа|скры|убер|без))/ },
    { id: 'editor.paywallSubscriptions.price.textStyle.fontSize', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*((^|[^а-яa-z])цен(а|у|ы|е|ой)?([^а-яa-z]|$)|\bprice\b))(?=.*(шрифт|font|размер|size|крупн|\b\d{1,3}\b))/ },
    { id: 'editor.paywallSubscriptions.price.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*((^|[^а-яa-z])цен(а|у|ы|е|ой)?([^а-яa-z]|$)|\bprice\b))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.planName.textStyle.fontSize', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(назван|name|title|тариф))(?=.*(шрифт|font|размер|size|крупн|\b\d{1,3}\b))/ },
    { id: 'editor.paywallSubscriptions.planNote.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(описан|note|description|подпись))(?=.*(цвет|color|#[0-9a-f]{3,8}|сер|gray|grey|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.layout.startColumnWidthPercentage', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(колон|column|width|ширин|left label|right label|plan name vs|price width|назван.*цен|цен.*ширин|цен.*колон))(?=.*(\b\d{1,3}\b|процент|%|шире|уже))/ },
    { id: 'editor.paywallSubscriptions.selectedItem.style.backgroundColor', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(выбран|selected|active|highlight|подсвет))(?=.*(фон|background|залив|fill|цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.selectedItem.style.borderColor', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(выбран|selected|active|highlight|подсвет))(?=.*(рамк|border|outline))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.selectedItem.style.cornerRadius', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(выбран|selected|active|highlight|подсвет))(?=.*(скруг|round|radius|угл|corner|\b\d{1,3}\b))/ },
    { id: 'editor.paywallSubscriptions.unselectedItem.style.backgroundColor', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(обычн|невыбран|unselected|default|normal))(?=.*(фон|background|залив|fill|цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.unselectedItem.style.borderColor', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(обычн|невыбран|unselected|default|normal))(?=.*(рамк|border|outline))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.checkbox.style.checkedColor', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(checkbox|чекбокс|галоч|выбор))(?=.*(выбран|checked|selected|active))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|зелен|green|черн|black|бел|white))/ },
    { id: 'editor.paywallSubscriptions.checkbox.style.uncheckedColor', re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(checkbox|чекбокс|галоч|выбор))(?=.*(пуст|unchecked|unselected|обычн))(?=.*(цвет|color|#[0-9a-f]{3,8}|сер|gray|grey|черн|black|бел|white))/ },
    { id: 'editor.paywallMedia.style.heightPercentage', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(картин|изображ|медиа|media|image|photo|video|видео|hero|обложк))(?=.*(высот|height|процент|%|\b\d{1,3}\b))/ },
    { id: 'editor.paywallMedia.style.cornerRadius', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(картин|изображ|медиа|media|image|photo|video|видео|hero|обложк))(?=.*(скруг|round|radius|угл|corner))/ },
    { id: 'editor.paywallMedia.style.repeat', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(video|видео))(?=.*(loop|repeat|зацикл|повтор|replay|автоповтор|выключ.*повтор|не\s+повтор))/ },
    { id: 'editor.paywallMedia.style.topAlignment', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(картин|изображ|медиа|media|image|photo|video|видео|hero|обложк))(?=.*(начина|сверху|top|navigation|header|шапк|верх|под\s+шап))/ },
    { id: 'editor.paywallMedia.style.bottomAlignment', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(картин|изображ|медиа|media|image|photo|video|видео|hero|обложк))(?=.*(текст|content|headline|заголов|поверх|за\s+карт|под\s+карт|below|behind|over|intro))/ },
    { id: 'editor.paywallMedia.style.scaleMode', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(картин|изображ|медиа|media|image|photo|video|видео|hero|обложк))(?=.*(fill|fit|cover|scale|aspect|заполн|впис|растян|обрез))/ },
    { id: 'editor.media.style.heightPercentage', re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(высот|height|процент|%|\b\d{1,3}\b))/ },
    { id: 'editor.media.style.cornerRadius', re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(скруг|round|radius|угл|corner))/ },
    { id: 'editor.media.style.repeat', re: /(?=.*(video|видео))(?=.*(loop|repeat|зацикл|повтор|replay|автоповтор|выключ.*повтор|не\s+повтор))/ },
    { id: 'editor.media.style.topAlignment', re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(начина|сверху|top|navigation|header|шапк|верх))/ },
    { id: 'editor.media.style.scaleMode', re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(fill|fit|cover|scale|aspect|заполн|впис|растян|обрез))/ },
    { id: 'editor.roller.style.labelColor', re: /(?=.*(колес|wheel|roller|picker))(?=.*(выбран|selected|значен|label|текст))(?=.*(цвет|color|#[0-9a-f]{3,8}|бел|white|черн|black|желт|yellow))/ },
    { id: 'editor.roller.style.labelFontSize', re: /(?=.*(колес|wheel|roller|picker))(?=.*(выбран|selected|значен|label|текст))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.roller.style.labelFontWeight', re: /(?=.*(колес|wheel|roller|picker))(?=.*(выбран|selected|значен|label|текст))(?=.*(жирн|bold|font weight|weight|\b[1-9]00\b))/ },
    { id: 'editor.roller.style.labelAlign', re: /(?=.*(колес|wheel|roller|picker))(?=.*(выбран|selected|значен|label|текст))(?=.*(выравн|align|center|центр|слева|справа))/ },
    { id: 'editor.roller.style.containerBackgroundColor', re: /(?=.*(колес|wheel|roller|picker))(?=.*(фон|background))(?=.*(цвет|color|#[0-9a-f]{3,8}|бел|white|черн|black|желт|yellow))/ },
    { id: 'editor.roller.style.containerBorderColor', re: /(?=.*(колес|wheel|roller|picker))(?=.*(рамк|border))(?=.*(цвет|color|#[0-9a-f]{3,8}|бел|white|черн|black|желт|yellow))/ },
    { id: 'editor.roller.style.containerBorderWidth', re: /(?=.*(колес|wheel|roller|picker))(?=.*(рамк|border))(?=.*(толщ|width|\b\d{1,3}\b))/ },
    { id: 'editor.roller.style.containerCornerRadius', re: /(?=.*(колес|wheel|roller|picker))(?=.*(скруг|radius|round|\b\d{1,3}\b))/ },
    { id: 'editor.stepper.style.timerDuration', re: /(?=.*(stepper|progress|прогресс|степпер|шаги))(?=.*(timer|duration|длитель|время|секунд|\b\d{1,3}\b))/ },
    { id: 'editor.stepper.style.fillColor', re: /(?=.*(stepper|progress|прогресс|степпер))(?=.*(fill|filled|заполн|залив))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|зелен|green|черн|black|бел|white))/ },
    { id: 'editor.stepper.style.trackColor', re: /(?=.*(stepper|progress|прогресс|степпер))(?=.*(track|трек|фон|background))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|сер|gray|grey|черн|black|бел|white))/ },
    { id: 'editor.stepper.style.thickness', re: /(?=.*(stepper|progress|прогресс|степпер))(?=.*(bar|fill|залив|полос))(?=.*(толщ|thickness|height|\b\d{1,3}\b))/ },
    { id: 'editor.stepper.style.trackThickness', re: /(?=.*(stepper|progress|прогресс|степпер))(?=.*(track|трек))(?=.*(толщ|thickness|height|\b\d{1,3}\b))/ },
    { id: 'editor.stepper.title.textStyle.color', re: /(?=.*(stepper|progress|прогресс|степпер|шаг))(?=.*((?<!под)заголов|title))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.stepper.title.textStyle.fontSize', re: /(?=.*(stepper|progress|прогресс|степпер|шаг))(?=.*((?<!под)заголов|title))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.stepper.subtitle.textStyle.color', re: /(?=.*(stepper|progress|прогресс|степпер|шаг))(?=.*(подзаголов|subtitle))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.stepper.description.textStyle.color', re: /(?=.*(stepper|progress|прогресс|степпер|шаг))(?=.*(описан|description))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.stepper.image.style.scaleMode', re: /(?=.*(stepper|progress|прогресс|степпер|шаг))(?=.*(картин|image|photo|изображ))(?=.*(fill|fit|cover|scale|aspect|заполн|впис|растян|обрез))/ },
    { id: 'editor.stepper.image.style.cornerRadius', re: /(?=.*(stepper|progress|прогресс|степпер|шаг))(?=.*(картин|image|photo|изображ))(?=.*(скруг|round|radius|угл|corner|\b\d{1,3}\b))/ },
    { id: 'editor.header.backButton.textStyle.fontSize', re: /(?=.*(назад|back))(?=.*(header|шапк|верх))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.header.backButton.textStyle.color', re: /(?=.*(назад|back))(?=.*(header|шапк|верх))(?=.*(цвет|color|#[0-9a-f]{3,8}|бел|white|черн|black))/ },
    { id: 'editor.header.skipButton.textStyle.fontSize', re: /(?=.*(skip|пропуст))(?=.*(header|шапк|верх))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.header.skipButton.textStyle.color', re: /(?=.*(skip|пропуст))(?=.*(header|шапк|верх))(?=.*(цвет|color|#[0-9a-f]{3,8}|бел|white|черн|black))/ },
    { id: 'editor.paywallFooter.style.backgroundColor', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(footer|футер|низ|нижн|bottom))(?=.*(фон|background|fill))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallFooter.purchaseButton.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(purchase|buy|subscribe|покуп|купить|подпис|кноп))(?=.*(текст|label|букв))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallFooter.purchaseButton.textStyle.fontSize', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(purchase|buy|subscribe|покуп|купить|подпис|кноп))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.paywallFooter.autoRenew.textStyle.fontSize', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(auto.?renew|авто.?прод|renewal|автоспис|продлен))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.paywallFooter.autoRenew.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(auto.?renew|авто.?прод|renewal|автоспис|продлен))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallFooter.restoreLink.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(restore|восстанов|покупк))(?=.*(ссыл|link|текст))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallFooter.termsLink.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(terms|услов|правил))(?=.*(ссыл|link|текст))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallFooter.privacyLink.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(privacy|политик|конфиденц))(?=.*(ссыл|link|текст))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.actionBar.primaryButton.textStyle.fontSize', re: /(?=.*(кноп|button))(?=.*(шрифт|font|букв|типограф))(?=.*(\b\d{1,3}\b|размер|size))|(?=.*(кноп|button))(?=.*(размер|size))(?=.*(текст|label|букв))/ },
    { id: 'editor.actionBar.primaryButton.textStyle.color', re: /(кноп|button).*(текст|label|букв).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(цвет|color).*(текст|label).*(кноп|button)/ },
    { id: 'editor.actionBar.primaryButton.textStyle.fontWeight', re: /(кноп|button).*(жирн|bold|font weight|weight)|(жирн|bold).*(кноп|button)/ },
    { id: 'editor.actionBar.primaryButton.textStyle.fontFamily', re: /(кноп|button).*(шрифт|font family|гарнитур|inter|roboto)|(шрифт|font family|гарнитур).*(кноп|button)/ },
    { id: 'editor.paywallBody.title.textStyle.fontSize', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*((?<!под)заголов|title|headline))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.paywallBody.title.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*((?<!под)заголов|title|headline))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.paywallBody.title.textStyle.fontWeight', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*((?<!под)заголов|title|headline))(?=.*(жирн|bold|font weight|weight|\b[1-9]00\b))/ },
    { id: 'editor.paywallBody.title.textStyle.fontFamily', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*((?<!под)заголов|title|headline))(?=.*(шрифт|font family|гарнитур|inter|roboto|arial))/ },
    { id: 'editor.paywallBody.subtitle.textStyle.fontSize', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(подзаголов|subtitle|supporting))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.paywallBody.subtitle.textStyle.color', re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(подзаголов|subtitle|supporting))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.textField.style.fontSize', re: /(поле|input|field|text field).*(ввод|answer|ответ|текст).*(шрифт|font|размер|size|\b\d{1,3}\b)|(шрифт|font|размер|size|\b\d{1,3}\b).*(поле|input|field|text field).*(ввод|answer|ответ|текст)/ },
    { id: 'editor.textField.style.fontFamily', re: /(поле|input|field|text field).*(ввод|answer|ответ|текст).*(font family|гарнитур|inter|roboto|шрифт)|(шрифт|font family|гарнитур).*(поле|input|field|text field).*(ввод|answer|ответ|текст)/ },
    { id: 'editor.textField.style.typedTextColor', re: /(поле|input|field|text field).*(ввод|answer|ответ|текст).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(цвет|color).*(введ|typed|answer|ответ).*(текст|поле|input|field)/ },
    { id: 'editor.textField.style.placeholderColor', re: /(?=.*(placeholder|подсказ|hint))(?=.*(поле|input|field|text field))(?=.*(цвет|color|#[0-9a-f]{3,8}))/ },
    { id: 'editor.textField.style.fieldBackgroundColor', re: /(поле|input|field|text field).*(фон|background).*(цвет|color|#[0-9a-f]{3,8}|бел|white|черн|black)|(фон|background).*(поле|input|field|text field)/ },
    { id: 'editor.carousel.title.textStyle.color', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*((?<!под)заголов|title|headline))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.carousel.title.textStyle.fontSize', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*((?<!под)заголов|title|headline))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.carousel.title.textStyle.fontWeight', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*((?<!под)заголов|title|headline))(?=.*(жирн|bold|font weight|weight|\b[1-9]00\b))/ },
    { id: 'editor.carousel.subtitle.textStyle.color', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*(подзаголов|subtitle|supporting))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.carousel.subtitle.textStyle.fontSize', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*(подзаголов|subtitle|supporting))(?=.*(шрифт|font|размер|size|\b\d{1,3}\b))/ },
    { id: 'editor.carousel.detail.textStyle.color', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*(detail|extra|дополнительн|описан))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.carousel.image.style.scaleMode', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*(картин|image|photo|изображ))(?=.*(fill|fit|cover|scale|aspect|заполн|впис|растян|обрез))/ },
    { id: 'editor.carousel.image.style.cornerRadius', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*(картин|image|photo|изображ))(?=.*(скруг|round|radius|угл|corner|\b\d{1,3}\b))/ },
    { id: 'editor.carousel.imageContainer.style.heightValue', re: /(?=.*(карусел|carousel|slide|слайд))(?=.*(картин|image|photo|изображ))(?=.*(област|region|container|контейнер|box))(?=.*(высот|height|\b\d{1,3}\b|процент|percent|%))/ },
    { id: 'editor.stickyContainer.style.backgroundColor', re: /(?=.*(sticky|стик|липк|закреп|плава|нижн.*панел|cta bar))(?=.*(фон|background|bar|панел))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.stickyContainer.style.opacity', re: /(?=.*(sticky|стик|липк|закреп|плава|нижн.*панел|cta bar))(?=.*(прозрач|opacity|transparent|glass))(?=.*(\b\d{1,3}\b|процент|%|0\.[0-9]+))/ },
    { id: 'editor.stickyContainer.style.cornerRadius', re: /(?=.*(sticky|стик|липк|закреп|плава|нижн.*панел|cta bar))(?=.*(скруг|radius|round|угл|corner|\b\d{1,3}\b))/ },
    { id: 'editor.stickyContainer.style.borderColor', re: /(?=.*(sticky|стик|липк|закреп|плава|нижн.*панел|cta bar))(?=.*(рамк|border|outline))(?=.*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white))/ },
    { id: 'editor.stickyContainer.style.borderWidth', re: /(?=.*(sticky|стик|липк|закреп|плава|нижн.*панел|cta bar))(?=.*(рамк|border|outline))(?=.*(толщ|width|\b\d{1,3}\b))/ },
    { id: 'editor.stickyContainer.style.showBackground', re: /(?=.*(sticky|стик|липк|закреп|плава|нижн.*панел|cta bar))(?=.*(фон|background|bar|панел))(?=.*(включ|выключ|show|hide|enable|disable|on|off))/ },
    { id: 'editor.content.title.textStyle.fontSize', re: /((?<!под)заголов|title).*(экран|screen|page|контент|content).*(шрифт|font|размер|size|\b\d{1,3}\b)|(шрифт|font|размер|size|\b\d{1,3}\b).*((?<!под)заголов|title).*(экран|screen|page|контент|content)/ },
    { id: 'editor.content.title.textStyle.color', re: /((?<!под)заголов|title).*(экран|screen|page|контент|content).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(цвет|color).*((?<!под)заголов|title).*(экран|screen|page|контент|content)/ },
    { id: 'editor.content.title.textStyle.fontWeight', re: /((?<!под)заголов|title).*(экран|screen|page|контент|content).*(жирн|bold|font weight|weight)|(жирн|bold).*((?<!под)заголов|title).*(экран|screen|page|контент|content)/ },
    { id: 'editor.content.title.textStyle.fontFamily', re: /((?<!под)заголов|title).*(экран|screen|page|контент|content).*(шрифт|font family|гарнитур|inter|roboto)|(шрифт|font family|гарнитур).*((?<!под)заголов|title).*(экран|screen|page|контент|content)/ },
    { id: 'editor.content.title.textStyle.align', re: /((?<!под)заголов|title).*(экран|screen|page|контент|content).*(выравн|align|center|центр)|(выравн|align|center|центр).*((?<!под)заголов|title).*(экран|screen|page|контент|content)/ },
    { id: 'editor.content.subtitle.textStyle.fontSize', re: /(подзаголов|subtitle).*(экран|screen|page|контент|content).*(шрифт|font|размер|size|\b\d{1,3}\b)|(шрифт|font|размер|size|\b\d{1,3}\b).*(подзаголов|subtitle).*(экран|screen|page|контент|content)/ },
    { id: 'editor.content.subtitle.textStyle.color', re: /(подзаголов|subtitle).*(экран|screen|page|контент|content).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(цвет|color).*(подзаголов|subtitle).*(экран|screen|page|контент|content)/ },
    { id: 'editor.options.selectedItem.style.backgroundColor', re: /(выбран|selected).*(вариант|option|ячей|item).*(фон|background).*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white)|(фон|background).*(выбран|selected).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.selectedItem.style.borderColor', re: /(выбран|selected).*(вариант|option|ячей|item).*(рамк|border).*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white)|(рамк|border).*(цвет|color).*(выбран|selected).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.selectedItem.style.borderWidth', re: /(выбран|selected).*(вариант|option|ячей|item).*(рамк|border).*(толщ|width|\b\d{1,3}\b)|(рамк|border).*(толщ|width|\b\d{1,3}\b).*(выбран|selected).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.selectedItem.style.cornerRadius', re: /(выбран|selected).*(вариант|option|ячей|item).*(скруг|radius|round|\b\d{1,3}\b)|(скруг|radius|round).*(выбран|selected).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.unselectedItem.style.backgroundColor', re: /(невыбран|unselected|обычн|default).*(вариант|option|ячей|item).*(фон|background).*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white)|(фон|background).*(невыбран|unselected|обычн|default).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.unselectedItem.style.borderColor', re: /(невыбран|unselected|обычн|default).*(вариант|option|ячей|item).*(рамк|border).*(цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white)|(рамк|border).*(цвет|color).*(невыбран|unselected|обычн|default).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.unselectedItem.style.borderWidth', re: /(невыбран|unselected|обычн|default).*(вариант|option|ячей|item).*(рамк|border).*(толщ|width|\b\d{1,3}\b)|(рамк|border).*(толщ|width|\b\d{1,3}\b).*(невыбран|unselected|обычн|default).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.unselectedItem.style.cornerRadius', re: /(невыбран|unselected|обычн|default).*(вариант|option|ячей|item).*(скруг|radius|round|\b\d{1,3}\b)|(скруг|radius|round).*(невыбран|unselected|обычн|default).*(вариант|option|ячей|item)/ },
    { id: 'editor.options.itemSubtitle.textStyle.fontSize', re: /(вариант|option|ячей|list).*(subtitle|подзаголов|описан|description).*(шрифт|font|размер|size|\b\d{1,3}\b)|(шрифт|font|размер|size|\b\d{1,3}\b).*(subtitle|подзаголов|описан|description).*(вариант|option|ячей|list)/ },
    { id: 'editor.options.itemSubtitle.textStyle.color', re: /(вариант|option|ячей|list).*(subtitle|подзаголов|описан|description).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(цвет|color).*(subtitle|подзаголов|описан|description).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemSubtitle.textStyle.backgroundColor', re: /(вариант|option|ячей|list).*(subtitle|подзаголов|описан|description).*(фон|background).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(фон|background).*(subtitle|подзаголов|описан|description).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemSubtitle.textStyle.fontWeight', re: /(вариант|option|ячей|list).*(subtitle|подзаголов|описан|description).*(жирн|bold|font weight|weight)|(жирн|bold).*(subtitle|подзаголов|описан|description).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemSubtitle.textStyle.align', re: /(вариант|option|ячей|list).*(subtitle|подзаголов|описан|description).*(выравн|align|center|центр)|(выравн|align|center|центр).*(subtitle|подзаголов|описан|description).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemTitle.textStyle.color', re: /(вариант|option|ячей|list).*(title|заголов).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(цвет|color).*(заголов).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemTitle.textStyle.backgroundColor', re: /(вариант|option|ячей|list).*(title|заголов).*(фон|background).*(цвет|color|бел|white|черн|black|#[0-9a-f]{3,8})|(фон|background).*(заголов).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemTitle.textStyle.fontWeight', re: /(вариант|option|ячей|list).*(title|заголов).*(жирн|bold|font weight|weight)|(жирн|bold).*(заголов).*(вариант|option|ячей)/ },
    { id: 'editor.options.itemTitle.textStyle.align', re: /(вариант|option|ячей|list).*(title|заголов).*(выравн|align|center|центр)|(выравн|align|center|центр).*(заголов).*(вариант|option|ячей)/ },
    { id: 'editor.actionBar.primaryButton.backgroundColor', re: /(главн|primary|нижн).*(кноп|button).*(желт|yellow|цвет|color)|(кноп|button).*(желт|yellow)/ },
    { id: 'editor.actionBar.primaryButton.label', re: /(кноп|button).*(текст|label|пишет|continue|start|wording|назв)/ },
    { id: 'editor.list.options.itemTitle.fontSize', re: /(вариант|ячей|option|list).*(шрифт|букв|крупн|font|size|18|20)/ },
    { id: 'launch.funnel.create', re: /(созд|create|build).*(воронк|funnel|чернов)/ },
    { id: 'launch.analytics.pixel.apply', re: /(pixel|пиксел|facebook|tiktok|meta|аналитик).*(подключ|connect|add|встав)/ },
    { id: 'launch.paywallProducts.create', re: /(тариф|plan|product|товар|price|цена).*(созд|create|сдел)/ },
    { id: 'editor.paywall.attachProduct', re: /(постав|attach|connect|привяж).*(тариф|product|plan|price|paywall|оплат)/ },
    { id: 'launch.publish', re: /(опублик|publish|live|рабоч.*ссыл|ссылк.*браузер|web link)/ },
    { id: 'handoff.stripe.connect', re: /(stripe).*(подключ|connect|oauth)|(подключ|connect).*(stripe)/ },
    { id: 'handoff.domain.dns', re: /(domain|домен|dns).*(подключ|connect|point|verify)/ },
  ];
  for (const rule of rules) {
    if (rule.re.test(text)) return actions.find(action => action.id === rule.id) ?? null;
  }
  let best = null;
  for (const action of actions) {
    const score = Math.max(0, ...(action.customerIntent ?? []).map(intent => phraseScore(text, normalize(intent))));
    if (score > (best?.score ?? 0)) best = { action, score };
  }
  return best?.score >= 2 ? best.action : null;
}

function runnerArgsForPromptAction(action, prompt, args) {
  const out = ['--action', action.id];
  const inputNames = [...(action.requiredInputs ?? []), ...(action.optionalInputs ?? [])];
  const inferred = inferPromptInputs(action.id, prompt);
  for (const name of inputNames) {
    const value = args[name] ?? inferred[name];
    if (value !== undefined && value !== '') out.push(`--${name}`, String(value));
  }
  return out;
}

function inferPromptInputs(actionId, prompt) {
  const text = normalize(prompt);
  const out = {};
  if (actionId === 'editor.actionBar.primaryButton.backgroundColor') {
    if (/желт|yellow/.test(text)) out.value = '#ffc201';
  }
  if (actionId === 'editor.screen.backgroundColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
  }
  if (/^editor\.actionBar\.(primary|secondary)Button\.textStyle\./.test(actionId)) {
    inferActionBarTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.header\.(backButton|skipButton)\.textStyle\./.test(actionId)) {
    inferHeaderTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.options\.itemTitle\.textStyle\./.test(actionId)) {
    inferOptionsTitleTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.options\.itemSubtitle\.textStyle\./.test(actionId)) {
    inferOptionsSubtitleTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.options\.(selectedItem|unselectedItem)\.style\./.test(actionId)) {
    inferOptionsItemStateInput(actionId, text, prompt, out);
  }
  if (/^editor\.content\.(title|subtitle)\.textStyle\./.test(actionId)) {
    inferContentCopyTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.paywallBody\.(title|subtitle)\.textStyle\./.test(actionId)) {
    inferContentCopyTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.paywallFooter\..*\.textStyle\./.test(actionId)) {
    inferContentCopyTextStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.paywallFooter\.style\./.test(actionId)) {
    inferPaywallFooterStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.paywallHeader\./.test(actionId)) {
    inferPaywallHeaderStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.textField\.style\./.test(actionId)) {
    inferTextFieldStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.paywallMedia\.style\./.test(actionId)) {
    inferMediaStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.paywallSubscriptions\./.test(actionId)) {
    inferPaywallSubscriptionsInput(actionId, text, prompt, out);
  }
  if (/^editor\.media\.style\./.test(actionId)) {
    inferMediaStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.roller\.style\./.test(actionId)) {
    inferRollerStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.stepper\./.test(actionId)) {
    inferStepperStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.carousel\./.test(actionId)) {
    inferCarouselStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.stickyContainer\.style\./.test(actionId)) {
    inferStickyContainerStyleInput(actionId, text, prompt, out);
  }
  if (/^editor\.flexibleSections\./.test(actionId)) {
    inferFlexibleSectionsStyleInput(actionId, text, prompt, out);
  }
  if (actionId === 'editor.list.options.itemTitle.fontSize') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt))?\b/);
    if (match) out.value = match[1];
  }
  if (actionId === 'launch.analytics.pixel.apply') {
    if (/tiktok/.test(text)) out.pixelProvider = 'tiktok';
    else if (/facebook|meta|фейсбук/.test(text)) out.pixelProvider = 'facebook';
    const idMatch = text.match(/\b([a-z]{1,4}[-_])?\d{4,}\b/i);
    if (idMatch) out.pixelId = idMatch[0];
  }
  return out;
}

function inferActionBarTextStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'fontSize' || leaf === 'lineHeight') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'color') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'fontWeight') {
    if (/\b([1-9]00)\b/.test(text)) out.value = text.match(/\b([1-9]00)\b/)[1];
    else if (/жирн|bold/.test(text)) out.value = '700';
    else if (/обычн|normal|regular/.test(text)) out.value = '400';
    return;
  }
  if (leaf === 'textAlign') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    return;
  }
  if (leaf === 'fontFamily') {
    const match = prompt.match(/\b(Inter|Roboto|Arial|Helvetica|Montserrat|Poppins|SF Pro)\b/i);
    if (match) out.value = match[1];
  }
}

function inferHeaderTextStyleInput(actionId, text, prompt, out) {
  inferContentCopyTextStyleInput(actionId, text, prompt, out);
}

function inferOptionsTitleTextStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'fontSize' || leaf === 'lineHeight' || leaf === 'backgroundColorOpacity' || leaf === 'backgroundCornerRadius') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt|%|процент))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'color' || leaf === 'backgroundColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'fontWeight') {
    if (/\b([1-9]00)\b/.test(text)) out.value = text.match(/\b([1-9]00)\b/)[1];
    else if (/жирн|bold/.test(text)) out.value = '700';
    else if (/обычн|normal|regular/.test(text)) out.value = '400';
    return;
  }
  if (leaf === 'align') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
  }
}

function inferOptionsSubtitleTextStyleInput(actionId, text, prompt, out) {
  inferOptionsTitleTextStyleInput(actionId, text, prompt, out);
}

function inferOptionsItemStateInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'borderWidth' || leaf === 'cornerRadius') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'backgroundColor' || leaf === 'borderColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
  }
}

function inferContentCopyTextStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'fontSize' || leaf === 'lineHeight' || leaf === 'backgroundColorOpacity' || leaf === 'backgroundCornerRadius') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt|%|процент))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'color' || leaf === 'backgroundColor' || leaf === 'textDecorationColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'fontWeight') {
    if (/\b([1-9]00)\b/.test(text)) out.value = text.match(/\b([1-9]00)\b/)[1];
    else if (/жирн|bold/.test(text)) out.value = '700';
    else if (/обычн|normal|regular/.test(text)) out.value = '400';
    return;
  }
  if (leaf === 'align') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    return;
  }
  if (leaf === 'fontFamily') {
    const match = prompt.match(/\b(Inter|Roboto|Arial|Helvetica|Montserrat|Poppins|SF Pro)\b/i);
    if (match) out.value = match[1];
  }
}

function inferTextFieldStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'fontSize' || leaf === 'fontWeight' || leaf === 'lineHeight' || leaf === 'borderWidth') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'typedTextColor' || leaf === 'placeholderColor' || leaf === 'fieldBackgroundColor' || leaf === 'borderColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'align') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    return;
  }
  if (leaf === 'borderType') {
    if (/box|рамк|короб/.test(text)) out.value = 'box';
    else if (/underline|подчерк/.test(text)) out.value = 'underline';
    return;
  }
  if (leaf === 'fontFamily') {
    const match = prompt.match(/\b(Inter|Roboto|Arial|Helvetica|Montserrat|Poppins|SF Pro)\b/i);
    if (match) out.value = match[1];
  }
}

function inferMediaStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'heightPercentage' || leaf === 'cornerRadius') {
    const match = text.match(/\b(\d{1,3})(?:\s*(%|процент|px|пикс|pt))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'repeat') {
    if (/выключ|off|disable|не\s+повтор|не\s+зацикл/.test(text)) out.value = 'false';
    else if (/loop|repeat|зацикл|повтор|replay|on|включ/.test(text)) out.value = 'true';
    return;
  }
  if (leaf === 'topAlignment') {
    if (/navigation|header|шапк|под\s+шап|below/.test(text)) out.value = 'navigationBar';
    else if (/top|сверху|верх|от\s+верх/.test(text)) out.value = 'top';
    return;
  }
  if (leaf === 'bottomAlignment') {
    if (/behind|over|overlay|поверх|за\s+карт|на\s+карт|intro/.test(text)) out.value = 'contentBottom';
    else if (/below|под\s+карт|ниже|без\s+налож|отдельн|above content/.test(text)) out.value = 'contentTop';
    return;
  }
  if (leaf === 'scaleMode') {
    if (/scale\s*to\s*fill|stretch|растян/.test(text)) out.value = 'scaleToFill';
    else if (/aspect\s*fit|\bfit\b|впис|целиком|без\s+обрез|whole/.test(text)) out.value = 'scaleAspectFit';
    else if (/aspect\s*fill|\bfill\b|cover|заполн|обрез/.test(text)) out.value = 'scaleAspectFill';
  }
}

function inferPaywallSubscriptionsInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (actionId.endsWith('.viewKind')) {
    if (/горизонт|horizontal|ряд|side.?by.?side/.test(text)) out.value = 'Horizontal';
    else if (/вертик|vertical|спис|stack/.test(text)) out.value = 'Vertical';
    return;
  }
  if (actionId.endsWith('.productLayout')) {
    if (/right|справа/.test(text)) out.value = 'LabelsCheckbox';
    else if (/hide|hidden|скры|убер|без/.test(text)) out.value = 'SubscriptionListItemType1';
    else if (/left|слева/.test(text)) out.value = 'CheckboxLabels';
    return;
  }
  if (
    actionId.endsWith('.startColumnWidthPercentage')
    || /^editor\.paywallSubscriptions\.(itemPadding|listPadding)\./.test(actionId)
    || leaf === 'fontSize'
    || leaf === 'lineHeight'
    || leaf === 'backgroundColorOpacity'
    || leaf === 'backgroundCornerRadius'
    || leaf === 'borderWidth'
    || leaf === 'cornerRadius'
  ) {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt|%|процент))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (
    leaf === 'backgroundColor'
    || leaf === 'borderColor'
    || leaf === 'color'
    || leaf === 'checkedColor'
    || leaf === 'uncheckedColor'
  ) {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    else if (/зелен|green/.test(text)) out.value = '#22c55e';
    else if (/сер|gray|grey/.test(text)) out.value = '#a1a1aa';
    return;
  }
  if (leaf === 'fontWeight') {
    if (/\b([1-9]00)\b/.test(text)) out.value = text.match(/\b([1-9]00)\b/)[1];
    else if (/жирн|bold/.test(text)) out.value = '700';
    else if (/обычн|normal|regular/.test(text)) out.value = '400';
    return;
  }
  if (leaf === 'align') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    return;
  }
  if (leaf === 'fontFamily') {
    const match = prompt.match(/\b(Inter|Roboto|Arial|Helvetica|Montserrat|Poppins|SF Pro)\b/i);
    if (match) out.value = match[1];
  }
}

function inferRollerStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (['labelFontSize', 'labelFontWeight', 'containerBorderWidth', 'containerCornerRadius'].includes(leaf)) {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (['labelColor', 'containerBackgroundColor', 'containerBorderColor'].includes(leaf)) {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'labelAlign') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
  }
}

function inferStepperStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (['timerDuration', 'thickness', 'trackThickness', 'containerHeightPercentage', 'fontSize', 'fontWeight', 'lineHeight', 'backgroundColorOpacity', 'backgroundCornerRadius', 'width', 'height', 'cornerRadius'].includes(leaf)) {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt|%|процент|сек|seconds?))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (['trackColor', 'fillColor', 'color', 'backgroundColor'].includes(leaf)) {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    else if (/зелен|green/.test(text)) out.value = '#22c55e';
    else if (/сер|gray|grey/.test(text)) out.value = '#e5e7eb';
    return;
  }
  if (leaf === 'align') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    return;
  }
  if (leaf === 'scaleMode') {
    if (/scale\s*to\s*fill|stretch|растян/.test(text)) out.value = 'scaleToFill';
    else if (/aspect\s*fit|\bfit\b|впис|целиком|без\s+обрез|whole/.test(text)) out.value = 'scaleAspectFit';
    else if (/aspect\s*fill|\bfill\b|cover|заполн|обрез/.test(text)) out.value = 'scaleAspectFill';
  }
}

function inferCarouselStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (['fontSize', 'fontWeight', 'lineHeight', 'backgroundColorOpacity', 'backgroundCornerRadius', 'width', 'height', 'cornerRadius', 'heightValue'].includes(leaf)) {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt|%|процент))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (['color', 'backgroundColor'].includes(leaf)) {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'align' || leaf === 'verticalAlign') {
    if (/центр|center/.test(text)) out.value = 'center';
    else if (/top|сверху|верх/.test(text)) out.value = 'top';
    else if (/bottom|снизу|низ/.test(text)) out.value = 'bottom';
    else if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    return;
  }
  if (leaf === 'scaleMode') {
    if (/scale\s*to\s*fill|stretch|растян/.test(text)) out.value = 'scaleToFill';
    else if (/aspect\s*fit|\bfit\b|впис|целиком|без\s+обрез|whole/.test(text)) out.value = 'scaleAspectFit';
    else if (/aspect\s*fill|\bfill\b|cover|заполн|обрез/.test(text)) out.value = 'scaleAspectFill';
    return;
  }
  if (leaf === 'heightMode') {
    if (/fixed|px|пикс|точн|фикс/.test(text)) out.value = 'fixed';
    else if (/%|percent|процент/.test(text)) out.value = 'percent';
  }
}

function inferStickyContainerStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'showBackground') {
    if (/выключ|hide|disable|off|убери|скрой/.test(text)) out.value = 'false';
    else if (/включ|show|enable|on|покажи/.test(text)) out.value = 'true';
    return;
  }
  if (leaf === 'opacity') {
    const decimal = text.match(/\b(0\.[0-9]+|1(?:\.0+)?)\b/);
    if (decimal) {
      out.value = decimal[1];
      return;
    }
    const percent = text.match(/\b(\d{1,3})(?:\s*(%|процент|percent))\b/);
    if (percent) {
      out.value = String(Math.max(0, Math.min(100, Number(percent[1]))) / 100);
      return;
    }
    const number = text.match(/\b(\d{1,3})\b/);
    if (number) out.value = String(Math.max(0, Math.min(100, Number(number[1]))) / 100);
    return;
  }
  if (leaf === 'cornerRadius' || leaf === 'borderWidth') {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'backgroundColor' || leaf === 'borderColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
  }
}

function inferFlexibleSectionsStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  const rawSectionId = prompt.match(/\b(section[_-][a-zA-Z0-9_-]+)\b/i);
  if (rawSectionId) out.sectionId = rawSectionId[1];
  const explicitSectionId = prompt.match(/(?:sectionId|section id|section|секц(?:ия|ии)?)[\s:=#-]+([a-zA-Z0-9_-]+)/i);
  const explicitCandidate = explicitSectionId?.[1];
  if (!out.sectionId && explicitCandidate) {
    const candidate = explicitCandidate.toLowerCase();
    const looksLikeId = candidate.startsWith('section') || /[_-]/.test(candidate) || /\d/.test(candidate);
    const isGenericNoun = ['flexible', 'layout', 'фон', 'background', 'color', 'цвет'].includes(candidate);
    if (looksLikeId && !isGenericNoun) out.sectionId = explicitCandidate;
  }

  if (leaf === 'screenScrollable' || leaf === 'sectionScrollable') {
    if (/выключ|off|disable|не\s+скролл|убери|скрой/.test(text)) out.value = 'false';
    else if (/включ|show|enable|on|скролл|scroll|прокрут/.test(text)) out.value = 'true';
    return;
  }
  if (['heightValue', 'flexGrow', 'flexShrink', 'zIndex', 'cornerRadius', 'borderWidth'].includes(leaf)) {
    const match = text.match(/\b(\d{1,3})(?:\s*(px|пикс|pt|%|процент))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'backgroundColor' || leaf === 'borderColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'heightMode') {
    if (/fixed|фикс|px|пикс/.test(text)) out.value = 'fixed';
    else if (/auto|авто/.test(text)) out.value = 'auto';
    else if (/%|percent|процент/.test(text)) out.value = 'percent';
    return;
  }
  if (leaf === 'verticalAlign') {
    if (/top|сверху|верх/.test(text)) out.value = 'top';
    else if (/bottom|снизу|низ/.test(text)) out.value = 'bottom';
    else if (/центр|center/.test(text)) out.value = 'center';
    return;
  }
  if (leaf === 'horizontalAlign') {
    if (/left|start|слева/.test(text)) out.value = 'start';
    else if (/right|end|справа/.test(text)) out.value = 'end';
    else if (/центр|center/.test(text)) out.value = 'center';
  }
}

function inferPaywallFooterStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (leaf === 'backgroundColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
  }
}

function inferPaywallHeaderStyleInput(actionId, text, prompt, out) {
  const leaf = actionId.split('.').pop();
  if (actionId.includes('.restoreLink.style.')) {
    inferContentCopyTextStyleInput(actionId, text, prompt, out);
    return;
  }
  if (leaf === 'delaySeconds') {
    const match = text.match(/\b(\d{1,2})(?:\s*(сек|seconds?|s))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (leaf === 'iconColor') {
    if (/#[0-9a-f]{3,8}/i.test(prompt)) out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    else if (/бел|white/.test(text)) out.value = '#ffffff';
    else if (/черн|black/.test(text)) out.value = '#000000';
    else if (/желт|yellow/.test(text)) out.value = '#ffc201';
    return;
  }
  if (leaf === 'alignment') {
    if (/right|справа|end/.test(text)) out.value = 'end';
    else if (/left|слева|start/.test(text)) out.value = 'start';
    return;
  }
  if (leaf === 'visibility') {
    if (/таймер|timer|delay|задерж|секунд|после/.test(text)) out.value = 'delayedVisible';
    else if (/show|visible|покажи|сразу|immediate/.test(text)) out.value = 'visible';
  }
}

function guideKeysForAction(actionId) {
  if (/^editor\.actionBar\.primaryButton\.textStyle\./.test(actionId)) {
    return ['screen-editor-action-button', 'screenedit-action-bar-primary-text-styles'];
  }
  if (/^editor\.actionBar\.secondaryButton\.textStyle\./.test(actionId)) {
    return ['screen-editor-action-button', 'screenedit-action-bar-secondary-text-styles'];
  }
  if (/^editor\.header\.backButton\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-header', 'screenedit-header-back-styles'];
  }
  if (/^editor\.header\.skipButton\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-header', 'screenedit-header-skip-styles'];
  }
  if (/^editor\.options\.itemTitle\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-options', 'screenedit-options-title-styles'];
  }
  if (/^editor\.options\.itemSubtitle\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-options', 'screenedit-options-subtitle-styles'];
  }
  if (/^editor\.options\.selectedItem\.style\./.test(actionId)) {
    return ['screen-editor-section-options', 'screenedit-options-selected-item'];
  }
  if (/^editor\.options\.unselectedItem\.style\./.test(actionId)) {
    return ['screen-editor-section-options', 'screenedit-options-unselected-item'];
  }
  if (/^editor\.content\.title\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-content', 'screenedit-copy-block-title-styles'];
  }
  if (/^editor\.content\.subtitle\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-content', 'screenedit-copy-block-subtitle-styles'];
  }
  if (/^editor\.paywallBody\.title\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-body', 'screenedit-paywall-body-title-styles'];
  }
  if (/^editor\.paywallBody\.subtitle\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-body', 'screenedit-paywall-body-subtitle-styles'];
  }
  if (/^editor\.paywallHeader\.closeButton\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      iconColor: 'screenedit-paywall-header-close-icon-color',
      alignment: 'screenedit-paywall-header-close-alignment',
      visibility: 'screenedit-paywall-header-close-visibility',
      delaySeconds: 'screenedit-paywall-header-close-delay',
    };
    return ['screen-editor-section-paywall-header', map[leaf] ?? 'screenedit-paywall-header-close-button'];
  }
  if (/^editor\.paywallHeader\.restoreLink\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      backgroundColor: 'screenedit-paywall-header-restore-background-color',
      fontFamily: 'screenedit-paywall-header-restore-font-family',
      lineHeight: 'screenedit-paywall-header-restore-line-height',
      fontSize: 'screenedit-paywall-header-restore-font-size',
      fontWeight: 'screenedit-paywall-header-restore-font-weight',
      color: 'screenedit-paywall-header-restore-text-color',
      align: 'screenedit-paywall-header-restore-text-align',
      textDecorationColor: 'screenedit-paywall-header-restore-strikethrough-color',
      backgroundColorOpacity: 'screenedit-paywall-header-restore-background-opacity',
      backgroundCornerRadius: 'screenedit-paywall-header-restore-background-radius',
    };
    return ['screen-editor-section-paywall-header', map[leaf] ?? 'screenedit-paywall-header-restore-button'];
  }
  if (/^editor\.paywallFooter\.purchaseButton\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-purchase-text-styles'];
  }
  if (/^editor\.paywallFooter\.autoRenew\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-autorenew-text-styles'];
  }
  if (/^editor\.paywallFooter\.restoreLink\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-restore-text-styles'];
  }
  if (/^editor\.paywallFooter\.termsLink\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-terms-text-styles'];
  }
  if (/^editor\.paywallFooter\.privacyLink\.textStyle\./.test(actionId)) {
    return ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-privacy-text-styles'];
  }
  if (/^editor\.paywallFooter\.style\./.test(actionId)) {
    return ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-background-color'];
  }
  if (/^editor\.paywallMedia\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      topAlignment: 'screenedit-paywall-media-top',
      bottomAlignment: 'screenedit-paywall-media-bottom',
      scaleMode: 'screenedit-paywall-media-scale-mode',
      heightPercentage: 'screenedit-paywall-media-height-percentage',
      cornerRadius: 'screenedit-paywall-media-corner-radius',
      repeat: 'screenedit-paywall-media-repeat',
    };
    return ['screen-editor-section-paywall-media', map[leaf] ?? 'screenedit-paywall-media-scale-mode'];
  }
  if (/^editor\.paywallSubscriptions\.layout\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      viewKind: 'screenedit-paywall-subscriptions-view-kind',
      productLayout: 'screenedit-paywall-subscriptions-product-layout',
      startColumnWidthPercentage: 'screenedit-paywall-subscriptions-column-layout',
    };
    return ['screen-editor-section-paywall-subscriptions', map[leaf] ?? 'screenedit-paywall-subscriptions-items'];
  }
  if (/^editor\.paywallSubscriptions\.selectedItem\.style\./.test(actionId)) {
    return ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-selected-state'];
  }
  if (/^editor\.paywallSubscriptions\.unselectedItem\.style\./.test(actionId)) {
    return ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-unselected-state'];
  }
  if (/^editor\.paywallSubscriptions\.itemPadding\./.test(actionId)) {
    return ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-item-padding'];
  }
  if (/^editor\.paywallSubscriptions\.listPadding\./.test(actionId)) {
    return ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-list-padding'];
  }
  if (/^editor\.paywallSubscriptions\.(planName|planNote|price|billingPeriod)\.textStyle\./.test(actionId)) {
    const element = actionId.split('.')[2];
    const map = {
      planName: 'screenedit-paywall-subscriptions-top-start-label',
      planNote: 'screenedit-paywall-subscriptions-bottom-start-label',
      price: 'screenedit-paywall-subscriptions-top-end-label',
      billingPeriod: 'screenedit-paywall-subscriptions-bottom-end-label',
    };
    return ['screen-editor-section-paywall-subscriptions', map[element] ?? 'screenedit-paywall-subscriptions-items'];
  }
  if (/^editor\.paywallSubscriptions\.checkbox\.style\./.test(actionId)) {
    return ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-checkbox'];
  }
  if (/^editor\.textField\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      typedTextColor: 'screenedit-text-field-text-color',
      fieldBackgroundColor: 'screenedit-text-field-background-color',
      borderColor: 'screenedit-text-field-border-color',
      borderWidth: 'screenedit-text-field-border-width',
      borderType: 'screenedit-text-field-border-type',
      fontFamily: 'screenedit-text-field-font-family',
      fontSize: 'screenedit-text-field-font-size',
      fontWeight: 'screenedit-text-field-font-weight',
      lineHeight: 'screenedit-text-field-line-height',
      align: 'screenedit-text-field-text-align',
      placeholderColor: 'screenedit-text-field-placeholder-color',
    };
    return ['screen-editor-section-text-field', map[leaf] ?? 'screenedit-text-field-font-size'];
  }
  if (/^editor\.media\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      topAlignment: 'screenedit-media-top-alignment',
      scaleMode: 'screenedit-media-scale-mode',
      heightPercentage: 'screenedit-media-height-percentage',
      cornerRadius: 'screenedit-media-corner-radius',
      repeat: 'screenedit-media-video-repeat',
    };
    return ['screen-editor-section-media', map[leaf] ?? 'screenedit-media-scale-mode'];
  }
  if (/^editor\.roller\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      labelFontSize: 'screenedit-roller-label-font-size',
      labelFontWeight: 'screenedit-roller-label-font-weight',
      labelColor: 'screenedit-roller-label-text-color',
      labelAlign: 'screenedit-roller-label-text-align',
      containerBackgroundColor: 'screenedit-roller-container-background-color',
      containerBorderWidth: 'screenedit-roller-border-width',
      containerBorderColor: 'screenedit-roller-border-color',
      containerCornerRadius: 'screenedit-roller-border-radius',
    };
    return ['screen-editor-section-roller', map[leaf] ?? 'screenedit-roller-label-font-size'];
  }
  if (/^editor\.stepper\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      timerDuration: 'screenedit-stepper-timer-duration',
      trackColor: 'screenedit-stepper-track-color',
      fillColor: 'screenedit-stepper-fill-color',
      thickness: 'screenedit-stepper-thickness',
      trackThickness: 'screenedit-stepper-track-thickness',
      containerHeightPercentage: 'screenedit-stepper-container-height',
    };
    return ['screen-editor-section-stepper', map[leaf] ?? 'screenedit-stepper-track-color'];
  }
  if (/^editor\.stepper\.(title|subtitle|description)\.textStyle\./.test(actionId)) {
    const element = actionId.split('.')[2];
    return ['screen-editor-section-stepper', `screenedit-stepper-${element}-styles`];
  }
  if (/^editor\.stepper\.image\.style\./.test(actionId)) {
    return ['screen-editor-section-stepper', 'screenedit-stepper-image-styles'];
  }
  if (/^editor\.carousel\.(title|subtitle|detail)\.textStyle\./.test(actionId)) {
    const element = actionId.split('.')[2];
    return ['screen-editor-section-carousel', `screenedit-carousel-${element}-styles`];
  }
  if (/^editor\.carousel\.image\.style\./.test(actionId)) {
    return ['screen-editor-section-carousel', 'screenedit-carousel-image-styles'];
  }
  if (/^editor\.carousel\.imageContainer\.style\./.test(actionId)) {
    return ['screen-editor-section-carousel', 'screenedit-carousel-image-container'];
  }
  if (/^editor\.carousel\.textContainer\.style\./.test(actionId)) {
    return ['screen-editor-section-carousel', 'screenedit-carousel-text-container'];
  }
  if (/^editor\.stickyContainer\.style\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      showBackground: 'screenedit-sticky-container-show-background',
      backgroundColor: 'screenedit-sticky-container-background-color',
      opacity: 'screenedit-sticky-container-opacity',
      cornerRadius: 'screenedit-sticky-container-corner-radius',
      borderWidth: 'screenedit-sticky-container-border-width',
      borderColor: 'screenedit-sticky-container-border-color',
    };
    return ['screen-editor-section-sticky-container', map[leaf] ?? 'screenedit-sticky-container-background-color'];
  }
  if (/^editor\.flexibleSections\.screen\./.test(actionId)) {
    return ['screen-editor-section-flexible-sections', 'screenedit-flexible-sections-screen-scrollable'];
  }
  if (/^editor\.flexibleSections\.section\.layout\./.test(actionId)) {
    const leaf = actionId.split('.').pop();
    const map = {
      heightMode: 'screenedit-flexible-sections-height-mode',
      heightValue: 'screenedit-flexible-sections-height-value',
      flexGrow: 'screenedit-flexible-sections-flex-grow',
      flexShrink: 'screenedit-flexible-sections-flex-shrink',
      sectionScrollable: 'screenedit-flexible-sections-scrollable',
      zIndex: 'screenedit-flexible-sections-z-index',
      backgroundColor: 'screenedit-flexible-sections-background-color',
      cornerRadius: 'screenedit-flexible-sections-corner-radius',
      borderWidth: 'screenedit-flexible-sections-border-width',
      borderColor: 'screenedit-flexible-sections-border-color',
      verticalAlign: 'screenedit-flexible-sections-vertical-alignment',
      horizontalAlign: 'screenedit-flexible-sections-horizontal-alignment',
    };
    return ['screen-editor-section-flexible-sections', map[leaf] ?? 'screenedit-flexible-sections-background-color'];
  }
  const map = {
    'launch.funnel.create': ['onboarding-list-create', 'onboarding-wizard-basic-info'],
    'launch.analytics.pixel.apply': ['analytics-add-provider', 'analytics-provider-config'],
    'editor.actionBar.primaryButton.label': ['screen-editor-action-button', 'screenedit-action-bar-primary-label'],
    'editor.actionBar.primaryButton.backgroundColor': ['screen-editor-action-button', 'screenedit-action-bar-primary-container'],
    'editor.screen.backgroundColor': ['screen-editor-section-background', 'screenedit-backdrop-solid-color'],
    'launch.paywallProducts.create': ['paywall-products-list'],
    'editor.paywall.attachProduct': ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-items'],
    'editor.list.options.itemTitle.fontSize': ['screen-editor-section-options', 'screenedit-options-title-styles'],
    'launch.publish': ['webplacement-publish-url'],
    'handoff.stripe.connect': ['integrations-stripe-connect-section', 'stripe-connect-oauth-guidance'],
    'handoff.domain.dns': ['integrations-custom-domain-section', 'custom-domain-dns-setup'],
  };
  return map[actionId] ?? [];
}

function resolveGuideKeysFromPrompt(prompt, guideEvidence, teachReference) {
  const text = normalize(prompt);
  const rules = [
    { re: /(?=.*(соедин|связ|подключ|connect|edge|edges|transition|переход))(?=.*(экран|screen|node|узел|канвас|canvas|flow|воронк|funnel))/, guideKeys: ['canvas-connect-screens'] },
    { re: /(?=.*(канвас|canvas|flow))(?=.*(соедин|связ|edge|transition|переход))/, guideKeys: ['canvas-overview', 'canvas-connect-screens'] },
    { re: /(?=.*(канвас|canvas|flow))(?=.*(добав|add|созд|create))(?=.*(экран|screen|node|узел))/, guideKeys: ['canvas-add-screen'] },
    { re: /(?=.*(канвас|canvas|flow))(?=.*(где|where|откр|open|найти|show|покаж))/, guideKeys: ['canvas-overview'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(video|видео|ролик|clip))(?=.*(добав|добавить|встав|загруз|upload|add|attach|постав|выбрать|choose|set))/, guideKeys: ['screen-editor-section-paywall-media', 'screenedit-paywall-media-enable', 'screenedit-paywall-media-kind', 'screenedit-paywall-media-video'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(video|видео|ролик|clip|featured media|hero media|медиа))/, guideKeys: ['screen-editor-section-paywall-media', 'screenedit-paywall-media-kind', 'screenedit-paywall-media-video'] },
    { re: /(?=.*(video|видео|ролик|clip))(?=.*(добав|добавить|встав|загруз|upload|add|attach|постав|выбрать|choose|set))(?=.*(спис|list|вариант|option|экран|screen|медиа|media|картин|image|photo))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-kind', 'screenedit-media-video-upload'] },
    { re: /(?=.*(video|видео|ролик|clip))(?=.*(спис|list|вариант|option))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-kind', 'screenedit-media-video-upload'] },
    { re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(высот|height|процент|%))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-height-percentage'] },
    { re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(скруг|round|radius|угл|corner))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-corner-radius'] },
    { re: /(?=.*(video|видео))(?=.*(loop|repeat|зацикл|повтор|replay))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-video-repeat'] },
    { re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(fill|fit|cover|scale|aspect|заполн|впис|растян|обрез))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-scale-mode'] },
    { re: /(?=.*(картин|изображ|медиа|media|image|photo|video|видео))(?=.*(начина|сверху|top|navigation|header|шапк|верх))/, guideKeys: ['screen-editor-section-media', 'screenedit-media-top-alignment'] },
    { re: /(?=.*(колес|wheel|roller|picker))(?=.*(шрифт|font|цвет|color|фон|background|рамк|border|скруг|radius|выравн|align))/, guideKeys: ['screen-editor-section-roller', 'screenedit-roller-label-text-color'] },
    { re: /(?=.*(stepper|progress|прогресс|степпер|шаги))(?=.*(fill|заполн|залив|progress bar))(?=.*(цвет|color|#[0-9a-f]{3,8}))/, guideKeys: ['screen-editor-section-stepper', 'screenedit-stepper-fill-color'] },
    { re: /(?=.*(stepper|progress|прогресс|степпер|шаги))(?=.*(track|трек|фон))(?=.*(цвет|color|#[0-9a-f]{3,8}))/, guideKeys: ['screen-editor-section-stepper', 'screenedit-stepper-track-color'] },
    { re: /(?=.*(stepper|progress|прогресс|степпер|шаги))(?=.*((?<!под)заголов|title|подзаголов|subtitle|описан|description|картин|image|photo|изображ|timer|duration|длитель|время|толщ|thickness))/, guideKeys: ['screen-editor-section-stepper', 'screenedit-stepper-title-styles'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(close|закры|крест|x\b))(?=.*(цвет|color|align|сторон|таймер|timer|задерж|visible|visibility))/, guideKeys: ['screen-editor-section-paywall-header', 'screenedit-paywall-header-close-button'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(header|шапк|верх))(?=.*(restore|восстанов|покупк))(?=.*(шрифт|font|цвет|color|размер|size|типограф|style|фон|background|выравн|align))/, guideKeys: ['screen-editor-section-paywall-header', 'screenedit-paywall-header-restore-font-size'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(footer|футер|низ|нижн|bottom))(?=.*(фон|background|fill))/, guideKeys: ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-background-color'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(purchase|buy|subscribe|покуп|купить|подпис|кноп))(?=.*(шрифт|font|типограф|букв|text style|стил.*текст|цвет|color))/, guideKeys: ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-purchase-text-styles'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(auto.?renew|авто.?прод|renewal|автоспис|продлен))/, guideKeys: ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-autorenew-text-styles'] },
    { re: /(?=.*(paywall|пейвол|оплат|тариф))(?=.*(restore|terms|privacy|восстанов|услов|политик|конфиденц))/, guideKeys: ['screen-editor-section-paywall-footer', 'screenedit-paywall-footer-privacy-text-styles'] },
    { re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(цен|price))(?=.*(шрифт|font|цвет|color|размер|size|типограф|style))/, guideKeys: ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-top-end-label'] },
    { re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(назван|name|title|описан|note|description))(?=.*(шрифт|font|цвет|color|размер|size|типограф|style))/, guideKeys: ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-top-start-label'] },
    { re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(выбран|selected|active|обычн|unselected|карточ|card))(?=.*(фон|background|рамк|border|скруг|radius|style|цвет|color))/, guideKeys: ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-selected-state'] },
    { re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(checkbox|чекбокс|галоч|выбор))/, guideKeys: ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-checkbox'] },
    { re: /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|subscription))(?=.*(вертик|vertical|горизонт|horizontal|ряд|спис|layout|arrangement))/, guideKeys: ['screen-editor-section-paywall-subscriptions', 'screenedit-paywall-subscriptions-view-kind'] },
    { re: /(?=.*(кноп|button))(?=.*(шрифт|font|типограф|букв|text style|стил.*текст))/, guideKeys: ['screen-editor-action-button', 'screenedit-action-bar-primary-text-styles'] },
    { re: /(шрифт|font|букв|размер|цвет|color).*((?<!под)заголов|title).*(экран|screen|page|контент|content)|((?<!под)заголов|title).*(экран|screen|page|контент|content).*(шрифт|font|букв|размер|цвет|color)/, guideKeys: ['screen-editor-section-content', 'screenedit-copy-block-title-styles'] },
    { re: /(шрифт|font|букв|размер|цвет|color).*(подзаголов|subtitle).*(экран|screen|page|контент|content)|(подзаголов|subtitle).*(экран|screen|page|контент|content).*(шрифт|font|букв|размер|цвет|color)/, guideKeys: ['screen-editor-section-content', 'screenedit-copy-block-subtitle-styles'] },
    { re: /(шрифт|font|букв|размер|цвет|color).*(subtitle|подзаголов|описан|description).*(ячей|вариант|list|option)|(subtitle|подзаголов|описан|description).*(ячей|вариант|list|option).*(шрифт|font|букв|размер|цвет|color)/, guideKeys: ['screen-editor-section-options', 'screenedit-options-subtitle-styles'] },
    { re: /(шрифт|font|букв).*(ячей|вариант|list|option)/, guideKeys: ['screen-editor-section-options', 'screenedit-options-title-styles'] },
    { re: /(фон|background|цвет|картинк|photo).*(экран|screen)/, guideKeys: ['screen-editor-section-background', 'screenedit-backdrop-type'] },
    { re: /(кноп|button).*(цвет|вид|текст|label)/, guideKeys: ['screen-editor-action-button', 'screenedit-action-bar-primary-container'] },
    { re: /(publish|опублик|ссылк|link)/, guideKeys: ['webplacement-publish-url'] },
    { re: /(созд|create).*(воронк|funnel)/, guideKeys: ['onboarding-list-create', 'onboarding-wizard-basic-info'] },
  ];
  for (const rule of rules) {
    if (rule.re.test(text)) return rule.guideKeys;
  }
  const probe = (teachReference.fieldQuestionProbes ?? []).find(item => phraseScore(text, normalize(item.query)) >= 2);
  if (probe?.expected?.articleAlias === 'help-options-list-single') {
    return ['screen-editor-section-options', 'screenedit-options-title-styles'];
  }
  const scored = (guideEvidence.guides ?? [])
    .map(guide => ({
      guideKey: guide.guideKey,
      score: phraseScore(text, normalize([
        guide.name,
        guide.journeyStep,
        guide.userNeed,
        ...(guide.sections ?? []).flatMap(section => [section.title, section.description]),
      ].filter(Boolean).join(' '))),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.guideKey);
  return scored.length ? scored : ['onboarding-list-create'];
}

function scenarioIdForPrompt(prompt, action) {
  if (action?.id === 'launch.funnel.create') return 'create-funnel';
  if (action?.id === 'launch.analytics.pixel.apply') return 'add-fb-pixel';
  if (action?.id === 'editor.actionBar.primaryButton.label') return 'configure-actions';
  if (action?.id === 'editor.actionBar.primaryButton.backgroundColor') return 'configure-actions';
  if (/^editor\.actionBar\.(primary|secondary)Button\.textStyle\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.header\.(backButton|skipButton)\.textStyle\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.options\.item(Title|Subtitle)\.textStyle\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.options\.(selectedItem|unselectedItem)\.style\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.content\.(title|subtitle)\.textStyle\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.paywallBody\.(title|subtitle)\.textStyle\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.paywallHeader\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.paywallFooter\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.paywallMedia\.style\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.paywallSubscriptions\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.media\.style\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.stepper\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.carousel\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.stickyContainer\.style\./.test(action?.id ?? '')) return 'change-setting';
  if (/^editor\.flexibleSections\./.test(action?.id ?? '')) return 'change-setting';
  if (action?.id === 'editor.screen.backgroundColor') return 'change-setting';
  if (action?.id === 'editor.list.options.itemTitle.fontSize') return 'change-setting';
  if (action?.id === 'launch.paywallProducts.create') return 'create-paywall-products';
  if (action?.id === 'editor.paywall.attachProduct') return 'attach-products';
  if (action?.id === 'launch.publish') return 'publish';
  if (action?.id === 'handoff.stripe.connect') return 'connect-stripe';
  if (action?.id === 'handoff.domain.dns') return 'add-custom-domain';
  const text = normalize(prompt);
  if (/publish|опублик|ссылк|link/.test(text)) return 'publish';
  if (/analytics|pixel|аналитик|пиксел/.test(text)) return 'connect-analytics';
  if (/stripe/.test(text)) return 'connect-stripe';
  return 'change-setting';
}

function hasExplicitActionIntent(text) {
  const normalized = String(text ?? '')
    .replace(/сделай\s+(?:скриншот|снимок(?:\s+экрана)?)/gi, ' ')
    .replace(/(?:take|capture|make)\s+(?:a\s+)?screenshot/gi, ' ');
  return /(сделай|создай|подключи|поставь|опубликуй|поменяй|измени|зацикли|скругли|включи|выключи|добавь|загрузи|вставь|прикрепи|можешь|attach|create|publish|set|connect|apply|upload|add|insert|do it|make|change it|change|enable|disable)/i.test(normalized);
}

function hasArticleFetchIntent(text) {
  const normalized = normalize(text);
  return /(?=.*(стать|article|guide|гайд|инструкц|документ))(?=.*(полную|полная|полный|полностью|целик|весь\s+текст|body|content|содержим|дай|пришли|скинь|отправ|открой|покажи|найди|ссылк|url|html|markdown|md|fetch|get|send|open|link))/i.test(normalized);
}

function hasShowIntent(text) {
  return /(покажи|где|куда\s+наж|проведи|show\s+me|show\s+where|where\s+do|walk\s+me|demonstrate|navigate\s+me)/i.test(String(text ?? ''));
}

function phraseScore(text, phrase) {
  if (!text || !phrase) return 0;
  if (text.includes(phrase) || phrase.includes(text)) return 5;
  const tokens = new Set(text.split(/[^a-zа-я0-9#]+/i).filter(token => token.length >= 3));
  let score = 0;
  for (const token of phrase.split(/[^a-zа-я0-9#]+/i)) {
    if (token.length >= 3 && tokens.has(token)) score += 1;
  }
  return score;
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/ё/g, 'е');
}

function hasVideoSourceArg(args) {
  return Boolean(args.videoUrl || args.videoFile || args.localFile || args.file || args.assetUrl);
}
