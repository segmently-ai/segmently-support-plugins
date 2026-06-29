import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export async function prepareBrowserAuth(args, options) {
  if (args.skipAuthBridge || process.env.SUPPORT_FLOW_SKIP_BROWSER_AUTH === '1') {
    return {
      enabled: false,
      ok: true,
      reason: 'browser auth bridge skipped by explicit option',
    };
  }

  const baseUrl = options.baseUrl;
  const segmentlyBin = args.segmentlyBin || args.segmently || 'segmently';
  const authEnv = args.authEnv || process.env.SUPPORT_FLOW_SEGMENTLY_AUTH_ENV || inferAuthEnv(baseUrl);
  const authPreflight = buildAuthPreflight(args, {
    baseUrl,
    authEnv,
    retryArgv: options.retryArgv,
  });
  const status = checkCliAuthStatus(segmentlyBin, authEnv);
  if (!status.ok) {
    return {
      enabled: true,
      ok: false,
      authEnv,
      reason: status.reason,
      authStatus: status.summary,
      authPreflight,
    };
  }
  const token = printCliToken(segmentlyBin, authEnv);
  if (!token.ok) {
    return {
      enabled: true,
      ok: false,
      authEnv,
      reason: token.reason,
      stderrPreview: redactSecrets(token.stderr ?? ''),
      authPreflight,
    };
  }

  const firebaseApiKey = args.firebaseApiKey
    || process.env.SUPPORT_FLOW_FIREBASE_API_KEY
    || await discoverFirebaseApiKey(baseUrl);
  if (!firebaseApiKey) {
    return {
      enabled: true,
      ok: false,
      authEnv,
      reason: 'Could not discover the public Firebase apiKey from the app. Pass --firebaseApiKey or SUPPORT_FLOW_FIREBASE_API_KEY.',
      authPreflight,
    };
  }

  const claims = decodeJwtClaims(token.idToken) ?? {};
  const credential = {
    idToken: token.idToken,
    firebaseApiKey,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    uid: typeof claims.user_id === 'string'
      ? claims.user_id
      : typeof claims.sub === 'string'
        ? claims.sub
        : '',
    expiresAt: typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + 55 * 60 * 1000,
  };
  const dir = mkdtempSync(join(tmpdir(), 'segmently-browser-auth-'));
  const initScriptFile = join(dir, 'firebase-auth-seed.js');
  writeFileSync(initScriptFile, buildFirebaseAuthSeedScript(credential), { mode: 0o600 });
  return {
    enabled: true,
    ok: true,
    authEnv,
    initScriptFile,
    baseUrl,
    email: credential.email ?? null,
    firebaseApiKeySource: args.firebaseApiKey
      ? 'argument'
      : process.env.SUPPORT_FLOW_FIREBASE_API_KEY
        ? 'environment'
        : 'app',
  };
}

export function cleanupBrowserAuth(auth) {
  if (!auth?.initScriptFile) return;
  try {
    rmSync(auth.initScriptFile, { force: true });
    const dir = auth.initScriptFile.split('/').slice(0, -1).join('/');
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup; never fail a completed browser run because temp cleanup failed.
  }
}

export function authSummary(auth) {
  if (!auth) return null;
  return {
    enabled: auth.enabled === true,
    ok: auth.ok === true,
    authEnv: auth.authEnv ?? null,
    email: auth.email ?? null,
    firebaseApiKeySource: auth.firebaseApiKeySource ?? null,
    reason: auth.reason ?? null,
    preflightRequired: Boolean(auth.authPreflight && auth.ok !== true),
  };
}

