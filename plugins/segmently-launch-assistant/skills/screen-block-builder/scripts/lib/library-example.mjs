import { canonicalJson, isRecord } from './runtime-packet.mjs';

const FORBIDDEN_BLUEPRINT_KEYS = new Set([
  'aiAssets',
  'generatedUrl',
  'posterUrl',
  'referenceImages',
  'provider',
  'model',
  'generationModel',
  'generationTimestamp',
  'sourceDataSnapshot',
]);

export function validateLibraryExample(input) {
  const failures = [];
  if (!isRecord(input)) return { ok: false, failures: ['example must be an object'] };
  if (input.schemaVersion !== 2) failures.push('schemaVersion must be 2');
  if ('envelope' in input) failures.push('v1 envelope is unsupported');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) failures.push('name must be non-empty');
  else if (name.length > 160) failures.push('name must be at most 160 characters');
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') failures.push('description must be a string');
    else if (input.description.trim().length > 1000) failures.push('description must be at most 1000 characters');
  }
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) failures.push('tags must be an array');
    else if (input.tags.length > 8) failures.push('at most 8 tags are allowed');
    else input.tags.forEach((tag, index) => {
      if (!nonEmpty(tag)) failures.push(`tags[${index}] must be non-empty`);
      else if (tag.trim().length > 40) failures.push(`tags[${index}] must be at most 40 characters`);
    });
  }
  const scopeMetadata = validateScopeMetadata(input.scopeMetadata, failures);
  if (!Number.isInteger(input.screensCount) || input.screensCount < 1) {
    failures.push('screensCount must be a positive integer');
  }
  if (!isRecord(input.contractSummary)
    || !nonNegativeInteger(input.contractSummary.inputs)
    || !nonNegativeInteger(input.contractSummary.outputs)) {
    failures.push('contractSummary must contain non-negative integer inputs/outputs');
  }
  if (typeof input.enabled !== 'boolean') failures.push('enabled must be boolean');
  if (input.systemExampleId !== undefined && input.systemExampleId !== null && !nonEmpty(input.systemExampleId)) {
    failures.push('systemExampleId must be non-empty when present');
  }

  const blueprint = isRecord(input.blueprint) ? input.blueprint : null;
  if (!blueprint) failures.push('blueprint must be an object');
  const previewScreens = Array.isArray(input.previewScreens) ? input.previewScreens : [];
  if (!previewScreens.length) failures.push('previewScreens must contain at least one full screen');
  const blueprintScreens = validateBlueprint(blueprint, failures);
  const blueprintIds = screenIds(blueprintScreens, 'blueprint.screens', failures);
  const previewIds = screenIds(previewScreens, 'previewScreens', failures);

  if (canonicalJson(blueprintIds) !== canonicalJson(previewIds)) {
    failures.push('blueprint.screens and previewScreens must share ordered stable ids');
  }
  blueprintScreens.forEach((screen, index) => {
    if (isRecord(previewScreens[index]) && String(screen.screenType ?? '') !== String(previewScreens[index].screenType ?? '')) {
      failures.push(`screen type mismatch at ${screen.id ?? index}`);
    }
  });
  if (blueprint && isRecord(blueprint.strategicBlock)) {
    if (!blueprintIds.includes(blueprint.strategicBlock.firstScreenId)) {
      failures.push('blueprint.strategicBlock.firstScreenId must reference a blueprint screen');
    }
    if (scopeMetadata && String(blueprint.strategicBlock.blockType) !== scopeMetadata.blockType) {
      failures.push('scopeMetadata.blockType must match blueprint.strategicBlock.blockType');
    }
    if (scopeMetadata
      && (blueprint.strategicBlock.customSubtype ?? undefined) !== scopeMetadata.customSubtype) {
      failures.push('scopeMetadata.customSubtype must match blueprint.strategicBlock.customSubtype');
    }
  }
  if (input.screensCount !== blueprintIds.length) {
    failures.push('screensCount must equal blueprint.screens.length');
  }

  if (blueprint && isRecord(blueprint.contract) && isRecord(input.contractSummary)) {
    const inputs = Array.isArray(blueprint.contract.inputVariables) ? blueprint.contract.inputVariables.length : 0;
    const outputs = Array.isArray(blueprint.contract.outputAssignment) ? blueprint.contract.outputAssignment.length : 0;
    if (input.contractSummary.inputs !== inputs || input.contractSummary.outputs !== outputs) {
      failures.push('contractSummary must match blueprint.contract');
    }
  }

  const sourceRef = input.sourceRef;
  if (!isRecord(sourceRef)
    || !nonEmpty(sourceRef.strategyId)
    || !nonEmpty(sourceRef.blockId)
    || !nonEmpty(sourceRef.blockEntityId)) {
    failures.push('sourceRef must carry strategyId, blockId and blockEntityId');
  }

  const checksumInput = blueprint && previewScreens.length && isRecord(sourceRef) && scopeMetadata
    ? { schemaVersion: 2, sourceRef, scopeMetadata, blueprint, previewScreens }
    : null;
  const computedChecksum = checksumInput ? computeLibrarySourceChecksum(checksumInput) : undefined;
  if (!/^fnv1a:[a-f0-9]{8}$/.test(String(input.sourceChecksum ?? ''))) {
    failures.push('sourceChecksum must be fnv1a:<8 lowercase hex characters>');
  } else if (computedChecksum && input.sourceChecksum !== computedChecksum) {
    failures.push(`sourceChecksum mismatch: expected ${computedChecksum}`);
  }

  const payloadBytes = blueprint && previewScreens.length
    ? Buffer.byteLength(JSON.stringify({ blueprint, previewScreens }), 'utf8')
    : 0;
  if (payloadBytes > 900000) failures.push(`blueprint + previewScreens exceed 900000 bytes (${payloadBytes})`);

  return {
    ok: failures.length === 0,
    failures,
    computedChecksum,
    summary: {
      name,
      blockType: scopeMetadata?.blockType,
      enabled: input.enabled,
      screenCount: blueprintIds.length,
      orderedScreenIds: blueprintIds,
      payloadBytes,
      instructionCount: Array.isArray(blueprint?.instructions) ? blueprint.instructions.length : 0,
      assetExampleCount: Array.isArray(blueprint?.assetExamples) ? blueprint.assetExamples.length : 0,
      assetIntentCount: countKeys(blueprint, 'assetIntents'),
      dataMappingCount: countKeys(blueprint, 'dataMapping'),
    },
  };
}

