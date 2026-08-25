#!/usr/bin/env node
// Pre-apply gate for a WebEmbed screen that came back from a design canvas.
//
// Why this exists: `custom-screen healthcheck` PASSES an artifact whose visible
// copy was edited in the canvas, because the SDK refs and data sources are all
// intact — yet at runtime `node.textContent = section.title` overwrites that copy
// from the data source and destroys any markup injected into a bound node. The
// edit renders in the canvas, survives apply, and is silently dead in production.
//
// So: classify every change, keep what survives runtime, and ROUTE a text edit to
// where it actually belongs — the data source — instead of dropping it.
// Schema: segmently.webembed-roundtrip-gate/v1
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const original = opt('--original'); const edited = opt('--edited');
const dsPath = opt('--data-sources'); const mapPath = opt('--interaction-map');
const outDir = opt('--out');
if (!original || !edited || !dsPath || !outDir) {
  console.error('usage: --original <index.html> --edited <index.html> --data-sources <data-sources.json> [--interaction-map <m.json>] --out <dir>');
  process.exit(2);
}

const A = readFileSync(original, 'utf8');
const B = readFileSync(edited, 'utf8');
const sources = JSON.parse(readFileSync(dsPath, 'utf8'));

// ---------- minimal element scanner (no deps; balanced by tag name) ----------
function scan(html, attr) {
  const out = new Map();
  const re = new RegExp(`<([a-zA-Z][\\w-]*)((?:\\s+[^<>]*?)?\\s${attr}="([^"]*)"(?:\\s+[^<>]*?)?)>`, 'g');
  let m;
  while ((m = re.exec(html)) !== null) {
    const [openTag, tag, , key] = m;
    const openEnd = m.index + openTag.length;
    const closeRe = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
    closeRe.lastIndex = openEnd;
    let depth = 1, innerEnd = -1, c;
    while ((c = closeRe.exec(html)) !== null) {
      depth += c[0][1] === '/' ? -1 : 1;
      if (depth === 0) { innerEnd = c.index; break; }
    }
    if (innerEnd === -1) continue;                       // void or malformed: skip
    out.set(key, { tag, key, openTag, openStart: m.index, openEnd, innerEnd,
                   inner: html.slice(openEnd, innerEnd) });
  }
  return out;
}
const textOf = (h) => h.replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

// ---------- resolve bound node -> data-source label ----------
// Tier 1: the screen's own convention map (`var copyLabels = { key: "Label" }`).
// Tier 2: unique match of the ORIGINAL text against a source's stored title.
function conventionMap(html) {
  const m = html.match(/var\s+copyLabels\s*=\s*\{([\s\S]*?)\}\s*;/);
  const map = new Map();
  if (!m) return map;
  for (const p of m[1].matchAll(/([A-Za-z0-9_$]+)\s*:\s*"([^"]*)"/g)) map.set(p[1], p[2]);
  return map;
}
const titleOf = (s) => {
  const t = s.textContent?.title?.translations;
  return t ? (t.en ?? Object.values(t)[0]) : undefined;
};
const byLabel = new Map(sources.map((s) => [s.label, s]));
const labels = conventionMap(A);
function resolveSource(key, originalText) {
  const viaMap = labels.get(key);
  if (viaMap && byLabel.has(viaMap)) return { source: byLabel.get(viaMap), how: 'convention' };
  const hits = sources.filter((s) => titleOf(s) === originalText);
  if (hits.length === 1) return { source: hits[0], how: 'text-match' };
  return { source: null, how: hits.length ? 'ambiguous' : 'unresolved' };
}

// ---------- classify ----------
const findings = [];
const add = (f) => findings.push(f);
const bound = { A: scan(A, 'data-copy'), B: scan(B, 'data-copy') };
const patched = JSON.parse(JSON.stringify(sources));
let html = B;
const edits = [];   // byte splices applied to `html` at the end, right-to-left

