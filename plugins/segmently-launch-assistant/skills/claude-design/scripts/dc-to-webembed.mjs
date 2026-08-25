#!/usr/bin/env node
// Claude Design artboard (.dc.html)  ->  Segmently WebEmbed custom screen HTML
// Reverses the wrap and re-attaches the quarantined behavior verbatim.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const inDir = opt('--in'); const out = opt('--out');
if (!inDir || !out) { console.error('usage: --in <dir with wrap-manifest.json + artboard> --out <index.html>'); process.exit(2); }

const man = JSON.parse(readFileSync(join(inDir, 'wrap-manifest.json'), 'utf8'));
const dc = readFileSync(join(inDir, man.artboard), 'utf8');
const xdc = dc.match(/<x-dc>([\s\S]*?)<\/x-dc>/i);
if (!xdc) { console.error('FAIL: no <x-dc> in the artboard'); process.exit(1); }

const helmetBlock = xdc[1].match(/<helmet>([\s\S]*?)<\/helmet>/i);
const helmetParts = helmetBlock ? (helmetBlock[1].match(/<style\b[^>]*>[\s\S]*?<\/style>|<link\b[^>]*>/gi) || []) : [];
if (helmetParts.length !== man.helmetCount) console.error(`warn: helmet blocks ${helmetParts.length} vs ${man.helmetCount} at wrap time`);
const dom = xdc[1].replace(/<helmet>[\s\S]*?<\/helmet>/i, '').trim();

// Gate: nothing template-ish may reach a runnable screen.
const leak = dom.match(/x-dc|sc-if|sc-for|style-hover|style-active/g);   // '{{' alone is ambiguous — the Stream-B gate owns that check
if (leak) { console.error(`FAIL: canvas template syntax leaked into the screen: ${[...new Set(leak)].join(', ')}`); process.exit(1); }

let html = man.docTemplate.replace('<!--DCWRAP:body-->', () => man.domLead + dom + (man.domTrail ?? '') + man.bodyTail);
html = html.replace(/<!--DCWRAP:helmet:(\d+)-->/g, (_, i) => helmetParts[Number(i)] ?? '');
writeFileSync(out, html);
console.error(`ok: ${out} (${html.length}B) · helmet ${helmetParts.length} · gate clean`);
