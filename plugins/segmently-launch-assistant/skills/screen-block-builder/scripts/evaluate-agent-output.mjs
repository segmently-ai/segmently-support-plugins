#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  findOutputAssetLeaks,
  isRecord,
  parseJsonResponse,
  validateJsonSchema,
  validateRuntimePacket,
} from './lib/runtime-packet.mjs';

const EVIDENCE_REF_KINDS = new Set([
  'insight',
  'review',
  'rating',
  'studyCase',
  'bigNumber',
  'task',
  'audience',
]);
const args = parseArgs(process.argv.slice(2));
if (!args.packet || !args.output) {
  fail('Usage: evaluate-agent-output.mjs --packet <runtime-packet.json> --output <raw-output.json> [--validation-schema <validation-schema.json> --run-manifest <run-manifest.json>] [--report <evaluation.json>]');
}

const packet = readJson(args.packet);
const packetValidation = validateRuntimePacket(packet);
const failures = packetValidation.failures.map(message => ({ stage: 'packet', message }));
const requiresRunSnapshot = packet.provider === 'google';
let runSnapshotContract = null;
let runSnapshotChecksum = null;

if (requiresRunSnapshot) {
  if (!args.validationSchema || !args.runManifest) {
    failures.push({
      stage: 'schema-snapshot',
      message: 'Google packet evaluation requires both --validation-schema and --run-manifest from the prepared run',
    });
  } else {
    const manifestPath = resolve(args.runManifest);
    const manifest = readJson(manifestPath);
    const validationSchemaPath = resolve(args.validationSchema);
    const declaredSchemaPath = typeof manifest.heldBackValidationSchema === 'string'
      ? resolve(dirname(manifestPath), manifest.heldBackValidationSchema)
      : null;
    if (manifest.kind !== 'segmently.packet-only-agent-run' || manifest.schemaVersion !== 2) {
      failures.push({ stage: 'schema-snapshot', message: 'run manifest is not the supported packet-only schemaVersion 2 contract' });
    }
    if (manifest.exactInputHash !== packet.exactInputHash || manifest.checksum !== packet.checksum) {
      failures.push({ stage: 'schema-snapshot', message: 'run manifest does not bind the evaluated runtime packet' });
    }
    if (!declaredSchemaPath || declaredSchemaPath !== validationSchemaPath) {
      failures.push({ stage: 'schema-snapshot', message: 'validation schema path does not match run-manifest.json' });
    }
    const validationSchemaBytes = readFileSync(validationSchemaPath);
    runSnapshotChecksum = sha256(validationSchemaBytes);
    if (manifest.validationSchemaChecksum !== runSnapshotChecksum) {
      failures.push({
        stage: 'schema-snapshot',
        message: `validation schema checksum mismatch: expected ${String(manifest.validationSchemaChecksum)}, received ${runSnapshotChecksum}`,
      });
    }
    runSnapshotContract = JSON.parse(validationSchemaBytes.toString('utf8'));
  }
}
let output = null;

if (packetValidation.ok) {
  try {
    output = parseJsonResponse(readFileSync(resolve(args.output), 'utf8'));
  } catch (error) {
    failures.push({ stage: 'json-parse', message: error instanceof Error ? error.message : String(error) });
  }
}

if (output) {
  const outputSchema = packet.outputSchema?.schema ?? runSnapshotContract?.schema;
  if (!outputSchema) {
    failures.push({ stage: 'schema', message: 'runtime output schema is unavailable' });
  } else {
    for (const message of validateJsonSchema(output, outputSchema)) {
      failures.push({ stage: 'schema', message });
    }
  }
  for (const path of findOutputAssetLeaks(output)) {
    failures.push({ stage: 'asset-isolation', message: `forbidden source/generated asset material at ${path}` });
  }
  failures.push(...validateLibraryAdaptationSemantics(output, packet, outputSchema));
}

const block = extractBlock(output);
const schemaSource = packet?.outputSchema?.schema
  ? 'provider-packet'
  : runSnapshotContract?.schema
    ? 'run-snapshot'
    : 'unavailable';