export function validateBlueprint(blueprint, failures = []) {
  if (!isRecord(blueprint)) {
    failures.push('blueprint must be an object');
    return [];
  }
  if (!isRecord(blueprint.strategicBlock)) failures.push('blueprint.strategicBlock must be an object');
  else {
    const sourceOnly = ['taskId', 'order', 'isFirstBlock', 'action']
      .filter(field => Object.prototype.hasOwnProperty.call(blueprint.strategicBlock, field));
    if (sourceOnly.length) failures.push(`blueprint.strategicBlock contains source-only fields: ${sourceOnly.join(', ')}`);
  }
  const screens = Array.isArray(blueprint.screens) ? blueprint.screens : [];
  if (!screens.length) failures.push('blueprint.screens must contain at least one simplified screen');
  if (!Array.isArray(blueprint.instructions)) failures.push('blueprint.instructions must be an array');
  if (!isRecord(blueprint.contract)) failures.push('blueprint.contract must be an object');
  if (!isRecord(blueprint.dataSemantics) || !Array.isArray(blueprint.dataSemantics.screens)) {
    failures.push('blueprint.dataSemantics.screens must be an array');
  }
  if (!Array.isArray(blueprint.assetExamples)) failures.push('blueprint.assetExamples must be an array');
  if (!isRecord(blueprint.strategyVariables)) failures.push('blueprint.strategyVariables must be an object');

  const ids = screenIds(screens, 'blueprint.screens', failures);
  const semanticScreens = Array.isArray(blueprint.dataSemantics?.screens) ? blueprint.dataSemantics.screens : [];
  const semanticIds = [];
  semanticScreens.forEach((entry, index) => {
    if (!isRecord(entry) || !nonEmpty(entry.screenId)) {
      failures.push(`blueprint.dataSemantics.screens[${index}].screenId must be non-empty`);
      return;
    }
    semanticIds.push(entry.screenId);
    if (!ids.includes(entry.screenId)) failures.push(`blueprint.dataSemantics.screens[${index}].screenId is unknown`);
    if (!Array.isArray(entry.dataMapping)) failures.push(`blueprint.dataSemantics.screens[${index}].dataMapping must be an array`);
    if (!Array.isArray(entry.variableRealizations)) failures.push(`blueprint.dataSemantics.screens[${index}].variableRealizations must be an array`);
    const screen = screens.find(candidate => candidate.id === entry.screenId);
    if (screen && Array.isArray(entry.dataMapping)
      && canonicalJson(entry.dataMapping) !== canonicalJson(screen.aiMeta?.dataMapping ?? [])) {
      failures.push(`blueprint.dataSemantics.screens[${index}].dataMapping must exactly match screen ${entry.screenId} aiMeta.dataMapping`);
    }
    if (screen && Array.isArray(entry.variableRealizations)
      && canonicalJson(entry.variableRealizations) !== canonicalJson(screen.aiMeta?.variableRealizations ?? [])) {
      failures.push(`blueprint.dataSemantics.screens[${index}].variableRealizations must exactly match screen ${entry.screenId} aiMeta.variableRealizations`);
    }
  });
  if (canonicalJson(ids) !== canonicalJson(semanticIds)) {
    failures.push('blueprint.dataSemantics.screens must cover every blueprint screen once in order');
  }

  const assetKeys = new Set();
  for (const [index, example] of (blueprint.assetExamples ?? []).entries()) {
    if (!isRecord(example) || !nonEmpty(example.screenId) || !ids.includes(example.screenId)) {
      failures.push(`blueprint.assetExamples[${index}].screenId must identify a blueprint screen`);
      continue;
    }
    if (!nonEmpty(example.slotKey)) failures.push(`blueprint.assetExamples[${index}].slotKey must be non-empty`);
    const key = `${example.screenId}:${example.slotKey}`;
    if (assetKeys.has(key)) failures.push(`blueprint.assetExamples duplicates ${key}`);
    assetKeys.add(key);
  }
  for (const path of findForbiddenBlueprintPaths(blueprint)) {
    failures.push(`blueprint contains forbidden generated/provider material at ${path}`);
  }
  return screens;
}