export function buildAuthPreflight(args = {}, options = {}) {
  const baseUrl = options.baseUrl ?? args.baseUrl;
  const segmentlyBin = args.segmentlyBin || args.segmently || 'segmently';
  const authEnv = options.authEnv
    || args.authEnv
    || process.env.SUPPORT_FLOW_SEGMENTLY_AUTH_ENV
    || inferAuthEnv(baseUrl);
  const retryArgv = Array.isArray(options.retryArgv) ? options.retryArgv : null;
  return {
    requiredForExecute: true,
    authEnv,
    statusProbe: {
      purpose: 'Check whether the local Segmently CLI is authorized before live SHOW/DO.',
      argv: [segmentlyBin, ...authStatusArgv(authEnv)],
      safeToShowOutput: true,
    },
    login: {
      purpose: 'Authorize the CLI when statusProbe reports auth_required or not logged in.',
      argv: [segmentlyBin, ...authLoginArgv(authEnv)],
      interactive: true,
      browserBased: true,
      fallbackArgv: [segmentlyBin, ...authLoginArgv(authEnv), '--no-browser'],
    },
    tokenProbe: {
      purpose: 'Internal browser auth seed after login; never print or paste stdout.',
      argv: [segmentlyBin, ...printTokenArgv(authEnv)],
      safeToShowOutput: false,
    },
    browserSeed: {
      purpose: 'Seed the authenticated Firebase session into the Playwright browser context.',
      helper: 'runtime/browser-auth-bridge.mjs',
      credentialSource: 'segmently auth print-token',
      storesCredentials: false,
      writesTemporaryInitScript: true,
    },
    retry: retryArgv
      ? {
          purpose: 'Re-run the original live operation after login and browser auth seed succeed.',
          argv: retryArgv,
        }
      : null,
    agentInstruction: 'Do not stop at auth_required. Run statusProbe, run login if needed, re-run statusProbe, then retry the same SHOW/DO runner. Only ask the customer to finish the browser login if the interactive authorization requires their approval.',
  };
}

export function wrapDriverScriptWithBrowserAuth(driverScript, auth) {
  if (!auth?.initScriptFile) return driverScript;
  const initScriptFile = JSON.stringify(auth.initScriptFile);
  const seedUrl = JSON.stringify(auth.baseUrl ? `${String(auth.baseUrl).replace(/\/+$/, '')}/login` : null);
  return `async (page) => {
  await page.context().addInitScript({ path: ${initScriptFile} });
  const seedUrl = ${seedUrl};
  if (seedUrl) {
    await page.goto(seedUrl);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.evaluate(() => window.__SEGMENTLY_AUTH_SEED_READY__ || true).catch(() => {});
  }
  const run = ${driverScript};
  return await run(page);
}`;
}

function buildFirebaseAuthSeedScript(credential) {
  const now = Date.now();
  const seed = {
    dbName: 'firebaseLocalStorageDb',
    storeName: 'firebaseLocalStorage',
    fbaseKey: `firebase:authUser:${credential.firebaseApiKey}:[DEFAULT]`,
    user: {
      uid: credential.uid,
      email: credential.email ?? null,
      emailVerified: true,
      isAnonymous: false,
      providerData: [],
      stsTokenManager: {
        refreshToken: '',
        accessToken: credential.idToken,
        expirationTime: credential.expiresAt,
      },
      createdAt: String(now),
      lastLoginAt: String(now),
      apiKey: credential.firebaseApiKey,
      appName: '[DEFAULT]',
    },
  };
  return `(() => {
  const args = ${JSON.stringify(seed)};
  window.__SEGMENTLY_AUTH_SEED_READY__ = new Promise((resolve) => {
  try {
    const serializedUser = JSON.stringify(args.user);
    localStorage.setItem(args.fbaseKey, serializedUser);
    sessionStorage.setItem(args.fbaseKey, serializedUser);
    const open = indexedDB.open(args.dbName);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(args.storeName)) {
        db.createObjectStore(args.storeName, { keyPath: 'fbase_key' });
      }
    };
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(args.storeName)) {
        db.close();
        resolve(false);
        return;
      }
      const tx = db.transaction([args.storeName], 'readwrite');
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.objectStore(args.storeName).put({ fbase_key: args.fbaseKey, value: args.user });
    };
  } catch {
    // The app auth guard will surface a visible login failure if seeding fails.
    resolve(false);
  }
  });
})();`;
}

function inferAuthEnv(baseUrl) {
  const value = String(baseUrl ?? '');
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(value)) return 'dev';
  if (/^https?:\/\/(?:dev\.segmently\.ai|dev-api\.segmently\.ai)(?::|\/|$)/i.test(value)) return 'dev';
  if (/^https?:\/\/(?:stage\.segmently\.ai|stage-api\.segmently\.ai|staging\.segmently\.ai|staging-api\.segmently\.ai)(?::|\/|$)/i.test(value)) return 'stage';
  return 'prod';
}

