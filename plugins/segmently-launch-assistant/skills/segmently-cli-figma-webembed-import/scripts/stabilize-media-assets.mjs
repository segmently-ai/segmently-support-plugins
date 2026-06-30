#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_WARN_UPLOAD_BYTES = 5 * 1024 * 1024;

function usage() {
  return [
    'Usage:',
    '  node stabilize-media-assets.mjs --catalog <custom-screen-catalog.json> --project <projectId> [options]',
    '',
    'Downloads remote/local Media section sources, uploads them through',
    '`segmently assets upload-image`, rewrites data-sources.json and',
    'data-source-plan.json to stable CDN asset references, and writes',
    'checks/media-cdn-upload-manifest.json.',
    '',
    'Options:',
    '  --env <env>              Segmently CLI environment. Omit to use CLI default.',
    '  --cli <command>          Segmently CLI command/path. Defaults to SEGMENTLY_CLI or segmently.',
    '  --folder <folder>        Folder under projects/<projectId>/cli-assets.',
    '  --locale <locale>        Locale to rewrite. Defaults to en-US.',
    '  --concurrency <n>        Parallel uploads. Defaults to 3.',
    '  --max-upload-bytes <n>   Fail before upload when a source exceeds this size. Defaults to 10485760.',
    '  --warn-upload-bytes <n>  Add manifest warning when a source exceeds this size. Defaults to 5242880.',
    '  --resize-max-edge <px>   Downscale raster images proportionally to fit inside this edge.',
    '  --resize-format <format> keep, webp, jpeg, png. Defaults to keep.',
    '  --resize-quality <n>     JPEG/WebP quality for client-side resize. Defaults to 85.',
    '  --check-sizes            With --dry-run, download sources and write source size metadata.',
    '  --manifest <file>        Manifest path. Defaults to checks/media-cdn-upload-manifest.json.',
    '  --dry-run                Only scan and write the manifest; do not upload or rewrite.',
    '  --help                   Show this help.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    cli: process.env.SEGMENTLY_CLI || 'segmently',
    locale: DEFAULT_LOCALE,
    concurrency: 3,
    maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
    warnUploadBytes: DEFAULT_WARN_UPLOAD_BYTES,
    resizeFormat: 'keep',
    resizeQuality: 85,
    checkSizes: false,
    dryRun: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--catalog') args.catalog = argv[++index];
    else if (arg === '--project') args.projectId = argv[++index];
    else if (arg === '--env') args.env = argv[++index];
    else if (arg === '--cli') args.cli = argv[++index];
    else if (arg === '--folder') args.folder = argv[++index];
    else if (arg === '--locale') args.locale = argv[++index];
    else if (arg === '--concurrency') args.concurrency = Number(argv[++index]);
    else if (arg === '--max-upload-bytes') args.maxUploadBytes = Number(argv[++index]);
    else if (arg === '--warn-upload-bytes') args.warnUploadBytes = Number(argv[++index]);
    else if (arg === '--resize-max-edge') args.resizeMaxEdge = Number(argv[++index]);
    else if (arg === '--resize-format') args.resizeFormat = argv[++index];
    else if (arg === '--resize-quality') args.resizeQuality = Number(argv[++index]);
    else if (arg === '--check-sizes') args.checkSizes = true;
    else if (arg === '--manifest') args.manifest = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function validateArgs(args) {
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) {
    throw new Error('--concurrency must be a positive number.');
  }
  if (!Number.isFinite(args.maxUploadBytes) || args.maxUploadBytes < 1) {
    throw new Error('--max-upload-bytes must be a positive number.');
  }
  if (!Number.isFinite(args.warnUploadBytes) || args.warnUploadBytes < 1) {
    throw new Error('--warn-upload-bytes must be a positive number.');
  }
  if (args.resizeMaxEdge !== undefined && (!Number.isFinite(args.resizeMaxEdge) || args.resizeMaxEdge < 1)) {
    throw new Error('--resize-max-edge must be a positive number.');
  }
  if (!['keep', 'webp', 'jpeg', 'jpg', 'png'].includes(String(args.resizeFormat))) {
    throw new Error('--resize-format must be one of: keep, webp, jpeg, png.');
  }
  if (!Number.isFinite(args.resizeQuality) || args.resizeQuality < 1 || args.resizeQuality > 100) {
    throw new Error('--resize-quality must be a number from 1 to 100.');
  }
  args.resizeFormat = String(args.resizeFormat || 'keep').toLowerCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveRunDir(catalogPath, catalog) {
  if (catalog.outputDir) {
    return path.isAbsolute(catalog.outputDir)
      ? catalog.outputDir
      : path.resolve(path.dirname(catalogPath), catalog.outputDir);
  }
  return path.dirname(catalogPath);
}

function resolveInRun(runDir, relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(runDir, relativeOrAbsolute);
}

function slug(value, fallback = 'asset') {
  const text = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return text || fallback;
}

function hash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10);
}

