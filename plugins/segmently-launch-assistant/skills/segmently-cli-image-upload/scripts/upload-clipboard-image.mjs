#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { access, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_WARN_UPLOAD_BYTES = 5 * 1024 * 1024;
const DEFAULT_RESIZE_QUALITY = 85;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}
validateUploadOptions(args);

const envName = args.env || process.env.SEGMENTLY_ENV || null;
const projectId = args.project || process.env.SEGMENTLY_ASSET_PROJECT || process.env.SEGMENTLY_PROJECT || null;
if (!projectId) {
  fail('Missing project id. Pass --project <projectId> or set SEGMENTLY_ASSET_PROJECT / SEGMENTLY_PROJECT.');
}
const folder = normalizeRelativePath(args.folder || 'agent-upload');
const source = args.file
  ? { filePath: resolve(args.file), source: 'file' }
  : await saveClipboardPng(args.name || 'clipboard');
const preparedSource = await prepareImageForUpload(source, args);

const sourceName = safePathSegment(args.name || stripImageExtension(basename(source.filePath)) || 'clipboard');
const storagePath = args.path
  ? normalizeRelativePath(args.path)
  : `projects/${safePathSegment(projectId)}/cli-assets/${folder}/${timestamp()}_${sourceName}`;

const result = await uploadWithCli({ filePath: preparedSource.filePath, projectId, storagePath, envName, source: source.source });
result.sizeInfo = preparedSource.sizeInfo;

if (args.rawUrl) {
  process.stdout.write(`${result.originalUrl}\n`);
} else if (args.asset) {
  process.stdout.write(`${JSON.stringify(result.asset, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function uploadWithCli({ filePath, projectId, storagePath, envName, source }) {
  const commandArgs = [
    'assets',
    'upload-image',
    filePath,
    '--project',
    projectId,
    '--path',
    storagePath,
  ];
  if (envName) commandArgs.push('--env', envName);
  const run = spawnSync('segmently', commandArgs, {
    env: process.env,
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    fail(`Segmently CLI upload failed:\n${run.stdout || ''}${run.stderr || ''}`.trim());
  }

  try {
    const payload = JSON.parse(run.stdout);
    return normalizeResult({
      payload,
      projectId,
      storagePath,
      envName,
      source,
      method: 'cli',
    });
  } catch (error) {
    fail(`Segmently CLI upload returned non-JSON output: ${error instanceof Error ? error.message : String(error)}\n${run.stdout}`);
  }
}

function normalizeResult({ payload, projectId, storagePath, envName, source, method }) {
  const assetUrl = payload.assetUrl || {};
  if (!assetUrl.origin || !assetUrl.small) {
    fail(`Upload response did not include assetUrl.origin and assetUrl.small: ${JSON.stringify(payload)}`);
  }

  return {
    projectId,
    projectNamespace: projectId,
    env: envName || 'default',
    method,
    source,
    path: storagePath,
    originalUrl: assetUrl.origin,
    smallUrl: assetUrl.small,
    asset: {
      original: assetUrl.origin,
      small: assetUrl.small,
    },
    assetUrl: {
      origin: assetUrl.origin,
      small: assetUrl.small,
      thumb: assetUrl.thumb || assetUrl.small,
      medium: assetUrl.medium || assetUrl.small,
      normal: assetUrl.normal || assetUrl.origin,
    },
    metadata: payload.metadata,
  };
}

async function saveClipboardPng(name) {
  const dir = await mkdtemp(join(tmpdir(), 'segmently-clipboard-image-'));
  const filePath = join(dir, `${safePathSegment(name)}.png`);
  const script = [
    `set outPath to "${escapeAppleScript(filePath)}"`,
    'set pngData to the clipboard as «class PNGf»',
    'set fileRef to open for access POSIX file outPath with write permission',
    'set eof of fileRef to 0',
    'write pngData to fileRef',
    'close access fileRef',
    'return outPath',
  ];

  try {
    execFileSync('osascript', script.flatMap((line) => ['-e', line]), { encoding: 'utf8' });
    await access(filePath);
    return { filePath, source: 'macos-clipboard' };
  } catch (error) {
    fail(`Could not read a PNG image from the macOS clipboard. Copy the image again or pass --file. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--project':
        parsed.project = takeValue(argv, ++index, arg);
        break;
      case '--env':
        parsed.env = takeValue(argv, ++index, arg);
        break;
      case '--folder':
        parsed.folder = takeValue(argv, ++index, arg);
        break;
      case '--name':
        parsed.name = takeValue(argv, ++index, arg);
        break;
      case '--path':
        parsed.path = takeValue(argv, ++index, arg);
        break;
      case '--file':
        parsed.file = takeValue(argv, ++index, arg);
        break;
      case '--max-upload-bytes':
        parsed.maxUploadBytes = Number(takeValue(argv, ++index, arg));
        break;
      case '--warn-upload-bytes':
        parsed.warnUploadBytes = Number(takeValue(argv, ++index, arg));
        break;
      case '--resize-max-edge':
        parsed.resizeMaxEdge = Number(takeValue(argv, ++index, arg));
        break;
      case '--resize-format':
        parsed.resizeFormat = takeValue(argv, ++index, arg);
        break;
      case '--resize-quality':
        parsed.resizeQuality = Number(takeValue(argv, ++index, arg));
        break;
      case '--asset':
        parsed.asset = true;
        break;
      case '--raw-url':
        parsed.rawUrl = true;
        break;
      default:
        fail(`Unknown option: ${arg}`);
    }
  }
  if (parsed.asset && parsed.rawUrl) {
    fail('Use only one of --asset or --raw-url.');
  }
  parsed.maxUploadBytes ??= DEFAULT_MAX_UPLOAD_BYTES;
  parsed.warnUploadBytes ??= DEFAULT_WARN_UPLOAD_BYTES;
  parsed.resizeFormat ??= 'keep';
  parsed.resizeQuality ??= DEFAULT_RESIZE_QUALITY;
  return parsed;
}