const result = {
  ok: failures.length === 0,
  proofClass: 'advisory-subagent-smoke',
  replacesRuntimeTaskDebug: false,
  exactInputHash: packet.exactInputHash,
  schemaValidationApplied: Boolean(output && (packet?.outputSchema?.schema || runSnapshotContract?.schema)),
  schemaSource,
  validationSchemaChecksum: packet?.outputSchema?.schema ? null : runSnapshotChecksum,
  earliestFailureStage: failures[0]?.stage ?? null,
  failures,
  summary: {
    blockFound: Boolean(block),
    blockName: block?.name ?? null,
    screenCount: Array.isArray(block?.screens) ? block.screens.length : 0,
    instructionCount: Array.isArray(block?.instructions) ? block.instructions.length : Number(Boolean(block?.description)),
    dataUsagePresent: Boolean(block && isRecord(block.dataUsage)),
    dataMappingCount: countArrayKey(block, 'dataMapping'),
    assetIntentCount: countArrayKey(block, 'assetIntents'),
  },
};

if (args.report) writeFileSync(resolve(args.report), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

function validateLibraryAdaptationSemantics(output, packet, outputSchema) {
  const failures = [];
  const branch = packet.resolvedBranch;
  const block = extractBlock(output);
  if (!block) return [{ stage: 'domain', message: 'output must contain exactly one onboardingStrategySequence block' }];
  if (packet.renderInput?.target?.blockId && block.id !== packet.renderInput.target.blockId) {
    failures.push({ stage: 'identity', message: `adapted block id must remain ${packet.renderInput.target.blockId}` });
  }
  if (packet.renderInput?.target?.blockType && block.blockType !== packet.renderInput.target.blockType) {
    failures.push({ stage: 'identity', message: `adapted blockType must remain ${packet.renderInput.target.blockType}` });
  }
  if (!Array.isArray(block.screens) || block.screens.length === 0) {
    failures.push({ stage: 'domain', message: 'adapted block must contain screens' });
  }
  if (!Array.isArray(block.instructions) || block.instructions.length < 2 || block.instructions.length > 6) {
    failures.push({ stage: 'instructions', message: 'adapted block must contain 2-6 regenerated leveled instructions' });
  } else {
    for (const [index, instruction] of block.instructions.entries()) {
      if (!isRecord(instruction)
        || !['mustHave', 'should', 'niceToHave', 'forbidden'].includes(instruction.level)
        || typeof instruction.text !== 'string'
        || !instruction.text.trim()) {
        failures.push({ stage: 'instructions', message: `instruction ${index} must contain canonical level and non-empty text` });
      }
    }
  }
  if (!isRecord(block.dataUsage)) failures.push({ stage: 'data-usage', message: 'adapted block must contain dataUsage' });
  if (!isRecord(block.blockContract)
    || !Array.isArray(block.blockContract.inputVariables)
    || !Array.isArray(block.blockContract.outputAssignment)) {
    failures.push({ stage: 'variables', message: 'adapted block must contain canonical blockContract inputVariables/outputAssignment arrays' });
  }
  for (const [index, screen] of (block.screens ?? []).entries()) {
    if (!isRecord(screen?.aiMeta)) failures.push({ stage: 'data-mapping', message: `screen ${index} missing aiMeta` });
    else if (!Array.isArray(screen.aiMeta.dataMapping)) failures.push({ stage: 'data-mapping', message: `screen ${index} missing aiMeta.dataMapping` });
  }
  if (branch?.evidenceMode !== 'no-evidence' && countArrayKey(block, 'dataMapping') === 0) {
    failures.push({ stage: 'data-mapping', message: 'at least one evidence-using screen must be grounded in the resolved evidence packet' });
  }
  if (branch?.hasAssetIntents && countArrayKey(block, 'assetIntents') === 0) {
    failures.push({ stage: 'asset-intents', message: 'resolved branch requires adapted assetIntents' });
  }
  failures.push(...validateCanonicalScreenShape(block, outputSchema));
  failures.push(...validateVariablePersonalization(block));
  failures.push(...validateMotivationSemantics(block));
  failures.push(...validatePersistedContentBoundary(block));
  failures.push(...validateNavigation(block));
  failures.push(...validateEvidenceBoundary(block, packet));
  failures.push(...validateVariableMappings(block, packet));
  return failures;
}

function validatePersistedContentBoundary(block) {
  const failures = [];
  const fields = [];
  if (typeof block.description === 'string') fields.push(['description', block.description]);
  for (const [index, instruction] of (block.instructions ?? []).entries()) {
    if (typeof instruction?.text === 'string') fields.push([`instructions[${index}].text`, instruction.text]);
  }
  for (const [index, screen] of (block.screens ?? []).entries()) {
    collectStringFields(screen?.content, `screens[${index}].content`, fields);
    if (typeof screen?.aiMeta?.blockRole === 'string') {
      fields.push([`screens[${index}].aiMeta.blockRole`, screen.aiMeta.blockRole]);
    }
    collectStringFields(screen?.aiMeta?.assetIntents, `screens[${index}].aiMeta.assetIntents`, fields);
  }

  const forbidden = [
    ['update-mode', /\bupdate[- ]mode\b/i],
    ['fallback-audience', /\bfallback[- ]audience\b/i],
    ['semantic branch', /\bsemantic branch\b/i],
    ['pinned insight package', /\bpinned insight package\b/i],
    ['resolved proof fields', /\b(?:resolved|eligible) (?:proof|evidence) fields?\b/i],
    ['prompt/compiler plumbing', /\b(?:compiler|compile input|runtime packet|provider request|provider response|task-debug|(?:system|model|provider|agent) prompts?|prompt (?:packet|registry|version|storage|path|section|compiler))\b/i],
  ];
  for (const [path, value] of fields) {
    for (const [label, pattern] of forbidden) {
      if (pattern.test(value)) {
        failures.push({
          stage: 'content-boundary',
          message: `${path} persists internal ${label} terminology`,
        });
      }
    }
  }
  return failures;
}

function collectStringFields(value, path, fields) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringFields(item, `${path}[${index}]`, fields));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) => collectStringFields(child, `${path}.${key}`, fields));
    return;
  }
  if (typeof value === 'string') fields.push([path, value]);
}