function mediaTranslation(section, locale) {
  if (section?.mediaContent?.kind === 'Video') {
    return section.mediaContent.content?.video?.translations?.[locale];
  }
  return section?.mediaContent?.content?.image?.translations?.[locale];
}

function setMaterializedMedia(section, locale, asset) {
  const translation = mediaTranslation(section, locale);
  if (!translation) return;
  translation.original = asset.original;
  translation.small = asset.small;
}

function getPlanUrl(section, locale) {
  if (!section || section.kind !== 'Media') return '';
  if (section.mediaContent) return mediaTranslation(section, locale)?.original || '';
  return section.url || section.assetUrl?.original || section.assetUrl?.origin || section.mediaUrl || '';
}

function setPlanUrl(section, locale, asset) {
  if (!section || section.kind !== 'Media') return;
  if (section.mediaContent) {
    setMaterializedMedia(section, locale, asset);
    return;
  }
  section.url = asset.original;
  section.assetUrl = { original: asset.original, small: asset.small };
}

function inferImageInfo(buffer, contentType, fallbackName) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/svg+xml') return { ext: 'svg', mimeType: 'image/svg+xml' };
  if (mime === 'image/png') return { ext: 'png', mimeType: 'image/png' };
  if (mime === 'image/jpeg') return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (mime === 'image/webp') return { ext: 'webp', mimeType: 'image/webp' };
  if (mime === 'image/gif') return { ext: 'gif', mimeType: 'image/gif' };

  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mimeType: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mimeType: 'image/webp' };
  }
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return { ext: 'gif', mimeType: 'image/gif' };
  if (buffer.slice(0, 256).toString('utf8').trimStart().startsWith('<svg')) {
    return { ext: 'svg', mimeType: 'image/svg+xml' };
  }

  const ext = (fallbackName.match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase();
  if (ext === 'svg') return { ext: 'svg', mimeType: 'image/svg+xml' };
  if (ext === 'jpg' || ext === 'jpeg') return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (ext === 'gif') return { ext: 'gif', mimeType: 'image/gif' };
  if (ext === 'webp') return { ext: 'webp', mimeType: 'image/webp' };
  return { ext: 'png', mimeType: 'image/png' };
}

