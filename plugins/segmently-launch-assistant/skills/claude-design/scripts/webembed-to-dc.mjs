#!/usr/bin/env node
// Segmently WebEmbed custom screen  ->  Claude Design artboard (.dc.html)
// Presentation goes on the canvas; behavior (SDK glue) is QUARANTINED in the
// manifest so it can neither break inside the no-egress iframe nor be hand-edited.
// Schema: segmently.webembed-dc-wrap/v1
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const input = opt('--in'); const outDir = opt('--out'); const artboard = opt('--artboard', 'Main.dc.html');
if (!input || !outDir) { console.error('usage: --in <index.html> --out <dir> [--artboard Main.dc.html]'); process.exit(2); }

const src = readFileSync(input, 'utf8');
const sha = createHash('sha256').update(src).digest('hex').slice(0, 16);
const head = src.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
const body = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!head || !body) { console.error('FAIL: no <head>/<body> — not a standalone WebEmbed document'); process.exit(1); }

// body: trailing <script> blocks are quarantined; the DOM prefix becomes the artboard
let dom = body[1];
let nScripts = 0;
for (;;) { const m = dom.match(/\s*<script\b[^>]*>[\s\S]*?<\/script>\s*$/i); if (!m) break; nScripts++; dom = dom.slice(0, m.index); }
if (/<script\b/i.test(dom)) { console.error('FAIL: <script> interleaved inside the DOM — unsupported; move SDK glue to the end of <body>'); process.exit(1); }
const bodyTail = body[1].slice(dom.length);   // byte-exact: whitespace + quarantined scripts
// The published page sets frame-src/object-src 'none': a nested frame paints as an empty
// box on the canvas, indistinguishable from a wrapper bug. Say so at wrap time, not after.
for (const t of new Set([...dom.matchAll(/<(iframe|object|embed)\b/gi)].map((m) => m[1].toLowerCase())))
  console.error(`warn: <${t}> in the DOM — the canvas blocks it; it will paint as an empty box, which is NOT a wrapper failure`);

// head: <style>/<link> become the artboard <helmet>; the rest of the document is a template
const helmet = [];
let docTemplate = src.replace(head[1], head[1].replace(/<style\b[^>]*>[\s\S]*?<\/style>|<link\b[^>]*>/gi,
  (m) => { helmet.push(m); return `<!--DCWRAP:helmet:${helmet.length - 1}-->`; }));
docTemplate = docTemplate.replace(body[1], '<!--DCWRAP:body-->');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, artboard), `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${helmet.join('\n')}
</helmet>
${dom.trim()}
</x-dc>
</body>
</html>
`);
writeFileSync(join(outDir, 'wrap-manifest.json'), JSON.stringify({
  schemaVersion: 'segmently.webembed-dc-wrap/v1',
  source: basename(input), sourceSha256: sha, artboard,
  helmetCount: helmet.length, quarantinedScripts: nScripts,
  docTemplate, bodyTail,
  domLead: dom.slice(0, dom.length - dom.trimStart().length),
  domTrail: dom.slice(dom.trimEnd().length),
}, null, 2) + '\n');
console.error(`ok: ${artboard} · helmet ${helmet.length} · quarantined scripts ${nScripts} · sha ${sha}`);