function validateVariablePersonalization(block) {
  const failures = [];
  for (const [screenIndex, screen] of (block.screens ?? []).entries()) {
    for (const path of findMustachePaths(screen?.content, `screens[${screenIndex}].content`)) {
      failures.push({
        stage: 'variables',
        message: `${path} uses unsupported mustache syntax; V2 runtime text uses @variable or @variable.key`,
      });
    }
    for (const [realizationIndex, realization] of (screen?.aiMeta?.variableRealizations ?? []).entries()) {
      if (realization?.realizationKind !== 'personalization_source') continue;
      const variableId = typeof realization.variableId === 'string' ? realization.variableId : '';
      const contentPath = typeof realization.contentPath === 'string' ? realization.contentPath : '';
      const contentValue = readPath(screen, contentPath);
      if (typeof contentValue !== 'string') {
        failures.push({
          stage: 'variables',
          message: `screen ${screenIndex} personalization ${realizationIndex} contentPath must resolve to runtime text`,
        });
        continue;
      }
      const escaped = variableId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const runtimeToken = new RegExp(`@${escaped}(?:\\.[A-Za-z0-9_-]+)?(?![A-Za-z0-9_-])`);
      if (!variableId || !runtimeToken.test(contentValue)) {
        failures.push({
          stage: 'variables',
          message: `screen ${screenIndex} personalization ${realizationIndex} is not realized as @${variableId} at ${contentPath}`,
        });
      }
    }
  }
  return failures;
}

function validateMotivationSemantics(block) {
  const failures = [];
  for (const [screenIndex, screen] of (block.screens ?? []).entries()) {
    const spec = screen?.aiMeta?.motivationSpec;
    if (!isRecord(spec)) continue;
    const mirrorsUserInput = (screen?.aiMeta?.variableRealizations ?? [])
      .some(realization => realization?.realizationKind === 'personalization_source');
    if (typeof spec.class === 'string' && spec.class.startsWith('gain:')) {
      if (typeof spec.targetsNeed !== 'string' || !spec.targetsNeed.trim()) {
        failures.push({
          stage: 'motivation',
          message: `screen ${screenIndex} gain motivationSpec requires a non-empty targetsNeed`,
        });
      }
    }
    if (spec.reflectsJtbd !== mirrorsUserInput) {
      failures.push({
        stage: 'motivation',
        message: `screen ${screenIndex} motivationSpec.reflectsJtbd must equal whether visible copy mirrors a personalization source`,
      });
    }
  }
  return failures;
}

function findMustachePaths(value, path, results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findMustachePaths(item, `${path}[${index}]`, results));
    return results;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) => findMustachePaths(child, `${path}.${key}`, results));
    return results;
  }
  if (typeof value === 'string' && /\{\{[^{}]+\}\}/.test(value)) results.push(path);
  return results;
}

function readPath(value, path) {
  if (!path) return undefined;
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if ((isRecord(current) || Array.isArray(current)) && segment in current) current = current[segment];
    else return undefined;
  }
  return current;
}

