#!/usr/bin/env node
/**
 * aggregate-results.mjs — read every eval's grading.json + the scenario-evals spec and
 * emit a compact summary (JSON + a markdown table body) for the STATUS report.
 * Part of the repeatable regression record: re-run after re-grading.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');
const repoRoot = findRepoRoot(skillRoot);
const evalsDir = join(repoRoot, 'qa-screenshots/launch-guide-verification/evals');
const spec = JSON.parse(readFileSync(join(skillRoot, 'evals/scenario-evals.json'), 'utf8'));

const pad2 = n => String(n).padStart(2, '0');
const rows = [];
let totalPass = 0, totalAssert = 0, allTriggered = 0, fullPassEvals = 0;

for (const ev of spec.evals) {
  const dir = join(evalsDir, `${pad2(ev.id)}-${ev.scenario}-${ev.lang}`);
  const gradingPath = join(dir, 'grading.json');
  const transcriptPath = join(dir, 'transcript.md');
  let passed = null, total = null, triggered = null, fails = [];
  if (existsSync(gradingPath)) {
    const g = JSON.parse(readFileSync(gradingPath, 'utf8'));
    passed = g.summary?.passed ?? (g.expectations || []).filter(e => e.passed).length;
    total = g.summary?.total ?? (g.expectations || []).length;
    triggered = g.triggered_launch_guide ?? null;
    fails = (g.expectations || []).filter(e => !e.passed).map(e => e.text.slice(0, 60));
    totalPass += passed; totalAssert += total;
    if (passed === total) fullPassEvals++;
  }
  // Triggering from transcript SKILLS_USED (authoritative in-repo signal).
  let skillsUsed = '';
  if (existsSync(transcriptPath)) {
    const last = readFileSync(transcriptPath, 'utf8').trim().split('\n').pop() || '';
    skillsUsed = last.replace(/^SKILLS_USED:\s*/, '');
    if (/segmently-launch-guide/.test(skillsUsed)) allTriggered++;
  }
  rows.push({ id: ev.id, scenario: ev.scenario, lang: ev.lang, passed, total, triggered, skillsUsed, fails });
}

const summary = {
  evals: rows.length,
  fullPassEvals,
  assertions: `${totalPass}/${totalAssert}`,
  triggeredSkill: `${allTriggered}/${rows.length}`,
};
console.log(JSON.stringify({ summary, rows }, null, 2));
writeFileSync(join(evalsDir, '..', 'results.json'), JSON.stringify({ summary, rows }, null, 2) + '\n');
console.error(`\nSUMMARY: ${fullPassEvals}/${rows.length} evals full-pass | assertions ${totalPass}/${totalAssert} | triggered ${allTriggered}/${rows.length}`);
const anyFail = rows.filter(r => r.passed !== r.total);
if (anyFail.length) { console.error('NON-FULL-PASS:'); for (const r of anyFail) console.error(`  ${r.id} ${r.scenario}/${r.lang}: ${r.passed}/${r.total} — ${r.fails.join('; ')}`); }

function findRepoRoot(start) {
  let current = start;
  while (current && current !== dirname(current)) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'modules/support-flow/MODULE.md'))) {
      return current;
    }
    current = dirname(current);
  }
  throw new Error(`Could not find Segmently repo root from ${start}`);
}