for (const [key, a] of bound.A) {
  const b = bound.B.get(key);
  if (!b) { add({ code: 'element_removed', severity: 'block', key, detail: `[data-copy="${key}"] is gone from the edited screen` }); continue; }
  if (a.inner === b.inner) continue;
  const at = textOf(a.inner), bt = textOf(b.inner);
  const markupChanged = a.inner.replace(/\s+/g, ' ').trim() !== b.inner.replace(/\s+/g, ' ').trim() && at === bt;
  if (markupChanged) {
    edits.push({ start: b.openEnd, end: b.innerEnd, text: a.inner });
    add({ code: 'markup_stripped', severity: 'warn', key,
          detail: `markup injected into an SDK-bound text node; \`node.textContent = …\` destroys it at runtime — reverted to the original` });
    continue;
  }
  const { source, how } = resolveSource(key, at);
  if (!source) {
    add({ code: 'text_unroutable', severity: 'block', key, from: at, to: bt,
          detail: `copy changed but no data source could be resolved (${how}) — routing it would guess; resolve by hand` });
    continue;
  }
  const target = patched.find((s) => s.label === source.label);
  const tr = target.textContent?.title?.translations;
  if (!tr) { add({ code: 'text_unroutable', severity: 'block', key, from: at, to: bt, detail: `source "${source.label}" carries no textContent.title.translations` }); continue; }
  for (const loc of Object.keys(tr)) tr[loc] = bt;
  edits.push({ start: b.openEnd, end: b.innerEnd, text: a.inner });   // HTML keeps the fallback it had
  add({ code: 'text_routed', severity: 'info', key, from: at, to: bt,
        detail: `routed into data source "${source.label}" (${how}); HTML fallback left as it was` });
}
for (const key of bound.B.keys()) if (!bound.A.has(key)) add({ code: 'element_added', severity: 'warn', key, detail: 'new SDK-bound node — it needs its own data source before apply' });

// attribute/style deltas on bound nodes are the edits we WANT: report, keep.
for (const [key, a] of bound.A) {
  const b = bound.B.get(key); if (!b || a.openTag === b.openTag) continue;
  const styleA = (a.openTag.match(/\sstyle="([^"]*)"/) || [])[1];
  const styleB = (b.openTag.match(/\sstyle="([^"]*)"/) || [])[1];
  add({ code: styleA !== styleB ? 'style_change' : 'attr_change', severity: 'info', key,
        detail: styleA !== styleB ? `style: ${styleA ?? '(none)'} -> ${styleB ?? '(none)'}` : `attributes changed on <${b.tag}>` });
}

// testids are the interaction contract: losing one breaks the map and every e2e selector.
const ids = (h) => new Set([...h.matchAll(/data-testid="([^"]*)"/g)].map((m) => m[1]));
for (const id of ids(A)) if (!ids(B).has(id)) add({ code: 'testid_removed', severity: 'block', id, detail: `data-testid="${id}" disappeared — interaction map and e2e selectors break` });
if (mapPath) {
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  for (const el of map.elements ?? []) if (!ids(B).has(el.testId)) add({ code: 'interaction_map_broken', severity: 'block', id: el.testId, detail: `interaction-map role "${el.role}" points at a testid that no longer exists` });
}
for (const leak of new Set(B.match(/x-dc|sc-if|sc-for|style-hover|style-active|\{\{/g) ?? [])) add({ code: 'template_leak', severity: 'block', detail: `canvas template syntax survived into the screen: ${leak}` });

// ---------- emit ----------
for (const e of edits.sort((x, y) => y.start - x.start)) html = html.slice(0, e.start) + e.text + html.slice(e.end);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, 'data-sources.json'), JSON.stringify(patched, null, 2) + '\n');
const blocked = findings.filter((f) => f.severity === 'block');
writeFileSync(join(outDir, 'gate-report.json'), JSON.stringify({
  schemaVersion: 'segmently.webembed-roundtrip-gate/v1',
  original, edited, verdict: blocked.length ? 'blocked' : 'pass', findings,
}, null, 2) + '\n');
for (const f of findings) console.error(`${f.severity.toUpperCase().padEnd(5)} ${f.code.padEnd(22)} ${f.key ?? f.id ?? ''} — ${f.detail}`);
console.error(`\n${blocked.length ? 'BLOCKED' : 'PASS'}: ${findings.length} finding(s) -> ${join(outDir, 'gate-report.json')}`);
process.exit(blocked.length ? 1 : 0);
