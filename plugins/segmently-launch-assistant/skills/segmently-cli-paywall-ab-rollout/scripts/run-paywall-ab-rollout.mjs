#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const projectId = requireArg(args.project, '--project');
const envName = optionalArg(args.env, '--env') || null;
const suffix = optionalArg(args.suffix, '--suffix') || String(Date.now());
const probeSamples = readPositiveInteger(optionalArg(args.probeSamples, '--probe-samples') || '30', '--probe-samples');
const publicBaseUrl = optionalArg(args.publicBaseUrl, '--public-base-url');
const sourceFunnelId = optionalArg(args.sourceFunnelId, '--source-funnel-id');
const sourceVersionId = optionalArg(args.sourceVersionId, '--source-version-id');
const sourceWebPlacementAlias = optionalArg(args.sourceWebPlacementAlias, '--source-web-placement-alias');
const paywallScreenId = optionalArg(args.paywallScreenId, '--paywall-screen-id') || 'Paywall';
const cloneName = optionalArg(args.cloneName, '--clone-name') || `CLI Cloned Paywall Treatment ${suffix}`;
const cloneVersionName = optionalArg(args.cloneVersionName, '--clone-version-name') || 'CLI Cloned Paywall Draft';
const treatmentPaywallProductIds = parseCommaSeparated(optionalArg(args.treatmentPaywallProductIds, '--treatment-paywall-product-ids'));
const cloneMode = Boolean(sourceFunnelId || sourceVersionId);

if (cloneMode && (!sourceFunnelId || !sourceVersionId)) {
  throw new Error('--source-funnel-id and --source-version-id must be provided together.');
}

const tempDir = mkdtempSync(join(tmpdir(), `segmently-paywall-ab-${suffix}-`));
const paywallProducts = treatmentPaywallProductIds.length > 0
  ? treatmentPaywallProductIds.map((id) => ({ id, reused: true }))
  : [args.paywallProductId
      ? { id: requireArg(args.paywallProductId, '--paywall-product-id'), reused: true }
      : ensurePaywallProduct({ projectId, envName, suffix, tempDir })];

const controlAlias = `cli-paywall-control-${suffix}`;
const treatmentAlias = `cli-paywall-treatment-${suffix}`;
const abAlias = `cli-paywall-ab-${suffix}`;
const iterationId = `paywall-iter-${suffix}`;
const tag = `cli-paywall-rollout-${suffix}`;

const rolloutPath = join(tempDir, 'paywall-ab-rollout.json');
writeJson(rolloutPath, cloneMode ? buildClonedPaywallRolloutManifest({
  suffix,
  sourceFunnelId,
  sourceVersionId,
  paywallScreenId,
  cloneName,
  cloneVersionName,
  paywallProducts,
  controlAlias,
  treatmentAlias,
  abAlias,
  iterationId,
  tag,
}) : buildRolloutManifest({
  suffix,
  paywallProductId: paywallProducts[0].id,
  controlAlias,
  treatmentAlias,
  abAlias,
  iterationId,
  tag,
}));

const rolloutArgs = [
  '--project', projectId,
  'ab-tests', 'rollout', 'apply',
  '--file', rolloutPath,
  '--publish',
  '--probe',
  '--probe-samples', String(probeSamples),
];
if (envName) {
  rolloutArgs.push('--env', envName);
}
if (publicBaseUrl) {
  rolloutArgs.push('--public-base-url', publicBaseUrl);
}

