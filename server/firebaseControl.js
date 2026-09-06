const { initializeApp, getApps, getApp } = require('firebase/app');
const {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  signInAnonymously,
} = require('firebase/auth');
const { getDatabase, ref, onValue, update, set, get, remove, push } = require('firebase/database');
const { firebaseConfig } = require('./firebaseConfig');

/** @type {Promise<{ app: import('firebase/app').FirebaseApp; db: import('firebase/database').Database }> | null} */
let initPromise = null;
let firebaseReady = false;
// After anonymous auth fails (or the first permission_denied), stop all RTDB
// traffic. The Express API keeps serving live/control/history/alerts from memory.
let rtdbDisabled = false;
let rtdbDisableReason = '';

function isPermissionDenied(err) {
  const code = err && (err.code || err.status);
  const msg = err && err.message ? String(err.message) : '';
  return code === 'PERMISSION_DENIED' || /permission.?denied/i.test(msg);
}

function disableRtdb(reason) {
  if (rtdbDisabled) return;
  rtdbDisabled = true;
  rtdbDisableReason = reason || 'unavailable';
  firebaseReady = false;
  console.warn(
    `[firebase] RTDB disabled (${rtdbDisableReason}). ` +
      'API continues from in-memory state. Enable Anonymous Auth in Firebase Console, ' +
      'or open RTDB rules, then restart the service to resume mirroring.'
  );
}

function canUseRtdb() {
  return !rtdbDisabled;
}

// Target growing conditions (per thesis): 21–27 °C, 80–90 % RH, 1000–2000 ppm CO₂.
// Upper bounds drive the exhaust fan (fan-on when above). Lower bounds are
// informational + used for alerting only — the system has no way to heat,
// humidify, or enrich CO₂.
function defaultControl() {
  return {
    // upper bounds (exhaust + intake fan turn on above)
    co2ThresholdPpm: 2000,
    tempFanOnC: 27,
    humFanOnPct: 90,
    // lower bounds (alert-only; sprinkler uses its own hysteresis band below)
    co2MinPpm: 1000,
    tempMinC: 21,
    humMinPct: 80,
    // exhaust fan manual override
    manualOverride: false,
    manualFanOn: false,
    // intake fan (independent from exhaust: turns on when CO2 or temp above max)
    intakeFanEnabled: true,
    manualIntakeFanOverride: false,
    manualIntakeFanOn: false,
    // sprinkler / humidifier — hysteresis + safety timers
    // on when hum <= sprinklerOnHumPct, off when hum >= sprinklerOffHumPct
    // capped at sprinklerMaxOnSec per burst with sprinklerMinOffSec cooldown
    sprinklerEnabled: true,
    sprinklerOnHumPct: 78,
    sprinklerOffHumPct: 85,
    sprinklerMaxOnSec: 60,
    sprinklerMinOffSec: 300,
    manualSprinklerOverride: false,
    manualSprinklerOn: false,
    // heater — hysteresis + safety timers (mirror of sprinkler, temperature side)
    // on when temp <= heaterOnTempC, off when temp >= heaterOffTempC
    // capped at heaterMaxOnSec per burst with heaterMinOffSec cooldown
    heaterEnabled: true,
    heaterOnTempC: 21,
    heaterOffTempC: 23,
    heaterMaxOnSec: 900,
    heaterMinOffSec: 60,
    manualHeaterOverride: false,
    manualHeaterOn: false,
  };
}

/**
 * @param {Record<string, unknown>} control
 * @param {unknown} raw
 */
/**
 * Field validation rules shared by applyControlSnapshot and
 * mergeControlToFirebase. `int: true` rounds before range-checking.
 */
const CONTROL_NUM_FIELDS = [
  // upper bounds
  { key: 'co2ThresholdPpm', min: 400, max: 10000, int: true },
  { key: 'tempFanOnC',      min: 15,  max: 45 },
  { key: 'humFanOnPct',     min: 55,  max: 100 },
  // lower bounds
  { key: 'co2MinPpm',       min: 300, max: 5000, int: true },
  { key: 'tempMinC',        min: 5,   max: 30 },
  { key: 'humMinPct',       min: 30,  max: 95 },
  // sprinkler hysteresis + timers
  { key: 'sprinklerOnHumPct',  min: 30, max: 95 },
  { key: 'sprinklerOffHumPct', min: 35, max: 100 },
  { key: 'sprinklerMaxOnSec',  min: 5,  max: 600,  int: true },
  { key: 'sprinklerMinOffSec', min: 30, max: 3600, int: true },
  // heater hysteresis + timers
  { key: 'heaterOnTempC',  min: 5,   max: 28 },
  { key: 'heaterOffTempC', min: 6,   max: 30 },
  { key: 'heaterMaxOnSec', min: 30,  max: 3600, int: true },
  { key: 'heaterMinOffSec', min: 15, max: 1800, int: true },
];

