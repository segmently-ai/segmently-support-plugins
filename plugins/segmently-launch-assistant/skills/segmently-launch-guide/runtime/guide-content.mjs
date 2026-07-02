/**
 * Lazy guide content hydration for installed Segmently launch skills.
 *
 * references/guide-evidence.json and references/guide-registry.json are
 * COMPACT directories: every scalar/routing field is present, but the heavy
 * per-guide `sections` arrays live in references/guides/<guideKey>.json
 * (pointed to by each row's `contentRef`, mirroring the article contentRef
 * pattern). Hydrate only the guides you actually selected; hydrate-all is for
 * audits/evals that need the legacy full shape.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const contentCache = new Map();

export function readGuideContent(skillRoot, contentRefOrGuideKey) {
  if (!contentRefOrGuideKey) return null;
  const rel = String(contentRefOrGuideKey).endsWith('.json')
    ? String(contentRefOrGuideKey)
    : `references/guides/${contentRefOrGuideKey}.json`;
  const cacheKey = `${skillRoot}::${rel}`;
  if (contentCache.has(cacheKey)) return contentCache.get(cacheKey);
  const path = join(skillRoot, rel);
  let parsed = null;
  if (existsSync(path)) {
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      parsed = null;
    }
  }
  contentCache.set(cacheKey, parsed);
  return parsed;
}

/**
 * Returns the guide-evidence row with its full `sections` array restored.
 * Drops the compact-only `sectionCount`/`contentRef` markers so the hydrated
 * row reproduces the legacy shape byte-for-byte (`sections` was the last key)
 * — consumers that hash or diff rows see no change from the lazy split.
 */
export function hydrateGuideEvidenceRow(skillRoot, row) {
  if (!row || Array.isArray(row.sections)) return row;
  const { sectionCount: _sectionCount, contentRef, ...rest } = row;
  const content = readGuideContent(skillRoot, contentRef ?? row.guideKey);
  return { ...rest, sections: content?.evidence?.sections ?? [] };
}

/** Returns the guide-registry row with its full `sections` array restored. */
export function hydrateGuideRegistryRow(skillRoot, row) {
  if (!row || Array.isArray(row.sections)) return row;
  const { sectionCount: _sectionCount, contentRef, ...rest } = row;
  const content = readGuideContent(skillRoot, contentRef ?? row.guideKey);
  return { ...rest, sections: content?.registrySections ?? [] };
}

/** Legacy full shape of guide-evidence (all guides hydrated). */
export function hydrateAllGuideEvidence(skillRoot, guideEvidence) {
  if (!guideEvidence || !Array.isArray(guideEvidence.guides)) return guideEvidence;
  return {
    ...guideEvidence,
    guides: guideEvidence.guides.map(row => hydrateGuideEvidenceRow(skillRoot, row)),
  };
}

/** Legacy full shape of guide-registry (all guides hydrated). */
export function hydrateAllGuideRegistry(skillRoot, guideRegistry) {
  if (!guideRegistry || !Array.isArray(guideRegistry.guides)) return guideRegistry;
  return {
    ...guideRegistry,
    guides: guideRegistry.guides.map(row => hydrateGuideRegistryRow(skillRoot, row)),
  };
}