const rollout = runCliJson(rolloutArgs);
const controlVariant = rollout.variants?.find((variant) => variant.id === 'control');
const treatmentVariant = rollout.variants?.find((variant) => variant.id === 'treatment');
const summary = {
  environment: envName,
  projectId,
  mode: cloneMode ? 'clonedFunnelVersion' : 'funnelManifest',
  suffix,
  paywallProduct: paywallProducts[0],
  paywallProducts,
  urls: {
    source: sourceWebPlacementAlias ? toPublicUrl(`/${sourceWebPlacementAlias}`, publicBaseUrl, envName) : undefined,
    control: toPublicUrl(controlVariant?.publicUrl || `/${controlAlias}`, publicBaseUrl, envName),
    treatment: toPublicUrl(treatmentVariant?.publicUrl || `/${treatmentAlias}`, publicBaseUrl, envName),
    abTest: toPublicUrl(rollout.publish?.webUrl || `/${abAlias}`, publicBaseUrl, envName),
  },
  aliases: {
    source: sourceWebPlacementAlias,
    control: controlAlias,
    treatment: treatmentAlias,
    abTest: abAlias,
  },
  sourceFunnel: cloneMode ? {
    funnelId: sourceFunnelId,
    versionId: sourceVersionId,
    editorUrl: toEditorUrl(projectId, sourceFunnelId, envName),
  } : undefined,
  clonedTreatment: cloneMode ? {
    funnelId: treatmentVariant?.funnelId,
    versionId: treatmentVariant?.versionId,
    webPlacementId: treatmentVariant?.webPlacementId,
    paywallScreenId,
    editorUrl: treatmentVariant?.funnelId ? toEditorUrl(projectId, treatmentVariant.funnelId, envName) : undefined,
  } : undefined,
  abTest: {
    id: rollout.abTest?.abTest?.id,
    alias: rollout.abTest?.abTest?.alias,
    status: rollout.abTest?.abTest?.status,
    iterationId,
    publicationId: rollout.publish?.publishId,
  },
  probe: rollout.probe,
  rollout,
};

if (args.output) {
  writeJson(resolve(process.cwd(), requireArg(args.output, '--output')), summary);
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.probe && summary.probe.success === false) {
  process.exitCode = 1;
}

function ensurePaywallProduct({ projectId, envName, suffix, tempDir }) {
  const manifestPath = join(tempDir, 'paywall-product.json');
  writeJson(manifestPath, {
    version: 'cli.paywall-product.v1',
    mode: 'test',
    product: {
      name: `CLI Sandbox Paywall ${suffix}`,
      description: 'Sandbox product created by the Segmently CLI paywall A/B rollout skill.',
      type: 'subscription',
      checkoutMode: 'embedded',
      unitAmount: 1299,
      currency: 'usd',
      interval: 'month',
      intervalCount: 1,
    },
  });

  const result = runCliJson([
    '--project', projectId,
    'stripe', 'paywall-product', 'ensure',
    '--file', manifestPath,
    ...(envName ? ['--env', envName] : []),
  ]);
  const product = result.paywallProduct;
  if (!product?.id) {
    throw new Error('stripe paywall-product ensure did not return paywallProduct.id');
  }
  return {
    id: product.id,
    reused: result.created === false,
    stripeProductId: product.stripeProductId,
    stripePriceId: product.stripePriceId,
  };
}

function buildRolloutManifest(input) {
  const control = buildPaywallFunnelApplyManifest(input.controlAlias, {
    title: `CLI Paywall Control ${input.suffix}`,
    subtitle: 'Control onboarding collects goal, name, and email before checkout.',
    paywallProductId: input.paywallProductId,
    paywallTitle: 'Unlock your control plan',
  });
  const treatment = buildPaywallFunnelApplyManifest(input.treatmentAlias, {
    title: `CLI Paywall Treatment ${input.suffix}`,
    subtitle: 'Treatment onboarding uses the same data contract with different copy.',
    paywallProductId: input.paywallProductId,
    paywallTitle: 'Unlock your treatment plan',
  });

  return {
    version: 'cli.ab-test-rollout.v1',
    operationId: `cli-paywall-rollout-${input.suffix}`,
    defaults: {
      language: 'en-US',
      platform: 'web',
      conflictPolicy: 'update-existing',
      publishVariants: true,
    },
    abTest: {
      name: `CLI Paywall AB ${input.suffix}`,
      alias: input.abAlias,
      description: 'Reusable sandbox paywall A/B rollout created by the Segmently CLI skill.',
      tags: ['cli-skill', 'paywall-ab', input.tag],
      baselineVariantId: 'control',
      iteration: {
        id: input.iterationId,
        label: `CLI Paywall ${input.suffix}`,
        tags: ['cli-skill', 'paywall-ab', input.tag],
        baselineVariantId: 'control',
      },
    },
    variants: [
      {
        id: 'control',
        name: 'Control',
        role: 'control',
        tags: ['baseline', input.tag],
        weight: 50,
        source: toRolloutFunnelSource(control),
      },
      {
        id: 'treatment',
        name: 'Treatment',
        role: 'treatment',
        tags: ['experiment', input.tag],
        weight: 50,
        source: toRolloutFunnelSource(treatment),
      },
    ],
    publish: {
      variants: true,
      abTest: true,
      probe: {
        enabled: true,
        sampleCount: probeSamples,
        requiredVariantIds: ['control', 'treatment'],
        ...(publicBaseUrl ? { publicBaseUrl } : {}),
      },
    },
  };
}

