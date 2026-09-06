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
        console.log('[firebase] Web SDK + anonymous auth (same config as Expo app)');
      } catch (e) {
        const code = e && e.code;
        if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
          console.warn(
            '[firebase] Anonymous sign-in unavailable; using RTDB without Auth. ' +
              'Use permissive RTDB rules for dev, or enable Anonymous in Firebase Console.'
          );
        } else {
          throw e;
        }
      }
      const db = getDatabase(app);
      firebaseReady = true;
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
  if (!deviceId) return;
  if (subscribed.has(deviceId)) return;
  subscribed.add(deviceId);

  getFirebaseContext()
    .then(({ db }) => {
      const r = ref(db, `devices/${deviceId}/control`);
      onValue(
        r,
        (snap) => {
          const base = defaultControl();
          applyControlSnapshot(base, snap.exists() ? snap.val() : null);
          onUpdate(deviceId, base);
        },
        (err) => {
          console.error(`[firebase] devices/${deviceId}/control:`, err.message);
        }
      );
    })
    .catch((e) => {
      console.error('[firebase] subscribe failed:', e.message);
      subscribed.delete(deviceId);
    });
}

/**
 * @returns {Promise<void>}
 */
async function mergeControlToFirebase(deviceId, body) {
  const { db } = await getFirebaseContext();
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
  await update(ref(db, `devices/${deviceId}/control`), patch);
}

function isFirebaseReady() {
  return firebaseReady;
}

/**
 * @returns {Promise<void>}
 */
async function mergeLiveToFirebase(deviceId, live) {
  if (!deviceId || !live || typeof live !== 'object') return;
  const { db } = await getFirebaseContext();
  await set(ref(db, `devices/${deviceId}/live`), live);
  if (typeof live.serverTsMs === 'number') {
    await set(ref(db, `devices/${deviceId}/heartbeatServerMs`), live.serverTsMs);
  }
}

/**
 * @param {string} deviceId
 * @param {Record<string, { tsMs?: number, co2ppm?: number, tempC?: number, humPct?: number }>} historyObj
 * @returns {Promise<void>}
 */
async function mergeHistory24hToFirebase(deviceId, historyObj) {
  if (!deviceId || !historyObj || typeof historyObj !== 'object') return;
  const { db } = await getFirebaseContext();
  await set(ref(db, `devices/${deviceId}/history24h`), historyObj);
}

/**
 * Append a single persistent history point at `devices/<id>/history`.
 * Uses push() so entries are chronologically sortable and never overwritten.
 * @param {string} deviceId
 * @param {{ tsMs: number, tempC: number|null, humPct: number|null, co2ppm: number|null, fanOn?: boolean }} point
 * @returns {Promise<void>}
 */
async function pushHistoryPoint(deviceId, point) {
  if (!deviceId || !point || typeof point !== 'object') return;
  const { db } = await getFirebaseContext();
  await push(ref(db, `devices/${deviceId}/history`), point);
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
  if (!deviceId) return [];
  const { db } = await getFirebaseContext();
  const snap = await get(ref(db, `devices/${deviceId}/history`));
  if (!snap.exists()) return [];
  const v = snap.val();
  if (!v || typeof v !== 'object') return [];
  const cutoff = typeof sinceMs === 'number' ? sinceMs : 0;
  return Object.values(v)
    .filter((p) => p && typeof p === 'object' && typeof p.tsMs === 'number' && p.tsMs >= cutoff)
    .sort((a, b) => a.tsMs - b.tsMs);
}

/**
 * Append an alert entry for the app to display.
 * @param {string} deviceId
 * @param {{ tsMs: number, type: string, title: string, body: string, value: number, threshold: number }} alert
 * @returns {Promise<void>}
 */
async function appendAlert(deviceId, alert) {
  if (!deviceId || !alert || typeof alert !== 'object') return;
  const { db } = await getFirebaseContext();
  await push(ref(db, `devices/${deviceId}/alerts`), alert);
}

/**
 * @param {string} deviceId
 * @returns {Promise<Array<{ token: string, platform?: string }>>}
 */
async function getPushTokens(deviceId) {
  if (!deviceId) return [];
  const { db } = await getFirebaseContext();
  const snap = await get(ref(db, `devices/${deviceId}/pushTokens`));
  if (!snap.exists()) return [];
  const v = snap.val();
  if (!v || typeof v !== 'object') return [];
  return Object.values(v)
    .filter((x) => x && typeof x === 'object' && typeof x.token === 'string' && x.token.length > 0)
    .map((x) => ({ token: x.token, platform: typeof x.platform === 'string' ? x.platform : undefined }));
}

/**
 * Remove a token record (key is the child key under pushTokens, not the raw token).
 * @param {string} deviceId
 * @param {string} tokenKey
 */
async function removePushTokenKey(deviceId, tokenKey) {
  const { db } = await getFirebaseContext();
  await remove(ref(db, `devices/${deviceId}/pushTokens/${tokenKey}`));
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
  getPushTokens,
  removePushTokenKey,
  isFirebaseReady,
};