function validateUploadOptions(parsed) {
  if (!Number.isFinite(parsed.maxUploadBytes) || parsed.maxUploadBytes < 1) {
    fail('--max-upload-bytes must be a positive number.');
  }
  if (!Number.isFinite(parsed.warnUploadBytes) || parsed.warnUploadBytes < 1) {
    fail('--warn-upload-bytes must be a positive number.');
  }
  if (parsed.resizeMaxEdge !== undefined && (!Number.isFinite(parsed.resizeMaxEdge) || parsed.resizeMaxEdge < 1)) {
    fail('--resize-max-edge must be a positive number.');
  }
  parsed.resizeFormat = String(parsed.resizeFormat || 'keep').toLowerCase();
  if (!['keep', 'webp', 'jpeg', 'jpg', 'png'].includes(parsed.resizeFormat)) {
    fail('--resize-format must be one of: keep, webp, jpeg, png.');
  }
  if (!Number.isFinite(parsed.resizeQuality) || parsed.resizeQuality < 1 || parsed.resizeQuality > 100) {
    fail('--resize-quality must be a number from 1 to 100.');
  }
}

function takeValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    fail(`${option} requires a value.`);
  }
  return value;
}

function printHelp() {
  process.stdout.write(`Upload a macOS clipboard image or local file to the Segmently CDN.

Usage:
  node scripts/upload-clipboard-image.mjs [options]

Options:
  --project <id>             Project id/namespace. Defaults to SEGMENTLY_ASSET_PROJECT, then SEGMENTLY_PROJECT.
  --env <env>                Optional Segmently CLI environment override. By default the Segmently CLI uses its configured public target.
  --folder <folder>          Folder under projects/<project>/cli-assets. Default: agent-upload.
  --name <name>              Human-readable asset name. Default: clipboard.
  --path <path>              Full storage path without /assets prefix.
  --file <path>              Upload a local file instead of the macOS clipboard image.
  --max-upload-bytes <n>     Fail before upload above this size. Default: ${DEFAULT_MAX_UPLOAD_BYTES}.
  --warn-upload-bytes <n>    Add size warning above this size. Default: ${DEFAULT_WARN_UPLOAD_BYTES}.
  --resize-max-edge <px>     Downscale raster images proportionally to fit inside this edge.
  --resize-format <format>   keep, webp, jpeg, or png. Default: keep.
  --resize-quality <n>       JPEG/WebP quality for client-side resize. Default: ${DEFAULT_RESIZE_QUALITY}.
  --asset                    Print only { original, small }.
  --raw-url                  Print only original URL.
  --help                     Show this help.
`);
}

function normalizeRelativePath(value) {
  const normalized = String(value).trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('..')) {
    fail('Asset path must be a relative path without "..".');
  }
  return normalized
    .split('/')
    .map(safePathSegment)
    .filter(Boolean)
    .join('/');
}

function safePathSegment(value) {
  const segment = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return segment || 'asset';
}

