#!/usr/bin/env node
/**
 * Customer-local Segmently Launch Assistant context.
 *
 * The plugin cache is read-only and replaceable, so durable user state lives in
 * a customer-owned file outside the installed skill. Store only non-secret
 * routing context here: project id/name and lightweight project history.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaVersion = 1;

export function resolveContextFile(args = {}) {
  if (hasValue(args.contextFile)) return resolve(String(args.contextFile));
  if (hasValue(process.env.SEGMENTLY_LAUNCH_CONTEXT_FILE)) {
    return resolve(String(process.env.SEGMENTLY_LAUNCH_CONTEXT_FILE));
  }
  return join(homedir(), '.segmently', 'launch-assistant', 'context.json');
}

export function readSessionContext(args = {}) {
  const contextFile = resolveContextFile(args);
  if (!existsSync(contextFile)) {
    return defaultContext(contextFile);
  }
  try {
    const parsed = JSON.parse(readFileSync(contextFile, 'utf8'));
    return normalizeContext(parsed, contextFile);
  } catch (error) {
    const context = defaultContext(contextFile);
    context.readError = error instanceof Error ? error.message : String(error);
    return context;
  }
}

export function writeSessionContext(context, args = {}) {
  const contextFile = resolveContextFile(args);
  const normalized = normalizeContext({
    ...context,
    updatedAt: nowIso(),
  }, contextFile);
  mkdirSync(dirname(contextFile), { recursive: true });
  writeFileSync(contextFile, `${JSON.stringify(publicContext(normalized), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return normalizeContext(normalized, contextFile);
}

export function setCurrentProject({ projectId, projectName, source = 'user', contextFile } = {}) {
  const id = normalizeValue(projectId);
  if (!id) throw new Error('projectId is required');
  const name = normalizeValue(projectName) ?? id;
  const current = {
    id,
    name,
    source: normalizeValue(source) ?? 'user',
    updatedAt: nowIso(),
  };
  const context = readSessionContext({ contextFile });
  const projects = upsertProject(context.projects, {
    ...current,
    lastUsedAt: current.updatedAt,
  });
  return writeSessionContext({
    ...context,
    currentProject: current,
    projects,
  }, { contextFile });
}

export function clearCurrentProject(args = {}) {
  const context = readSessionContext(args);
  return writeSessionContext({
    ...context,
    currentProject: null,
  }, args);
}

export function resolveProjectContext(args = {}) {
  const context = readSessionContext(args);
  const explicitProjectId = normalizeValue(args.projectId);
  const explicitProjectName = normalizeValue(args.projectName) ?? explicitProjectId;
  if (explicitProjectId) {
    return {
      contextFile: context.contextFile,
      state: publicContext(context),
      currentProject: {
        id: explicitProjectId,
        name: explicitProjectName,
        source: 'explicit-args',
      },
      projectId: explicitProjectId,
      projectName: explicitProjectName,
      projectIdSource: 'explicit',
      usingStoredProject: false,
      missingProject: false,
      readError: context.readError ?? null,
    };
  }
  const stored = context.currentProject?.id ? context.currentProject : null;
  return {
    contextFile: context.contextFile,
    state: publicContext(context),
    currentProject: stored,
    projectId: stored?.id ?? null,
    projectName: stored?.name ?? null,
    projectIdSource: stored ? 'stored-current-project' : 'missing',
    usingStoredProject: Boolean(stored),
    missingProject: !stored,
    readError: context.readError ?? null,
  };
}

function defaultContext(contextFile) {
  return {
    schemaVersion,
    contextFile,
    updatedAt: null,
    currentProject: null,
    projects: [],
    engine: defaultEngine(),
  };
}

function normalizeContext(value, contextFile) {
  const currentProject = normalizeProject(value?.currentProject);
  return {
    schemaVersion,
    contextFile,
    updatedAt: normalizeValue(value?.updatedAt),
    currentProject,
    projects: Array.isArray(value?.projects)
      ? value.projects.map(normalizeProject).filter(Boolean)
      : [],
    engine: normalizeEngine(value?.engine),
    readError: normalizeValue(value?.readError) ?? null,
  };
}

function publicContext(context) {
  return {
    schemaVersion,
    updatedAt: context.updatedAt ?? null,
    currentProject: context.currentProject ?? null,
    projects: context.projects ?? [],
    engine: normalizeEngine(context.engine),
  };
}

function defaultEngine() {
  return { session: 'on', predictive: 'off' };
}

function normalizeEngine(value) {
  const engine = defaultEngine();
  if (value && typeof value === 'object') {
    if (value.session === 'off') engine.session = 'off';
    if (value.predictive === 'on') engine.predictive = 'on';
  }
  return engine;
}

/**
 * Effective engine toggles: stored context.json value overridden by the
 * SEGMENTLY_LAUNCH_ENGINE env var ("off", "session=off", "predictive=on",
 * comma-separated). The env override never persists to disk.
 */
