#!/usr/bin/env node
/**
 * Optional session engine for installed Segmently launch skills.
 *
 * A disposable, per-project session cache beside the durable context.json:
 * last verified launch-state snapshot, recently routed intents, and
 * deterministically predicted next steps. Everything here is a latency
 * optimization — the cache may be deleted at any time with zero behavior
 * change, holds only non-secret routing data, and never grants execution
 * authority: DO flows still require their own confirmation + preflight.
 *
 * Toggles live in context.json (`engine.session`, `engine.predictive`,
 * default session=on predictive=off) with a SEGMENTLY_LAUNCH_ENGINE env
 * override. Every command no-ops cleanly when the engine is off.
 *
 * Predictions are pure graph/data traversal over generated references
 * (scenarios.matrix.json, routing-quick-index.json) — no model
 * calls, no heuristics beyond documented ordering, so regenerating the
 * package updates predictions automatically.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEngineSettings, resolveProjectContext, setEngineSettings } from './session-context.mjs';

const schemaVersion = 1;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

const MAX_PROJECT_SESSIONS = 10;
const MAX_RECENT_INTENTS = 10;
const MAX_PREDICTIONS = 5;
const DEFAULT_STATE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PREDICTION_TTL_MS = 30 * 60 * 1000;

const INTENT_KINDS = ['action', 'article', 'scenario', 'guide', 'milestone'];

export function resolveCacheFile(args = {}) {
  if (hasValue(args.cacheFile)) return resolve(String(args.cacheFile));
  if (hasValue(process.env.SEGMENTLY_LAUNCH_SESSION_CACHE_FILE)) {
    return resolve(String(process.env.SEGMENTLY_LAUNCH_SESSION_CACHE_FILE));
  }
  return join(homedir(), '.segmently', 'launch-assistant', 'session-cache.json');
}

function stateTtlMs() {
  const raw = Number(process.env.SEGMENTLY_LAUNCH_STATE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STATE_TTL_MS;
}

function predictionTtlMs() {
  const raw = Number(process.env.SEGMENTLY_LAUNCH_PREDICT_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PREDICTION_TTL_MS;
}

export function readSessionCache(args = {}) {
  const cacheFile = resolveCacheFile(args);
  if (!existsSync(cacheFile)) return defaultCache(cacheFile);
  try {
    return normalizeCache(JSON.parse(readFileSync(cacheFile, 'utf8')), cacheFile);
  } catch (error) {
    const cache = defaultCache(cacheFile);
    cache.readError = error instanceof Error ? error.message : String(error);
    return cache;
  }
}

export function writeSessionCache(cache, args = {}) {
  const cacheFile = resolveCacheFile(args);
  const normalized = normalizeCache({ ...cache, updatedAt: nowIso() }, cacheFile);
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, `${JSON.stringify(publicCache(normalized), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return normalized;
}

/**
 * Called by launch-progress-runner after every successful progress read.
 * Never throws: session recording must not break the primary read.
 */