function mimeToExt(mimeType) {
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function normalizeResizeFormat(format, sourceMimeType) {
  const value = String(format || 'keep').toLowerCase();
  if (value === 'keep') return sourceMimeType;
  if (value === 'jpg' || value === 'jpeg') return 'image/jpeg';
  if (value === 'webp') return 'image/webp';
  if (value === 'png') return 'image/png';
  return sourceMimeType;
}

async function writeSourceFile(runDir, downloadsDir, source, ref) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  const baseName = `${ref.screenId}-${slug(ref.label)}-${hash(source)}`;

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`download ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const info = inferImageInfo(buffer, response.headers.get('content-type'), baseName);
    const filePath = path.join(downloadsDir, `${baseName}.${info.ext}`);
    fs.writeFileSync(filePath, buffer);
    return { filePath, mimeType: info.mimeType, bytes: buffer.length };
  }

  const filePath = resolveInRun(runDir, source);
  const buffer = fs.readFileSync(filePath);
  const info = inferImageInfo(buffer, '', filePath);
  return { filePath, mimeType: info.mimeType, bytes: buffer.length };
}

async function inspectRasterImage(filePath) {
  try {
    const sharp = await import('sharp');
    const metadata = await sharp.default(filePath).metadata();
    return {
      width: metadata.width || null,
      height: metadata.height || null,
      format: metadata.format || null,
    };
  } catch {
    return { width: null, height: null, format: null };
  }
}

async function resizeSourceFileIfNeeded(args, sourceFile, downloadsDir, ref) {
  const raster = !['image/svg+xml', 'image/gif'].includes(sourceFile.mimeType);
  const metadata = raster
    ? await inspectRasterImage(sourceFile.filePath)
    : { width: null, height: null, format: sourceFile.mimeType === 'image/svg+xml' ? 'svg' : 'gif' };
  const warnings = [];
  if (sourceFile.bytes > args.warnUploadBytes) {
    warnings.push({
      code: 'large-source-image',
      message: `Source image is ${sourceFile.bytes} bytes, above warning threshold ${args.warnUploadBytes}.`,
    });
  }

  const sizeInfo = {
    sourceBytes: sourceFile.bytes,
    uploadBytes: sourceFile.bytes,
    sourceMimeType: sourceFile.mimeType,
    uploadMimeType: sourceFile.mimeType,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    uploadWidth: metadata.width,
    uploadHeight: metadata.height,
    resized: false,
    resizeSkippedReason: null,
    warnings,
  };

  const maxEdge = args.resizeMaxEdge;
  const exceedsByteLimit = sourceFile.bytes > args.maxUploadBytes;
  const exceedsEdgeLimit = Number.isFinite(maxEdge)
    && (Number(metadata.width || 0) > maxEdge || Number(metadata.height || 0) > maxEdge);
  if (!raster && (exceedsByteLimit || exceedsEdgeLimit)) {
    sizeInfo.resizeSkippedReason = `client-side resize is unsupported for ${sourceFile.mimeType}`;
  }

  if (raster && Number.isFinite(maxEdge) && (exceedsByteLimit || exceedsEdgeLimit)) {
    let sharp;
    try {
      sharp = await import('sharp');
    } catch (error) {
      throw new Error(`Image ${ref.screenId}:${ref.label} needs client-side resize, but sharp is unavailable: ${error.message}`);
    }
    const uploadMimeType = normalizeResizeFormat(args.resizeFormat, sourceFile.mimeType);
    const outputExt = mimeToExt(uploadMimeType);
    const resizedPath = path.join(
      downloadsDir,
      `${ref.screenId}-${slug(ref.label)}-${hash(sourceFile.filePath)}-resized.${outputExt}`,
    );
    let pipeline = sharp.default(sourceFile.filePath)
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    if (uploadMimeType === 'image/webp') pipeline = pipeline.webp({ quality: args.resizeQuality });
    else if (uploadMimeType === 'image/jpeg') pipeline = pipeline.jpeg({ quality: args.resizeQuality });
    else if (uploadMimeType === 'image/png') pipeline = pipeline.png();
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    fs.writeFileSync(resizedPath, data);
    sizeInfo.uploadBytes = data.length;
    sizeInfo.uploadMimeType = uploadMimeType;
    sizeInfo.uploadWidth = info.width || null;
    sizeInfo.uploadHeight = info.height || null;
    sizeInfo.resized = true;
    sizeInfo.resizedFilePath = resizedPath;
    if (data.length > args.maxUploadBytes) {
      throw new Error(
        `Image ${ref.screenId}:${ref.label} is still ${data.length} bytes after client-side resize, ` +
        `above --max-upload-bytes ${args.maxUploadBytes}. Reduce --resize-max-edge, change --resize-format, ` +
        'or reduce the source asset.',
      );
    }
    return {
      ...sourceFile,
      filePath: resizedPath,
      mimeType: uploadMimeType,
      bytes: data.length,
      sizeInfo,
    };
  }

  if (sourceFile.bytes > args.maxUploadBytes) {
    const resizeHint = sizeInfo.resizeSkippedReason
      ? `${sizeInfo.resizeSkippedReason}. `
      : '';
    throw new Error(
      `Image ${ref.screenId}:${ref.label} is ${sourceFile.bytes} bytes, above --max-upload-bytes ${args.maxUploadBytes}. ` +
      resizeHint +
      'Use --resize-max-edge for client-side downscale before upload, or reduce the source asset.',
    );
  }

  return { ...sourceFile, sizeInfo };
}

function cliCommand(cli) {
  return cli.endsWith('.js')
    ? { command: process.execPath, prefix: [cli] }
    : { command: cli, prefix: [] };
}

function uploadFile(args, filePath, mimeType, ref) {
  const name = `${ref.screenId}-${slug(ref.label)}${path.extname(filePath) || '.png'}`;
  const invocation = cliCommand(args.cli);
  const commandArgs = [
    ...invocation.prefix,
    ...(args.env ? ['--env', args.env] : []),
    '--format', 'json',
    'assets', 'upload-image',
    filePath,
    args.projectId,
    ...(args.folder ? ['--folder', args.folder] : []),
    '--name', name,
    '--mime-type', mimeType,
    '--asset',
  ];

  const result = spawnSync(invocation.command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `upload failed ${result.status}`).trim());
  }
  return JSON.parse(result.stdout);
}

function collectSources(runDir, catalog, locale) {
  const sources = new Map();
  for (const screen of catalog.screens || []) {
    const dataSourcesFile = screen.updated?.dataSourcesFile;
    if (!dataSourcesFile) continue;
    const dataSources = readJson(resolveInRun(runDir, dataSourcesFile));
    for (const section of dataSources) {
      if (section.kind !== 'Media') continue;
      const source = mediaTranslation(section, locale)?.original;
      if (!source) continue;
      if (!sources.has(source)) sources.set(source, { source, refs: [] });
      sources.get(source).refs.push({ screenId: screen.id, label: section.label });
    }
  }
  return Array.from(sources.values());
}

function readExistingUploads(manifestFile) {
  if (!fs.existsSync(manifestFile)) return new Map();
  const manifest = readJson(manifestFile);
  const uploads = new Map();
  for (const item of manifest.items || []) {
    if ((item.status === 'uploaded' || item.status === 'uploaded-with-size-warning') && item.asset?.original && item.asset?.small) {
      uploads.set(item.source, item);
    }
  }
  return uploads;
}

async function runPool(items, concurrency, worker) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function buildSizeReport(args, runDir, downloadsDir, sources) {
  const inspected = [];
  const failures = [];
  await runPool(sources.filter((item) => !sourceIsStableCdn(item.source)), Number(args.concurrency || 3), async (item) => {
    const firstRef = item.refs[0];
    try {
      const sourceFile = await writeSourceFile(runDir, downloadsDir, item.source, firstRef);
      const processed = await resizeSourceFileIfNeeded(args, sourceFile, downloadsDir, firstRef);
      inspected.push({
        source: item.source,
        refs: item.refs,
        filePath: processed.filePath,
        mimeType: processed.mimeType,
        bytes: processed.bytes,
        sizeInfo: processed.sizeInfo,
        status: processed.sizeInfo?.warnings?.length ? 'size-warning' : 'size-ok',
      });
    } catch (error) {
      failures.push({
        source: item.source,
        refs: item.refs,
        status: 'size-failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { inspected, failures };
}

function updateMediaFiles(runDir, catalog, locale, uploadMap) {
  for (const screen of catalog.screens || []) {
    const dataSourcesFile = screen.updated?.dataSourcesFile;
    if (!dataSourcesFile) continue;
    const dataSourcesPath = resolveInRun(runDir, dataSourcesFile);
    const dataSources = readJson(dataSourcesPath);
    for (const section of dataSources) {
      const source = mediaTranslation(section, locale)?.original;
      const upload = uploadMap.get(source);
      if (upload) setMaterializedMedia(section, locale, upload.asset);
    }
    writeJson(dataSourcesPath, dataSources);

    const planPath = path.join(runDir, 'screens', screen.id, 'updated', 'data-source-plan.json');
    if (fs.existsSync(planPath)) {
      const plan = readJson(planPath);
      for (const section of plan) {
        const upload = uploadMap.get(getPlanUrl(section, locale));
        if (upload) setPlanUrl(section, locale, upload.asset);
      }
      writeJson(planPath, plan);
    }
  }
}

function updateFigmaCatalog(runDir, locale, uploadMap) {
  const figmaCatalogPath = path.join(runDir, 'figma-catalog.json');
  if (!fs.existsSync(figmaCatalogPath)) return;
  const figmaCatalog = readJson(figmaCatalogPath);
  for (const screen of figmaCatalog.screens || []) {
    const planPath = path.join(runDir, 'screens', screen.id, 'updated', 'data-source-plan.json');
    if (fs.existsSync(planPath)) {
      screen.dataSourcePlan = readJson(planPath);
    } else if (Array.isArray(screen.dataSourcePlan)) {
      for (const section of screen.dataSourcePlan) {
        const upload = uploadMap.get(getPlanUrl(section, locale));
        if (upload) setPlanUrl(section, locale, upload.asset);
      }
    }
  }
  writeJson(figmaCatalogPath, figmaCatalog);
}

function sourceIsStableCdn(source) {
  return /^https?:\/\//i.test(source) && !source.includes('figma.com/api/mcp/asset');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  validateArgs(args);
  if (!args.catalog) throw new Error(`Missing --catalog\n\n${usage()}`);
  if (!args.projectId && !args.dryRun) throw new Error('Missing --project for upload mode.');

  const catalogPath = path.resolve(args.catalog);
  const catalog = readJson(catalogPath);
  const runDir = resolveRunDir(catalogPath, catalog);
  const manifestFile = resolveInRun(runDir, args.manifest || 'checks/media-cdn-upload-manifest.json');
  const downloadsDir = path.join(runDir, 'checks', 'media-cdn-source');
  const sources = collectSources(runDir, catalog, args.locale);
  const existingUploads = readExistingUploads(manifestFile);

  if (args.dryRun) {
    const sizeReport = args.checkSizes
      ? await buildSizeReport(args, runDir, downloadsDir, sources)
      : { inspected: [], failures: [] };
    const stableItems = sources
      .filter((item) => sourceIsStableCdn(item.source))
      .map((item) => ({ ...item, status: 'already-stable' }));
    const pendingItems = args.checkSizes
      ? sizeReport.inspected
      : sources
        .filter((item) => !sourceIsStableCdn(item.source))
        .map((item) => ({ ...item, status: 'needs-upload' }));
    writeJson(manifestFile, {
      schemaVersion: 'figma-webembed-media-cdn-upload/v1',
      status: sizeReport.failures.length ? 'dry-run-failed' : 'dry-run',
      generatedAt: new Date().toISOString(),
      env: args.env || null,
      projectId: args.projectId || null,
      assetSizePolicy: {
        maxUploadBytes: args.maxUploadBytes,
        warnUploadBytes: args.warnUploadBytes,
        resizeMaxEdge: args.resizeMaxEdge || null,
        resizeFormat: args.resizeFormat,
        resizeQuality: args.resizeQuality,
      },
      totalSources: sources.length,
      alreadyStable: sources.filter((item) => sourceIsStableCdn(item.source)).length,
      needsUpload: sources.filter((item) => !sourceIsStableCdn(item.source)).length,
      sizeChecked: args.checkSizes,
      failed: sizeReport.failures.length,
      items: [...stableItems, ...pendingItems, ...sizeReport.failures],
    });
    console.log(JSON.stringify({
      manifest: manifestFile,
      sources: sources.length,
      sizeChecked: args.checkSizes,
      failed: sizeReport.failures.length,
    }, null, 2));
    if (sizeReport.failures.length) process.exit(1);
    return;
  }

  const uploaded = Array.from(existingUploads.values());
  const alreadyStable = sources
    .filter((item) => sourceIsStableCdn(item.source))
    .map((item) => ({ ...item, status: 'already-stable' }));
  const failures = [];
  const pending = sources.filter((item) => !sourceIsStableCdn(item.source) && !existingUploads.has(item.source));

  await runPool(pending, Number(args.concurrency || 3), async (item, index) => {
    const firstRef = item.refs[0];
    try {
      const sourceFile = await writeSourceFile(runDir, downloadsDir, item.source, firstRef);
      const processed = await resizeSourceFileIfNeeded(args, sourceFile, downloadsDir, firstRef);
      const asset = uploadFile(args, processed.filePath, processed.mimeType, firstRef);
      uploaded.push({
        source: item.source,
        refs: item.refs,
        filePath: processed.filePath,
        mimeType: processed.mimeType,
        bytes: processed.bytes,
        sizeInfo: processed.sizeInfo,
        asset,
        status: processed.sizeInfo?.warnings?.length ? 'uploaded-with-size-warning' : 'uploaded',
      });
      console.error(`[${index + 1}/${pending.length}] uploaded ${firstRef.screenId}:${firstRef.label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        source: item.source,
        refs: item.refs,
        status: 'failed',
        error: message,
      });
      console.error(`[${index + 1}/${pending.length}] failed ${firstRef.screenId}:${firstRef.label}: ${message}`);
    }
  });

  const manifest = {
    schemaVersion: 'figma-webembed-media-cdn-upload/v1',
    status: failures.length ? 'failed' : 'uploaded',
    generatedAt: new Date().toISOString(),
    env: args.env || null,
    projectId: args.projectId,
    folder: args.folder || null,
    assetSizePolicy: {
      maxUploadBytes: args.maxUploadBytes,
      warnUploadBytes: args.warnUploadBytes,
      resizeMaxEdge: args.resizeMaxEdge || null,
      resizeFormat: args.resizeFormat,
      resizeQuality: args.resizeQuality,
    },
    totalSources: sources.length,
    alreadyStable: alreadyStable.length,
    uploaded: uploaded.length,
    failed: failures.length,
    items: [...alreadyStable, ...uploaded, ...failures],
  };
  writeJson(manifestFile, manifest);

  if (failures.length) {
    console.log(JSON.stringify({ manifest: manifestFile, uploaded: uploaded.length, failed: failures.length }, null, 2));
    process.exit(1);
  }

  const uploadMap = new Map(uploaded.map((item) => [item.source, item]));
  updateMediaFiles(runDir, catalog, args.locale, uploadMap);
  updateFigmaCatalog(runDir, args.locale, uploadMap);
  catalog.checks = {
    ...(catalog.checks || {}),
    mediaCdnUploadManifestFile: path.relative(runDir, manifestFile),
  };
  writeJson(catalogPath, catalog);

  console.log(JSON.stringify({ manifest: manifestFile, uploaded: uploaded.length, failed: 0 }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
