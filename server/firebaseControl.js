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

function defaultControl() {
  return {
    co2ThresholdPpm: 800,
    tempFanOnC: 32,
    humFanOnPct: 92,
    manualOverride: false,
    manualFanOn: false,
  };
}

/**
 * @param {Record<string, unknown>} control
 * @param {unknown} raw
 */
function applyControlSnapshot(control, raw) {
  if (!raw || typeof raw !== 'object') return;
  if (typeof raw.co2ThresholdPpm === 'number') {
    const v = Math.round(raw.co2ThresholdPpm);
    if (v >= 400 && v <= 10000) control.co2ThresholdPpm = v;
  }
  if (typeof raw.tempFanOnC === 'number') {
    const v = raw.tempFanOnC;
    if (v >= 15 && v <= 45) control.tempFanOnC = v;
  }
  if (typeof raw.humFanOnPct === 'number') {
    const v = raw.humFanOnPct;
    if (v >= 55 && v <= 100) control.humFanOnPct = v;
  }
  if (typeof raw.manualOverride === 'boolean') {
    control.manualOverride = raw.manualOverride;
  }
  if (typeof raw.manualFanOn === 'boolean') {
    control.manualFanOn = raw.manualFanOn;
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
  if (typeof b.co2ThresholdPpm === 'number') {
    const v = Math.round(b.co2ThresholdPpm);
    if (v >= 400 && v <= 10000) patch.co2ThresholdPpm = v;
  }
  if (typeof b.tempFanOnC === 'number') {
    const v = b.tempFanOnC;
    if (v >= 15 && v <= 45) patch.tempFanOnC = v;
  }
  if (typeof b.humFanOnPct === 'number') {
    const v = b.humFanOnPct;
    if (v >= 55 && v <= 100) patch.humFanOnPct = v;
  }
  if (typeof b.manualOverride === 'boolean') patch.manualOverride = b.manualOverride;
  if (typeof b.manualFanOn === 'boolean') patch.manualFanOn = b.manualFanOn;
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
  appendAlert,
  getPushTokens,
  removePushTokenKey,
  isFirebaseReady,
};