function stripImageExtension(fileName) {
  return fileName.replace(/\.(jpe?g|png|gif|webp|svg)$/i, '');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function inferMimeType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

async function prepareImageForUpload(source, parsed) {
  const sourceStats = await stat(source.filePath);
  const sourceMimeType = inferMimeType(source.filePath);
  const raster = !['image/svg+xml', 'image/gif'].includes(sourceMimeType);
  const metadata = raster
    ? await inspectRasterImage(source.filePath)
    : { width: null, height: null, format: sourceMimeType === 'image/svg+xml' ? 'svg' : 'gif' };
  const warnings = [];
  if (sourceStats.size > parsed.warnUploadBytes) {
    warnings.push({
      code: 'large-source-image',
      message: `Source image is ${sourceStats.size} bytes, above warning threshold ${parsed.warnUploadBytes}.`,
    });
  }

  const sizeInfo = {
    sourcePath: source.filePath,
    uploadPath: source.filePath,
    sourceBytes: sourceStats.size,
    uploadBytes: sourceStats.size,
    sourceMimeType,
    uploadMimeType: sourceMimeType,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    uploadWidth: metadata.width,
    uploadHeight: metadata.height,
    resized: false,
    resizeSkippedReason: null,
    warnings,
  };
  const maxEdge = parsed.resizeMaxEdge;
  const exceedsByteLimit = sourceStats.size > parsed.maxUploadBytes;
  const exceedsEdgeLimit = Number.isFinite(maxEdge)
    && (Number(metadata.width || 0) > maxEdge || Number(metadata.height || 0) > maxEdge);

  if (!raster && (exceedsByteLimit || exceedsEdgeLimit)) {
    sizeInfo.resizeSkippedReason = `client-side resize is unsupported for ${sourceMimeType}`;
  }

  if (raster && Number.isFinite(maxEdge) && (exceedsByteLimit || exceedsEdgeLimit)) {
    let sharp;
    try {
      sharp = await import('sharp');
    } catch (error) {
      fail(`Image needs client-side resize, but sharp is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    const uploadMimeType = normalizeResizeFormat(parsed.resizeFormat, sourceMimeType);
    const outputExt = mimeToExt(uploadMimeType);
    const resizedDir = await mkdtemp(join(tmpdir(), 'segmently-upload-resize-'));
    const resizedPath = join(
      resizedDir,
      `${stripImageExtension(basename(source.filePath)) || 'image'}-resized.${outputExt}`,
    );
    let pipeline = sharp.default(source.filePath)
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    if (uploadMimeType === 'image/webp') pipeline = pipeline.webp({ quality: parsed.resizeQuality });
    else if (uploadMimeType === 'image/jpeg') pipeline = pipeline.jpeg({ quality: parsed.resizeQuality });
    else if (uploadMimeType === 'image/png') pipeline = pipeline.png();
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    await writeFile(resizedPath, data);
    sizeInfo.uploadPath = resizedPath;
    sizeInfo.uploadBytes = data.length;
    sizeInfo.uploadMimeType = uploadMimeType;
    sizeInfo.uploadWidth = info.width || null;
    sizeInfo.uploadHeight = info.height || null;
    sizeInfo.resized = true;
    if (data.length > parsed.maxUploadBytes) {
      fail(
        `Image is still ${data.length} bytes after client-side resize, above --max-upload-bytes ${parsed.maxUploadBytes}. ` +
        'Reduce --resize-max-edge, change --resize-format, or reduce the source asset.',
      );
    }
    return { ...source, filePath: resizedPath, sizeInfo };
  }

  if (sourceStats.size > parsed.maxUploadBytes) {
    const resizeHint = sizeInfo.resizeSkippedReason
      ? `${sizeInfo.resizeSkippedReason}. `
      : '';
    fail(
      `Image is ${sourceStats.size} bytes, above --max-upload-bytes ${parsed.maxUploadBytes}. ` +
      resizeHint +
      'Use --resize-max-edge for client-side downscale before upload, or reduce the source asset.',
    );
  }

  return { ...source, sizeInfo };
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

function normalizeResizeFormat(format, sourceMimeType) {
  const value = String(format || 'keep').toLowerCase();
  if (value === 'keep') return sourceMimeType;
  if (value === 'jpg' || value === 'jpeg') return 'image/jpeg';
  if (value === 'webp') return 'image/webp';
  if (value === 'png') return 'image/png';
  return sourceMimeType;
}

function mimeToExt(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function escapeAppleScript(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