export function recordStateSnapshot({ projectId, goal, preflightStatus, checkedAt, milestones }, args = {}) {
  try {
    const { engine } = readEngineSettings(args);
    if (engine.session !== 'on') return { recorded: false, reason: 'engine-session-off' };
    const id = normalizeValue(projectId);
    if (!id) return { recorded: false, reason: 'missing-project-id' };
    const cache = readSessionCache(args);
    const session = sessionForProject(cache, id);
    session.stateSnapshot = {
      goal: normalizeValue(goal) ?? 'ads-ready',
      preflightStatus: normalizeValue(preflightStatus),
      checkedAt: normalizeValue(checkedAt) ?? nowIso(),
      recordedAt: nowIso(),
      milestones: Array.isArray(milestones)
        ? milestones
            .map(m => ({
              id: normalizeValue(m?.id),
              status: normalizeValue(m?.status),
              inGoal: m?.inGoal === true,
            }))
            .filter(m => m.id && m.status)
        : [],
    };
    // A fresh verified state invalidates earlier predictions.
    session.predictedNext = [];
    writeSessionCache(upsertSession(cache, id, session), args);
    return { recorded: true, cacheFile: resolveCacheFile(args) };
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function defaultCache(cacheFile) {
  return { schemaVersion, cacheFile, updatedAt: null, sessions: {} };
}

function normalizeCache(value, cacheFile) {
  const sessions = {};
  if (value?.sessions && typeof value.sessions === 'object') {
    for (const [projectId, session] of Object.entries(value.sessions)) {
      const id = normalizeValue(projectId);
      if (!id) continue;
      sessions[id] = normalizeSession(session);
    }
  }
  return {
    schemaVersion,
    cacheFile,
    updatedAt: normalizeValue(value?.updatedAt),
    sessions,
    readError: normalizeValue(value?.readError) ?? null,
  };
}

function publicCache(cache) {
  return {
    schemaVersion,
    updatedAt: cache.updatedAt ?? null,
    sessions: cache.sessions ?? {},
  };
}

function normalizeSession(value) {
  const session = { stateSnapshot: null, recentIntents: [], predictedNext: [], lastTouchedAt: normalizeValue(value?.lastTouchedAt) };
  const snapshot = value?.stateSnapshot;
  if (snapshot && typeof snapshot === 'object' && normalizeValue(snapshot.checkedAt)) {
    session.stateSnapshot = {
      goal: normalizeValue(snapshot.goal) ?? 'ads-ready',
      preflightStatus: normalizeValue(snapshot.preflightStatus),
      checkedAt: normalizeValue(snapshot.checkedAt),
      recordedAt: normalizeValue(snapshot.recordedAt),
      milestones: Array.isArray(snapshot.milestones)
        ? snapshot.milestones
            .map(m => ({ id: normalizeValue(m?.id), status: normalizeValue(m?.status), inGoal: m?.inGoal === true }))
            .filter(m => m.id && m.status)
        : [],
    };
  }
  if (Array.isArray(value?.recentIntents)) {
    session.recentIntents = value.recentIntents
      .map(intent => ({
        kind: INTENT_KINDS.includes(intent?.kind) ? intent.kind : null,
        id: normalizeValue(intent?.id),
        mode: normalizeValue(intent?.mode),
        recordedAt: normalizeValue(intent?.recordedAt),
      }))
      .filter(intent => intent.kind && intent.id)
      .slice(0, MAX_RECENT_INTENTS);
  }
  if (Array.isArray(value?.predictedNext)) {
    session.predictedNext = value.predictedNext
      .map(normalizePrediction)
      .filter(Boolean)
      .slice(0, MAX_PREDICTIONS);
  }
  return session;
}

function normalizePrediction(value) {
  const candidateId = normalizeValue(value?.candidateId);
  if (!candidateId) return null;
  return {
    candidateId,
    kind: normalizeValue(value?.kind) ?? 'unknown',
    confidence: value?.confidence === 'high' ? 'high' : 'medium',
    why: normalizeValue(value?.why),
    scenarioId: normalizeValue(value?.scenarioId),
    articleAlias: normalizeValue(value?.articleAlias),
    actionId: normalizeValue(value?.actionId),
    predictedAt: normalizeValue(value?.predictedAt),
    preparedPlan: value?.preparedPlan && typeof value.preparedPlan === 'object' ? value.preparedPlan : null,
    preparedAt: normalizeValue(value?.preparedAt),
  };
}

function sessionForProject(cache, projectId) {
  return cache.sessions[projectId] ?? normalizeSession(null);
}

function upsertSession(cache, projectId, session) {
  const next = { ...cache, sessions: { ...cache.sessions } };
  next.sessions[projectId] = { ...session, lastTouchedAt: nowIso() };
  const ids = Object.keys(next.sessions);
  if (ids.length > MAX_PROJECT_SESSIONS) {
    ids
      .sort((a, b) => String(next.sessions[a].lastTouchedAt ?? '').localeCompare(String(next.sessions[b].lastTouchedAt ?? '')))
      .slice(0, ids.length - MAX_PROJECT_SESSIONS)
      .forEach(id => delete next.sessions[id]);
  }
  return next;
}

function freshness(session) {
  const now = Date.now();
  const stateCheckedAt = session.stateSnapshot?.checkedAt ? Date.parse(session.stateSnapshot.checkedAt) : NaN;
  const stateFresh = Number.isFinite(stateCheckedAt) && now - stateCheckedAt <= stateTtlMs();
  const predictedNextFresh = session.predictedNext.filter(prediction => {
    const at = prediction.predictedAt ? Date.parse(prediction.predictedAt) : NaN;
    return Number.isFinite(at) && now - at <= predictionTtlMs();
  });
  return {
    stateFresh,
    stateStaleRule: stateFresh
      ? null
      : 'State snapshot is stale or absent: re-verify with runtime/launch-progress-runner.mjs before any claim about project state.',
    predictedNextFresh,
  };
}

// ---------------------------------------------------------------------------
// Deterministic next-step prediction (pure traversal over generated refs).
// ---------------------------------------------------------------------------

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

export function predictNextSteps({ session, topK = 3 }) {
  const candidates = [];
  const seen = new Set();
  const push = candidate => {
    if (!candidate.candidateId || seen.has(candidate.candidateId)) return;
    seen.add(candidate.candidateId);
    candidates.push(candidate);
  };

  const matrix = loadJson('references/scenarios.matrix.json');
  const scenarioByMilestone = new Map();
  const scenarioById = new Map();
  for (const scenario of matrix.scenarios ?? []) {
    scenarioById.set(scenario.id, scenario);
    if (scenario.milestone) scenarioByMilestone.set(scenario.milestone, scenario);
  }

  // 1. Remaining milestones from the verified state snapshot (high confidence):
  //    milestone order inside the snapshot IS the launch order emitted by
  //    launch-progress-runner, so the first remaining entries are the next steps.
  const remaining = (session.stateSnapshot?.milestones ?? []).filter(
    m => m.inGoal && (m.status === 'failed' || m.status === 'warning'),
  );
  for (const milestone of remaining.slice(0, 2)) {
    const scenario = scenarioByMilestone.get(milestone.id) ?? null;
    push({
      candidateId: scenario ? `scenario:${scenario.id}` : `milestone:${milestone.id}`,
      kind: 'milestone',
      confidence: 'high',
      why: `Remaining launch milestone "${milestone.id}" (status ${milestone.status}) in the last verified snapshot.`,
      scenarioId: scenario?.id ?? null,
      articleAlias: scenario?.article ?? null,
      actionId: null,
      milestoneId: milestone.id,
    });
  }

  // 2. Explicit quick-index neighbors of the most recent routed intent
  //    (medium confidence). The customer plugin intentionally ships no full
  //    SupportFlow graph; only reviewed compact route relations participate.
  const lastIntent = session.recentIntents[0] ?? null;
  if (lastIntent) {
    const quickIndex = loadJson('references/routing-quick-index.json');
    for (const neighbor of quickIndexNeighbors(quickIndex, lastIntent)) {
      push({
        candidateId: neighbor.candidateId,
        kind: neighbor.kind,
        confidence: 'medium',
        why: `Reviewed quick-index neighbor of the last routed intent ${lastIntent.kind}:${lastIntent.id}.`,
        scenarioId: neighbor.scenarioId ?? null,
        articleAlias: neighbor.articleAlias ?? null,
        actionId: neighbor.actionId ?? null,
      });
    }
  }

  return candidates.slice(0, Math.max(1, Number(topK) || 3));
}

function quickIndexNeighbors(index, intent) {
  const results = [];
  for (const entry of index.entries ?? []) {
    const articleMatch = intent.kind === 'article' && (entry.articleAliases ?? []).includes(intent.id);
    const actionMatch = intent.kind === 'action' && (entry.actionId === intent.id || entry.actionFamily === intent.id);
    const scenarioMatch = intent.kind === 'scenario' && entry.scenarioId === intent.id;
    if (!articleMatch && !actionMatch && !scenarioMatch) continue;
    if (entry.scenarioId) results.push({ candidateId: `scenario:${entry.scenarioId}`, kind: 'scenario', scenarioId: entry.scenarioId });
    for (const alias of entry.articleAliases ?? []) results.push({ candidateId: `article:${alias}`, kind: 'article', articleAlias: alias });
    if (entry.actionId) results.push({ candidateId: `action:${entry.actionId}`, kind: 'action', actionId: entry.actionId });
  }
  return results;
}

function graphNeighbors(adjacency, intent) {
  const prefixByKind = { action: 'Action', article: 'Article', scenario: 'Scenario', guide: 'Guide' };
  const prefix = prefixByKind[intent.kind];
  if (!prefix) return [];
  const nodeId = `${prefix}:${intent.id}`;
  const outgoing = adjacency.outgoing?.[nodeId] ?? {};
  const incoming = adjacency.incoming?.[nodeId] ?? {};
  const results = [];

  const collect = (edge, targets) => {
    for (const target of targets ?? []) {
      const [targetType, ...rest] = String(target).split(':');
      const targetId = rest.join(':');
      if (!targetId) continue;
      if (targetType === 'Scenario') {
        results.push({ candidateId: `scenario:${targetId}`, kind: 'scenario', edge, scenarioId: targetId });
      } else if (targetType === 'Article') {
        results.push({ candidateId: `article:${targetId}`, kind: 'article', edge, articleAlias: targetId });
      } else if (targetType === 'Action') {
        results.push({ candidateId: `action:${targetId}`, kind: 'action', edge, actionId: targetId });
      } else if (targetType === 'CliCapability') {
        // One hop deeper: capabilities point at the scenarios they support.
        const capabilityOut = adjacency.outgoing?.[target] ?? {};
        for (const scenarioEdge of ['CAPABILITY_SUPPORTS_SCENARIO', 'CAPABILITY_PROVEN_BY_SCENARIO']) {
          for (const scenarioTarget of capabilityOut[scenarioEdge] ?? []) {
            const scenarioId = String(scenarioTarget).split(':').slice(1).join(':');
            if (scenarioId) {
              results.push({ candidateId: `scenario:${scenarioId}`, kind: 'scenario', edge: `${edge}->${scenarioEdge}`, scenarioId });
            }
          }
        }
      }
    }
  };

  // Ordered hop list: same-surface follow-ups first, then capability bridges.
  collect('ARTICLE_RELATES_TO_SCENARIO', outgoing.ARTICLE_RELATES_TO_SCENARIO);
  collect('ARTICLE_RELATES_TO_ACTION', outgoing.ARTICLE_RELATES_TO_ACTION);
  collect('ACTION_BACKED_BY_CLI_CAPABILITY', outgoing.ACTION_BACKED_BY_CLI_CAPABILITY);
  collect('ARTICLE_RELATES_TO_ACTION(incoming)', incoming.ARTICLE_RELATES_TO_ACTION);
  collect('ARTICLE_RELATES_TO_SCENARIO(incoming)', incoming.ARTICLE_RELATES_TO_SCENARIO);
  collect('STEP_REQUIRES_ACTION(incoming)', incoming.STEP_REQUIRES_ACTION);
  return results.slice(0, 6);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function requireProjectId(args) {
  const resolution = resolveProjectContext(args);
  if (!resolution.projectId) {
    throw new Error('No project in scope. Pass --projectId or set one via session-context.mjs set-current-project.');
  }
  return resolution.projectId;
}

function engineGate(args, { need = 'session' } = {}) {
  const settings = readEngineSettings(args);
  if (settings.engine.session !== 'on' || (need === 'predictive' && settings.engine.predictive !== 'on')) {
    emit({ ok: true, noop: true, reason: `engine ${need} is off`, engine: settings.engine, envOverride: settings.envOverride });
    return null;
  }
  return settings;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._?.[0] ?? 'get';
  try {
    if (command === 'help' || args.help) {
      printHelp();
      return;
    }
    if (command === 'set-engine') {
      const context = setEngineSettings({
        session: normalizeValue(args.session),
        predictive: normalizeValue(args.predictive),
        contextFile: args.contextFile,
      });
      emit({ ok: true, engine: context.engine });
      return;
    }
    if (command === 'clear') {
      const cache = readSessionCache(args);
      if (args.all === true) {
        writeSessionCache({ ...cache, sessions: {} }, args);
        emit({ ok: true, cleared: 'all', cacheFile: resolveCacheFile(args) });
        return;
      }
      const projectId = requireProjectId(args);
      const sessions = { ...cache.sessions };
      delete sessions[projectId];
      writeSessionCache({ ...cache, sessions }, args);
      emit({ ok: true, cleared: projectId, cacheFile: resolveCacheFile(args) });
      return;
    }

    const settings = engineGate(args, { need: command === 'predict' || command === 'record-prediction' ? 'predictive' : 'session' });
    if (!settings) return;

    if (command === 'get') {
      const projectId = requireProjectId(args);
      const cache = readSessionCache(args);
      const session = sessionForProject(cache, projectId);
      const fresh = freshness(session);
      emit({
        ok: true,
        engine: settings.engine,
        cacheFile: resolveCacheFile(args),
        projectId,
        stateSnapshot: session.stateSnapshot,
        stateFresh: fresh.stateFresh,
        stateStaleRule: fresh.stateStaleRule,
        recentIntents: session.recentIntents,
        predictedNext: fresh.predictedNextFresh,
        readError: cache.readError ?? null,
      });
      return;
    }
    if (command === 'record-intent') {
      const projectId = requireProjectId(args);
      const kind = normalizeValue(args.kind);
      const id = normalizeValue(args.id);
      if (!INTENT_KINDS.includes(kind) || !id) {
        throw new Error(`record-intent needs --kind (${INTENT_KINDS.join('|')}) and --id.`);
      }
      const cache = readSessionCache(args);
      const session = sessionForProject(cache, projectId);
      session.recentIntents = [
        { kind, id, mode: normalizeValue(args.mode), recordedAt: nowIso() },
        ...session.recentIntents,
      ].slice(0, MAX_RECENT_INTENTS);
      writeSessionCache(upsertSession(cache, projectId, session), args);
      emit({ ok: true, projectId, recorded: { kind, id }, recentIntents: session.recentIntents.length });
      return;
    }
    if (command === 'write-state') {
      const projectId = requireProjectId(args);
      const state = readJsonInput(args, ['stateJson', 'stateFile'], 'write-state needs --stateJson or --stateFile.');
      const result = recordStateSnapshot({ projectId, ...state }, args);
      emit({ ok: result.recorded, projectId, ...result });
      if (!result.recorded) process.exitCode = 2;
      return;
    }
    if (command === 'predict') {
      const projectId = requireProjectId(args);
      const cache = readSessionCache(args);
      const session = sessionForProject(cache, projectId);
      const fresh = freshness(session);
      const usableSession = {
        ...session,
        stateSnapshot: fresh.stateFresh ? session.stateSnapshot : null,
      };
      const predictions = predictNextSteps({ session: usableSession, topK: args.topK }).map(candidate => ({
        ...candidate,
        predictedAt: nowIso(),
      }));
      if (args.save === true) {
        session.predictedNext = predictions.map(normalizePrediction).filter(Boolean);
        writeSessionCache(upsertSession(cache, projectId, session), args);
      }
      emit({
        ok: true,
        projectId,
        stateFresh: fresh.stateFresh,
        stateStaleRule: fresh.stateStaleRule,
        saved: args.save === true,
        predictions,
        speculationPolicy: 'Predictions only prepare reads; execution always goes through normal confirmation + preflight gates.',
      });
      return;
    }
    if (command === 'record-prediction') {
      const projectId = requireProjectId(args);
      const candidateId = normalizeValue(args.candidateId);
      if (!candidateId) throw new Error('record-prediction needs --candidateId.');
      const plan = readJsonInput(args, ['planJson', 'planFile'], 'record-prediction needs --planJson or --planFile.');
      const cache = readSessionCache(args);
      const session = sessionForProject(cache, projectId);
      const existing = session.predictedNext.find(prediction => prediction.candidateId === candidateId);
      const entry = normalizePrediction({
        ...(existing ?? { candidateId }),
        candidateId,
        preparedPlan: plan,
        preparedAt: nowIso(),
        predictedAt: existing?.predictedAt ?? nowIso(),
      });
      session.predictedNext = [entry, ...session.predictedNext.filter(prediction => prediction.candidateId !== candidateId)].slice(0, MAX_PREDICTIONS);
      writeSessionCache(upsertSession(cache, projectId, session), args);
      emit({ ok: true, projectId, candidateId, prepared: true });
      return;
    }
    throw new Error(`Unknown command ${command}`);
  } catch (error) {
    emit({ ok: false, reason: error instanceof Error ? error.message : String(error), cacheFile: resolveCacheFile(args) });
    process.exitCode = 2;
  }
}

function readJsonInput(args, keys, message) {
  for (const key of keys) {
    if (!hasValue(args[key])) continue;
    const raw = key.endsWith('File') ? readFileSync(resolve(String(args[key])), 'utf8') : String(args[key]);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error(`--${key} must contain a JSON object.`);
    return parsed;
  }
  throw new Error(message);
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === true || value === false) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function hasValue(value) {
  return normalizeValue(value) !== null;
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._ = [...(out._ ?? []), arg];
      continue;
    }
    const key = arg.slice(2);
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
    '  node runtime/session-engine.mjs get [--projectId <id>] [--cacheFile <path>]',
    '  node runtime/session-engine.mjs record-intent --kind action|article|scenario|guide|milestone --id <id> [--mode teach|show|do]',
    '  node runtime/session-engine.mjs write-state (--stateJson <json> | --stateFile <path>) [--projectId <id>]',
    '  node runtime/session-engine.mjs predict [--topK <n>] [--save] [--projectId <id>]',
    '  node runtime/session-engine.mjs record-prediction --candidateId <id> (--planJson <json> | --planFile <path>)',
    '  node runtime/session-engine.mjs clear [--all] [--projectId <id>]',
    '  node runtime/session-engine.mjs set-engine [--session on|off] [--predictive on|off]',
    '',
    'Disposable per-project session cache (state snapshot, recent intents,',
    'predicted next steps). Non-secret data only. All commands no-op when the',
    'engine toggle is off; predictions never execute anything.',
  ].join('\n'));
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