function checkCliAuthStatus(segmentlyBin, authEnv) {
  const result = spawnSync(segmentlyBin, authStatusArgv(authEnv), {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const summary = {
    argv: [segmentlyBin, ...authStatusArgv(authEnv)],
    status: result.status ?? 1,
    stdoutPreview: redactSecrets(result.stdout ?? ''),
    stderrPreview: redactSecrets(result.stderr ?? ''),
  };
  if (result.error) {
    return {
      ok: false,
      reason: result.error.message,
      summary: { ...summary, stderrPreview: result.error.message },
    };
  }
  if ((result.status ?? 0) === 0) {
    return { ok: true, summary };
  }
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const reason = /auth[_ -]?required|not (authenticated|logged)|login/i.test(combined)
    ? `Segmently CLI is not authenticated for ${authEnv}. Run the auth preflight and retry the same live operation.`
    : `segmently auth status failed for ${authEnv}`;
  return {
    ok: false,
    reason,
    summary,
  };
}

function printCliToken(segmentlyBin, authEnv) {
  const argv = printTokenArgv(authEnv);
  const result = spawnSync(segmentlyBin, argv, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    return { ok: false, reason: result.error.message, stderr: result.stderr ?? '' };
  }
  if ((result.status ?? 0) !== 0) {
    const stderr = result.stderr ?? '';
    const reason = /auth[_ -]?required|not (authenticated|logged)/i.test(stderr)
      ? `Segmently CLI is not authenticated for ${authEnv}. Run segmently auth login first.`
      : `segmently auth print-token failed for ${authEnv}`;
    return { ok: false, reason, stderr };
  }
  const idToken = String(result.stdout ?? '').trim();
  if (!idToken || idToken.split('.').length !== 3) {
    return { ok: false, reason: `segmently auth print-token did not return a Firebase idToken for ${authEnv}` };
  }
  return { ok: true, idToken };
}

function authStatusArgv(authEnv) {
  return ['--env', authEnv, 'auth', 'status'];
}

function authLoginArgv(authEnv) {
  return ['--env', authEnv, 'auth', 'login'];
}

function printTokenArgv(authEnv) {
  const argv = ['--env', authEnv, 'auth', 'print-token', '--raw'];
  if (authEnv === 'prod') argv.push('--allow-prod');
  return argv;
}

async function discoverFirebaseApiKey(baseUrl) {
  if (!baseUrl) return null;
  const base = String(baseUrl).replace(/\/+$/, '');
  const seen = new Set();
  const candidates = [
    `${base}/src/firebase.js`,
    `${base}/firebase.js`,
    `${base}/login`,
    `${base}/`,
  ];
  for (const url of candidates) {
    const key = await fetchKeyFromUrl(url, base, seen);
    if (key) return key;
  }
  return null;
}

async function fetchKeyFromUrl(url, base, seen) {
  if (seen.has(url)) return null;
  seen.add(url);
  const text = await fetchText(url);
  if (!text) return null;
  const direct = extractFirebaseApiKey(text);
  if (direct) return direct;
  const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map(match => absoluteUrl(match[1], base))
    .filter(Boolean);
  for (const scriptUrl of scripts) {
    const key = await fetchKeyFromUrl(scriptUrl, base, seen);
    if (key) return key;
  }
  return null;
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractFirebaseApiKey(text) {
  const vite = text.match(/"VITE_FIREBASE_API_KEY"\s*:\s*"([^"]+)"/);
  if (vite?.[1]) return vite[1];
  const objectValue = text.match(/apiKey\s*:\s*["'](AIza[0-9A-Za-z_-]+)["']/);
  if (objectValue?.[1]) return objectValue[1];
  const loose = text.match(/AIza[0-9A-Za-z_-]{20,}/);
  return loose?.[0] ?? null;
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, `${base}/`).toString();
  } catch {
    return null;
  }
}

function decodeJwtClaims(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function redactSecrets(text) {
  return String(text ?? '')
    .replace(JWT_RE, '[JWT_REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, '$1[REDACTED]')
    .replace(/("(?:accessToken|refreshToken|idToken|apiKey)"\s*:\s*")[^"]+"/g, '$1[REDACTED]"');
}