function buildClonedPaywallRolloutManifest(input) {
  const controlPlacement = buildRolloutWebPlacement(input.controlAlias, `CLI Paywall Control ${input.suffix}`);
  const treatmentPlacement = buildRolloutWebPlacement(input.treatmentAlias, `CLI Paywall Treatment Clone ${input.suffix}`);

  return {
    version: 'cli.ab-test-rollout.v1',
    operationId: `cli-paywall-clone-rollout-${input.suffix}`,
    defaults: {
      language: 'en-US',
      platform: 'web',
      conflictPolicy: 'update-existing',
      publishVariants: true,
    },
    abTest: {
      name: `CLI Cloned Paywall AB ${input.suffix}`,
      alias: input.abAlias,
      description: 'Reusable sandbox paywall A/B rollout that clones a source funnel and mutates a Paywall screen.',
      tags: ['cli-skill', 'paywall-ab', 'clone-paywall', input.tag],
      baselineVariantId: 'control',
      iteration: {
        id: input.iterationId,
        label: `CLI Cloned Paywall ${input.suffix}`,
        tags: ['cli-skill', 'paywall-ab', 'clone-paywall', input.tag],
        baselineVariantId: 'control',
      },
    },
    variants: [
      {
        id: 'control',
        name: 'Control',
        role: 'control',
        tags: ['baseline', input.tag],
        weight: 50,
        source: {
          type: 'existingFunnelVersion',
          funnelId: input.sourceFunnelId,
          versionId: input.sourceVersionId,
          ...controlPlacement,
        },
      },
      {
        id: 'treatment',
        name: 'Treatment clone',
        role: 'treatment',
        tags: ['experiment', 'paywall-products', input.tag],
        weight: 50,
        source: {
          type: 'clonedFunnelVersion',
          sourceProjectId: projectId,
          funnelId: input.sourceFunnelId,
          versionId: input.sourceVersionId,
          clone: {
            name: input.cloneName,
            versionName: input.cloneVersionName,
          },
          mutation: {
            screenId: input.paywallScreenId,
            paywall: {
              products: input.paywallProducts.map((product, index) => ({
                productId: product.id,
                title: index === 0 ? 'Treatment monthly access' : `Treatment offer ${index + 1}`,
                subtitle: index === 0 ? '$12.99/mo' : 'Experiment offer',
                isDefault: index === 0,
              })),
              purchaseAction: { content: 'Start my plan' },
            },
          },
          ...treatmentPlacement,
        },
      },
    ],
    publish: {
      variants: true,
      abTest: true,
      probe: {
        enabled: true,
        sampleCount: probeSamples,
        requiredVariantIds: ['control', 'treatment'],
        ...(publicBaseUrl ? { publicBaseUrl } : {}),
      },
    },
  };
}

