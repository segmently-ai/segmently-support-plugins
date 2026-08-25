#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCorpusV2Runtime } from './corpus-v2.mjs';
import { resolveProjectContext } from './session-context.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const rawKey = token.slice(2);
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    out[key] = next && !next.startsWith('--') ? argv[++index] : true;
  }
  return out;
}

function list(value) {
  return [...new Set(String(value ?? '').split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean))];
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е');
}

function hasActionIntent(text) {
  const value = String(text ?? '').trim();
  if (/^(?:how\s+(?:do|can|should)\s+i|how\s+to|can\s+i|could\s+i|what(?:'s|\s+is)?\s+the\s+(?:way|process)|как(?:\s+мне)?|каким\s+образом|можно\s+ли|что\s+нужно)/i.test(value)) return false;
  return /(?:^|[^\p{L}\p{N}])(?:сделай|сделать|создай|создать|подключи|подключить|поставь|поставить|опубликуй|опубликовать|поменяй|поменять|измени|изменить|зацикли|зациклить|скругли|скруглить|включи|включить|выключи|выключить|добавь|добавить|загрузи|загрузить|вставь|вставить|прикрепи|прикрепить|можешь|attach|create|publish|set|connect|apply|upload|add|insert|do\s+it|make|change\s+it|change|turn\s+on|turn\s+off|enable|disable)(?=$|[^\p{L}\p{N}])/iu.test(value);
}

function hasArticleFetchIntent(text) {
  const value = normalize(text);
  return /(?=.*(стать|article|guide|гайд|инструкц|документ))(?=.*(полную|полная|полный|полностью|целик|весь\s+текст|body|content|содержим|дай|пришли|скинь|отправ|открой|покажи|найди|ссылк|url|html|markdown|md|fetch|get|send|open|link))/i.test(value);
}

function hasShowIntent(text) {
  return /(покажи|куда\s+наж|где\s+(?:наж|найти|находится|расположен)|проведи\s+(?:меня\s+)?по|show\s+me|show\s+where|where\s+do|walk\s+me|demonstrate|navigate\s+me)/i.test(String(text ?? ''));
}

function hasInternalCorpusRequest(text) {
  const value = normalize(text).replace(/[_/\\]+/g, ' ');
  return /support[-\s]+knowledge[-\s]+graph/.test(value)
    || /(?:internal|maintainer|внутренн\p{L}*)[^\n]{0,48}(?:knowledge\s+graph|graph|module|source|path|edge|node|corpus|граф|модул|исходн|путь|ребр|узл|корпус)/u.test(value)
    || /(?:graph|module|source|граф|модул|исходн)[^\n]{0,48}(?:edge\s+ids?|node\s+ids?|module\s+paths?|source\s+paths?|internal|maintainer|id\s+реб|id\s+узл|внутренн\p{L}*)/u.test(value);
}

function looksRussian(text) {
  return /[а-яё]/i.test(String(text ?? ''));
}

function interactionPolicy() {
  return {
    schemaVersion: 1,
    multiStepActionTool: 'todo-list',
    askUserQuestionTool: 'ask-user-question',
    useTodoListWhen: 'a DO flow needs multiple tool, auth, execution, or verification steps',
    useAskUserQuestionWhen: 'a required target, value, asset, or approval cannot be inferred',
    fallbackWhenToolUnavailable: 'ask one concise targeted question in prose',
  };
}

function projectContextContract(context) {
  return {
    schemaVersion: 1,
    currentProject: context.currentProject ?? null,
    projectIdSource: context.projectIdSource ?? null,
    usingCurrentProject: context.usingCurrentProject === true,
    missingCurrentProject: context.missingCurrentProject === true,
    askToSetCurrentProject: context.askToSetCurrentProject === true,
  };
}

function actionScore(prompt, action) {
  const queryTerms = new Set(normalize(prompt).split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 3));
  const text = normalize([action.id, action.label, ...(action.customerIntent ?? [])].join(' '));
  let score = 0;
  for (const term of queryTerms) if (text.includes(term)) score += 1;
  return score;
}

function selectAction(prompt, actions, requestedActionId) {
  if (requestedActionId) return actions.find((action) => action.id === requestedActionId) ?? null;
  return actions.map((action) => ({ action, score: actionScore(prompt, action) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.action.id.localeCompare(b.action.id))[0]?.action ?? null;
}

function selectConditionalBrowserAction(prompt, requestedActionId) {
  const id = String(requestedActionId ?? '');
  const text = normalize(prompt);
  const asksForVideoUpload = /video|видео/.test(text) && /upload|загруз|добав|сдел|прикреп|встав/.test(text);
  if (id === 'browser.paywallMedia.videoUpload' || (asksForVideoUpload && /paywall|пейвол/.test(text))) {
    return {
      actionId: 'browser.paywallMedia.videoUpload',
      label: 'Upload featured video to Paywall Media',
      articleAlias: 'help-block-paywall-media',
      guideKey: 'screenedit-paywall-media-video',
    };
  }
  if (id === 'browser.media.videoUpload' || asksForVideoUpload) {
    return {
      actionId: 'browser.media.videoUpload',
      label: 'Upload video to the shared Media block',
      articleAlias: 'help-block-media',
      guideKey: 'screenedit-media-video-upload',
    };
  }
  return null;
}

function conditionalActionContract(selected, args) {
  const missingInputs = [];
  for (const input of ['projectId', 'funnelId', 'screenId']) if (!args[input]) missingInputs.push(input);
  if (!args.videoUrl && !args.localFile && !args.file) missingInputs.push('videoUrl-or-local-file');
  return {
    actionId: selected.actionId,
    label: selected.label,
    status: 'missing-input',
    runner: 'e2e-do-runner',
    owningSkill: 'playwright-bowser',
    companionSkill: 'segmently-test-kit',
    supportedBoundary: 'conditional-browser-editor-upload',
    requiredInputs: ['projectId', 'funnelId', 'screenId', 'videoUrl-or-local-file'],
    missingInputs,
    verify: {
      kind: 'browser-and-cli-readback',
      evidence: 'The uploaded video is visible in the editor and the exported funnel references the saved media asset.',
    },
    authorizationRequired: true,
    executionObserved: false,
    verificationObserved: false,
  };
}

function writeResult(response, runtime, args, traceFields) {
  const text = `${JSON.stringify(response, null, 2)}\n`;
  const responseBytes = Buffer.byteLength(text);
  if (response.mode === 'teach' && responseBytes > 32_000) throw new Error(`TEACH response exceeds 32000 bytes (${responseBytes}).`);
  if (args.tracePath) {
    const trace = runtime.trace({
      ...traceFields,
      responseBytes,
      responseBytesByTopLevelField: Object.fromEntries(Object.entries(response).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))])),
    });
    fs.mkdirSync(path.dirname(path.resolve(String(args.tracePath))), { recursive: true });
    fs.writeFileSync(path.resolve(String(args.tracePath)), `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  }
  if (args.resultPath) {
    fs.mkdirSync(path.dirname(path.resolve(String(args.resultPath))), { recursive: true });
    fs.writeFileSync(path.resolve(String(args.resultPath)), text, 'utf8');
  } else {
    process.stdout.write(text);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.prompt && !args.articleAliases && !args.guideKeys)) {
    process.stdout.write('Usage: node runtime/customer-response-runner.mjs --prompt "..." [--article-aliases <aliases>] [--guide-keys <keys>] [--mode teach|show|do|article-fetch] [--trace-path <file>]\n');
    return;
  }
  if (args.corpusVersion && String(args.corpusVersion).toLowerCase() !== 'v2') throw new Error('The customer plugin ships Corpus V2 only.');
  const runtime = createCorpusV2Runtime({ root, traceEnabled: Boolean(args.tracePath || args.trace) });
  const prompt = String(args.prompt ?? '').trim();
  const requestedGuideKeys = list(args.guideKeys);
  const requestedArticleAliases = list(args.articleAliases);
  const conditionalBrowserAction = selectConditionalBrowserAction(prompt, args.actionId);
  const requestedMode = String(args.mode ?? '').trim().toLowerCase();
  const mode = requestedMode || (hasArticleFetchIntent(prompt)
    ? 'article-fetch'
    : hasShowIntent(prompt)
      ? 'show'
      : args.actionId || hasActionIntent(prompt)
        ? 'do'
        : 'teach');
  if (!['teach', 'show', 'do', 'article-fetch'].includes(mode)) throw new Error(`Unsupported mode ${mode}.`);
  const selectedGuideRoutes = requestedGuideKeys.length > 0
    ? mode === 'show'
      ? runtime.loadGuideBindingsByKeys(requestedGuideKeys)
      : runtime.loadGuideRoutesByKeys(requestedGuideKeys)
    : [];
  const directAliases = [...new Set([
    ...requestedArticleAliases,
    ...(conditionalBrowserAction ? [conditionalBrowserAction.articleAlias] : []),
    ...selectedGuideRoutes.flatMap((guide) => guide.articleBindings.map((binding) => binding.articleAlias)),
  ])];
  const directSectionIds = new Set(selectedGuideRoutes.flatMap((guide) => guide.articleBindings.map((binding) => binding.sectionId)));
  const rawSearchResult = runtime.search(prompt || directAliases.join(' '), {
    topK: Math.min(5, Number(args.topK ?? 5) || 5),
    locale: looksRussian(prompt) ? 'auto' : 'en',
    productArea: args.productArea ? String(args.productArea) : null,
  });
  const internalCorpusRequest = directAliases.length === 0 && hasInternalCorpusRequest(prompt);
  const searchResult = internalCorpusRequest
    ? {
        ...rawSearchResult,
        candidates: [],
        discarded: [
          ...(rawSearchResult.candidates ?? []).map((candidate) => ({
            articleAlias: candidate.article.articleAlias,
            score: candidate.score,
            reasons: ['PUBLIC_INTERNAL_REQUEST_BLOCKED'],
          })),
          ...(rawSearchResult.discarded ?? []),
        ],
        guard: { code: 'PUBLIC_INTERNAL_REQUEST_BLOCKED', customerKnowledgeOnly: true },
      }
    : rawSearchResult;
  const candidates = new Map(searchResult.candidates.map((candidate) => [candidate.article.articleAlias, candidate]));
  for (const alias of directAliases) {
    const article = runtime.directory.articles.find((entry) => entry.articleAlias === alias);
    if (!article) throw new Error(`Unknown Corpus V2 Article alias ${alias}.`);
    candidates.set(alias, {
      article,
      score: 100,
      scoreBreakdown: { 'selected-catalog-item': 100 },
      matchedTerms: [],
      sections: runtime.sectionRows.filter((section) => section.articleAlias === alias && (directSectionIds.size === 0 || directSectionIds.has(section.sectionId))).slice(0, 5),
      discardedReasons: [],
    });
  }
  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.article.articleAlias.localeCompare(b.article.articleAlias)).slice(0, 5);
  if (ranked.length === 0) {
    const response = {
      ok: true,
      corpusSchemaVersion: 2,
      corpusContentHash: runtime.manifest.contentHash,
      mode: 'handoff',
      selectedArticles: [],
      answer: { summary: 'No reviewed Segmently support Article matched this request strongly enough.', articleAliases: [], sectionRefs: [], nextStep: 'Ask one focused clarification question or hand off without inventing an Article.' },
      guideBindings: [],
      show: null,
      action: null,
      articleFetch: null,
      interactionPolicy: interactionPolicy(),
      missingArticleClaimed: false,
      completionClaim: 'no-match-no-action',
    };
    writeResult(response, runtime, args, {
      searchResult,
      mode: 'handoff',
      selectedArticleAliases: [],
      selectedSectionRefs: [],
      guideKeysLoaded: [],
      actionIdsLoaded: [],
      failureCodes: [internalCorpusRequest ? 'PUBLIC_INTERNAL_REQUEST_BLOCKED' : 'RETRIEVAL_MISS'],
    });
    return;
  }
  const selectedSections = [];
  for (const candidate of ranked) {
    for (const section of candidate.sections ?? []) {
      if (selectedSections.length >= 5) break;
      if (!selectedSections.some((entry) => entry.articleAlias === section.articleAlias && entry.sectionId === section.sectionId)) selectedSections.push(section);
    }
  }
  if (selectedSections.length === 0) selectedSections.push(...runtime.sectionRows.filter((section) => section.articleAlias === ranked[0].article.articleAlias).slice(0, 3));
  const primary = ranked[0].article;
  const configFetch = await runtime.fetchArticleConfig(primary, { timeoutMs: Number(args.configTimeoutMs ?? 1500) || 1500 });
  const fallback = configFetch.ok ? null : runtime.loadFallback(primary);
  const selectedArticles = ranked.slice(0, 3).map((candidate) => ({
    articleAlias: candidate.article.articleAlias,
    articleId: candidate.article.articleId,
    title: candidate.article.title,
    summary: candidate.article.summary,
    publishedUrl: candidate.article.publishedUrl,
    configUrl: candidate.article.configUrl,
    contentHash: candidate.article.contentHash,
    productArea: candidate.article.productArea,
    score: candidate.score,
    sections: selectedSections.filter((section) => section.articleAlias === candidate.article.articleAlias).map((section) => ({ sectionId: section.sectionId, title: section.title, summary: section.summary })),
  }));
  const sectionRefs = selectedSections.map((section) => `${section.articleAlias}#${section.sectionId}`);
  let guideBindings = [];
  let show = null;
  if (mode === 'show') {
    guideBindings = selectedGuideRoutes.length > 0 ? selectedGuideRoutes : runtime.loadGuideBindings({ articleAliases: selectedArticles.map((article) => article.articleAlias), sectionIds: selectedSections.map((section) => section.sectionId) });
    const evidence = guideBindings.flatMap((guide) => guide.evidence ?? []).slice(0, 2);
    show = { status: evidence.length > 0 ? 'ready' : 'evidence-missing', runner: 'show-runner', guideKeys: guideBindings.map((guide) => guide.guideKey), evidence, evidenceLevel: 'visual-route-evidence-not-execution-proof', mutation: false };
  }
  let action = null;
  if (mode === 'do') {
    const selected = conditionalBrowserAction ? null : selectAction(prompt, runtime.loadActions(null), args.actionId ? String(args.actionId) : null);
    action = conditionalBrowserAction ? conditionalActionContract(conditionalBrowserAction, args) : selected ? {
      actionId: selected.id,
      label: selected.label,
      status: selected.status,
      runner: selected.runner ?? selected.owningSkill ?? null,
      requiredInputs: selected.requiredInputs ?? [],
      verify: selected.verify ?? null,
      authorizationRequired: true,
      executionObserved: false,
      verificationObserved: false,
    } : { actionId: null, status: 'handoff', authorizationRequired: true, executionObserved: false, verificationObserved: false, reason: 'No reviewed action contract matched the request.' };
  }
  const projectContext = resolveProjectContext(args);
  const response = {
    ok: true,
    corpusSchemaVersion: 2,
    corpusContentHash: runtime.manifest.contentHash,
    source: requestedGuideKeys.length || requestedArticleAliases.length ? 'agent-selected-catalog' : 'prompt-debug-fallback',
    mode,
    resolver: conditionalBrowserAction ? { kind: 'conditional-do', guideKey: conditionalBrowserAction.guideKey } : { kind: 'corpus-v2' },
    customerQuestion: prompt,
    selectedArticles,
    answer: {
      summary: primary.summary,
      articleAliases: selectedArticles.map((article) => article.articleAlias),
      sectionRefs,
      grounding: configFetch.ok ? 'verified-public-article-config' : 'shipped-offline-fallback',
      fallbackExcerpt: fallback?.sections?.[0]?.excerpt ?? null,
      nextStep: mode === 'show'
        ? 'Use the mapped screenshot and route evidence to show the selected control without treating the screenshot as execution proof.'
        : mode === 'do'
          ? 'Collect required inputs and explicit authorization, then execute and verify through the owning runner.'
          : mode === 'article-fetch'
            ? configFetch.ok ? 'The canonical public Article config was fetched and hash-verified.' : 'Use the shipped fallback and report that the public config could not be verified.'
            : 'Answer from the selected Article sections and link the public Article for complete instructions.',
    },
    guideBindings: mode === 'show' ? guideBindings.map((guide) => ({ guideKey: guide.guideKey, presentationTitle: guide.presentationTitle, articleBindings: guide.articleBindings, referencePath: guide.referencePath })) : [],
    show,
    action,
    articleFetch: mode === 'article-fetch' ? { articleAlias: primary.articleAlias, publicUrl: primary.publishedUrl, configUrl: primary.configUrl, status: configFetch.ok ? 'verified' : 'fallback', hashMatch: configFetch.hashMatch === true, mutation: false } : null,
    sessionContext: projectContextContract(projectContext),
    routingPolicy: { semanticDecisionOwner: requestedGuideKeys.length || requestedArticleAliases.length ? 'agent-model' : 'corpus-v2-lexical-debug-fallback', deterministicRunnerRole: 'candidate-ranking-evidence-and-execution-boundaries', topKMaximum: 5, guideBindingsMaximum: 2, fullGraphLoaded: false },
    interactionPolicy: interactionPolicy(),
    missingArticleClaimed: false,
    completionClaim: mode === 'do' ? 'not-completed-until-authorized-executed-and-verified' : mode === 'show' ? 'show-plan-not-executed' : mode === 'article-fetch' && configFetch.ok ? 'read-only-article-fetch-verified' : 'guidance-only',
  };
  writeResult(response, runtime, args, {
    searchResult,
    mode,
    selectedArticleAliases: selectedArticles.map((article) => article.articleAlias),
    selectedSectionRefs: sectionRefs,
    configFetch: { urlClass: 'public-config-url', status: configFetch.status ?? null, etag: configFetch.etag ?? null, hashMatch: configFetch.hashMatch === true, cache: configFetch.cache, fallback: !configFetch.ok, timingMs: configFetch.elapsedMs ?? null, reason: configFetch.reason ?? null },
    guideKeysLoaded: guideBindings.map((guide) => guide.guideKey),
    actionIdsLoaded: action?.actionId ? [action.actionId] : [],
    failureCodes: configFetch.ok ? [] : [configFetch.reason ?? 'ARTICLE_CONFIG_FETCH_FAILED'],
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