function validateCanonicalScreenShape(block, outputSchema) {
  const failures = [];
  const blockSchema = outputSchema?.properties?.result?.properties
    ?.onboardingStrategySequence?.items;
  const screenSchema = blockSchema?.properties?.screens?.items;
  if (!isRecord(screenSchema) || !isRecord(screenSchema.properties)) {
    return [{ stage: 'schema-contract', message: 'runtime schema does not expose the canonical screen shape' }];
  }

  for (const [index, screen] of (block.screens ?? []).entries()) {
    failures.push(...findUndeclaredKeys(screen, screenSchema, `screens[${index}]`));
    failures.push(...findUndeclaredKeys(
      screen?.content,
      screenSchema.properties.content,
      `screens[${index}].content`,
    ));
    failures.push(...findUndeclaredKeys(
      screen?.aiMeta,
      screenSchema.properties.aiMeta,
      `screens[${index}].aiMeta`,
    ));

    const aiMetaSchema = screenSchema.properties.aiMeta;
    for (const [mappingIndex, mapping] of (screen?.aiMeta?.dataMapping ?? []).entries()) {
      failures.push(...findUndeclaredKeys(
        mapping,
        aiMetaSchema?.properties?.dataMapping?.items,
        `screens[${index}].aiMeta.dataMapping[${mappingIndex}]`,
      ));
    }
    for (const [intentIndex, intent] of (screen?.aiMeta?.assetIntents ?? []).entries()) {
      failures.push(...findUndeclaredKeys(
        intent,
        aiMetaSchema?.properties?.assetIntents?.items,
        `screens[${index}].aiMeta.assetIntents[${intentIndex}]`,
      ));
    }
    for (const [realizationIndex, realization] of (screen?.aiMeta?.variableRealizations ?? []).entries()) {
      failures.push(...findUndeclaredKeys(
        realization,
        aiMetaSchema?.properties?.variableRealizations?.items,
        `screens[${index}].aiMeta.variableRealizations[${realizationIndex}]`,
      ));
    }
  }
  return failures;
}

function findUndeclaredKeys(value, schema, path) {
  if (!isRecord(value) || !isRecord(schema) || !isRecord(schema.properties)) return [];
  const allowed = new Set(Object.keys(schema.properties));
  return Object.keys(value)
    .filter(key => !allowed.has(key))
    .map(key => ({
      stage: 'canonical-shape',
      message: `${path}.${key} is not declared by the runtime simplified-screen schema`,
    }));
}

function validateNavigation(block) {
  const failures = [];
  if (!Array.isArray(block.screens) || block.screens.length === 0) return failures;
  const ids = block.screens.map(screen => screen?.id).filter(id => typeof id === 'string');
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) failures.push({ stage: 'routes', message: 'screen ids must be unique' });
  if (!uniqueIds.has(block.firstScreenId)) failures.push({ stage: 'routes', message: 'firstScreenId must name a screen in the adapted block' });

  const adjacency = new Map(ids.map(id => [id, []]));
  let terminalActionCount = 0;
  for (const [index, screen] of block.screens.entries()) {
    const actions = collectActionObjects(screen);
    const edges = actions.flatMap(action => Array.isArray(action.edges) ? action.edges : []);
    terminalActionCount += actions.filter(action => ['complete', 'purchase'].includes(action.kind)).length;
    if (actions.length === 0) failures.push({ stage: 'routes', message: `screen ${index} has no canonical action` });
    for (const [actionIndex, action] of actions.entries()) {
      if (Object.hasOwn(action, 'navigate')) {
        failures.push({
          stage: 'routes',
          message: `screen ${index} action ${actionIndex} uses forbidden navigate alias`,
        });
      }
    }
    for (const [edgeIndex, edge] of edges.entries()) {
      if (isRecord(edge) && Object.hasOwn(edge, 'to')) {
        failures.push({
          stage: 'routes',
          message: `screen ${index} edge ${edgeIndex} uses forbidden to alias`,
        });
      }
      if (!uniqueIds.has(edge?.nextScreenId)) {
        failures.push({ stage: 'routes', message: `screen ${index} points to unknown nextScreenId ${String(edge?.nextScreenId)}` });
      } else if (typeof screen?.id === 'string') {
        adjacency.get(screen.id)?.push(edge.nextScreenId);
      }
    }
  }
  if (terminalActionCount === 0) failures.push({ stage: 'routes', message: 'adapted block must contain a complete or purchase terminal action' });

  if (uniqueIds.has(block.firstScreenId)) {
    const visited = new Set();
    const queue = [block.firstScreenId];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...(adjacency.get(current) ?? []));
    }
    for (const id of uniqueIds) {
      if (!visited.has(id)) failures.push({ stage: 'routes', message: `screen ${id} is unreachable from firstScreenId` });
    }
  }
  return failures;
}

