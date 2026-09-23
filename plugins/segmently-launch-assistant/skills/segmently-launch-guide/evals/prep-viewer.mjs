#!/usr/bin/env node
/**
 * prep-viewer.mjs — adapt each eval run dir to the skill-creator eval-viewer contract
 * (generate_review.py expects: <run>/outputs/<file>, <run>/grading.json, <run>/eval_metadata.json).
 * Idempotent. Part of the repeatable regression record.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');
const repoRoot = join(skillRoot, '../../..');
const evalsDir = join(repoRoot, 'qa-screenshots/launch-guide-verification/evals');
const spec = JSON.parse(readFileSync(join(skillRoot, 'evals/scenario-evals.json'), 'utf8'));
const pad2 = n => String(n).padStart(2, '0');

let prepped = 0;
for (const ev of spec.evals) {
  const dir = join(evalsDir, `${pad2(ev.id)}-${ev.scenario}-${ev.lang}`);
  const transcript = join(dir, 'transcript.md');
  if (!existsSync(transcript)) { console.error(`skip (no transcript): ${dir}`); continue; }
  const outputs = join(dir, 'outputs');
  mkdirSync(outputs, { recursive: true });
  // Copy answer as an output file (NOT named transcript.md — that name is excluded by the viewer).
  copyFileSync(transcript, join(outputs, 'answer.md'));
  // eval_metadata.json gives the viewer the prompt + eval id.
  writeFileSync(join(dir, 'eval_metadata.json'), JSON.stringify({
    eval_id: ev.id, scenario: ev.scenario, lang: ev.lang, prompt: ev.prompt,
    expected_output: ev.expected_output,
  }, null, 2) + '\n');
  prepped++;
}
console.log(`prepped ${prepped} run dirs for the eval-viewer`);