const CONTROL_BOOL_FIELDS = [
  'manualOverride',
  'manualFanOn',
  'intakeFanEnabled',
  'manualIntakeFanOverride',
  'manualIntakeFanOn',
  'sprinklerEnabled',
  'manualSprinklerOverride',
  'manualSprinklerOn',
  'heaterEnabled',
  'manualHeaterOverride',
  'manualHeaterOn',
];

function coerceNumField(raw, spec) {
  const v = raw[spec.key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = spec.int ? Math.round(v) : v;
  if (n < spec.min || n > spec.max) return undefined;
  return n;
}

function applyControlSnapshot(control, raw) {
  if (!raw || typeof raw !== 'object') return;
  for (const spec of CONTROL_NUM_FIELDS) {
    const v = coerceNumField(raw, spec);
    if (v !== undefined) control[spec.key] = v;
  }
  for (const key of CONTROL_BOOL_FIELDS) {
    if (typeof raw[key] === 'boolean') control[key] = raw[key];
  }
}

function getFirebaseContext() {
  if (!initPromise) {
    initPromise = (async () => {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      let auth;
      try {
        auth = initializeAuth(app, { persistence: inMemoryPersistence });
      } catch (e) {
        if (e && e.code === 'auth/already-initialized') auth = getAuth(app);
        else throw e;
      }
      try {
        await signInAnonymously(auth);
        console.log('[firebase] Web SDK + anonymous auth');
      } catch (e) {
        const code = e && e.code;
        if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
          disableRtdb('anonymous auth disabled');
        } else {
          throw e;
        }
      }
      const db = getDatabase(app);
      if (!rtdbDisabled) firebaseReady = true;
      return { app, db };
    })().catch((e) => {
      firebaseReady = false;
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

/** Optional: connect before first HTTP client (health may show ready sooner). */
function warmup() {
  return getFirebaseContext().catch((e) => {
    console.error('[firebase] warmup failed:', e.message);
  });
}

/** @type {Set<string>} */
const subscribed = new Set();

/**
 * @param {(deviceId: string, control: object) => void} onUpdate
 */
function ensureControlSubscription(deviceId, onUpdate) {
  if (!deviceId || !canUseRtdb()) return;
  if (subscribed.has(deviceId)) return;
  subscribed.add(deviceId);

  getFirebaseContext()
    .then(({ db }) => {
      if (!canUseRtdb()) return;
      const r = ref(db, `devices/${deviceId}/control`);
      onValue(
        r,
        (snap) => {
          const base = defaultControl();
          applyControlSnapshot(base, snap.exists() ? snap.val() : null);
          onUpdate(deviceId, base);
        },
        (err) => {
          if (isPermissionDenied(err)) disableRtdb('permission_denied');
          else console.warn(`[firebase] devices/${deviceId}/control:`, err.message);
        }
      );
    })
    .catch((e) => {
      if (isPermissionDenied(e)) disableRtdb('permission_denied');
      else console.warn('[firebase] subscribe failed:', e.message);
      subscribed.delete(deviceId);
    });
}

/**
 * @returns {Promise<void>}
 */
async function mergeControlToFirebase(deviceId, body) {
  if (!canUseRtdb()) return;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return;
  const patch = {};
  const b = body || {};
  for (const spec of CONTROL_NUM_FIELDS) {
    const v = coerceNumField(b, spec);
    if (v !== undefined) patch[spec.key] = v;
  }
  for (const key of CONTROL_BOOL_FIELDS) {
    if (typeof b[key] === 'boolean') patch[key] = b[key];
  }
  if (Object.keys(patch).length === 0) return;
  try {
    await update(ref(db, `devices/${deviceId}/control`), patch);
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    throw e;
  }
}

function isFirebaseReady() {
  return firebaseReady;
}

/**
 * @returns {Promise<void>}
 */
async function mergeLiveToFirebase(deviceId, live) {
  if (!deviceId || !live || typeof live !== 'object' || !canUseRtdb()) return;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return;
  try {
    await set(ref(db, `devices/${deviceId}/live`), live);
    if (typeof live.serverTsMs === 'number') {
      await set(ref(db, `devices/${deviceId}/heartbeatServerMs`), live.serverTsMs);
    }
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    throw e;
  }
}

/**
 * @param {string} deviceId
 * @param {Record<string, { tsMs?: number, co2ppm?: number, tempC?: number, humPct?: number }>} historyObj
 * @returns {Promise<void>}
 */
async function mergeHistory24hToFirebase(deviceId, historyObj) {
  if (!deviceId || !historyObj || typeof historyObj !== 'object' || !canUseRtdb()) return;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return;
  try {
    await set(ref(db, `devices/${deviceId}/history24h`), historyObj);
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    throw e;
  }
}

/**
 * Append a single persistent history point at `devices/<id>/history`.
 * Uses push() so entries are chronologically sortable and never overwritten.
 * @param {string} deviceId
 * @param {{ tsMs: number, tempC: number|null, humPct: number|null, co2ppm: number|null, fanOn?: boolean }} point
 * @returns {Promise<void>}
 */
async function pushHistoryPoint(deviceId, point) {
  if (!deviceId || !point || typeof point !== 'object' || !canUseRtdb()) return;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return;
  try {
    await push(ref(db, `devices/${deviceId}/history`), point);
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    throw e;
  }
}

/**
 * Load history points from RTDB newer than `sinceMs`. Best-effort; returns
 * an array sorted by tsMs ascending. Used to backfill the in-memory buffer
 * after a server restart so /history24h isn't empty.
 * @param {string} deviceId
 * @param {number} sinceMs
 * @returns {Promise<Array<{ tsMs: number, tempC: number|null, humPct: number|null, co2ppm: number|null, fanOn?: boolean }>>}
 */
async function loadRecentHistory(deviceId, sinceMs) {
  if (!deviceId || !canUseRtdb()) return [];
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return [];
  try {
    const snap = await get(ref(db, `devices/${deviceId}/history`));
    if (!snap.exists()) return [];
    const v = snap.val();
    if (!v || typeof v !== 'object') return [];
    const cutoff = typeof sinceMs === 'number' ? sinceMs : 0;
    return Object.values(v)
      .filter((p) => p && typeof p === 'object' && typeof p.tsMs === 'number' && p.tsMs >= cutoff)
      .sort((a, b) => a.tsMs - b.tsMs);
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    return [];
  }
}

/**
 * Append an alert entry for the app to display.
 * @param {string} deviceId
 * @param {{ tsMs: number, type: string, title: string, body: string, value: number, threshold: number }} alert
 * @returns {Promise<void>}
 */
async function appendAlert(deviceId, alert) {
  if (!deviceId || !alert || typeof alert !== 'object' || !canUseRtdb()) return;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return;
  try {
    await push(ref(db, `devices/${deviceId}/alerts`), alert);
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
  }
}

/**
 * Read all alerts for a device (as an object keyed by push id, matching the
 * shape the mobile app already consumes). Best-effort — returns {} on error.
 * @param {string} deviceId
 * @returns {Promise<Record<string, object>>}
 */
async function readAlerts(deviceId) {
  if (!deviceId || !canUseRtdb()) return {};
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return {};
  try {
    const snap = await get(ref(db, `devices/${deviceId}/alerts`));
    if (!snap.exists()) return {};
    const v = snap.val();
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    return {};
  }
}

/**
 * Upsert a mobile push token under devices/<id>/pushTokens/<safeKey>. The key
 * is derived from the token so repeat registrations don't duplicate entries.
 * @param {string} deviceId
 * @param {{ token: string, platform?: string }} tokenInfo
 * @returns {Promise<string>} the safe key used
 */
async function upsertPushToken(deviceId, tokenInfo) {
  if (!deviceId || !tokenInfo || typeof tokenInfo.token !== 'string') {
    throw new Error('deviceId and token are required');
  }
  const safeKey = tokenInfo.token.replace(/[.#$\[\]\/]/g, '_');
  if (!canUseRtdb()) return safeKey;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return safeKey;
  try {
    await set(ref(db, `devices/${deviceId}/pushTokens/${safeKey}`), {
      token: tokenInfo.token,
      platform: typeof tokenInfo.platform === 'string' ? tokenInfo.platform : null,
      updatedAtMs: Date.now(),
    });
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
  }
  return safeKey;
}

/**
 * @param {string} deviceId
 * @returns {Promise<Array<{ token: string, platform?: string }>>}
 */
async function getPushTokens(deviceId) {
  if (!deviceId || !canUseRtdb()) return [];
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return [];
  try {
    const snap = await get(ref(db, `devices/${deviceId}/pushTokens`));
    if (!snap.exists()) return [];
    const v = snap.val();
    if (!v || typeof v !== 'object') return [];
    return Object.values(v)
      .filter((x) => x && typeof x === 'object' && typeof x.token === 'string' && x.token.length > 0)
      .map((x) => ({ token: x.token, platform: typeof x.platform === 'string' ? x.platform : undefined }));
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
    return [];
  }
}

/**
 * Remove a token record (key is the child key under pushTokens, not the raw token).
 * @param {string} deviceId
 * @param {string} tokenKey
 */
async function removePushTokenKey(deviceId, tokenKey) {
  if (!canUseRtdb()) return;
  const { db } = await getFirebaseContext();
  if (!canUseRtdb()) return;
  try {
    await remove(ref(db, `devices/${deviceId}/pushTokens/${tokenKey}`));
  } catch (e) {
    if (isPermissionDenied(e)) disableRtdb('permission_denied');
  }
}

module.exports = {
  warmup,
  defaultControl,
  applyControlSnapshot,
  ensureControlSubscription,
  mergeControlToFirebase,
  mergeLiveToFirebase,
  mergeHistory24hToFirebase,
  pushHistoryPoint,
  loadRecentHistory,
  appendAlert,
  readAlerts,
  upsertPushToken,
  getPushTokens,
  removePushTokenKey,
  isFirebaseReady,
  isRtdbDisabled: () => rtdbDisabled,
};
