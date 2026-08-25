import { createHash } from 'node:crypto';

export const PACKET_VERSION = 1;

const FORBIDDEN_KEYS = new Set([
  'previewScreens',
  'aiAssets',
  'generatedUrl',
  'generatedUrls',
  'downloadUrl',
  'storagePath',
  'firestorePath',
  'expectedAnswer',
  'evaluatorVerdict',
  'alternativeBranches',
  'unselectedEvidence',
  'allEvidence',
]);

const REQUIRED_BRANCH_FIELDS = {
  agentId: ['updateBlockFromLibrary'],
  insertionMode: ['staged', 'immediate'],
  sourceScope: ['project', 'system'],
  evidenceMode: ['strategy-default', 'selected-only', 'no-evidence'],
  neighbours: ['both', 'predecessor-only', 'successor-only', 'none'],
};

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = canonicalize(value[key]);
  }
  return out;
}

export function canonicalJson(value) {
  return stableStringify(value);
}

export function computePacketHash(packet) {
  return sha256(stableStringify({
    attempt: 1,
    provider: packet.provider,
    model: packet.model,
    maxTokens: packet.maxTokens,
    messages: [
      { role: 'system', content: packet.systemPrompt },
      { role: 'user', content: packet.effectiveUserMessage },
    ],
    ...(packet.outputSchema ? { outputSchema: packet.outputSchema } : {}),
  }));
}

export function computePacketChecksum(packet) {
  const { checksum: _checksum, ...packetWithoutChecksum } = packet;
  return sha256(stableStringify(packetWithoutChecksum));
}