function validateEvidenceBoundary(block, packet) {
  const failures = [];
  const evidence = packet.renderInput?.evidence;
  const mode = evidence?.mode ?? packet.resolvedBranch?.evidenceMode;
  const allowedRefs = new Set();
  for (const item of evidence?.items ?? []) {
    allowedRefs.add(`@${item.kind}[${item.id}]`);
    for (const ref of findEvidenceRefs(item.value)) allowedRefs.add(ref);
  }
  const outputRefs = findEvidenceRefs(block);
  if (mode === 'no-evidence') {
    for (const ref of outputRefs) failures.push({ stage: 'evidence', message: `no-evidence output contains forbidden source reference ${ref}` });
    if (countArrayKey(block, 'dataMapping') > 0 || countArrayKey(block.dataUsage, 'dataMappingItems') > 0) {
      failures.push({ stage: 'evidence', message: 'no-evidence output must not contain evidence-derived data mappings' });
    }
  } else {
    for (const ref of outputRefs) {
      if (!allowedRefs.has(ref)) failures.push({ stage: 'evidence', message: `output cites unselected evidence ${ref}` });
    }
    const dataUsageRefs = findEvidenceRefs(block.dataUsage);
    if (!dataUsageRefs.some(ref => allowedRefs.has(ref))) {
      failures.push({ stage: 'data-usage', message: 'dataUsage must record at least one resolved evidence reference' });
    }
  }
  return failures;
}

function validateVariableMappings(block, packet) {
  const failures = [];
  const sourceBlueprint = packet.renderInput?.sourceExample?.blueprint;
  for (const mapping of packet.renderInput?.variableMappings ?? []) {
    const sourceUsed = containsIdentifier(sourceBlueprint, mapping.sourceVariableId);
    if (containsIdentifier(block, mapping.sourceVariableId)) {
      failures.push({ stage: 'variables', message: `source variable ${mapping.sourceVariableId} remains referenced after ${mapping.action}` });
    }
    const targetId = mapping.action === 'bind'
      ? mapping.targetVariableId
      : mapping.action === 'create'
        ? mapping.targetVariable?.id
        : mapping.action === 'incompatible' && mapping.resolution === 'rewrite-to-target'
          ? mapping.targetVariableId
          : undefined;
    if (sourceUsed && targetId && !containsIdentifier(block, targetId)) {
      failures.push({ stage: 'variables', message: `mapped target variable ${targetId} is not realized in the adapted block` });
    }
  }
  return failures;
}

function collectActionObjects(value, results = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectActionObjects(item, results));
    return results;
  }
  if (!isRecord(value)) return results;
  if (typeof value.kind === 'string' && Array.isArray(value.edges)) results.push(value);
  Object.values(value).forEach(child => collectActionObjects(child, results));
  return results;
}

function findEvidenceRefs(value, results = []) {
  if (Array.isArray(value)) {
    value.forEach(item => findEvidenceRefs(item, results));
    return results;
  }
  if (isRecord(value)) {
    Object.values(value).forEach(child => findEvidenceRefs(child, results));
    return results;
  }
  if (typeof value !== 'string') return results;
  for (const match of value.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)\[[^\]\s]+\](?:\.[A-Za-z0-9_.\[\]-]+)?/g)) {
    if (EVIDENCE_REF_KINDS.has(match[1]) && !results.includes(match[0])) {
      results.push(match[0]);
    }
  }
  return results;
}

function containsIdentifier(value, identifier) {
  if (!identifier) return false;
  if (Array.isArray(value)) return value.some(item => containsIdentifier(item, identifier));
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) => key === identifier || containsIdentifier(child, identifier));
  }
  if (typeof value !== 'string') return false;
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(value);
}

function extractBlock(output) {
  const blocks = output?.result?.onboardingStrategySequence ?? output?.onboardingStrategySequence;
  return Array.isArray(blocks) && blocks.length === 1 && isRecord(blocks[0]) ? blocks[0] : null;
}

function countArrayKey(value, target) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countArrayKey(item, target), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((sum, [key, child]) => sum + (key === target && Array.isArray(child) ? child.length : 0) + countArrayKey(child, target), 0);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    fail(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--packet') out.packet = argv[++index];
    else if (argv[index] === '--output') out.output = argv[++index];
    else if (argv[index] === '--validation-schema') out.validationSchema = argv[++index];
    else if (argv[index] === '--run-manifest') out.runManifest = argv[++index];
    else if (argv[index] === '--report') out.report = argv[++index];
    else fail(`Unknown option ${argv[index]}`);
  }
  return out;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