function buildPaywallFunnelApplyManifest(alias, options) {
  const placement = buildRolloutWebPlacement(alias, `CLI Paywall Web ${alias}`);
  const { sources, destinations } = placement;

  return {
    version: 'cli.funnel-apply.v1',
    funnel: {
      name: `CLI Paywall Funnel ${alias}`,
      platform: 'web',
      defaultLanguage: 'en-US',
      languages: ['en-US'],
      versionName: 'CLI Paywall Draft',
    },
    graph: {
      launchScreenKey: 'Welcome',
      screens: [
        {
          key: 'Welcome',
          type: 'HeroContent',
          name: 'Welcome',
          position: { x: 0, y: 0 },
          content: {
            copy: {
              title: options.title,
              subtitle: options.subtitle,
            },
            actionBar: {
              primary: { content: 'Continue' },
            },
          },
        },
        {
          key: 'Goal',
          type: 'ListSinglePick',
          name: 'Goal',
          position: { x: 928, y: 0 },
          content: {
            copy: { title: 'Choose your main goal' },
            options: {
              selectionMode: 'one',
              items: [
                { title: 'Fitness', variableValue: 'Fitness' },
                { title: 'Sleep', variableValue: 'Sleep' },
              ],
            },
          },
          variable: { id: 'goal', name: 'Goal', type: 'enum' },
        },
        {
          key: 'Name',
          type: 'TextInput',
          name: 'Name',
          position: { x: 1856, y: 0 },
          content: {
            copy: { title: 'What should we call you?' },
            textField: { placeholder: 'Jane' },
            actionBar: {
              primary: { content: 'Continue' },
            },
          },
          variable: { id: 'name', name: 'Name', type: 'string' },
        },
        {
          key: 'Email',
          type: 'TextInput',
          name: 'Email',
          position: { x: 2784, y: 0 },
          content: {
            copy: { title: 'Where should we send your plan?' },
            textField: { placeholder: 'name@example.com' },
            actionBar: {
              primary: { content: 'Continue' },
            },
          },
          variable: { id: 'email', name: 'Email', type: 'string' },
        },
        {
          key: 'Paywall',
          type: 'Paywall',
          name: 'Paywall',
          position: { x: 3712, y: 0 },
          content: {
            copy: { title: options.paywallTitle },
            paywall: {
              products: [
                {
                  productId: options.paywallProductId,
                  title: 'Monthly access',
                  subtitle: '$12.99/mo',
                  isDefault: true,
                },
              ],
              purchaseAction: {
                content: 'Continue',
                action: { kind: 'purchase', edges: [] },
              },
            },
          },
        },
        {
          key: 'PaidSuccess',
          type: 'HeroContent',
          name: 'Paid Success',
          position: { x: 4640, y: 0 },
          content: {
            copy: {
              title: 'Payment captured',
              subtitle: 'The CLI paywall flow reached the post-purchase screen.',
            },
            actionBar: {
              primary: { content: 'Done' },
            },
          },
        },
      ],
      edges: [
        { from: 'Welcome', action: 'actionBar.primary', to: 'Goal' },
        { from: 'Goal', action: 'options.item.0', to: 'Name' },
        { from: 'Goal', action: 'options.item.1', to: 'Name' },
        { from: 'Name', action: 'actionBar.primary', to: 'Email' },
        { from: 'Email', action: 'actionBar.primary', to: 'Paywall' },
        { from: 'Paywall', action: 'paywall.purchaseAction', to: 'PaidSuccess' },
      ],
    },
    webPlacement: {
      version: 'cli.web-placement.v1',
      webPlacement: {
        name: `CLI Paywall Web ${alias}`,
        alias,
        funnelRef: {
          funnelId: 'created-by-funnel-apply',
          versionId: 'created-by-funnel-apply',
        },
        saveUserProgress: false,
        rememberPaymentMethod: true,
      },
      sources,
      destinations,
    },
  };
}

function buildRolloutWebPlacement(alias, name) {
  const facebookUrlParams = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'utm_id',
    'fbclid',
    'fb_campaign_id',
    'fb_adset_id',
    'fb_ad_id',
    'placement',
    'site_source_name',
  ];
  const facebookServerParams = [
    { key: 'fbp', path: 'facebook.fbp' },
    { key: 'fbc', path: 'facebook.fbc' },
  ];
  const variableInputs = [
    { key: 'goal', variable: 'Goal' },
    { key: 'name', variable: 'Name' },
    { key: 'email', variable: 'Email' },
  ];

  return {
    webPlacement: {
      name,
      alias,
      saveUserProgress: false,
      rememberPaymentMethod: true,
    },
    sources: {
      urlParams: facebookUrlParams.map((key) => ({ key })),
      serverData: facebookServerParams,
      variableInputs,
    },
    destinations: {
      stripeMappings: [
        ...facebookUrlParams.map((key) => ({ sourceType: 'url', sourceKey: key })),
        ...facebookServerParams.map((source) => ({ sourceType: 'server', sourceKey: source.key })),
        { sourceType: 'variable', sourceKey: 'email' },
      ],
      stripeEmail: { variable: 'Email' },
    },
  };
}