export function validateRuntimePacket(packet) {
  const failures = [];
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return { ok: false, failures: ['packet must be a JSON object'] };
  }
  if (packet.packetVersion !== PACKET_VERSION) failures.push(`packetVersion must be ${PACKET_VERSION}`);
  if (packet.agentId !== 'updateBlockFromLibrary') {
    failures.push('agentId must be updateBlockFromLibrary');
  }
  if (packet.taskType !== 'block-update') failures.push('taskType must be block-update');
  if (packet.promptMode !== 'library-adapt') failures.push('promptMode must be library-adapt');
  if (packet.attempt !== 1) failures.push('attempt must be 1 for the exported local packet');
  if (typeof packet.provider !== 'string' || !packet.provider.trim()) failures.push('provider must be non-empty');
  if (typeof packet.model !== 'string' || !packet.model.trim()) failures.push('model must be non-empty');
  if (!Number.isInteger(packet.maxTokens) || packet.maxTokens <= 0) failures.push('maxTokens must be a positive integer');
  if (!Array.isArray(packet.promptPaths) || packet.promptPaths.length === 0) failures.push('promptPaths must be non-empty');
  if (typeof packet.systemPrompt !== 'string' || !packet.systemPrompt.trim()) {
    failures.push('systemPrompt must be a non-empty string');
  }
  if (typeof packet.userMessage !== 'string' || !packet.userMessage.trim()) {
    failures.push('userMessage must be a non-empty string');
  }
  if (typeof packet.effectiveUserMessage !== 'string' || !packet.effectiveUserMessage.trim()) {
    failures.push('effectiveUserMessage must be a non-empty string');
  }
  if (!isRecord(packet.renderInput)) failures.push('renderInput must be an object');
  if (packet.outputSchema !== undefined && (!isRecord(packet.outputSchema) || !isRecord(packet.outputSchema.schema))) {
    failures.push('outputSchema.schema must be an object when outputSchema is present');
  }
  if (packet.provider === 'google' && packet.outputSchema !== undefined) {
    failures.push('Google exact runtime packets must omit outputSchema');
  }
  if (packet.provider !== 'google' && packet.outputSchema === undefined) {
    failures.push('non-Google exact runtime packets must include outputSchema');
  }
  if (!isRecord(packet.resolvedBranch)) failures.push('resolvedBranch must be an object');
  if (!isRecord(packet.promptVersions)) failures.push('promptVersions must be an object');

  if (isRecord(packet.resolvedBranch)) {
    for (const [field, allowed] of Object.entries(REQUIRED_BRANCH_FIELDS)) {
      if (!allowed.includes(packet.resolvedBranch[field])) {
        failures.push(`resolvedBranch.${field} must be one of ${allowed.join('|')}`);
      }
    }
    for (const field of ['hasVariableConflicts', 'hasAssetIntents', 'hasTargetTheme', 'operatorInstructionPresent']) {
      if (typeof packet.resolvedBranch[field] !== 'boolean') failures.push(`resolvedBranch.${field} must be boolean`);
    }
    if (packet.resolvedBranch.agentId !== packet.agentId) failures.push('resolvedBranch.agentId must equal packet.agentId');
  }

  const leaked = findForbiddenPacketMaterial({
    systemPrompt: packet.systemPrompt,
    userMessage: packet.userMessage,
    effectiveUserMessage: packet.effectiveUserMessage,
    renderInput: packet.renderInput,
  });
  failures.push(...leaked.map(item => `forbidden packet material at ${item}`));

  if (!/^sha256:[a-f0-9]{64}$/.test(String(packet.exactInputHash ?? ''))) {
    failures.push('exactInputHash must be sha256:<64 lowercase hex characters>');
  } else {
    const computedHash = computePacketHash(packet);
    if (packet.exactInputHash !== computedHash) {
      failures.push(`exactInputHash mismatch: expected ${computedHash}`);
    }
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(packet.checksum ?? ''))) {
    failures.push('checksum must be sha256:<64 lowercase hex characters>');
  } else {
    const computedChecksum = computePacketChecksum(packet);
    if (packet.checksum !== computedChecksum) failures.push(`checksum mismatch: expected ${computedChecksum}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    computedHash: computePacketHash(packet),
    computedChecksum: computePacketChecksum(packet),
    summary: {
      agentId: packet.agentId,
      systemPromptBytes: byteLength(packet.systemPrompt),
      userMessageBytes: byteLength(packet.userMessage),
      effectiveUserMessageBytes: byteLength(packet.effectiveUserMessage),
      renderInputBytes: byteLength(canonicalJson(packet.renderInput)),
      outputSchemaBytes: byteLength(canonicalJson(packet.outputSchema)),
      branch: packet.resolvedBranch,
    },
  };
}

export function buildAgentRequest(packet) {
  return {
    schemaVersion: 1,
    kind: 'segmently.packet-only-agent-request',
    exactInputHash: packet.exactInputHash,
    checksum: packet.checksum,
    provider: packet.provider,
    model: packet.model,
    maxTokens: packet.maxTokens,
    systemPrompt: packet.systemPrompt,
    userMessage: packet.effectiveUserMessage,
    ...(packet.outputSchema ? { outputSchema: packet.outputSchema } : {}),
    executionPolicy: {
      allowedInput: 'this-file-only',
      repositoryAccess: false,
      fileEditing: false,
      tools: false,
      expectedAnswerVisible: false,
      response: 'json-only',
    },
  };
}

export function parseJsonResponse(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('agent output is empty');
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!match) throw new Error('agent output is not valid JSON');
    return JSON.parse(match[1]);
  }
}

export function validateJsonSchema(value, schema, rootSchema = schema, path = '$') {
  const failures = [];
  if (!schema || typeof schema !== 'object') return failures;
  if (schema.$ref) {
    const resolved = resolveLocalRef(rootSchema, schema.$ref);
    if (!resolved) return [`${path}: unresolved schema ref ${schema.$ref}`];
    return validateJsonSchema(value, resolved, rootSchema, path);
  }
  if (Array.isArray(schema.anyOf)) {
    const alternatives = schema.anyOf.map(item => validateJsonSchema(value, item, rootSchema, path));
    if (!alternatives.some(items => items.length === 0)) failures.push(`${path}: value matches no anyOf branch`);
    return failures;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(item => validateJsonSchema(value, item, rootSchema, path).length === 0).length;
    if (matches !== 1) failures.push(`${path}: value must match exactly one oneOf branch`);
    return failures;
  }
  if (schema.const !== undefined && !deepEqual(value, schema.const)) failures.push(`${path}: value does not equal const`);
  if (Array.isArray(schema.enum) && !schema.enum.some(item => deepEqual(item, value))) failures.push(`${path}: value is not in enum`);
  if (schema.type && !matchesType(value, schema.type)) {
    failures.push(`${path}: expected ${schema.type}`);
    return failures;
  }
  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) failures.push(`${path}: shorter than minLength`);
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) failures.push(`${path}: longer than maxLength`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) failures.push(`${path}: does not match pattern`);
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) failures.push(`${path}: fewer than minItems`);
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) failures.push(`${path}: more than maxItems`);
    if (schema.items) value.forEach((item, index) => failures.push(...validateJsonSchema(item, schema.items, rootSchema, `${path}[${index}]`)));
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) failures.push(`${path}.${key}: required property missing`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) failures.push(...validateJsonSchema(child, properties[key], rootSchema, `${path}.${key}`));
      else if (schema.additionalProperties === false) failures.push(`${path}.${key}: additional property not allowed`);
      else if (isRecord(schema.additionalProperties)) failures.push(...validateJsonSchema(child, schema.additionalProperties, rootSchema, `${path}.${key}`));
    }
  }
  return failures;
}

export function findForbiddenPacketMaterial(value, path = '$', results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenPacketMaterial(item, `${path}[${index}]`, results));
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) results.push(childPath);
    if (/^(?:https?:\/\/|gs:\/\/)/i.test(String(child ?? '')) && /(generated|storage|media|asset)/i.test(key)) {
      results.push(childPath);
    }
    findForbiddenPacketMaterial(child, childPath, results);
  }
  return results;
}

export function findOutputAssetLeaks(value, path = '$', results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findOutputAssetLeaks(item, `${path}[${index}]`, results));
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === 'aiAssets' || key === 'previewScreens' || /(?:generatedUrl|storagePath|providerPrompt)/i.test(key)) {
      results.push(childPath);
    }
    findOutputAssetLeaks(child, childPath, results);
  }
  return results;
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function resolveLocalRef(root, ref) {
  if (!String(ref).startsWith('#/')) return null;
  return String(ref).slice(2).split('/').reduce((current, segment) => {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    return current && typeof current === 'object' ? current[key] : undefined;
  }, root);
}

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some(item => matchesType(value, item));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isRecord(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function deepEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
