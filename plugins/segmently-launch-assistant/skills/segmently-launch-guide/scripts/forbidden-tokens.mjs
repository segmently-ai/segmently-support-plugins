/**
 * Single source for the leak-guard vocabulary, imported by BOTH the eval runner
 * (run-evals.mjs) and the sync codegen (sync-from-support-flow.ts) so the
 * forbidden-token list can never silently diverge between the two gates.
 *
 * These tokens must never appear in the customer-facing projection (SKILL.md +
 * references/*): internal/admin skills, internal CLI flags, non-prod env flags,
 * loopback/source-tree markers.
 */
export const FORBIDDEN_TOKENS = Object.freeze([
  'SEGMENTLY_CLI_INTERNAL',
  'segmently-cli-admin-guide',
  'support-flow-author',
  'cli-admin-guide',
  'deployweblocal',
  'worktree-local-dev',
  'plugin-creator',
  'segmently-guides-dev-to-prod',
  'segmently-migration',
  'segmently-admin-diagnostics',
  'data-testid',
  '.claude/',
  '.agents/',
  'src/modules/',
  'test-login',
  'SEGMENTLY_HOME',
  '127.0.0.1',
  'internal payments',
  'internal guides',
  'internal billing',
  '--env ',
]);
