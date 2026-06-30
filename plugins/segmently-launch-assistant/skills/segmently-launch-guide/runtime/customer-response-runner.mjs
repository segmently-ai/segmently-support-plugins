#!/usr/bin/env node
/**
 * Customer-surface response contract runner for installed Segmently launch skills.
 *
 * This script intentionally reads only shipped skill files. It proves a clean
 * Codex/Claude delivery can answer persona-style beginner questions from
 * references/guide-evidence.json and route "do it" requests through
 * runtime/editor-do-runner.mjs without touching project source.
 *
 * The preferred customer flow is model-selected semantics plus deterministic
 * evidence resolution: pass --guideKeys after the agent selects catalog items.
 * Raw --prompt routing remains a compatibility fallback and regression surface.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectContext } from './session-context.mjs';
import { buildToolPreflight } from './tool-preflight.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let resultPath = null;

function main() {
  const args = parseArgs(process.argv.slice(2));
  resultPath = typeof args.resultPath === 'string' ? args.resultPath : null;
  if (args.help || (!args.guideKeys && !args.prompt && (!args.persona || !args.question))) {
    printHelp();
    return;
  }
  const projectContext = resolveProjectContext(args);
  const effectiveArgs = argsForProjectContext(args, projectContext);

  const personaFlow = readJson('evals/persona-flow-evals.json');
  const guideEvidence = readJson('references/guide-evidence.json');
  const helpArticleReference = readJson('references/help-article-reference.json');
  const teachReference = readJson('references/teach-reference.json');
  const scenarios = readJson('references/scenarios.matrix.json');
  const actions = readJson('runtime/do-action-reference.json');
  const helpArticlesByAlias = new Map((helpArticleReference.articles ?? []).map(article => [article.alias, article]));

  const promptResolution = args.guideKeys
    ? resolveSelectedQuestion(args.prompt, effectiveArgs)
    : args.prompt
    ? resolvePromptQuestion(args.prompt, effectiveArgs, { guideEvidence, teachReference, scenarios, actions })
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
    sessionContext: buildSessionContextContract(projectContext),
    action: null,
    show: null,
    articleFetch: null,
    missingArticleClaimed: false,
    routingPolicy: buildRoutingPolicy(promptResolution, args),
    interactionPolicy: buildInteractionPolicy(),
    completionClaim: question.expectedDo
      ? 'not-completed-until-verification'
      : isShow
        ? 'show-plan-not-executed'
        : isArticleFetch
          ? 'article-fetch-plan-not-executed'
          : 'guidance-only',
  };

  if (question.expectedShow) {
    response.show = showContract(question.expectedShow, guideContracts, effectiveArgs);
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
    response.action = conditionalBrowserDoContract(question.expectedConditionalDo, guideContracts, effectiveArgs);
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

  applySessionContextAnswer(response, projectContext, args.prompt ?? question.text);

  writeJson(response);
}

function argsForProjectContext(args, projectContext) {
  if (!projectContext.projectId || hasArg(args, 'projectId')) return args;
  return {
    ...args,
    projectId: projectContext.projectId,
    projectName: hasArg(args, 'projectName') ? args.projectName : projectContext.projectName,
  };
}

function buildSessionContextContract(projectContext) {
  return {
    schemaVersion: 1,
    contextFile: projectContext.contextFile,
    currentProject: projectContext.currentProject
      ? {
          id: projectContext.currentProject.id,
          name: projectContext.currentProject.name ?? projectContext.currentProject.id,
          source: projectContext.currentProject.source ?? projectContext.projectIdSource,
        }
      : null,
    projectIdSource: projectContext.projectIdSource,
    usingCurrentProject: projectContext.usingStoredProject === true,
    missingCurrentProject: projectContext.missingProject === true,
    askToSetCurrentProject: false,
    setCurrentProjectCommand: 'node runtime/session-context.mjs set-current-project --projectId <projectId> --projectName "<Project name>"',
    readError: projectContext.readError ?? null,
  };
}

function buildRoutingPolicy(promptResolution, args) {
  const selectedByAgent = Boolean(args.guideKeys || args.actionId || args.scenarioId);
  return {
    schemaVersion: 1,
    semanticDecisionOwner: 'agent-model',
    selectedByAgent,
    deterministicRunnerRole: 'validate-selected-catalog-items-execution-boundaries-and-verification',
    rawPromptRoutingRole: selectedByAgent
      ? 'not-used-for-meaning'
      : 'compatibility-fallback-and-regression-surface-not-primary-routing',
    cliExecutionOwner: 'owning-customer-skill',
    mustPreferSelectedCatalog: true,
    mustDelegateCliDoToOwningSkill: true,
    lowLevelCliRunnerRole:
      'dry-run-or-approved-smoke-executor-after-the-agent-has-selected-an-action-and-the-owning-skill-contract',
    resolverKind: promptResolution?.resolver?.kind ?? null,
  };
}

function buildInteractionPolicy() {
  return {
    schemaVersion: 1,
    multiStepActionTool: 'todo-list',
    multiStepActionToolAliases: ['TodoWrite', 'update_plan', 'task-list'],
    askUserQuestionTool: 'ask-user-question',
    askUserQuestionToolAliases: ['AskUserQuestion', 'request_user_input'],
    useTodoListWhen: 'the customer asks for a DO flow that needs multiple tool steps, checks, auth, browser work, or verification',
    useAskUserQuestionWhen: 'required target/value/asset/approval input is missing and cannot be inferred from session context or the customer message',
    fallbackWhenToolUnavailable: 'ask one concise targeted question in prose and continue only after the answer is available',
  };
}

function applySessionContextAnswer(response, projectContext, promptText) {
  if (projectContext.usingStoredProject && projectContext.currentProject?.id) {
    response.answer.contextNotice = localizedProjectContextNotice(projectContext.currentProject, promptText);
  }
  if (responseNeedsProjectId(response) && projectContext.missingProject) {
    response.sessionContext.askToSetCurrentProject = true;
    response.answer.contextSetup = localizedProjectContextSetup(promptText);
  }
}

function responseNeedsProjectId(response) {
  const missingInputs = [
    ...(response.show?.missingInputs ?? []),
    ...(response.action?.missingInputs ?? []),
  ];
  return missingInputs.includes('projectId');
}

function localizedProjectContextNotice(project, promptText) {
  const label = project.name && project.name !== project.id
    ? `"${project.name}" (${project.id})`
    : project.id;
  if (looksRussian(promptText)) {
    return `Использую текущий проект ${label} из контекста Segmently. Если нужен другой проект, пришлите ссылку или id проекта.`;
  }
  return `Using current Segmently project ${label} from the local assistant context. Send another project link or id if this request is for a different project.`;
}

function localizedProjectContextSetup(promptText) {
  if (looksRussian(promptText)) {
    return 'Чтобы не спрашивать projectId каждый раз, пришлите один раз ссылку или id проекта и его название; я сохраню это как текущий проект для следующих вопросов.';
  }
  return 'To avoid asking for projectId each time, send the project link or id and project name once; I will save it as the current project for later questions.';
}

function looksRussian(text) {
  return /[а-яё]/i.test(String(text ?? ''));
}

function resolvePromptQuestion(prompt, args, context) {
  const integrationsCustomDomainGuideKeys = integrationsCustomDomainGuideKeysFromPrompt(prompt);
  const integrationsAnalyticsGuideKeys = integrationsCustomDomainGuideKeys ? null : integrationsAnalyticsGuideKeysFromPrompt(prompt);
  const integrationGuideKeys = integrationsCustomDomainGuideKeys ?? integrationsAnalyticsGuideKeys;
  const variableBindingGuideKeys = integrationGuideKeys ? null : variableBindingGuideKeysFromPrompt(prompt);
  const basicConfigObjectToggleGuideKeys = integrationGuideKeys || variableBindingGuideKeys ? null : basicConfigObjectToggleGuideKeysFromPrompt(prompt);
  const optionsStructureGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys ? null : optionsStructureGuideKeysFromPrompt(prompt);
  const headerNavigationGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys ? null : headerNavigationGuideKeysFromPrompt(prompt);
  const paywallBodyBenefitsGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys ? null : paywallBodyBenefitsGuideKeysFromPrompt(prompt);
  const paywallFooterLinksGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys ? null : paywallFooterLinksGuideKeysFromPrompt(prompt);
  const layoutSpacingGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys || paywallFooterLinksGuideKeys ? null : layoutSpacingGuideKeysFromPrompt(prompt);
  const actionBarRichStyleGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys || paywallFooterLinksGuideKeys || layoutSpacingGuideKeys ? null : actionBarRichStyleGuideKeysFromPrompt(prompt);
  const carouselSlidesTimingGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys || paywallFooterLinksGuideKeys || layoutSpacingGuideKeys || actionBarRichStyleGuideKeys ? null : carouselSlidesTimingGuideKeysFromPrompt(prompt);
  const customHtmlWebEmbedGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys || paywallFooterLinksGuideKeys || layoutSpacingGuideKeys || actionBarRichStyleGuideKeys || carouselSlidesTimingGuideKeys ? null : customHtmlWebEmbedGuideKeysFromPrompt(prompt);
  const mediaAssetLayoutGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys || paywallFooterLinksGuideKeys || layoutSpacingGuideKeys || actionBarRichStyleGuideKeys || carouselSlidesTimingGuideKeys || customHtmlWebEmbedGuideKeys ? null : mediaAssetLayoutGuideKeysFromPrompt(prompt);
  const copyTextValueGuideKeys = integrationGuideKeys || variableBindingGuideKeys || basicConfigObjectToggleGuideKeys || optionsStructureGuideKeys || headerNavigationGuideKeys || paywallBodyBenefitsGuideKeys || paywallFooterLinksGuideKeys || layoutSpacingGuideKeys || actionBarRichStyleGuideKeys || carouselSlidesTimingGuideKeys || customHtmlWebEmbedGuideKeys || mediaAssetLayoutGuideKeys ? null : copyTextValueGuideKeysFromPrompt(prompt);
  const domainOperationGuideKeys = variableBindingGuideKeys ?? basicConfigObjectToggleGuideKeys ?? optionsStructureGuideKeys ?? headerNavigationGuideKeys ?? paywallBodyBenefitsGuideKeys ?? paywallFooterLinksGuideKeys ?? layoutSpacingGuideKeys ?? actionBarRichStyleGuideKeys ?? carouselSlidesTimingGuideKeys ?? customHtmlWebEmbedGuideKeys ?? mediaAssetLayoutGuideKeys ?? copyTextValueGuideKeys;
  let action = domainOperationGuideKeys ? null : resolveActionFromPrompt(prompt, context.actions.actions ?? []);
  const explicitActionIntent = hasExplicitActionIntent(prompt);
  const articleFetchIntent = hasArticleFetchIntent(prompt) && !explicitActionIntent;
  const showIntent = hasShowIntent(prompt) && !explicitActionIntent && !articleFetchIntent;
  let guideKeys = domainOperationGuideKeys ?? (action && (explicitActionIntent || showIntent)
    ? guideKeysForResolvedAction(action)
    : integrationGuideKeys ?? resolveGuideKeysFromPrompt(prompt, context.guideEvidence, context.teachReference));
  if (!action && explicitActionIntent) {
    action = resolveActionForGuideKeys(guideKeys, context.actions.actions ?? []);
    if (action) guideKeys = guideKeysForResolvedAction(action);
  }
  const scenarioId = scenarioIdForPrompt(prompt, action);
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
      copyTextValueBoundary: copyTextValueGuideKeys ? {
        kind: 'copy-or-label-text-value',
        reason: 'The prompt asks to change customer-facing copy/label text, not text style. This needs a locale-aware domain operation or browser flow before it can be executed safely.',
      } : null,
      domainOperationBoundary: variableBindingGuideKeys ? {
        kind: 'variable-binding-domain-operation',
        reason: 'Variable binding changes create or connect structured variable/option/score records and must not be executed as blind scalar patches.',
      } : basicConfigObjectToggleGuideKeys ? {
        kind: 'basic-config-object-toggle-domain-operation',
        reason: 'Basic Config object toggles create or remove nested objects and must not be executed as blind scalar child-field patches.',
      } : optionsStructureGuideKeys ? {
        kind: 'options-structure-domain-operation',
        reason: 'Options structure changes alter selection mode, ordering, layout, checkbox, spacing, or item geometry and must not be executed as blind scalar style patches.',
      } : headerNavigationGuideKeys ? {
        kind: 'header-navigation-domain-operation',
        reason: 'Header navigation/progress changes can create or reconfigure button, progress, layout, icon, inset, and bar structures and must not be executed as blind text-style patches.',
      } : paywallBodyBenefitsGuideKeys ? {
        kind: 'paywall-body-benefits-domain-operation',
        reason: 'Paywall body copy and benefit-list changes alter localized template text and repeated benefit records and must not be executed as blind style or subscription patches.',
      } : paywallFooterLinksGuideKeys ? {
        kind: 'paywall-footer-links-domain-operation',
        reason: 'Paywall footer copy, legal links, restore links, and element ordering require paywall-aware localized text/URL semantics and must not be executed as blind style patches.',
      } : layoutSpacingGuideKeys ? {
        kind: 'layout-spacing-domain-operation',
        reason: 'Content spacing and insets alter per-side layout objects and must not be executed as blind text-style, media, or subscription scalar patches.',
      } : actionBarRichStyleGuideKeys ? {
        kind: 'rich-visual-style-domain-operation',
        reason: 'Action Bar gradients, shadows, motion effects, icons, secondary fills, and rich style objects require structured style validation and must not be executed as blind text-style patches.',
      } : carouselSlidesTimingGuideKeys ? {
        kind: 'carousel-slides-and-timing-domain-operation',
        reason: 'Carousel slide type, slide copy, and duration settings require slide-aware structured updates and must not be executed as blind text-style or image patches.',
      } : customHtmlWebEmbedGuideKeys ? {
        kind: 'custom-html-webembed-domain-operation',
        reason: 'Custom HTML/WebEmbed code, iframe sandboxing, and data sources require code-aware editor operations and must not be executed as blind scalar patches.',
      } : mediaAssetLayoutGuideKeys ? {
        kind: 'media-asset-layout-domain-operation',
        reason: 'Image/media asset changes, hero image layout, option card images, and carousel slide images require asset-aware editor or domain operations with upload/source verification.',
      } : null,
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
      copyTextValueBoundary: Boolean(copyTextValueGuideKeys),
      domainOperationBoundary: variableBindingGuideKeys
        ? 'variable-binding-domain-operation'
        : basicConfigObjectToggleGuideKeys
          ? 'basic-config-object-toggle-domain-operation'
          : optionsStructureGuideKeys
            ? 'options-structure-domain-operation'
            : headerNavigationGuideKeys
              ? 'header-navigation-domain-operation'
              : paywallBodyBenefitsGuideKeys
                ? 'paywall-body-benefits-domain-operation'
                : paywallFooterLinksGuideKeys
                  ? 'paywall-footer-links-domain-operation'
                  : layoutSpacingGuideKeys
                    ? 'layout-spacing-domain-operation'
                    : actionBarRichStyleGuideKeys
                      ? 'rich-visual-style-domain-operation'
                      : carouselSlidesTimingGuideKeys
                        ? 'carousel-slides-and-timing-domain-operation'
                        : customHtmlWebEmbedGuideKeys
                          ? 'custom-html-webembed-domain-operation'
                          : mediaAssetLayoutGuideKeys
                            ? 'media-asset-layout-domain-operation'
                            : null,
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

function resolveSelectedQuestion(prompt, args) {
  const guideKeys = parseListArg(args.guideKeys);
  if (guideKeys.length === 0) fail('--guideKeys was provided but no guide keys were parsed.');
  const scenarioId = typeof args.scenarioId === 'string' && args.scenarioId.trim()
    ? args.scenarioId.trim()
    : null;
  const selectedMode = typeof args.mode === 'string' ? args.mode.trim() : 'teach';
  const actionId = typeof args.actionId === 'string' && args.actionId.trim() ? args.actionId.trim() : null;
  const expectedShow = selectedMode === 'show'
    ? {
        guideKeys,
        requiredInputs: requiredInputsForShow(guideKeys),
        mutation: false,
      }
    : null;
  const expectedArticleFetch = selectedMode === 'article-fetch'
    ? {
        guideKeys,
        requiredInputs: [],
        mutation: false,
      }
    : null;
  const expectedDo = actionId
    ? {
        actionId,
        status: 'selected-by-agent',
        mode: 'selected-by-agent',
        sampleArgs: ['--action', actionId],
      }
    : null;
  return {
    question: {
      id: 'selected-catalog-items',
      phase: scenarioId ?? 'agent-selected-semantics',
      text: prompt ?? 'Agent-selected Segmently support catalog items',
      expectedScenarioId: scenarioId,
      guidance: {
        guideKeys,
        requiresText: true,
        requiresImage: selectedMode === 'show',
      },
      copyTextValueBoundary: null,
      domainOperationBoundary: null,
      expectedDo,
      expectedConditionalDo: null,
      expectedShow,
      expectedArticleFetch,
    },
    resolver: {
      kind: 'agent-selected-semantics',
      actionId,
      guideKeys,
      scenarioId,
      selectionSource: 'model-over-catalog',
      deterministicRole: 'evidence-and-execution-contract-only',
      copyTextValueBoundary: false,
      domainOperationBoundary: null,
      conditionalDo: null,
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
      toolPreflight: buildToolPreflight({}, {
        needsSegmently: true,
        needsBrowser: action.mode === 'e2e',
      }),
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
      routingPolicy: {
        semanticDecisionOwner: 'agent-model',
        rawPromptActionRouting: 'compatibility-fallback-not-primary',
        selectedActionRequiredForPrimaryFlow:
          'For customer-facing CLI DO, select the action semantically from do-action-reference.json first, then call this runner with --guideKeys and --actionId.',
        delegateFirstToOwningSkill: plan.executeWith?.skill ?? action.owningSkill ?? null,
        runnerRole: 'validate-inputs-materialize-contract-and-verification',
      },
      toolPreflight: buildToolPreflight({}, {
        needsSegmently: true,
        needsBrowser: action.mode === 'e2e',
      }),
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
      routingPolicy: {
        semanticDecisionOwner: 'agent-model',
        rawPromptActionRouting: 'compatibility-fallback-not-primary',
        selectedActionRequiredForPrimaryFlow:
          'Ask for the missing inputs after the agent has selected the intended action and owning skill.',
        delegateFirstToOwningSkill: action.owningSkill ?? null,
        runnerRole: 'validate-missing-inputs-and-safe-next-step',
      },
      toolPreflight: buildToolPreflight({}, {
        needsSegmently: true,
        needsBrowser: action.mode === 'e2e',
      }),
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
    toolPreflight: buildToolPreflight(args, {
      needsSegmently: true,
      needsBrowser: true,
    }),
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
  const preferredReference = preferredGuideReference(references);
  const customerVisibleGuideAssets = buildCustomerVisibleGuideAssets(guideContracts);
  const visualCoverage = customerVisibleGuideAssets.visualCoverage;
  const evidencePhrase = visualCoverage.hasAnyImageUrl
    ? 'text and concrete screenshot/image URLs'
    : visualCoverage.hasAnyScreenshotEvidence
      ? 'text and tracked screenshot evidence; no concrete screenshot image URL is currently shipped for this guide'
      : 'text guidance; no screenshot image is currently shipped for this guide';
  return {
    goal: scenario?.title ?? question.phase ?? question.id,
    whereToStart: firstGuide
      ? `${firstGuide.journeyStep}: ${firstGuide.userNeed}`
      : 'Start from the matched Segmently area.',
    customerAnswerStarter: preferredReference
      ? `The built-in Segmently guide/article is available: ${preferredReference.name} (${preferredReference.articleAlias ?? preferredReference.articleId}, reference ${preferredReference.referencePath}). Use its ${evidencePhrase}.`
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
      ? articleReferenceSummaryForVisualCoverage(visualCoverage)
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
      hasScreenshotEvidence: guideHasScreenshotEvidence(guide),
      hasConcreteImageUrl: guideHasConcreteImageUrl(guide),
      visualCoverageStatus: guideVisualCoverageStatus(guide),
      customerSafeMessage: articleAvailabilityMessageForGuide(guide),
    })),
    imageUrls: customerVisibleGuideAssets.imageUrls,
    customerVisibleGuideAssets,
    verification: scenario?.verify ?? null,
    nextStep: teachNextStepForGuides(guideContracts, question),
    showDoOptions: teachShowDoOptionsForGuides(guideContracts, question),
  };
}

function buildCustomerVisibleGuideAssets(guideContracts) {
  const publicArticleLinks = uniqueStrings(guideContracts.map(guide => guide.fullArticleLink).filter(Boolean));
  const imageUrls = uniqueStrings(guideContracts.flatMap(guide => guide.imageUrls ?? []).filter(Boolean));
  const visualCoverage = summarizeGuideVisualCoverage(guideContracts);
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
      hasScreenshotEvidence: guideHasScreenshotEvidence(guide),
      hasConcreteImageUrl: guideHasConcreteImageUrl(guide),
      visualCoverageStatus: guideVisualCoverageStatus(guide),
    }));
  return {
    mustShowInCustomerAnswer: true,
    publicArticleLinks,
    imageUrls,
    visualCoverage,
    guideReferences,
    instruction: customerVisibleGuideAssetsInstruction(visualCoverage),
  };
}

function summarizeGuideVisualCoverage(guideContracts) {
  const guideStatuses = guideContracts.map(guide => ({
    guideKey: guide.guideKey,
    articleAlias: guide.articleAlias ?? null,
    status: guideVisualCoverageStatus(guide),
    hasScreenshotEvidence: guideHasScreenshotEvidence(guide),
    hasConcreteImageUrl: guideHasConcreteImageUrl(guide),
  }));
  const hasAnyImageUrl = guideStatuses.some(item => item.hasConcreteImageUrl);
  const hasAnyScreenshotEvidence = guideStatuses.some(item => item.hasScreenshotEvidence);
  const status = hasAnyImageUrl
    ? 'image-url-available'
    : hasAnyScreenshotEvidence
      ? 'screenshot-evidence-missing-image-url'
      : 'text-only-no-screenshot-evidence';
  return {
    status,
    hasAnyImageUrl,
    hasAnyScreenshotEvidence,
    guideStatuses,
    missingImageReason: hasAnyImageUrl
      ? null
      : hasAnyScreenshotEvidence
        ? 'Screenshot-backed evidence is tracked, but no concrete https image URL is shipped for the matched guide row.'
        : 'The matched guide rows are currently text-only: no screenshot-backed evidence or concrete image URL is shipped.',
  };
}

function guideVisualCoverageStatus(guide) {
  if (guideHasConcreteImageUrl(guide)) return 'image-url-available';
  if (guideHasScreenshotEvidence(guide)) return 'screenshot-evidence-missing-image-url';
  return 'text-only-no-screenshot-evidence';
}

function guideHasConcreteImageUrl(guide) {
  return (guide.imageUrls ?? []).some(Boolean)
    || (guide.textSections ?? []).some(section => Boolean(section.imageUrl));
}

function guideHasScreenshotEvidence(guide) {
  return guide.hasScreenshotEvidence === true
    || guide.sectionScreenshotEvidence === true
    || (guide.textSections ?? []).some(section => section.hasScreenshotEvidence === true);
}

function articleReferenceSummaryForVisualCoverage(visualCoverage) {
  if (visualCoverage.hasAnyImageUrl) {
    return 'Built-in guide/article references are available; answer from the shipped text and concrete screenshot/image evidence. Cite preferredCitation.referencePath or articleAlias when a locator is useful.';
  }
  if (visualCoverage.hasAnyScreenshotEvidence) {
    return 'Built-in guide/article references are available; answer from the shipped text, but no concrete screenshot image URL is shipped for the matched guide. Cite preferredCitation.referencePath or articleAlias and do not imply visible screenshots are available.';
  }
  return 'Built-in guide/article references are available; answer from the shipped text. The matched guide is text-only in the shipped package, so cite the article URL/referencePath and do not imply images are available.';
}

function articleAvailabilityMessageForGuide(guide) {
  const hasArticle = Boolean(guide.fullArticleLink);
  const visualStatus = guideVisualCoverageStatus(guide);
  if (hasArticle && visualStatus === 'image-url-available') {
    return 'A public article URL is available and should be included in the customer answer together with the relevant screenshot URLs.';
  }
  if (hasArticle && visualStatus === 'screenshot-evidence-missing-image-url') {
    return 'A public article URL is available, but no concrete screenshot image URL is shipped for this guide row. Cite the article/reference path and do not imply visible screenshots are available.';
  }
  if (hasArticle) {
    return 'A public article URL is available, but this guide row is currently text-only with no shipped screenshot image URL. Cite the article/reference path and do not imply screenshot evidence.';
  }
  if (visualStatus === 'image-url-available') {
    return 'Built-in guide/article text is available with concrete screenshot image URLs; do not describe the article as missing.';
  }
  if (visualStatus === 'screenshot-evidence-missing-image-url') {
    return 'Built-in guide/article text is available and screenshot evidence is tracked, but no concrete image URL is shipped. Do not describe the article as missing or imply visible screenshots.';
  }
  return 'Built-in guide/article text is available, but this guide row is text-only with no shipped screenshot image URL. Do not describe the article as missing or imply screenshot evidence.';
}

function customerVisibleGuideAssetsInstruction(visualCoverage) {
  if (visualCoverage.hasAnyImageUrl) {
    return 'In the customer answer, include the public article URL when present and include concrete image URLs when present. If no public article URL is present, cite the guide name plus articleAlias/referencePath and still show the image URL(s); do not merely say screenshots exist.';
  }
  if (visualCoverage.hasAnyScreenshotEvidence) {
    return 'In the customer answer, include the public article URL when present and cite the guide name plus articleAlias/referencePath. Do not claim visible screenshots are available until a concrete image URL is shipped.';
  }
  return 'In the customer answer, include the public article URL when present and cite the guide name plus articleAlias/referencePath. This matched guide is text-only in the shipped package, so do not claim screenshot-backed or image evidence.';
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value)).filter(Boolean))];
}

function teachNextStepForGuides(guideContracts, question = null) {
  const guideKeys = guideContracts.map(guide => guide.guideKey);
  const requiredInputs = requiredInputsForShow(guideKeys);
  if (isCopyTextValueGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Content/Options/label field without changing data.',
      'Do not offer generic CLI mutation for this text value. Actual DO needs a locale-aware copy/label domain operation or browser flow that understands the screen kind, option/block identity, language/translation, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact text value and language/locale when the funnel is multilingual.`,
    ].join(' ');
  }
  if (isVariableBindingDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Variable Binding section without changing data.',
      'Do not offer generic CLI mutation for variable binding. Actual DO needs a domain operation or browser flow that understands the variable id/name, option identity, stored value, score target, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact variable/option/score target and desired value.`,
    ].join(' ');
  }
  if (isBasicConfigObjectToggleGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open Basic Config without changing data.',
      'Do not offer generic CLI mutation for this object toggle. Actual DO needs a Basic Config domain operation or browser flow that creates/removes the nested countdown or system-permission object and verifies readback.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the desired on/off state and any required child fields before enabling it.`,
    ].join(' ');
  }
  if (isOptionsStructureDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Options section without changing data.',
      'Do not offer generic CLI mutation for Options structure/items. Actual DO needs a domain operation or browser flow that understands the screen type, selection mode, item identity, layout mode, checkbox semantics, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact Options structure setting and desired value.`,
    ].join(' ');
  }
  if (isHeaderNavigationDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Header section without changing data.',
      'Do not offer generic CLI mutation for Header navigation/progress structure. Actual DO needs a domain operation or browser flow that understands the screen type, header visibility, back/skip button semantics, progress indicator kind, icon asset, layout/insets, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact Header or progress setting and desired value.`,
    ].join(' ');
  }
  if (isPaywallBodyBenefitsDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Paywall Body section without changing data.',
      'Do not offer generic CLI mutation for Paywall Body copy or benefit-list structure. Actual DO needs a Paywall Body domain operation or browser flow that understands localized template text, benefit item identity, repeated item template/style propagation, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact title/subtitle/benefit-list target, target item if any, desired text/value, and locale when the funnel is multilingual.`,
    ].join(' ');
  }
  if (isPaywallFooterLinksDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Paywall Footer section without changing data.',
      'Do not offer generic CLI mutation for Paywall Footer legal links/copy/order. Actual DO needs a Paywall Footer domain operation or browser flow that understands localized template text, legal URL validation, restore/purchase link semantics, element order, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact footer target, desired text/URL/order value, and locale when the funnel is multilingual.`,
    ].join(' ');
  }
  if (isLayoutSpacingDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Content section without changing data.',
      'Do not offer generic CLI mutation for Content spacing/insets. Actual DO needs a domain operation or browser flow that understands the screen type, target element, per-side spacing values, units/defaults, save behavior, and readback verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact title/subtitle/hero spacing target, side(s), and desired value.`,
    ].join(' ');
  }
  if (isActionBarRichStyleDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Action Bar style accordion without changing data.',
      'Do not offer generic CLI mutation for Action Bar rich styles. Actual DO needs a domain operation or browser flow that understands primary vs secondary button identity, gradient/shadow/effect/icon object shape, optional uploaded icon assets, save behavior, and readback/preview verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact Action Bar style target and desired gradient/shadow/effect/container/icon value or asset.`,
    ].join(' ');
  }
  if (isCarouselSlidesTimingDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Carousel section without changing data.',
      'Do not offer generic CLI mutation for Carousel slide content, slide type, or duration. Actual DO needs a domain operation or browser flow that understands slide identity/order, type-specific fields, timing semantics, save behavior, and readback/preview verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact Carousel slide or timing target and the desired text, type, duration, or timing value.`,
    ].join(' ');
  }
  if (isCustomHtmlWebEmbedDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Custom HTML section without changing data.',
      'Do not offer generic CLI mutation for Custom HTML/WebEmbed code, iframe isolation, or data sources. Actual DO needs a domain operation or browser flow that understands code editing, Apply to Preview behavior, data source identity/type, sandboxing, save behavior, and readback/preview verification.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact custom HTML/code/data-source target and the desired HTML/CSS/JS, iframe/sandbox setting, or data source value.`,
    ].join(' ');
  }
  if (isMediaAssetLayoutDomainGuide(guideContracts, question)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the matched Content, Media, Options, or Carousel image control without changing data.',
      'Do not offer generic CLI mutation for image/media assets or image layout. Actual DO needs an asset-aware domain operation or browser flow that understands the screen type, target image slot, upload/source URL, layout semantics, save behavior, CDN/readback verification, and screenshot evidence.',
      `Missing target inputs before live SHOW: ${requiredInputs.join(', ')}. For future DO, also ask for the exact image/media target and either a local file, uploaded asset id, or direct HTTPS URL plus any layout value.`,
    ].join(' ');
  }
  if (isPaywallMediaVideoGuide(guideContracts)) {
    return [
      'Offer SHOW: ask for the editor screen link, or projectId/funnelId/screenId, then open the Paywall Media section without changing data.',
      'Offer DO with boundary: to add the paywall video for the customer, ask for the same target plus a direct video URL or a local file/asset the browser editor can upload. Do not claim the video was uploaded before browser/editor execution and verification.',
      `Missing target inputs before live SHOW/DO: ${requiredInputs.join(', ')}.`,
    ].join(' ');
  }
  if (isStripeSubscriptionSetupGuide(guideContracts)) {
    return [
      'Offer SHOW: ask for the project link or projectId, then show the Stripe connection, Paywall Products, and Paywall Subscriptions areas without changing data.',
      'Offer DO with boundary: Stripe Connect OAuth is a customer handoff, but creating subscription products can be delegated to the Segmently CLI after the customer provides projectId plus product names, prices, billing intervals, currency, and trial settings. Attaching/checking those plans on a Paywall screen also needs funnelId/screenId and verification readback.',
      'Do not claim Stripe was connected or products were created until the OAuth handoff/CLI operation and verification reads have passed.',
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

function teachShowDoOptionsForGuides(guideContracts, question = null) {
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
    do: isCopyTextValueGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'value', 'target-copy-or-label-identity', 'locale-if-multilingual'],
          summary: 'Do not use a generic setFieldValue patch for copy/label text values. Promote this only after a locale-aware CLI domain operation or browser flow has readback and installed-plugin live proof.',
        }
      : isMediaVideoGuide(guideContracts) || isPaywallMediaVideoGuide(guideContracts)
      ? {
          available: 'conditional',
          mutation: true,
          missingInputs: [...requiredInputs, 'videoUrl-or-local-file'],
          summary: 'Can be done through the editor/browser path after the customer provides the target screen and the video asset/source. Do not present it as completed before execution and verification.',
        }
      : isStripeSubscriptionSetupGuide(guideContracts)
      ? {
          available: 'partly-cli-and-handoff',
          mutation: true,
          missingInputs: ['projectId', 'product-names-prices-currency-billing-intervals-trials', 'funnelId-and-screenId-if-attaching-to-paywall'],
          summary: 'Stripe Connect OAuth is a manual customer authorization step. Subscription products can be created through the Segmently CLI when product details are provided; attaching/checking plans on a Paywall screen then needs target funnel/screen context and readback verification.',
        }
      : isVariableBindingDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'variable-or-option-identity', 'desired-binding-or-score-value'],
          summary: 'Do not use a generic setFieldValue patch for variable binding. Promote this only after a CLI domain operation or browser flow can create/connect variable records and verify readback from the editor/export.',
        }
      : isBasicConfigObjectToggleGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'desired-toggle-state', 'required-child-fields-if-enabling'],
          summary: 'Do not use a generic setFieldValue patch for Basic Config object toggles. Promote this only after a domain operation or browser flow can create/remove the nested object and verify readback.',
        }
      : isOptionsStructureDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'options-structure-setting', 'desired-options-structure-value'],
          summary: 'Do not use a generic setFieldValue patch for Options structure/items. Promote this only after a domain operation or browser flow can update selection, layout, checkbox, spacing, or item structure and verify readback.',
        }
      : isHeaderNavigationDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'header-or-progress-setting', 'desired-header-or-progress-value'],
          summary: 'Do not use a generic setFieldValue patch for Header navigation/progress structure. Promote this only after a domain operation or browser flow can update buttons, progress kind/colors/icons, insets, or header layout and verify readback.',
        }
      : isPaywallBodyBenefitsDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'paywall-body-target', 'desired-copy-benefit-or-layout-value', 'locale-if-multilingual'],
          summary: 'Do not use a generic setFieldValue patch for Paywall Body copy or benefit-list structure. Promote this only after a Paywall Body domain operation or browser flow can update localized template text, repeated benefit records/styles, and verify readback.',
        }
      : isPaywallFooterLinksDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'paywall-footer-target', 'desired-text-url-or-order-value', 'locale-if-multilingual'],
          summary: 'Do not use a generic setFieldValue patch for Paywall Footer legal links/copy/order. Promote this only after a Paywall Footer domain operation or browser flow can update localized template text, validated legal URLs, restore/purchase link semantics, order, and verify readback.',
        }
      : isLayoutSpacingDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'layout-spacing-target', 'desired-spacing-values-or-sides'],
          summary: 'Do not use a generic setFieldValue patch for Content spacing/insets. Promote this only after a domain operation or browser flow can update per-side title, subtitle, or hero image spacing and verify readback.',
        }
      : isActionBarRichStyleDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'action-bar-rich-style-target', 'desired-rich-style-value-or-asset'],
          summary: 'Do not use a generic setFieldValue patch for Action Bar gradients, shadows, effects, icons, or secondary button shape/fill. Promote this only after a rich visual style domain operation or browser flow can validate structured style objects/assets and verify readback.',
        }
      : isCarouselSlidesTimingDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'carousel-slide-or-timing-target', 'desired-carousel-content-or-timing-value'],
          summary: 'Do not use a generic setFieldValue patch for Carousel slide content, slide type, or timing. Promote this only after a Carousel domain operation or browser flow can update the correct slide, preserve type-specific fields, and verify readback.',
        }
      : isCustomHtmlWebEmbedDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'custom-html-or-webembed-target', 'desired-html-code-iframe-or-data-source'],
          summary: 'Do not use a generic setFieldValue patch for Custom HTML/WebEmbed code, iframe isolation, or data sources. Promote this only after a code-aware domain operation or browser flow can apply preview, update data sources, and verify readback.',
        }
      : isMediaAssetLayoutDomainGuide(guideContracts, question)
      ? {
          available: 'requires-domain-operation',
          mutation: true,
          missingInputs: [...requiredInputs, 'media-or-image-target', 'image-url-local-file-or-asset-id', 'desired-layout-value-if-any'],
          summary: 'Do not use a generic setFieldValue patch or the video upload runner for image/media assets and image layout. Promote this only after an asset-aware CLI/domain operation or browser flow can upload/select the image, update layout, and verify CDN/readback plus screenshot evidence.',
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
  return /screenedit-media-(video-upload|video-repeat)/.test(keys);
}

function isPaywallMediaVideoGuide(guideContracts) {
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-paywall-media-(video|repeat)/.test(keys);
}

function isStripeSubscriptionSetupGuide(guideContracts) {
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /integrations-stripe-connect-section/.test(keys)
    && /paywall-product-subscription-options/.test(keys)
    && /screenedit-paywall-subscriptions-items/.test(keys);
}

function isCopyTextValueGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'variable-binding-domain-operation') return false;
  if (question?.copyTextValueBoundary?.kind === 'copy-or-label-text-value') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-copy-block-(title|subtitle)-text|screenedit-variable-binding-.*label/.test(keys);
}

function isVariableBindingDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'variable-binding-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screen-editor-section-variable-binding|screenedit-variable-binding-/.test(keys);
}

function isBasicConfigObjectToggleGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'basic-config-object-toggle-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-basic-config-(countdown-enabled|system-permission-enabled)/.test(keys);
}

function isOptionsStructureDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'options-structure-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-options-(selection-mode|max-selections|randomize-order|item-layout|cell-dimensions|max-cell-height|checkbox-(styles|container)|items-spacing|item-paddings|list-paddings)/.test(keys);
}

function isHeaderNavigationDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'header-navigation-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-header-(back-button|skip-button|progress-(indicator-kind|active-color|track-color|title|icon|content-alignment|full-width|respect-buttons|vertical-alignment|insets)|appearance-(height|bg-color|opacity)|insets)/.test(keys);
}

function isPaywallBodyBenefitsDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'paywall-body-benefits-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-paywall-body-(title|subtitle|features|item-state|item-padding|list-padding|bullet-(title|subtitle|image)-styles)/.test(keys)
    && !/screenedit-paywall-body-(title|subtitle)-styles/.test(keys);
}

function isPaywallFooterLinksDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'paywall-footer-links-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-paywall-footer-(purchase-text|purchase-container|purchase-downsale|purchase-padding|autorenew-text|elements-order|autorenew-padding|restore-text|terms-text|terms-uri|privacy-text|privacy-uri|legal-links-padding)/.test(keys)
    && !/screenedit-paywall-footer-(purchase|autorenew|restore|terms|privacy)-text-styles/.test(keys)
    && !/screenedit-paywall-footer-background-color/.test(keys);
}

function isLayoutSpacingDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'layout-spacing-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-copy-block-(title|subtitle|hero)-padding/.test(keys);
}

function isActionBarRichStyleDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'rich-visual-style-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-action-bar-(primary|secondary)-(gradient|shadow|effects|icon)|screenedit-action-bar-secondary-container/.test(keys);
}

function isCarouselSlidesTimingDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'carousel-slides-and-timing-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-carousel-(slide-(type|title|subtitle|detail|duration-range)|duration)/.test(keys);
}

function isCustomHtmlWebEmbedDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'custom-html-webembed-domain-operation') return true;
  const guideKeys = question?.guidance?.guideKeys ?? guideContracts.map(guide => guide.guideKey);
  const firstGuideKey = guideKeys[0] ?? '';
  const isCustomHtmlGuideKey = guideKey => guideKey === 'screen-editor-section-embed' || /^screenedit-embed-(iframe-isolation|html-editor|data-sources)$/.test(guideKey);
  return isCustomHtmlGuideKey(firstGuideKey) || (guideKeys.includes('screen-editor-section-embed') && guideKeys.some(guideKey => /^screenedit-embed-/.test(guideKey)) && guideKeys.every(isCustomHtmlGuideKey));
}

function isMediaAssetLayoutDomainGuide(guideContracts, question = null) {
  if (question?.domainOperationBoundary?.kind === 'media-asset-layout-domain-operation') return true;
  const keys = guideContracts.map(guide => guide.guideKey).join(' ');
  return /screenedit-(copy-block-hero-(url|scale-mode|width|height|height-percentage|corner-radius)|media-(enable|kind|image-upload|padding|gradient-(enable|height|color))|options-image-(container|styles)|carousel-slide-image)/.test(keys);
}

function conditionalBrowserDoForGuideKeys(guideKeys) {
  const keys = guideKeys.join(' ');
  if (/screenedit-paywall-media-(video|repeat)/.test(keys)) {
    return {
      actionId: 'browser.paywallMedia.videoUpload',
      label: 'Add or change the Paywall featured video through the editor',
      targetLabel: 'the Paywall Media section',
      valueInput: 'videoUrl-or-local-file',
    };
  }
  if (/screenedit-media-(video-upload|video-repeat)/.test(keys)) {
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

function preferredGuideReference(references) {
  return references.find(reference => reference.articleSectionUrl)
    ?? references.find(reference => reference.articleAlias?.startsWith('help-'))
    ?? references.find(reference => reference.articleAlias)
    ?? references[0]
    ?? null;
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
      purpose: 'open-headed-browser-focus-control-and-capture-screenshot-without-mutation',
    },
    authPreflight: {
      requiredForExecute: true,
      statusProbe: 'segmently --env <env> auth status',
      login: 'segmently --env <env> auth login',
      browserSeed: 'runtime/show-runner.mjs seeds browser auth from the authorized CLI credential before opening the editor',
      agentInstruction: 'Do not stop at auth_required. Run status, run login if needed, re-check status, then retry the same SHOW runner. Ask the customer only if browser login approval is required.',
    },
    toolPreflight: buildToolPreflight(args, {
      needsSegmently: true,
      needsBrowser: true,
    }),
    browserPlan,
    visibleBrowser: {
      required: true,
      mode: 'headed',
      keepOpenByDefault: true,
      closeOnlyWhenExplicitlyRequested: true,
      customerPurpose: 'The customer must be able to see where to click; screenshot evidence is only the saved artifact.',
    },
    screenshotTarget: 'qa-screenshots/segmently-launch-guide/show-target.png',
    nextStep: missingInputs.length > 0
      ? `Ask for ${missingInputs.join(', ')}, then open the target in a visible headed browser, focus the control, keep the browser open for the customer, and capture a screenshot artifact without changing data.`
      : 'Use playwright-bowser to open the target in a visible headed browser, navigate to the matched setting, keep the browser open for the customer, and capture a screenshot artifact without clicking Save or changing values.',
  };
}

function articleFetchContract(expectedArticleFetch, guideContracts) {
  const references = builtInArticleReferences(guideContracts);
  const preferredReference = preferredGuideReference(references);
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
  plan.push('Open the route in a visible headed browser and keep the window open so the customer can see where to click.');
  plan.push('Capture a screenshot in qa-screenshots/segmently-launch-guide/ as evidence, but do not treat the screenshot as a replacement for the visible SHOW walkthrough.');
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

function parseListArg(value) {
  if (Array.isArray(value)) return value.flatMap(parseListArg);
  return String(value ?? '')
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log([
    'Usage:',
    '  node runtime/customer-response-runner.mjs --persona <personaId> --question <questionId>',
    '  node runtime/customer-response-runner.mjs --prompt "<customer request>" [--projectId <id> ...]',
    '  node runtime/customer-response-runner.mjs --prompt "<customer request>" --guideKeys <key,key> [--scenarioId <id>] [--mode teach|show|article-fetch]',
    '  node runtime/customer-response-runner.mjs --prompt "<customer request>" --resultPath <path>',
    '',
    'Returns a customer-facing response contract built only from shipped skill files.',
    'Preferred mode: the agent selects guideKeys semantically from the shipped catalog, then this runner resolves article URLs, image URLs, SHOW/DO/handoff boundaries, and verification facts.',
    'Raw prompt mode is a compatibility fallback/regression surface and must not be treated as the only semantic authority for unknown customer wording.',
  ].join('\n'));
}

function writeJson(value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (resultPath) {
    mkdirSync(dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, text, 'utf8');
  }
  process.stdout.write(text);
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
    { id: 'launch.analytics.pixel.apply', re: /(?=.*(pixel|пиксел|facebook|tiktok|meta))(?=.*(подключ|connect|add|добав|встав|insert|apply|set|постав))/ },
    { id: 'launch.paywallProducts.create', re: /(тариф|plan|product|товар|price|цена|подпис|subscription).*(созд|create|сдел|добав|add)|(созд|create|сдел|добав|add).*(тариф|plan|product|товар|price|цена|подпис|subscription)/ },
    { id: 'editor.paywall.attachProduct', re: /(постав|attach|connect|привяж).*(тариф|product|plan|price|paywall|оплат)/ },
    { id: 'launch.publish', re: /(опублик|publish|live|рабоч.*ссыл|ссылк.*браузер|web link)/ },
    { id: 'handoff.stripe.connect', re: /(stripe).*(подключ|connect|oauth)|(подключ|connect).*(stripe)/ },
    { id: 'handoff.domain.dns', re: /(?=.*(custom domain|domain|домен|dns))(?=.*(подключ|connect|point|verify|провер|настро|set|setup|add|добав))/ },
  ];
  for (const rule of rules) {
    if (rule.re.test(text)) return actions.find(action => action.id === rule.id) ?? null;
  }
  let best = null;
  for (const action of actions) {
    if (!actionAllowedByPrompt(action.id, text)) continue;
    const score = Math.max(0, ...(action.customerIntent ?? []).map(intent => phraseScore(text, normalize(intent))));
    if (score > (best?.score ?? 0)) best = { action, score };
  }
  return best?.score >= 2 ? best.action : null;
}

function resolveActionForGuideKeys(guideKeys, actions) {
  const wanted = new Set(guideKeys ?? []);
  if (wanted.size === 0) return null;
  const candidates = (actions ?? [])
    .filter(action => action.status === 'supported' && action.mode === 'cli' && wanted.has(action.teachFallback?.articleAlias))
    .sort((a, b) => Number(b.id.startsWith('editor.setting.')) - Number(a.id.startsWith('editor.setting.')));
  return candidates[0] ?? null;
}

function actionAllowedByPrompt(actionId, text) {
  if (actionId === 'launch.paywallProducts.create') {
    return /(?=.*(paywall|пейвол|оплат|подпис|тариф|plan|product|товар|price|цена))(?=.*(созд|create|сдел|make|add|добав))/.test(text);
  }
  return true;
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
  if (/^editor\.setting\./.test(actionId)) {
    inferGenericScalarSettingInput(actionId, text, prompt, out);
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

function inferGenericScalarSettingInput(actionId, text, prompt, out) {
  const guideKey = actionId.replace(/^editor\.setting\./, '');
  if (/#[0-9a-f]{3,8}/i.test(prompt)) {
    out.value = prompt.match(/#[0-9a-f]{3,8}/i)[0];
    return;
  }
  const urlMatch = prompt.match(/https?:\/\/\S+/i);
  if (urlMatch && /(uri|url|link)/.test(guideKey)) {
    out.value = urlMatch[0].replace(/[),.;]+$/, '');
    return;
  }
  if (/(duration|width|height|percentage|radius|opacity|font-size|font-weight|line-height|z-index|delay)/.test(guideKey)) {
    const match = text.match(/\b(\d{1,4})(?:\s*(px|пикс|pt|%|процент|сек|seconds?|s))?\b/);
    if (match) out.value = match[1];
    return;
  }
  if (/(animation-enabled|offline-first|system-permission-enabled|countdown-enabled|auto-focus)/.test(guideKey)) {
    if (/выключ|disable|off|hide|убер|не\s+нужно|без/.test(text)) out.value = 'false';
    else if (/включ|enable|on|show|покаж|ask|reuse|использ/.test(text)) out.value = 'true';
    return;
  }
  if (/(scale-mode)/.test(guideKey)) {
    if (/scale\s*to\s*fill|stretch|растян/.test(text)) out.value = 'scaleToFill';
    else if (/aspect\s*fit|\bfit\b|впис|целиком|без\s+обрез|whole/.test(text)) out.value = 'scaleAspectFit';
    else if (/aspect\s*fill|\bfill\b|cover|заполн|обрез/.test(text)) out.value = 'scaleAspectFill';
    return;
  }
  if (/(permission-type)/.test(guideKey)) {
    if (/notification|push|уведом/.test(text)) out.value = 'notifications';
    else if (/camera|камер/.test(text)) out.value = 'camera';
    else if (/photo|gallery|фото|галер/.test(text)) out.value = 'photos';
    return;
  }
  if (/(countdown-unit)/.test(guideKey)) {
    if (/minute|минут/.test(text)) out.value = 'minutes';
    else if (/second|секунд|сек\b/.test(text)) out.value = 'seconds';
    return;
  }
  if (/(keyboard-type|field-type|border-type|elements-order|kind|alignment)/.test(guideKey)) {
    const quoted = prompt.match(/["'“”«»]([^"'“”«»]{2,40})["'“”«»]/);
    if (quoted) out.value = quoted[1];
  }
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

function guideKeysForResolvedAction(action) {
  const hardcoded = guideKeysForAction(action.id);
  if (hardcoded.length > 0) return hardcoded;
  return action.teachFallback?.articleAlias ? [action.teachFallback.articleAlias] : [];
}

function guideKeysForAction(actionId) {
  if (/^editor\.setting\./.test(actionId)) {
    return [actionId.replace(/^editor\.setting\./, '')];
  }
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
  const stripeSubscriptionSetupGuideKeys = stripeSubscriptionSetupGuideKeysFromPrompt(text);
  if (stripeSubscriptionSetupGuideKeys) return stripeSubscriptionSetupGuideKeys;
  const integrationsCustomDomainGuideKeys = integrationsCustomDomainGuideKeysFromPrompt(text);
  if (integrationsCustomDomainGuideKeys) return integrationsCustomDomainGuideKeys;
  const integrationsAnalyticsGuideKeys = integrationsAnalyticsGuideKeysFromPrompt(text);
  if (integrationsAnalyticsGuideKeys) return integrationsAnalyticsGuideKeys;
  const variableBindingGuideKeys = variableBindingGuideKeysFromPrompt(text);
  if (variableBindingGuideKeys) return variableBindingGuideKeys;
  const basicConfigObjectToggleGuideKeys = basicConfigObjectToggleGuideKeysFromPrompt(text);
  if (basicConfigObjectToggleGuideKeys) return basicConfigObjectToggleGuideKeys;
  const optionsStructureGuideKeys = optionsStructureGuideKeysFromPrompt(text);
  if (optionsStructureGuideKeys) return optionsStructureGuideKeys;
  const headerNavigationGuideKeys = headerNavigationGuideKeysFromPrompt(text);
  if (headerNavigationGuideKeys) return headerNavigationGuideKeys;
  const paywallBodyBenefitsGuideKeys = paywallBodyBenefitsGuideKeysFromPrompt(text);
  if (paywallBodyBenefitsGuideKeys) return paywallBodyBenefitsGuideKeys;
  const paywallFooterLinksGuideKeys = paywallFooterLinksGuideKeysFromPrompt(text);
  if (paywallFooterLinksGuideKeys) return paywallFooterLinksGuideKeys;
  const layoutSpacingGuideKeys = layoutSpacingGuideKeysFromPrompt(text);
  if (layoutSpacingGuideKeys) return layoutSpacingGuideKeys;
  const actionBarRichStyleGuideKeys = actionBarRichStyleGuideKeysFromPrompt(text);
  if (actionBarRichStyleGuideKeys) return actionBarRichStyleGuideKeys;
  const carouselSlidesTimingGuideKeys = carouselSlidesTimingGuideKeysFromPrompt(text);
  if (carouselSlidesTimingGuideKeys) return carouselSlidesTimingGuideKeys;
  const customHtmlWebEmbedGuideKeys = customHtmlWebEmbedGuideKeysFromPrompt(text);
  if (customHtmlWebEmbedGuideKeys) return customHtmlWebEmbedGuideKeys;
  const mediaAssetLayoutGuideKeys = mediaAssetLayoutGuideKeysFromPrompt(text);
  if (mediaAssetLayoutGuideKeys) return mediaAssetLayoutGuideKeys;
  const rules = [
    { re: /(?=.*(текст|copy|wording|надпис))(?=.*((?<!под)заголов|headline|title))(?=.*(экран|screen|page|контент|content|copy))(?=.*(поменяй|измени|замени|напиши|поставь|set|change|write|rename|to|на\b))/, guideKeys: ['screen-editor-section-content', 'screenedit-copy-block-title-text'] },
    { re: /(?=.*(текст|copy|wording|надпис))(?=.*(подзаголов|subtitle|supporting))(?=.*(экран|screen|page|контент|content|copy))(?=.*(поменяй|измени|замени|напиши|поставь|set|change|write|rename|to|на\b))/, guideKeys: ['screen-editor-section-content', 'screenedit-copy-block-subtitle-text'] },
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

function integrationsCustomDomainGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const hasDomainTarget = /(custom domain|domain|домен|dns|cname|a\s*record|aaaa|txt record|запис.*dns|dns.*запис|registrar|регистратор)/.test(text);
  if (!hasDomainTarget) return null;
  if (/(analytics|аналитик|pixel|пиксел|facebook|tiktok|google|ga4|amplitude|mixpanel|posthog)/.test(text)) return null;
  if (/(verify|verification|провер|провери|propagat|распростран|status|статус)/.test(text)) {
    return ['custom-domain-verification', 'custom-domain-dns-setup', 'integrations-custom-domain-section'];
  }
  if (/(dns|cname|a\s*record|aaaa|txt record|record|запис|registrar|регистратор|point|направ|пропис|host|hostname)/.test(text)) {
    return ['custom-domain-dns-setup', 'custom-domain-verification', 'integrations-custom-domain-section'];
  }
  if (/(input|field|поле|ввести|enter|встав|добав|add|domain name|назван.*домен)/.test(text)) {
    return ['custom-domain-domain-input', 'integrations-custom-domain-section', 'custom-domain-dns-setup'];
  }
  return ['integrations-custom-domain-section', 'custom-domain-domain-input', 'custom-domain-dns-setup'];
}

function integrationsAnalyticsGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const hasAnalyticsTarget = /(analytics|аналитик|pixel|пиксел|facebook|tiktok|meta|google analytics|ga4|gtm|amplitude|mixpanel|posthog|tracking|трек(инг|ать)|events?|событ)/.test(text);
  if (!hasAnalyticsTarget) return null;
  if (/(custom html|webembed|web embed|iframe|html editor|html code|child section|data source|segmentlysdk)/.test(text)) return null;
  if (/(custom domain|домен|dns|cname|registrar|регистратор)/.test(text)) return null;

  const keys = [];
  if (/(config|configure|настро|id|measurement|pixel id|token|key|ключ|скрипт|script|custom script|код|встав|insert|постав|set|apply|google analytics|ga4|gtm|amplitude|mixpanel|posthog|facebook|tiktok|meta|pixel|пиксел)/.test(text)) {
    keys.push('analytics-provider-config');
  }
  if (/(add|добав|connect|подключ|new|нов|provider|integration|интеграц|facebook|tiktok|meta|google|ga4|gtm|amplitude|mixpanel|posthog)/.test(text)) {
    keys.push('analytics-add-provider');
  }
  if (/(list|спис|where|где|open|откр|section|раздел|analytics|аналитик)/.test(text) || keys.length === 0) {
    keys.push('integrations-analytics-section', 'analytics-integration-list');
  }
  return uniqueStrings(keys);
}

function copyTextValueGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  if (!hasCopyTextValueIntent(text)) return null;
  if (/(подзаголов|subtitle|supporting)/.test(text) && /(экран|screen|page|контент|content|copy)/.test(text)) {
    return ['screen-editor-section-content', 'screenedit-copy-block-subtitle-text'];
  }
  if (/((?<!под)заголов|headline|title)/.test(text) && /(экран|screen|page|контент|content|copy)/.test(text)) {
    return ['screen-editor-section-content', 'screenedit-copy-block-title-text'];
  }
  if (/(кноп|button)/.test(text)) return null;
  if (/(вариант|option|ячей|list)/.test(text)) return ['screen-editor-section-options'];
  return null;
}

function variableBindingGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  if (!/(переменн|variable|binding|stored value|save.*answer|сохран.*ответ|привяз|связ.*ответ|score|балл|completion score)/.test(text)) {
    return null;
  }
  const section = 'screen-editor-section-variable-binding';
  if (/(score|балл|points|completion score|скоринг|оценк)/.test(text)) {
    if (/(target|куда|какую|which|переменн)/.test(text)) {
      return [section, 'screenedit-variable-binding-score-effects', 'screenedit-variable-binding-score-effect-target-variable'];
    }
    return [section, 'screenedit-variable-binding-score-effects', 'screenedit-variable-binding-score-effect-completion-score'];
  }
  if (/(добав|add|new|нов).*(option|вариант|значен|value|label|лейбл)/.test(text)) {
    return [section, 'screenedit-variable-binding-add-new-option-label'];
  }
  if (/(stored value|значен|label|лейбл|option label|option value|value for this option)/.test(text)) {
    return [section, 'screenedit-variable-binding-option-label'];
  }
  if (/(apply|rebuild|sync|примен|пересобр|заполн|созда.*вариант|вариант.*переменн|option.*variable|items.*variable|привяз.*вариант|связ.*вариант)/.test(text)) {
    return [section, 'screenedit-variable-binding-apply-items-to-variable', 'screenedit-variable-binding-option-item-binding'];
  }
  if (/(описан|description|note|заметк)/.test(text)) {
    return [section, 'screenedit-variable-binding-create-variable-description'];
  }
  if (/(type|тип|kind|boolean|number|string|text|текстов|числ)/.test(text)) {
    return [section, 'screenedit-variable-binding-create-variable-type'];
  }
  if (/(созд|create|new|нов|назван|name|title|переимен|rename|измени|поменяй)/.test(text)) {
    const keys = [section, 'screenedit-variable-binding-create-variable-name'];
    if (/(options|вариант|спис|list|answers|ответ)/.test(text)) {
      keys.push('screenedit-variable-binding-create-variable-options');
    }
    return keys;
  }
  if (/(options|вариант|спис|list|answers|ответ)/.test(text)) {
    return [section, 'screenedit-variable-binding-create-variable-options'];
  }
  return [section, 'screenedit-variable-binding-variable-selector'];
}

function basicConfigObjectToggleGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const section = 'screen-editor-section-basic-config';
  const wantsToggle = /(включ|выключ|добав|убер|enable|disable|turn on|turn off|show|hide|add|remove|сделай|поставь|нужен|need)/.test(text);
  if (/(countdown|обратн.*отсчет|таймер|auto.?advance|авто.*переход)/.test(text)) {
    const asksScalarChild = /(duration|длитель|секунд|seconds|unit|единиц|\b\d{1,4}\b)/.test(text);
    if (wantsToggle && !asksScalarChild) {
      return [section, 'screenedit-basic-config-countdown-enabled'];
    }
  }
  if (/(system permission|permission prompt|permission request|разрешен|системн.*запрос|запрос.*разреш|ask.*permission)/.test(text)) {
    const asksPermissionType = /(type|тип|which|како|notification|push|location|camera|tracking|contacts|photo|permission type)/.test(text);
    if ((wantsToggle || /request|prompt|запрос/.test(text)) && !asksPermissionType) {
      return [section, 'screenedit-basic-config-system-permission-enabled'];
    }
  }
  return null;
}

function optionsStructureGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const section = 'screen-editor-section-options';
  const hasOptionsTarget = /(вариант|option|choice|answer|ответ|ячей|cell|спис|list|items?)/.test(text);
  if (!hasOptionsTarget) return null;

  const hasCheckboxTarget = /(checkbox|чекбокс|галоч|radio|tick)/.test(text);
  const hasStructuralTerm = /(selection|select|выбор|выбрать|pick|max|maximum|максим|лимит|случайн|random|shuffle|перемеш|колон|column|grid|сетка|layout|расклад|структур|spacing|gap|space|расстоя|интервал|padding|отступ|height|высот|cell|ячей|checkbox|чекбокс|галоч|radio|режим|mode)/.test(text);
  if (!hasStructuralTerm) return null;

  const selectedStateStyle = /(selected|unselected|выбран|невыбран|обычн|active|inactive)/.test(text)
    && /(фон|background|рамк|border|скруг|radius|color|цвет|style|стил|#[0-9a-f]{3,8})/.test(text);
  if (selectedStateStyle) return null;

  const optionTextStyle = /((?<!под)заголов|title|подзаголов|subtitle|описан|description|текст|text|label|лейбл|ячей|cell)/.test(text)
    && /(шрифт|font|типограф|размер шрифта|font size|жирн|bold|weight|line height|line-height|выравн|align|цвет|color|#[0-9a-f]{3,8}|фон|background|скруг|radius)/.test(text)
    && !/(padding|отступ|spacing|gap|расстоя|интервал|height|высот|колон|column|grid|сетка|checkbox|чекбокс|галоч|selection|max|maximum|максим|лимит|random|shuffle|перемеш)/.test(text);
  if (optionTextStyle) return null;

  if (/(max|maximum|лимит|максим|не больше|сколько|\b\d+\b).*(выбор|выбрать|selection|select|pick|вариант|option)|(\b\d+\b).*(выбор|выбрать|selection|select|pick)/.test(text)) {
    return [section, 'screenedit-options-selection-mode', 'screenedit-options-max-selections'];
  }
  if (/(random|shuffle|случайн|перемеш|рандом)/.test(text)) {
    return [section, 'screenedit-options-randomize-order'];
  }
  if (hasCheckboxTarget) {
    if (/(цвет|color|style|стил|shape|форма|круг|circle|square|квадрат|padding|отступ|size|размер|рамк|border|фон|background|#[0-9a-f]{3,8})/.test(text)) {
      return [section, 'screenedit-options-checkbox-styles'];
    }
    return [section, 'screenedit-options-checkbox-container'];
  }
  if (/(колон|column|grid|сетка|\b2\b|две|two).*(вариант|option|choice|item|ячей|cell|спис|list)|(вариант|option|choice|item|ячей|cell|спис|list).*(колон|column|grid|сетка|\b2\b|две|two)/.test(text)) {
    return [section, 'screenedit-options-cell-dimensions'];
  }
  if (/(layout|расклад|структур|что.*показы|show.*(image|title|subtitle)|картин.*заголов|image.*title|title only|только.*заголов|показыв).*(вариант|option|choice|item)|(вариант|option|choice|item).*(layout|расклад|структур|что.*показы|show.*(image|title|subtitle)|картин.*заголов|image.*title|title only|только.*заголов|показыв)/.test(text)) {
    return [section, 'screenedit-options-item-layout'];
  }
  if (/(расстоя|spacing|gap|space|интервал).*(вариант|option|choice|item|ячей)|(вариант|option|choice|item|ячей).*(расстоя|spacing|gap|space|интервал)/.test(text)) {
    return [section, 'screenedit-options-items-spacing'];
  }
  if (/(padding|отступ).*(внутр|inside|item|вариант|option|choice|ячей|cell)|(внутр|inside|item|вариант|option|choice|ячей|cell).*(padding|отступ)/.test(text)) {
    return [section, 'screenedit-options-item-paddings'];
  }
  if (/(padding|margin|отступ).*(спис|list|whole|outer|вокруг)|(спис|list|whole|outer|вокруг).*(padding|margin|отступ)/.test(text)) {
    return [section, 'screenedit-options-list-paddings'];
  }
  if (/(height|высот).*(ячей|cell|вариант|option|choice|grid|сетка)|(ячей|cell|вариант|option|choice|grid|сетка).*(height|высот)/.test(text)) {
    return [section, 'screenedit-options-max-cell-height'];
  }
  if (/(selection mode|режим.*выбор|single pick|multi pick|single select|multi select|множествен|один.*выбор|несколько.*выбор)/.test(text)) {
    return [section, 'screenedit-options-selection-mode'];
  }
  return null;
}

function stripeSubscriptionSetupGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const hasStripeTarget = /\bstripe\b|страйп/.test(text);
  const hasSubscriptionTarget = /(подпис|subscription|recurr|billing interval|interval|trial|триал|тариф|plan|price|цена|paywall|пейвол|оплат)/.test(text);
  if (!hasStripeTarget || !hasSubscriptionTarget) return null;

  return [
    'integrations-stripe-connect-section',
    'stripe-connect-oauth-guidance',
    'paywall-products-list',
    'paywall-product-subscription-options',
    'screen-editor-section-paywall-subscriptions',
    'screenedit-paywall-subscriptions-items',
  ];
}

function headerNavigationGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const section = 'screen-editor-section-header';
  const hasHeaderTarget = /(header|шапк|верхн|navbar|nav bar|navigation bar|навигац)/.test(text);
  const hasProgressTarget = /(progress|прогресс|indicator|индикатор|bar|бар|dots|dashes|линия|полоск)/.test(text);
  const hasHeaderButtonTarget = /(кнопк.*назад|назад.*кнопк|back.*button|button.*back|кнопк.*skip|skip.*button|button.*skip|кнопк.*пропуст|пропуст.*кнопк)/.test(text)
    || (hasHeaderTarget && /(back|назад|skip|пропуст)/.test(text));
  if (!hasHeaderTarget && !hasProgressTarget && !hasHeaderButtonTarget) return null;

  const explicitStepperTarget = /(stepper|progress steps|степпер|шаги|экран.*прогресс|progress screen)/.test(text);
  if (explicitStepperTarget && !hasHeaderTarget) return null;

  const headerButtonTextStyle = hasHeaderButtonTarget
    && /(шрифт|font|типограф|text style|стил.*текст|размер|font size|жирн|bold|weight|line height|line-height|выравн|align|цвет|color|фон|background|#[0-9a-f]{3,8})/.test(text)
    && !/(включ|выключ|show|hide|enable|disable|добав|убер|remove|label|лейбл|надпис|текст кнопк|button text)/.test(text);
  if (headerButtonTextStyle) return null;

  const stepperFillStyle = hasProgressTarget
    && !hasHeaderTarget
    && /(fill|заполн|залив|track|трек|progress bar)/.test(text)
    && /(цвет|color|#[0-9a-f]{3,8})/.test(text)
    && !/(active|completed|current|актив|заверш|готов|remaining|остат|неактив)/.test(text);
  if (stepperFillStyle) return null;

  if (/(back|назад|кнопк.*назад|назад.*кнопк)/.test(text)) {
    return [section, 'screenedit-header-back-button'];
  }
  if (/(skip|пропуст|кнопк.*skip|skip.*button|кнопк.*пропуст)/.test(text)) {
    return [section, 'screenedit-header-skip-button'];
  }
  if (hasProgressTarget) {
    if (/(icon|икон|symbol|значок)/.test(text)) {
      if (/(цвет|color|размер|size|style|стил|#[0-9a-f]{3,8})/.test(text)) {
        return [section, 'screenedit-header-progress-icon-styles'];
      }
      return [section, 'screenedit-header-progress-icon'];
    }
    if (/(full.?width|edge.?to.?edge|stretch|растян|на всю|полную ширин|ширин)/.test(text)) {
      return [section, 'screenedit-header-progress-full-width'];
    }
    if (/(respect.*button|clear.*button|не.*перекрыв|обход.*кноп|рядом.*кноп)/.test(text)) {
      return [section, 'screenedit-header-progress-respect-buttons'];
    }
    if (/(inset|padding|margin|отступ|space|spacing|расстоя)/.test(text)) {
      return [section, 'screenedit-header-progress-insets'];
    }
    if (/(vertical|height|top|bottom|центр.*верт|вертик|высот)/.test(text)) {
      return [section, 'screenedit-header-progress-vertical-alignment'];
    }
    if (/(align|alignment|left|right|center|центр|слева|справа|выравн|side|сторон)/.test(text)) {
      return [section, 'screenedit-header-progress-content-alignment'];
    }
    if (/(active|completed|current|актив|заверш|готов|filled).*?(color|цвет|#[0-9a-f]{3,8})|(color|цвет).*?(active|completed|current|актив|заверш|готов|filled)/.test(text)) {
      return [section, 'screenedit-header-progress-active-color'];
    }
    if (/(track|remaining|остат|неактив|фон|background).*?(color|цвет|#[0-9a-f]{3,8})|(color|цвет).*?(track|remaining|остат|неактив|фон|background)/.test(text)) {
      return [section, 'screenedit-header-progress-track-color'];
    }
    if (/(title|text|label|подпис|текст)/.test(text)) {
      if (/(шрифт|font|типограф|размер|font size|жирн|bold|weight|цвет|color|#[0-9a-f]{3,8})/.test(text)) {
        return null;
      }
      return [section, 'screenedit-header-progress-title'];
    }
    return [section, 'screenedit-header-progress-indicator-kind'];
  }
  if (hasHeaderTarget) {
    if (/(height|высот)/.test(text)) {
      return [section, 'screenedit-header-appearance-height'];
    }
    if (/(opacity|transparent|прозрач|see.?through)/.test(text)) {
      return [section, 'screenedit-header-appearance-opacity'];
    }
    if (/(inset|padding|margin|отступ|space|spacing|расстоя)/.test(text)) {
      return [section, 'screenedit-header-insets'];
    }
    if (/(background|фон|залив|bg|color|цвет|#[0-9a-f]{3,8})/.test(text)) {
      return [section, 'screenedit-header-appearance-bg-color'];
    }
  }
  return null;
}

function paywallBodyBenefitsGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  if (!/(paywall|пейвол|оплат|тариф|subscription|подпис)/.test(text)) return null;

  const section = 'screen-editor-section-paywall-body';
  const hasBodyTarget = /(body|контент|copy|тело|headline|title|заголов|subtitle|подзаголов|benefit|feature|bullet|буллет|преимуществ|список преимуществ|чеклист|checklist)/.test(text);
  if (!hasBodyTarget) return null;

  const explicitStyleIntent = /(style|стил|шрифт|font|типограф|размер шрифта|font size|жирн|bold|weight|line height|line-height|выравн|align|цвет|color|#[0-9a-f]{3,8}|фон|background|скруг|radius)/.test(text);
  const structuralOrCopyIntent = /(текст|copy|wording|label|лейбл|надпис|назван|title|headline|subtitle|подзаголов|напиши|поменяй|измени|замени|rename|set|change|write|на\b|\bto\b|добав|add|remove|удал|benefit|feature|bullet|буллет|преимуществ|checklist|item|padding|отступ|spacing|gap|space|layout|image|икон|icon|картин|изображ)/.test(text);
  if (explicitStyleIntent && !/(padding|отступ|spacing|gap|benefit|feature|bullet|буллет|преимуществ|checklist|item|добав|add|remove|удал|текст|copy|wording|label|лейбл|надпис|напиши|поменяй|измени|замени|rename|set|change|write|на\b|\bto\b)/.test(text)) {
    return null;
  }
  if (!structuralOrCopyIntent) return null;

  if (/(subtitle|подзаголов|supporting)/.test(text) && !explicitStyleIntent) {
    return [section, 'screenedit-paywall-body-subtitle'];
  }
  if (/((?<!под)заголов|headline|title)/.test(text) && !explicitStyleIntent) {
    return [section, 'screenedit-paywall-body-title'];
  }
  if (/(padding|отступ|spacing|gap|space)/.test(text)) {
    if (/(list|спис|whole|around|вокруг|outer)/.test(text)) {
      return [section, 'screenedit-paywall-body-list-padding'];
    }
    return [section, 'screenedit-paywall-body-item-padding'];
  }
  if (/(state|selected|unselected|выбран|обычн|active|стейт|checked|unchecked)/.test(text)) {
    return [section, 'screenedit-paywall-body-item-state'];
  }
  if (/(image|икон|icon|картин|изображ)/.test(text)) {
    return [section, 'screenedit-paywall-body-bullet-image-styles'];
  }
  if (/(subtitle|подзаголов|description|описан).*(bullet|feature|benefit|буллет|преимуществ)|(bullet|feature|benefit|буллет|преимуществ).*(subtitle|подзаголов|description|описан)/.test(text)) {
    return [section, 'screenedit-paywall-body-bullet-subtitle-styles'];
  }
  if (/(title|headline|заголов).*(bullet|feature|benefit|буллет|преимуществ)|(bullet|feature|benefit|буллет|преимуществ).*(title|headline|заголов)/.test(text)) {
    return [section, 'screenedit-paywall-body-bullet-title-styles'];
  }
  if (/(benefit|feature|bullet|буллет|преимуществ|checklist|чеклист|список преимуществ|item|пункт)/.test(text)) {
    return [section, 'screenedit-paywall-body-features'];
  }
  return null;
}

function paywallFooterLinksGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  if (!/(paywall|пейвол|оплат|тариф|subscription|подпис|footer|футер|низ|нижн|restore|terms|privacy|legal|autorenew|auto.?renew|renewal|purchase|buy|subscribe|покуп|купить|подпис)/.test(text)) {
    return null;
  }

  const section = 'screen-editor-section-paywall-footer';
  const hasFooterTarget = /(footer|футер|низ|нижн|restore|terms|privacy|legal|autorenew|auto.?renew|renewal|purchase|buy|subscribe|покуп|купить|подпис|кнопк покупки|кнопка покупки|order|порядок|ссылк|link|url|uri|услов|политик|конфиденц)/.test(text);
  if (!hasFooterTarget) return null;
  if (/(header|шапк|верх)/.test(text) && /(restore|восстанов)/.test(text)) return null;

  const styleOnly = /(style|стил|шрифт|font|типограф|размер шрифта|font size|жирн|bold|weight|line height|line-height|выравн|align|цвет|color|#[0-9a-f]{3,8}|фон|background|скруг|radius)/.test(text)
    && !/(text|текст|copy|wording|label|лейбл|надпис|url|uri|link|ссылк|https?:|order|порядок|padding|отступ|spacing|gap|space|downsale|даунсел)/.test(text);
  if (styleOnly) return null;

  if (/(terms|услов|terms of use)/.test(text)) {
    if (/(url|uri|link|ссылк|https?:)/.test(text)) return [section, 'screenedit-paywall-footer-terms-uri'];
    return [section, 'screenedit-paywall-footer-terms-text'];
  }
  if (/(privacy|политик|конфиденц)/.test(text)) {
    if (/(url|uri|link|ссылк|https?:)/.test(text)) return [section, 'screenedit-paywall-footer-privacy-uri'];
    return [section, 'screenedit-paywall-footer-privacy-text'];
  }
  if (/(restore|восстанов)/.test(text)) {
    return [section, 'screenedit-paywall-footer-restore-text'];
  }
  if (/(order|порядок|reorder|перестав|before|after|до |после|button.*text|text.*button|кнопк.*текст|текст.*кнопк)/.test(text)) {
    return [section, 'screenedit-paywall-footer-elements-order'];
  }
  if (/(auto.?renew|autorenew|renewal|авто.?прод|автоспис|продлен)/.test(text)) {
    if (/(padding|отступ|spacing|gap|space)/.test(text)) return [section, 'screenedit-paywall-footer-autorenew-padding'];
    return [section, 'screenedit-paywall-footer-autorenew-text'];
  }
  if (/(legal|ссылк|links|terms|privacy).*(padding|отступ|spacing|gap|space)|(padding|отступ|spacing|gap|space).*(legal|ссылк|links|terms|privacy)/.test(text)) {
    return [section, 'screenedit-paywall-footer-legal-links-padding'];
  }
  if (/(purchase|buy|subscribe|покуп|купить|подпис|кноп)/.test(text)) {
    if (/(downsale|cancel|отказ|даунсел|decline)/.test(text)) return [section, 'screenedit-paywall-footer-purchase-downsale'];
    if (/(padding|отступ|spacing|gap|space)/.test(text)) return [section, 'screenedit-paywall-footer-purchase-padding'];
    if (/(container|box|shape|рамк|обвод|button box|кнопк.*контейнер)/.test(text)) return [section, 'screenedit-paywall-footer-purchase-container'];
    if (/(text|текст|copy|wording|label|лейбл|надпис|напиши|поменяй|измени|замени|rename|set|change|write|на\b|\bto\b)/.test(text)) {
      return [section, 'screenedit-paywall-footer-purchase-text'];
    }
  }
  return null;
}

function layoutSpacingGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const section = 'screen-editor-section-content';
  const hasSpacingIntent = /(padding|margin|inset|отступ|отступы|space around|spacing|расстоя.*вокруг|мест.*вокруг|вокруг|space)/.test(text);
  if (!hasSpacingIntent) return null;
  if (/(header|шапк|верхн|progress|прогресс|вариант|option|choice|ячей|cell|list|спис)/.test(text)) return null;

  const hasContentTarget = /(content|контент|copy|экран|screen|page|title|заголов|headline|subtitle|подзаголов|hero|image|картин|изображ|photo|picture)/.test(text);
  if (!hasContentTarget) return null;
  const hasTextStyleOnlyTarget = /(шрифт|font|типограф|font size|размер шрифта|жирн|bold|weight|line height|line-height|цвет|color|#[0-9a-f]{3,8}|фон|background|скруг|radius)/.test(text)
    && !/(padding|margin|inset|отступ|space around|spacing|вокруг)/.test(text);
  if (hasTextStyleOnlyTarget) return null;

  if (/(подзаголов|subtitle|supporting)/.test(text)) {
    return [section, 'screenedit-copy-block-subtitle-padding'];
  }
  if (/((?<!под)заголов|headline|title)/.test(text)) {
    return [section, 'screenedit-copy-block-title-padding'];
  }
  if (/(hero|image|картин|изображ|photo|picture)/.test(text)) {
    return [section, 'screenedit-copy-block-hero-padding'];
  }
  return null;
}

function actionBarRichStyleGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  if (/(paywall|пейвол|оплат|тариф|subscription|подпис|header|шапк|progress|прогресс)/.test(text)) return null;

  const section = 'screen-editor-section-action-bar';
  const hasButtonTarget = /(action bar|actionbar|cta|кноп|button|continue|next|secondary|primary|main|главн|основн|втор|skip|продолж)/.test(text);
  if (!hasButtonTarget) return null;

  const textStyleOnly = /(шрифт|font|типограф|text style|стил.*текст|размер шрифта|font size|жирн|bold|weight|line height|line-height|выравн|align|цвет текста|text color)/.test(text)
    && !/(gradient|градиент|shadow|тень|motion|effect|анимац|икон|icon|symbol|значок|container|shape|box|fill|фон|background|залив|рамк|border|скруг|radius|padding|отступ)/.test(text);
  if (textStyleOnly) return null;

  const primaryTarget = /(primary|main|главн|основн|continue|next|продолж)/.test(text);
  const secondaryTarget = /(secondary|second|втор|skip|optional|дополн|альтернатив)/.test(text);
  const prefix = secondaryTarget && !primaryTarget ? 'secondary' : 'primary';

  const asksSupportedPrimaryBackground = prefix === 'primary'
    && /(фон|background|fill|залив|цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white)/.test(text)
    && !/(gradient|градиент|shadow|тень|motion|effect|анимац|икон|icon|symbol|значок|container|shape|box|рамк|border|скруг|radius|padding|отступ)/.test(text);
  if (asksSupportedPrimaryBackground) return null;

  if (/(gradient|градиент)/.test(text)) {
    return [section, `screenedit-action-bar-${prefix}-gradient`];
  }
  if (/(shadow|тень)/.test(text)) {
    return [section, `screenedit-action-bar-${prefix}-shadow`];
  }
  if (/(motion|effect|effects|анимац|движен|эффект)/.test(text)) {
    return [section, `screenedit-action-bar-${prefix}-effects`];
  }
  if (/(икон|icon|symbol|значок)/.test(text)) {
    return [section, `screenedit-action-bar-${prefix}-icon`];
  }
  if (prefix === 'secondary' && /(фон|background|fill|залив|цвет|color|#[0-9a-f]{3,8}|желт|yellow|черн|black|бел|white|container|shape|box|рамк|border|скруг|radius|padding|отступ)/.test(text)) {
    return [section, 'screenedit-action-bar-secondary-container'];
  }
  if (/(container|shape|box|рамк|border|скруг|radius|padding|отступ)/.test(text)) {
    return [section, `screenedit-action-bar-${prefix}-container`];
  }
  return null;
}

function carouselSlidesTimingGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const section = 'screen-editor-section-carousel';
  const hasCarouselTarget = /(carousel|карусел|slide|слайд)/.test(text);
  if (!hasCarouselTarget) return null;

  const explicitStyleIntent = /(style|стил|шрифт|font|типограф|размер шрифта|font size|жирн|bold|weight|line height|line-height|выравн|align|цвет|color|#[0-9a-f]{3,8}|фон|background|скруг|radius)/.test(text);
  const asksImageAsset = /(image|photo|picture|картин|изображ|фото)/.test(text)
    && /(добав|add|upload|загруз|attach|встав|replace|замени|url|https?:|asset|source|источник|выб|select|choose)/.test(text)
    && !/(type|тип|kind|template|шаблон)/.test(text);
  if (asksImageAsset) return null;

  if (/(duration|длител|время|timing|тайминг|seconds|секунд|timer|play time|autoplay)/.test(text)) {
    if (/(total|overall|общ|all|whole|весь|full|полная|timer|play time|autoplay)/.test(text)) {
      return [section, 'screenedit-carousel-duration'];
    }
    return [section, 'screenedit-carousel-slide-duration-range'];
  }

  if (/(type|тип|kind|template|шаблон|content type|содержим.*тип|image slide|text slide|картин.*тип|слайд.*картин)/.test(text)) {
    return [section, 'screenedit-carousel-slide-type'];
  }

  const copyIntent = /(текст|copy|wording|label|лейбл|надпис|напиши|поменяй|измени|замени|rename|set|change|write|на\b|\bto\b)/.test(text);
  if (!copyIntent || explicitStyleIntent) return null;

  if (/(subtitle|подзаголов|supporting)/.test(text)) {
    return [section, 'screenedit-carousel-slide-subtitle'];
  }
  if (/(detail|details|extra|дополнитель|описан|description)/.test(text)) {
    return [section, 'screenedit-carousel-slide-detail'];
  }
  if (/((?<!под)заголов|headline|title)/.test(text)) {
    return [section, 'screenedit-carousel-slide-title'];
  }
  if (/(slide|слайд)/.test(text) && /(text|текст|copy|wording|надпис)/.test(text)) {
    return [section, 'screenedit-carousel-slide-title'];
  }

  return null;
}

function customHtmlWebEmbedGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const section = 'screen-editor-section-embed';
  const hasCustomHtmlTarget = /(custom html|custom screen|webembed|web embed|web-embed|embed screen|iframe|html editor|html code|html.*screen|html.*экран|код.*html|кастомн.*html|кастомн.*код|веб.?эмбед|data source|data sources|child section|childsections|getchildsection|segmentlysdk|sandbox|isolation|изолир|песочн|источник.*данн|данн.*html|контент.*html)/.test(text);
  if (!hasCustomHtmlTarget) return null;

  const customDomainOnly = /(custom domain|домен|dns)/.test(text)
    && !/(html|webembed|web embed|iframe|embed|data source|child section|segmentlysdk|код)/.test(text);
  if (customDomainOnly) return null;

  const analyticsOnly = /(analytics|аналитик|pixel|пиксел|ga4|gtm|amplitude|mixpanel|posthog|facebook|tiktok)/.test(text)
    && !/(webembed|web embed|custom html|iframe|html editor|html code|embed screen|child section|data source|segmentlysdk)/.test(text);
  if (analyticsOnly) return null;

  if (/(data source|data sources|child section|childsections|getchildsection|источник.*данн|данн.*html|контент.*html|editable content|редакт.*контент)/.test(text)) {
    return [section, 'screenedit-embed-data-sources'];
  }
  const asksIframeIsolation = /(sandbox|isolation|isolat|песочн|изолир|allow|permission|разреш)/.test(text);
  const asksCodeEdit = /(встав|paste|добав|add|write|set|change|код|html editor|html code|css|javascript|script|snippet|виджет|widget|iframe.*(встав|add)|custom screen)/.test(text);
  if (asksIframeIsolation && !asksCodeEdit) {
    return [section, 'screenedit-embed-iframe-isolation'];
  }
  if (asksCodeEdit || /(html.*screen|html.*экран|iframe)/.test(text)) {
    return [section, 'screenedit-embed-html-editor'];
  }
  if (/(iframe|frame)/.test(text) || asksIframeIsolation) {
    return [section, 'screenedit-embed-iframe-isolation'];
  }
  return [section, 'screenedit-embed-html-editor'];
}

function mediaAssetLayoutGuideKeysFromPrompt(prompt) {
  const text = normalize(prompt);
  const hasImageIntent = /(image|photo|picture|картин|изображ|фото|asset|media|медиа)/.test(text);
  const hasVideoIntent = /(video|видео|ролик|clip)/.test(text);
  const wantsImageInsteadOfVideo = hasImageIntent && hasVideoIntent && /(instead|вместо|замени|switch|переключ)/.test(text);
  const wantsAssetOrLayout = /(добав|add|upload|загруз|attach|встав|set|постав|replace|замени|change|поменяй|select|choose|выб|url|https?:|asset|source|источник|width|ширин|height|высот|size|размер|scale|cover|fit|fill|crop|contain|обрез|впис|заполн|radius|скруг|corner|enable|show|hide|gradient|fade|градиент|затемн|картин|изображ|фото|image|photo|picture)/.test(text);
  if (!hasImageIntent || !wantsAssetOrLayout) return null;

  const asksForArticleOrScreenshotEvidence = /(стать[ьяю]|article|guide|гайд|подсказ|инструкц).*(картин|скрин|screenshot|image|photo)|(картин|скрин|screenshot|image|photo).*(стать[ьяю]|article|guide|гайд|подсказ|инструкц)/.test(text);
  const hasImageSlotTarget = /(hero|featured image|main image|media|медиа|вариант|option|choice|answer|ответ|ячей|cell|card|карточ|item|carousel|карусел|slide|слайд|спис|list|grid|сетка|wheel|колес|picker)/.test(text);
  if (asksForArticleOrScreenshotEvidence && !hasImageSlotTarget) return null;

  const asksSpacing = /(padding|margin|inset|отступ|отступы|space around|spacing|расстоя|вокруг)/.test(text);
  if (asksSpacing) return null;

  const explicitVideoOnly = hasVideoIntent && !wantsImageInsteadOfVideo && !/(image|photo|picture|картин|изображ|фото)/.test(text);
  if (explicitVideoOnly) return null;

  if (/(carousel|карусел|slide|слайд)/.test(text)) {
    return ['screen-editor-section-carousel', 'screenedit-carousel-slide-image'];
  }

  if (/(вариант|option|choice|answer|ответ|ячей|cell|card|карточ|item)/.test(text)
    && !/(screen|экран|media|медиа).*(list|спис)|list|спис.*(screen|экран|media|медиа)/.test(text)) {
    if (/(container|area|box|контейнер|област|зон|позици|position|layout|размер|size|height|width|высот|ширин)/.test(text)) {
      return ['screen-editor-section-options', 'screenedit-options-image-container'];
    }
    return ['screen-editor-section-options', 'screenedit-options-image-styles'];
  }

  if (/(hero|featured image|main image|главн.*картин|верхн.*картин)/.test(text)) {
    const section = 'screen-editor-section-content';
    if (/(scale|cover|fit|fill|crop|contain|обрез|впис|заполн)/.test(text)) {
      return [section, 'screenedit-copy-block-hero-scale-mode'];
    }
    if (/(width|ширин)/.test(text)) {
      return [section, 'screenedit-copy-block-hero-width'];
    }
    if (/(height.*percent|height.*%|высот.*процент|высот.*%|процент)/.test(text)) {
      return [section, 'screenedit-copy-block-hero-height-percentage'];
    }
    if (/(height|высот)/.test(text)) {
      return [section, 'screenedit-copy-block-hero-height'];
    }
    if (/(radius|скруг|corner|угл)/.test(text)) {
      return [section, 'screenedit-copy-block-hero-corner-radius'];
    }
    if (/(url|https?:|upload|загруз|attach|source|источник|asset|добав|add|replace|замени|постав|set|выб)/.test(text)) {
      return [section, 'screenedit-copy-block-hero-url'];
    }
    return [section, 'screenedit-copy-block-hero'];
  }

  if (/(спис|list|grid|сетка|wheel|колес|picker|экран|screen|media|медиа)/.test(text)) {
    const section = 'screen-editor-section-media';
    if (/(enable|show|hide|включ|выключ|показ|скрыт)/.test(text)) {
      return [section, 'screenedit-media-enable'];
    }
    if (/(kind|тип|image or video|фото.*видео|image.*video|вместо.*видео|instead.*video|переключ)/.test(text) || wantsImageInsteadOfVideo) {
      return [section, 'screenedit-media-kind', 'screenedit-media-image-upload'];
    }
    if (/(url|https?:|upload|загруз|attach|source|источник|asset|добав|add|replace|замени|постав|set|выб)/.test(text)) {
      return [section, 'screenedit-media-kind', 'screenedit-media-image-upload'];
    }
    if (/(gradient|fade|градиент|затемн)/.test(text)) {
      if (/(height|высот|size|размер)/.test(text)) return [section, 'screenedit-media-gradient-height'];
      if (/(color|цвет|#[0-9a-f]{3,8})/.test(text)) return [section, 'screenedit-media-gradient-color'];
      return [section, 'screenedit-media-gradient-enable'];
    }
    if (/(padding|margin|отступ)/.test(text)) {
      return [section, 'screenedit-media-padding'];
    }
  }

  return null;
}

function hasCopyTextValueIntent(text) {
  if (!/(текст|copy|wording|label|лейбл|надпис|назван|title|headline|subtitle|подзаголов)/.test(text)) return false;
  if (hasTextStyleIntent(text)) return false;
  return /(поменяй|измени|замени|напиши|поставь|переименуй|set|change|write|rename|на\b|\bto\b)/.test(text);
}

function hasTextStyleIntent(text) {
  return /(шрифт|font|типограф|style|стил|размер|size|цвет|color|#[0-9a-f]{3,8}|жирн|bold|weight|выравн|align|фон|background|скруг|radius|padding|отступ|spacing|line height|line-height)/i.test(text);
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
  if (/^editor\.setting\./.test(action?.id ?? '')) return 'change-setting';
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
  return /(сделай|создай|подключи|поставь|опубликуй|поменяй|измени|зацикли|скругли|включи|выключи|добавь|загрузи|вставь|прикрепи|можешь|attach|create|publish|set|connect|apply|upload|add|insert|do it|make|change it|change|turn\s+on|turn\s+off|enable|disable)/i.test(normalized);
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