export function readEngineSettings(args = {}) {
  const context = readSessionContext(args);
  const engine = normalizeEngine(context.engine);
  const raw = normalizeValue(process.env.SEGMENTLY_LAUNCH_ENGINE);
  if (raw) {
    for (const part of raw.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)) {
      if (part === 'off') {
        engine.session = 'off';
        engine.predictive = 'off';
      } else if (part === 'on') {
        engine.session = 'on';
      } else {
        const [key, state] = part.split('=').map(item => item?.trim());
        if ((key === 'session' || key === 'predictive') && (state === 'on' || state === 'off')) {
          engine[key] = state;
        }
      }
    }
  }
  if (engine.session === 'off') engine.predictive = 'off';
  return { engine, storedEngine: normalizeEngine(context.engine), envOverride: raw ?? null };
}

export function setEngineSettings({ session, predictive, contextFile } = {}) {
  const context = readSessionContext({ contextFile });
  const engine = normalizeEngine(context.engine);
  if (session === 'on' || session === 'off') engine.session = session;
  if (predictive === 'on' || predictive === 'off') engine.predictive = predictive;
  if (engine.session === 'off') engine.predictive = 'off';
  return writeSessionContext({ ...context, engine }, { contextFile });
}

function normalizeProject(value) {
  const id = normalizeValue(value?.id);
  if (!id) return null;
  const name = normalizeValue(value?.name) ?? id;
  return {
    id,
    name,
    source: normalizeValue(value?.source) ?? 'unknown',
    updatedAt: normalizeValue(value?.updatedAt) ?? null,
    lastUsedAt: normalizeValue(value?.lastUsedAt) ?? normalizeValue(value?.updatedAt) ?? null,
  };
}

function upsertProject(projects = [], project) {
  const normalized = normalizeProject(project);
  if (!normalized) return projects;
  const without = projects
    .map(normalizeProject)
    .filter(Boolean)
    .filter(item => item.id !== normalized.id);
  return [normalized, ...without].slice(0, 20);
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._?.[0] ?? 'get';
  try {
    if (command === 'get') {
      emit({ ok: true, contextFile: resolveContextFile(args), context: publicContext(readSessionContext(args)) });
      return;
    }
    if (command === 'set-current-project') {
      const context = setCurrentProject({
        projectId: args.projectId,
        projectName: args.projectName,
        source: args.source,
        contextFile: args.contextFile,
      });
      emit({ ok: true, contextFile: resolveContextFile(args), context: publicContext(context) });
      return;
    }
    if (command === 'clear-current-project') {
      const context = clearCurrentProject(args);
      emit({ ok: true, contextFile: resolveContextFile(args), context: publicContext(context) });
      return;
    }
    if (command === 'resolve-project') {
      emit({ ok: true, ...publicProjectResolution(resolveProjectContext(args)) });
      return;
    }
    if (command === 'get-engine') {
      emit({ ok: true, contextFile: resolveContextFile(args), ...readEngineSettings(args) });
      return;
    }
    if (command === 'set-engine') {
      const context = setEngineSettings({
        session: normalizeValue(args.session),
        predictive: normalizeValue(args.predictive),
        contextFile: args.contextFile,
      });
      emit({ ok: true, contextFile: resolveContextFile(args), engine: context.engine });
      return;
    }
    if (command === 'help' || args.help) {
      printHelp();
      return;
    }
    throw new Error(`Unknown command ${command}`);
  } catch (error) {
    emit({
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      contextFile: resolveContextFile(args),
    });
    process.exit(2);
  }
}

function publicProjectResolution(resolution) {
  return {
    contextFile: resolution.contextFile,
    currentProject: resolution.currentProject,
    projectId: resolution.projectId,
    projectName: resolution.projectName,
    projectIdSource: resolution.projectIdSource,
    usingStoredProject: resolution.usingStoredProject,
    missingProject: resolution.missingProject,
    readError: resolution.readError,
  };
}

function printHelp() {
  console.log([
    'Usage:',
    '  node runtime/session-context.mjs get [--contextFile <path>]',
    '  node runtime/session-context.mjs set-current-project --projectId <id> [--projectName <name>] [--contextFile <path>]',
    '  node runtime/session-context.mjs clear-current-project [--contextFile <path>]',
    '  node runtime/session-context.mjs resolve-project [--projectId <id>] [--projectName <name>] [--contextFile <path>]',
    '  node runtime/session-context.mjs get-engine [--contextFile <path>]',
    '  node runtime/session-context.mjs set-engine [--session on|off] [--predictive on|off] [--contextFile <path>]',
    '',
    'Stores only non-secret customer routing context: current project id/name',
    'and the session-engine toggles (session cache + predictive prefetch).',
  ].join('\n'));
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