function toRolloutFunnelSource(applyManifest) {
  const webPlacementManifest = applyManifest.webPlacement;
  const webPlacement = webPlacementManifest.webPlacement;
  return {
    type: 'funnelManifest',
    funnel: applyManifest.funnel,
    graph: applyManifest.graph,
    webPlacement: {
      id: webPlacement.id,
      name: webPlacement.name,
      alias: webPlacement.alias,
      description: webPlacement.description,
      saveUserProgress: webPlacement.saveUserProgress,
      rememberPaymentMethod: webPlacement.rememberPaymentMethod,
      redirectUrl: webPlacement.redirectUrl,
      fallbackUrl: webPlacement.fallbackUrl,
      urlEncode: webPlacement.urlEncode,
      seo: webPlacement.seo,
      customAnalytics: webPlacement.customAnalytics,
      consentManagement: webPlacement.consentManagement,
    },
    sources: webPlacementManifest.sources,
    destinations: webPlacementManifest.destinations,
    entryScreenRules: webPlacementManifest.entryScreenRules,
  };
}

function runCliJson(cliArgs) {
  const result = spawnSync('segmently', cliArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`segmently CLI command failed: ${cliArgs.join(' ')}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse CLI JSON output: ${error.message}\n${result.stdout}`);
  }
}

function toPublicUrl(pathOrUrl, baseUrl, envName) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  if (!baseUrl) {
    return pathOrUrl;
  }
  return `${baseUrl.replace(/\/$/, '')}/${String(pathOrUrl).replace(/^\//, '')}`;
}

function toEditorUrl(projectId, funnelId) {
  const baseUrl = optionalArg(args.appBaseUrl, '--app-base-url') || 'https://app.segmently.ai';
  return `${baseUrl}/project/${encodeURIComponent(projectId)}/onboarding-v2/${encodeURIComponent(funnelId)}`;
}

function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = toCamelCase(arg.slice(2));
    const next = rawArgs[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function requireArg(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required. Run with --help for usage.`);
  }
  return value;
}

function optionalArg(value, name) {
  if (value === undefined) {
    return undefined;
  }
  return requireArg(value, name);
}

function parseCommaSeparated(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readPositiveInteger(value, name) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  throw new Error(`${name} must be a positive integer.`);
}

function printHelp() {
  process.stdout.write(`Segmently sandbox paywall A/B rollout

Usage:
  node scripts/run-paywall-ab-rollout.mjs --project <projectId> [options]

Options:
  --project <projectId>          Segmently project id. Required.
  --env <env>                    Optional Segmently CLI environment override.
  --suffix <stable-id>           Deterministic suffix for aliases.
  --paywall-product-id <id>      Reuse an existing Segmently paywall product.
  --source-funnel-id <id>        Clone this source funnel instead of creating two new variants.
  --source-version-id <id>       Source funnel version to clone. Required with --source-funnel-id.
  --source-web-placement-alias <alias>
                                  Optional existing source onboarding alias for summary URLs.
  --paywall-screen-id <id>       Paywall screen key/id to mutate in clone mode. Default: Paywall.
  --clone-name <name>            Treatment clone funnel name.
  --clone-version-name <name>    Treatment clone version name.
  --treatment-paywall-product-ids <ids>
                                  Comma-separated Segmently paywall product ids for clone mode.
  --probe-samples <count>        Runtime probe sample count. Default: 30.
  --public-base-url <url>        Public base URL for runtime probe and summary URLs.
  --app-base-url <url>           Segmently app base URL for editor links. Default: https://app.segmently.ai.
  --output <path>                Write summary JSON to this path.
  --help                         Show this help.

Requires an authenticated Segmently CLI identity with projects:read, funnels:read,
funnels:write, themes:read, themes:write, publish:write, stripe:read, and
stripe:write.
`);
}
