#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, computePacketChecksum, computePacketHash } from './lib/runtime-packet.mjs';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const fixtures = join(skillRoot, 'evals/fixtures');
const tempRoot = mkdtempSync(join(tmpdir(), 'screen-block-builder-eval-'));
const failures = [];

try {
  const evalManifest = readJson(join(skillRoot, 'evals/evals.json'));
  check('eval manifest has four forward cases', evalManifest.evals?.length === 4);

  const validPacketPath = join(fixtures, 'runtime-packet.valid.json');
  const validOutputPath = join(fixtures, 'agent-output.valid.json');
  const validExamplePath = join(fixtures, 'library-example.valid.json');
  const oldInvalidExamplePath = join(fixtures, 'library-example.old-invalid.json');
  const compileInputPath = join(skillRoot, 'examples/library-authoring-request.json');

  checkCommand('complete compile-input example', [join(skillRoot, 'scripts/validate-compile-input.mjs'), '--input', compileInputPath, '--format', 'json']);

  checkCommand('valid runtime packet', [join(skillRoot, 'scripts/validate-runtime-packet.mjs'), '--packet', validPacketPath, '--format', 'json']);

  const agentRunDir = join(tempRoot, 'agent-run');
  checkCommand('prepare packet-only run', [join(skillRoot, 'scripts/prepare-agent-run.mjs'), '--packet', validPacketPath, '--out-dir', agentRunDir]);
  const agentRequest = readJson(join(agentRunDir, 'agent-request.json'));
  const evalContext = readJson(join(agentRunDir, 'eval-context.json'));
  const manifest = readJson(join(agentRunDir, 'run-manifest.json'));
  const runManifestPath = join(agentRunDir, 'run-manifest.json');
  const validationSchemaPath = join(agentRunDir, 'validation-schema.json');
  const validationSchemaBytes = readFileSync(validationSchemaPath);
  const validationSchemaChecksum = sha256(validationSchemaBytes);
  check('agent request contains exact prompts', typeof agentRequest.systemPrompt === 'string' && typeof agentRequest.userMessage === 'string');
  check('agent request excludes held-back debug context', !('renderInput' in agentRequest) && !('resolvedBranch' in agentRequest) && !('promptVersions' in agentRequest));
  const validPacket = readJson(validPacketPath);
  check('eval context keeps render and base-message evidence', Boolean(evalContext.renderInput)
    && Boolean(evalContext.resolvedBranch)
    && evalContext.baseUserMessage === validPacket.userMessage);
  check('agent request uses exact effective message', agentRequest.userMessage === validPacket.effectiveUserMessage);
  check('agent request does not expose base message separately', !('baseUserMessage' in agentRequest));
  check('smoke remains advisory', manifest.proofClass === 'advisory-subagent-smoke' && manifest.replacesRuntimeTaskDebug === false);
  check('prepared run is explicit about missing agent output', manifest.status === 'prepared-awaiting-agent');
  check('prepared run declares separate immutable completion evidence', manifest.completion === 'completion.json');
  check('run snapshots held-back validation schema', manifest.heldBackValidationSchema === 'validation-schema.json'
    && manifest.validationSchemaChecksum === validationSchemaChecksum);
  check('agent request excludes held-back validation schema', !('validationSchema' in agentRequest)
    && !('validationSchemaChecksum' in agentRequest));

  const effectiveTamper = structuredClone(validPacket);
  effectiveTamper.effectiveUserMessage += '\nTampered provider suffix.';
  effectiveTamper.checksum = computePacketChecksum(effectiveTamper);
  const effectiveTamperPath = join(tempRoot, 'effective-tamper.json');
  writeJson(effectiveTamperPath, effectiveTamper);
  checkCommandFails('effective provider message changes exact hash', [join(skillRoot, 'scripts/validate-runtime-packet.mjs'), '--packet', effectiveTamperPath]);

  const googlePacket = structuredClone(validPacket);
  googlePacket.provider = 'google';
  googlePacket.model = 'gemini-project-model';
  googlePacket.effectiveUserMessage = `${googlePacket.userMessage}\n\nReturn ONLY valid JSON with the required root envelope.`;
  delete googlePacket.outputSchema;
  googlePacket.exactInputHash = computePacketHash(googlePacket);
  googlePacket.checksum = computePacketChecksum(googlePacket);
  const googlePacketPath = join(tempRoot, 'google-packet.json');
  writeJson(googlePacketPath, googlePacket);
  checkCommand('Google exact message without output schema', [join(skillRoot, 'scripts/validate-runtime-packet.mjs'), '--packet', googlePacketPath]);
  const googleAgentRunDir = join(tempRoot, 'google-agent-run');
  checkCommand('prepare exact Google packet-only run', [
    join(skillRoot, 'scripts/prepare-agent-run.mjs'),
    '--packet', googlePacketPath,
    '--out-dir', googleAgentRunDir,
  ]);
  const googleRunManifestPath = join(googleAgentRunDir, 'run-manifest.json');
  const googleManifest = readJson(googleRunManifestPath);
  const googleValidationSchemaPath = join(googleAgentRunDir, 'validation-schema.json');
  const googleValidationSchemaBytes = readFileSync(googleValidationSchemaPath);
  const googleWithSchema = structuredClone(googlePacket);
  googleWithSchema.outputSchema = validPacket.outputSchema;
  googleWithSchema.exactInputHash = computePacketHash(googleWithSchema);
  googleWithSchema.checksum = computePacketChecksum(googleWithSchema);
  const googleWithSchemaPath = join(tempRoot, 'google-with-schema.json');
  writeJson(googleWithSchemaPath, googleWithSchema);
  checkCommandFails('Google packet rejects provider-inexact schema', [join(skillRoot, 'scripts/validate-runtime-packet.mjs'), '--packet', googleWithSchemaPath]);
  const nonGoogleWithoutSchema = structuredClone(validPacket);
  delete nonGoogleWithoutSchema.outputSchema;
  nonGoogleWithoutSchema.exactInputHash = computePacketHash(nonGoogleWithoutSchema);
  nonGoogleWithoutSchema.checksum = computePacketChecksum(nonGoogleWithoutSchema);
  const nonGoogleWithoutSchemaPath = join(tempRoot, 'non-google-without-schema.json');
  writeJson(nonGoogleWithoutSchemaPath, nonGoogleWithoutSchema);
  checkCommandFails('non-Google packet requires runtime schema', [join(skillRoot, 'scripts/validate-runtime-packet.mjs'), '--packet', nonGoogleWithoutSchemaPath]);
  check('Google suffix participates in exact hash', googlePacket.exactInputHash !== computePacketHash({
    ...googlePacket,
    effectiveUserMessage: googlePacket.userMessage,
  }));
  const googleEvaluationPath = join(tempRoot, 'google-evaluation.json');
  checkCommand('Google output uses packaged runtime schema', [
    join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
    '--packet', googlePacketPath,
    '--output', validOutputPath,
    '--validation-schema', googleValidationSchemaPath,
    '--run-manifest', googleRunManifestPath,
    '--report', googleEvaluationPath,
  ]);
  const googleEvaluation = readJson(googleEvaluationPath);
  check('Google schema validation is explicit', googleEvaluation.schemaValidationApplied === true
    && googleEvaluation.schemaSource === 'run-snapshot'
    && googleEvaluation.validationSchemaChecksum === googleManifest.validationSchemaChecksum);
  checkCommandFails('Google output requires its prepared run manifest', [
    join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
    '--packet', googlePacketPath,
    '--output', validOutputPath,
    '--validation-schema', googleValidationSchemaPath,
  ]);
  appendFileSync(googleValidationSchemaPath, '\n', 'utf8');
  checkCommandFails('Google output rejects a tampered held-back schema', [
    join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
    '--packet', googlePacketPath,
    '--output', validOutputPath,
    '--validation-schema', googleValidationSchemaPath,
    '--run-manifest', googleRunManifestPath,
  ]);
  writeFileSync(googleValidationSchemaPath, googleValidationSchemaBytes);

  const malformedGoogleCases = [
    ['missing blockType', value => { delete value.result.onboardingStrategySequence[0].blockType; }],
    ['missing screenType', value => { delete value.result.onboardingStrategySequence[0].screens[0].screenType; }],
    ['malformed data mapping', value => { delete value.result.onboardingStrategySequence[0].screens[0].aiMeta.dataMapping[0].sourcePath; }],
    ['malformed variable realization', value => { value.result.onboardingStrategySequence[0].screens[0].aiMeta.variableRealizations = [{ variableId: 'focus' }]; }],
    ['mustache variable alias', value => {
      const screen = value.result.onboardingStrategySequence[0].screens[0];
      screen.content.copy.title = '{{focus}} can start small';
      screen.aiMeta.variableRealizations = [{
        variableId: 'focus',
        realizationKind: 'personalization_source',
        contentPath: 'content.copy.title',
      }];
    }],
    ['unrealized personalization metadata', value => {
      const screen = value.result.onboardingStrategySequence[0].screens[0];
      screen.content.copy.title = 'A generic title with no runtime token';
      screen.aiMeta.variableRealizations = [{
        variableId: 'focus',
        realizationKind: 'personalization_source',
        contentPath: 'content.copy.title',
      }];
    }],
    ['malformed motivation spec', value => { delete value.result.onboardingStrategySequence[0].screens[0].aiMeta.motivationSpec.class; }],
    ['gain motivation missing targetsNeed', value => { delete value.result.onboardingStrategySequence[0].screens[0].aiMeta.motivationSpec.targetsNeed; }],
    ['personalized gain has false reflectsJtbd', value => {
      const screen = value.result.onboardingStrategySequence[0].screens[0];
      screen.content.copy.title = 'A step toward @focus';
      screen.aiMeta.variableRealizations = [{
        variableId: 'focus',
        realizationKind: 'personalization_source',
        contentPath: 'content.copy.title',
      }];
      screen.aiMeta.motivationSpec.reflectsJtbd = false;
    }],
    ['non-personalized screen has true reflectsJtbd', value => {
      value.result.onboardingStrategySequence[0].screens[0].aiMeta.motivationSpec.reflectsJtbd = true;
    }],
    ['personalized non-gain screen has false reflectsJtbd', value => {
      const screen = value.result.onboardingStrategySequence[0].screens[0];
      screen.content.copy.title = 'A step toward @focus';
      screen.aiMeta.variableRealizations = [{
        variableId: 'focus',
        realizationKind: 'personalization_source',
        contentPath: 'content.copy.title',
      }];
      screen.aiMeta.motivationSpec.class = 'neutral';
      screen.aiMeta.motivationSpec.reflectsJtbd = false;
    }],
    ['malformed asset intent', value => { delete value.result.onboardingStrategySequence[0].screens[0].aiMeta.assetIntents[0].slotRole; }],
    ['invented content action alias', value => {
      const content = value.result.onboardingStrategySequence[0].screens[0].content;
      content.button = content.actionBar.primary;
      delete content.actionBar;
    }],
    ['forbidden nested navigate alias', value => {
      const action = value.result.onboardingStrategySequence[0]
        .screens[0].content.actionBar.primary.action;
      action.navigate = 'screen1';
    }],
    ['forbidden nested edge to alias', value => {
      const action = value.result.onboardingStrategySequence[0]
        .screens[0].content.actionBar.primary.action;
      action.edges = [{
        nextScreenId: 'screen1',
        transitionKind: 'push',
        conditions: [],
        to: 'screen1',
      }];
    }],
    ['persisted runtime plumbing', value => {
      const block = value.result.onboardingStrategySequence[0];
      block.description = 'An update-mode block using the fallback-audience semantic branch because no pinned insight package is available.';
      block.screens[0].aiMeta.blockRole += '\nRejected options lacked complete resolved proof fields.';
    }],
  ];
  for (const [label, mutate] of malformedGoogleCases) {
    const malformed = structuredClone(readJson(validOutputPath));
    mutate(malformed);
    const malformedPath = join(tempRoot, `google-${label.replaceAll(' ', '-')}.json`);
    writeJson(malformedPath, malformed);
    checkCommandFails(`Google schema rejects ${label}`, [
      join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
      '--packet', googlePacketPath,
      '--output', malformedPath,
      '--validation-schema', googleValidationSchemaPath,
      '--run-manifest', googleRunManifestPath,
    ]);
  }

  const evaluationPath = join(tempRoot, 'evaluation.json');
  checkCommand('schema-valid agent output', [join(skillRoot, 'scripts/evaluate-agent-output.mjs'), '--packet', validPacketPath, '--output', validOutputPath, '--report', evaluationPath]);
  const evaluation = readJson(evaluationPath);
  check('valid output covers data and assets', evaluation.summary.dataUsagePresent && evaluation.summary.dataMappingCount === 1 && evaluation.summary.assetIntentCount === 1);
  check('provider packet schema validation is explicit', evaluation.schemaValidationApplied === true
    && evaluation.schemaSource === 'provider-packet');

  const legitimateProductPromptOutput = structuredClone(readJson(validOutputPath));
  legitimateProductPromptOutput.result.onboardingStrategySequence[0]
    .screens[0].content.copy.title = 'Choose a journaling prompt';
  const legitimateProductPromptPath = join(tempRoot, 'legitimate-product-prompt.json');
  writeJson(legitimateProductPromptPath, legitimateProductPromptOutput);
  checkCommand('legitimate product prompt wording passes', [
    join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
    '--packet', validPacketPath,
    '--output', legitimateProductPromptPath,
  ]);

  cpSync(validOutputPath, join(agentRunDir, 'raw-output.json'));
  checkCommand('prepared run output evaluates before completion', [
    join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
    '--packet', validPacketPath,
    '--output', join(agentRunDir, 'raw-output.json'),
    '--report', join(agentRunDir, 'evaluation.json'),
  ]);
  checkCommand('record passing fresh-agent completion', [
    join(skillRoot, 'scripts/record-agent-completion.mjs'),
    '--run-dir', agentRunDir,
    '--scenario', 'eval-valid',
    '--run-id', 'run-1',
    '--agent-task', '/eval/fresh-agent-1',
    '--note', 'Topology branch matched the exact packet.',
    '--note', 'Evidence and variable semantics passed deterministic evaluation.',
  ]);
  const completion = readJson(join(agentRunDir, 'completion.json'));
  check('completion binds fresh identity, files, and evaluator notes',
    completion.kind === 'segmently.packet-only-agent-completion'
      && completion.status === 'evaluated-pass'
      && completion.agentTask === '/eval/fresh-agent-1'
      && completion.inputBoundary?.kind === 'agent-request-only'
      && completion.inputBoundary?.inheritedConversation === false
      && completion.inputBoundary?.repositoryAccess === false
      && completion.rawOutput?.file === 'raw-output.json'
      && completion.evaluation?.ok === true
      && completion.evaluatorNotes?.length === 2);

  const mixedGroundingOutput = structuredClone(readJson(validOutputPath));
  const mixedGroundingBlock = mixedGroundingOutput.result.onboardingStrategySequence[0];
  mixedGroundingBlock.screens[0].content.actionBar.primary.action = {
    kind: 'advance',
    edges: [{ nextScreenId: 'screen2', transitionKind: 'push', conditions: [] }],
  };
  const ungroundedHandoff = structuredClone(mixedGroundingBlock.screens[0]);
  ungroundedHandoff.id = 'screen2';
  ungroundedHandoff.name = 'Ungrounded plan handoff';
  ungroundedHandoff.content.copy = {
    title: 'Shape the next small step',
    subtitle: 'Continue into a plan that fits your day.',
  };
  ungroundedHandoff.content.actionBar.primary.action = { kind: 'complete', edges: [] };
  ungroundedHandoff.aiMeta.dataMapping = [];
  ungroundedHandoff.aiMeta.assetIntents = [];
  mixedGroundingBlock.screens.push(ungroundedHandoff);
  const mixedGroundingPath = join(tempRoot, 'mixed-grounding-valid.json');
  writeJson(mixedGroundingPath, mixedGroundingOutput);
  checkCommand('evidence is required only on screens that use evidence', [
    join(skillRoot, 'scripts/evaluate-agent-output.mjs'),
    '--packet', validPacketPath,
    '--output', mixedGroundingPath,
  ]);

  const missingDataUsage = readJson(validOutputPath);
  delete missingDataUsage.result.onboardingStrategySequence[0].dataUsage;
  const missingDataPath = join(tempRoot, 'missing-data-usage.json');
  writeJson(missingDataPath, missingDataUsage);
  checkCommandFails('missing dataUsage fails', [join(skillRoot, 'scripts/evaluate-agent-output.mjs'), '--packet', validPacketPath, '--output', missingDataPath]);

  const sourceAssetLeak = readJson(validOutputPath);
  sourceAssetLeak.result.onboardingStrategySequence[0].screens[0].aiAssets = [{ url: 'https://example.invalid/generated.png' }];
  const assetLeakPath = join(tempRoot, 'asset-leak.json');
  writeJson(assetLeakPath, sourceAssetLeak);
  checkCommandFails('source generated asset fails', [join(skillRoot, 'scripts/evaluate-agent-output.mjs'), '--packet', validPacketPath, '--output', assetLeakPath]);

  const packetLeak = readJson(validPacketPath);
  packetLeak.renderInput.previewScreens = [{ id: 'full-screen' }];
  packetLeak.exactInputHash = computePacketHash(packetLeak);
  packetLeak.checksum = computePacketChecksum(packetLeak);
  const packetLeakPath = join(tempRoot, 'packet-leak.json');
  writeJson(packetLeakPath, packetLeak);
  checkCommandFails('previewScreens packet leak fails', [join(skillRoot, 'scripts/validate-runtime-packet.mjs'), '--packet', packetLeakPath]);

  checkCommand('valid dual library example', [join(skillRoot, 'scripts/validate-library-example.mjs'), '--input', validExamplePath, '--format', 'json']);
  checkCommandFails('old self-consistent but product-incompatible example fails', [join(skillRoot, 'scripts/validate-library-example.mjs'), '--input', oldInvalidExamplePath]);
  const previewPath = join(tempRoot, 'preview.html');
  checkCommand('render-only preview', [join(skillRoot, 'scripts/render-library-preview.mjs'), '--input', validExamplePath, '--out', previewPath]);
  const previewHtml = readFileSync(previewPath, 'utf8');
  check('preview labels render-only boundary', previewHtml.includes('render-only') && previewHtml.includes('never model input'));

  const mismatchedExample = readJson(validExamplePath);
  mismatchedExample.previewScreens[0].id = 'different-screen';
  const mismatchPath = join(tempRoot, 'mismatch.json');
  writeJson(mismatchPath, mismatchedExample);
  checkCommandFails('blueprint preview identity mismatch fails', [join(skillRoot, 'scripts/validate-library-example.mjs'), '--input', mismatchPath]);

  const semanticDriftExample = readJson(validExamplePath);
  semanticDriftExample.blueprint.dataSemantics.screens[0].dataMapping.push({
    sourcePath: '@review[drifted-evidence]',
    value: 'Drifted semantic copy.',
    justification: 'Must not exist only in the duplicated semantic projection.',
    category: 'social_proof',
    purposeId: 'drift-check',
    sourcePriority: 1,
  });
  semanticDriftExample.sourceChecksum = computeExampleChecksum(semanticDriftExample);
  const semanticDriftPath = join(tempRoot, 'semantic-drift.json');
  writeJson(semanticDriftPath, semanticDriftExample);
  checkCommandFails('data semantics must exactly match screen aiMeta', [join(skillRoot, 'scripts/validate-library-example.mjs'), '--input', semanticDriftPath]);

  checkCommand('public skill safety audit', [join(skillRoot, 'scripts/audit-public-skill.mjs'), '--root', skillRoot]);

  const parityMirror = join(tempRoot, 'package-mirror');
  cpSync(skillRoot, parityMirror, { recursive: true });
  checkCommand('package parity checker accepts exact copy', [join(skillRoot, 'scripts/check-package-parity.mjs'), '--source', skillRoot, '--target', parityMirror]);
  appendFileSync(join(parityMirror, 'SKILL.md'), '\nparity drift\n', 'utf8');
  checkCommandFails('package parity checker detects drift', [join(skillRoot, 'scripts/check-package-parity.mjs'), '--source', skillRoot, '--target', parityMirror]);
  if (args.parityRoot) {
    checkCommand('configured packaged skill parity', [join(skillRoot, 'scripts/check-package-parity.mjs'), '--source', skillRoot, '--target', args.parityRoot]);
  }

  const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
  for (const required of [
    'prompt-packet',
    'dry-run → approval → apply → get/readback',
    '`readback.exists=false`',
    '`not_found`',
    'owningSkill=screen-block-builder',
    'previewScreens',
    'aiMeta.assetIntents',
    'advisory',
  ]) check(`skill contains ${required}`, skill.includes(required));
  const privilegedRoleToken = `service-${String.fromCharCode(97, 100, 109, 105, 110)}`;
  for (const forbidden of ['.' + 'claude/', '.' + 'agents/', 'n' + '8n/', privilegedRoleToken, 'SEGMENTLY_HOME', 'src/' + 'modules/']) {
    check(`skill excludes ${forbidden}`, !skill.includes(forbidden));
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`screen-block-builder evals failed: ${failures.length}`);
  process.exit(1);
}
console.log('screen-block-builder evals passed: 4');

function check(label, condition) {
  if (!condition) failures.push(label);
}

function checkCommand(label, argv) {
  const result = spawnSync(process.execPath, argv, { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${label}: ${result.stderr || result.stdout || `status ${result.status}`}`);
}

function checkCommandFails(label, argv) {
  const result = spawnSync(process.execPath, argv, { encoding: 'utf8' });
  if (result.status === 0) failures.push(`${label}: command unexpectedly passed`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function computeExampleChecksum(value) {
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

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--parity-root') out.parityRoot = argv[++index];
    else throw new Error(`Unknown option ${token}`);
  }
  return out;
}
