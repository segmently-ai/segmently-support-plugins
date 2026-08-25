#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.out) fail('Usage: render-library-preview.mjs --input <library-example.json> --out <preview.html>');

const input = readJson(args.input);
const example = input.example ?? input.payload ?? input;
const screens = parseScreens(example.previewScreens);
if (!screens.length) fail('previewScreens must be a non-empty array');

const cards = screens.map((screen, index) => {
  const id = text(screen?.id ?? `screen-${index + 1}`);
  const type = text(screen?.screenType ?? screen?.data?.type ?? screen?.type ?? 'Unknown');
  const name = text(screen?.name ?? screen?.data?.name ?? id);
  const snapshot = text(JSON.stringify(screen, null, 2));
  return `<article class="screen"><header><span>${index + 1}</span><div><strong>${name}</strong><small>${id} · ${type}</small></div></header><pre>${snapshot}</pre></article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${text(example.name ?? 'Block library preview')}</title>
<style>
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f5f6fa;color:#171923}*{box-sizing:border-box}body{margin:0;padding:32px}main{max-width:1440px;margin:auto}h1{margin:0 0 8px;font-size:28px}.note{color:#667085;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}.screen{background:#fff;border:1px solid #dfe3ec;border-radius:18px;box-shadow:0 8px 30px #11182712;overflow:hidden}.screen header{display:flex;gap:12px;align-items:center;padding:16px;border-bottom:1px solid #eaecf0}.screen header>span{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#6d5dfc;color:#fff;font-weight:700}.screen strong,.screen small{display:block}.screen small{color:#667085;margin-top:3px}.screen pre{margin:0;padding:16px;max-height:620px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}@media(prefers-color-scheme:dark){:root{background:#10131a;color:#eef2ff}.screen{background:#181d27;border-color:#344054}.screen header{border-color:#344054}.screen small,.note{color:#98a2b3}}
</style></head><body><main><h1>${text(example.name ?? 'Block library preview')}</h1><p class="note">Full preview snapshots · render-only · never model input · ${screens.length} screen(s)</p><section class="grid">${cards}</section></main></body></html>`;

const outputPath = resolve(args.out);
writeFileSync(outputPath, html, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, outputPath, screenCount: screens.length, renderOnly: true }, null, 2)}\n`);

function parseScreens(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    fail(`Cannot read example: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function text(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') out.input = argv[++index];
    else if (argv[index] === '--out') out.out = argv[++index];
    else fail(`Unknown option ${argv[index]}`);
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