function validateScopeMetadata(value, failures) {
  if (!isRecord(value) || !nonEmpty(value.blockType)) {
    failures.push('scopeMetadata.blockType must be non-empty');
    return null;
  }
  const blockType = value.blockType.trim();
  let customSubtype;
  if (value.customSubtype !== undefined && value.customSubtype !== null) {
    if (typeof value.customSubtype !== 'string'
      || value.customSubtype !== value.customSubtype.trim()
      || !/^[a-z0-9][a-z0-9_-]*$/.test(value.customSubtype)) {
      failures.push('scopeMetadata.customSubtype must be a normalized lowercase slug');
    } else if (blockType !== 'custom') {
      failures.push('scopeMetadata.customSubtype is allowed only for custom blocks');
    } else customSubtype = value.customSubtype;
  }
  return { blockType, ...(customSubtype ? { customSubtype } : {}) };
}

export function computeLibrarySourceChecksum(value) {
  const canonical = canonicalJson({
    schemaVersion: value.schemaVersion,
    sourceRef: value.sourceRef,
    scopeMetadata: value.scopeMetadata,
    blueprint: value.blueprint,
    previewScreens: value.previewScreens,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, '0')}`;
}

export function findForbiddenBlueprintPaths(value, path = '$', results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenBlueprintPaths(item, `${path}[${index}]`, results));
    return results;
  }
  if (!isRecord(value)) return results;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_BLUEPRINT_KEYS.has(key)) results.push(childPath);
    else findForbiddenBlueprintPaths(child, childPath, results);
  }
  return results;
}

function screenIds(screens, label, failures) {
  const ids = [];
  const seen = new Set();
  screens.forEach((screen, index) => {
    const id = isRecord(screen) && nonEmpty(screen.id) ? screen.id : '';
    if (!id) failures.push(`${label}[${index}].id must be non-empty`);
    else if (seen.has(id)) failures.push(`${label} contains duplicate id ${id}`);
    else { seen.add(id); ids.push(id); }
  });
  return ids;
}

function countKeys(value, target) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countKeys(item, target), 0);
  if (!isRecord(value)) return 0;
  return Object.entries(value).reduce((sum, [key, child]) => (
    sum + (key === target && Array.isArray(child) ? child.length : 0) + countKeys(child, target)
  ), 0);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}
