const express = require('express');
const cors = require('cors');
const fb = require('./firebaseControl');

const app = express();
if (process.env.RENDER) {
  app.set('trust proxy', 1);
}
app.use(cors());
app.use(express.json({ limit: '32kb' }));

const API_KEY = process.env.API_KEY || '';
const PORT = Number(process.env.PORT) || 3000;

fb.warmup().catch(() => {});

const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

async function sendExpoPush(tokens, title, body, data = {}) {
  if (!tokens.length) return;
  const messages = tokens.map((t) => ({
    to: t,
    sound: 'default',
    title,
    body,
    data,
  }));

  // Chunk to stay under Expo limits.
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  for (const chunk of chunks) {
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.warn('[push] Expo send failed', r.status, j || '');
      continue;
    }
    const results = j && j.data ? j.data : [];
    results.forEach((resItem, idx) => {
      if (resItem && resItem.status === 'error') {
        const msg = resItem.message || '';
        console.warn('[push] token error', chunk[idx]?.to, msg);
      }
    });
  }
}

function thresholdAlerts(d, b) {
  const out = [];
  const tempC = typeof b.tempC === 'number' ? b.tempC : null;
  const humPct = typeof b.humPct === 'number' ? b.humPct : null;
  const co2ppm = typeof b.co2ppm === 'number' ? b.co2ppm : null;

  const co2Thr = typeof d.control?.co2ThresholdPpm === 'number' ? d.control.co2ThresholdPpm : null;
  const tThr = typeof d.control?.tempFanOnC === 'number' ? d.control.tempFanOnC : null;
  const hThr = typeof d.control?.humFanOnPct === 'number' ? d.control.humFanOnPct : null;

  if (co2Thr != null && co2ppm != null && co2ppm > 0 && co2ppm >= co2Thr) out.push({ type: 'co2', value: co2ppm, thr: co2Thr });
  if (tThr != null && tempC != null && tempC >= tThr) out.push({ type: 'temp', value: tempC, thr: tThr });
  if (hThr != null && humPct != null && humPct >= hThr) out.push({ type: 'hum', value: humPct, thr: hThr });
  return out;
}

function currentThresholdState(d, b) {
  const tempC = typeof b.tempC === 'number' ? b.tempC : null;
  const humPct = typeof b.humPct === 'number' ? b.humPct : null;
  const co2ppm = typeof b.co2ppm === 'number' ? b.co2ppm : null;

  const co2Thr = typeof d.control?.co2ThresholdPpm === 'number' ? d.control.co2ThresholdPpm : null;
  const tThr = typeof d.control?.tempFanOnC === 'number' ? d.control.tempFanOnC : null;
  const hThr = typeof d.control?.humFanOnPct === 'number' ? d.control.humFanOnPct : null;

  return {
    co2: { above: co2Thr != null && co2ppm != null && co2ppm > 0 && co2ppm >= co2Thr, value: co2ppm, thr: co2Thr },
    temp: { above: tThr != null && tempC != null && tempC >= tThr, value: tempC, thr: tThr },
    hum: { above: hThr != null && humPct != null && humPct >= hThr, value: humPct, thr: hThr },
  };
}

/** @type {Map<string, { control: object, live: object | null, history: object[], lastTelemetrySig: string, alertState: Record<string, { above: boolean, lastSentMs: number }> }>} */
const devices = new Map();

function telemetrySignature(b) {
  // Treat "no value" uniformly so minor payload shape differences don't trigger writes.
  const t = typeof b.tempC === 'number' ? b.tempC : null;
  const h = typeof b.humPct === 'number' ? b.humPct : null;
  const c = typeof b.co2ppm === 'number' ? b.co2ppm : null;
  const fan = typeof b.fanOn === 'boolean' ? b.fanOn : !!b.fanOn;
  // Use a stable string; rounding reduces noisy tiny changes.
  const tR = t == null ? null : Math.round(t * 10) / 10;
  const hR = h == null ? null : Math.round(h * 10) / 10;
  const cR = c == null ? null : Math.round(c);
  return `${tR}|${hR}|${cR}|${fan ? 1 : 0}`;
}

function history24hPayload(d) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const points = d.history.filter((h) => h.tsMs >= cutoff);
  const out = {};
  points.forEach((p, i) => {
    out[`p${i}`] = p;
  });
  return out;
}

function getOrCreate(deviceId) {
  if (!devices.has(deviceId)) {
    devices.set(deviceId, {
      control: { ...fb.defaultControl() },
      live: null,
      history: [],
      lastTelemetrySig: '',
      alertState: {},
    });
  }
  fb.ensureControlSubscription(deviceId, (id, control) => {
    const d = devices.get(id);
    if (d) d.control = { ...control };
  });
  return devices.get(deviceId);
}

function auth(req, res, next) {
  if (!API_KEY) return next();
  const key = req.get('x-api-key');
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(API_KEY),
    firebaseControl: fb.isFirebaseReady(),
    firebaseMode: 'web-sdk+anonymous',
  });
});

app.get('/api/devices/:deviceId/control', auth, (req, res) => {
  const d = getOrCreate(req.params.deviceId);
  res.json(d.control);
});

app.put('/api/devices/:deviceId/control', auth, async (req, res) => {
  const deviceId = req.params.deviceId;
  const d = getOrCreate(deviceId);
  const b = req.body || {};

  try {
    await fb.mergeControlToFirebase(deviceId, b);
    fb.applyControlSnapshot(d.control, b);
  } catch (e) {
    console.warn('[firebase] PUT not written to RTDB (using memory):', e.message);
    if (typeof b.co2ThresholdPpm === 'number') {
      const v = Math.round(b.co2ThresholdPpm);
      if (v >= 400 && v <= 10000) d.control.co2ThresholdPpm = v;
    }
    if (typeof b.tempFanOnC === 'number') {
      const v = b.tempFanOnC;
      if (v >= 15 && v <= 45) d.control.tempFanOnC = v;
    }
    if (typeof b.humFanOnPct === 'number') {
      const v = b.humFanOnPct;
      if (v >= 55 && v <= 100) d.control.humFanOnPct = v;
    }
    if (typeof b.manualOverride === 'boolean') d.control.manualOverride = b.manualOverride;
    if (typeof b.manualFanOn === 'boolean') d.control.manualFanOn = b.manualFanOn;
  }
  res.json(d.control);
});

app.post('/api/devices/:deviceId/telemetry', auth, (req, res) => {
  const deviceId = req.params.deviceId;
  const d = getOrCreate(deviceId);
  const b = req.body || {};
  const now = Date.now();
  const sig = telemetrySignature(b);
  const unchanged = sig && sig === d.lastTelemetrySig;
  const live = { ...b, serverTsMs: now };
  d.live = live;
  if (!unchanged) {
    d.lastTelemetrySig = sig;

    fb.mergeLiveToFirebase(deviceId, live).catch((e) => {
      console.warn('[firebase] live not mirrored to RTDB:', e.message);
    });

    d.history.push({
      tsMs: now,
      // RTDB rejects `undefined`, so coerce missing fields to null.
      co2ppm: typeof b.co2ppm === 'number' ? b.co2ppm : null,
      tempC: typeof b.tempC === 'number' ? b.tempC : null,
      humPct: typeof b.humPct === 'number' ? b.humPct : null,
    });
    const maxHist = 5000;
    if (d.history.length > maxHist) d.history.splice(0, d.history.length - maxHist);

    const histOut = history24hPayload(d);
    fb.mergeHistory24hToFirebase(deviceId, histOut).catch((e) => {
      console.warn('[firebase] history24h not mirrored to RTDB:', e.message);
    });
  }

  // Push notifications when thresholds are reached (with cooldown).
  const alerts = thresholdAlerts(d, b);
  if (alerts.length) {
    console.log(
      `[alert] ${new Date(now).toISOString()} device=${deviceId} ` +
        alerts.map((a) => `${a.type} value=${a.value} thr=${a.thr}`).join(' | ')
    );
    fb.getPushTokens(deviceId)
      .then(async (tokenObjs) => {
        const pushTokens = tokenObjs.map((x) => x.token).filter(Boolean);
        console.log(`[alert] device=${deviceId} pushTokens=${pushTokens.length}`);
        for (const a of alerts) {
          const key = a.type;
          const st = d.alertState[key] || { above: false, lastSentMs: 0 };
          const canSend = !st.above || now - st.lastSentMs >= ALERT_COOLDOWN_MS;
          if (!canSend) {
            d.alertState[key] = { above: true, lastSentMs: st.lastSentMs };
            continue;
          }
          const title = 'Mushroom Nursery Alert';
          const body =
            a.type === 'co2'
              ? `CO₂ high: ${Math.round(a.value)} ppm (threshold ${a.thr})`
              : a.type === 'temp'
                ? `Temp high: ${a.value.toFixed(1)} °C (threshold ${a.thr})`
                : `Humidity high: ${a.value.toFixed(0)}% (threshold ${a.thr})`;
          // Save alert entry for the app to display (even if push tokens are missing).
          fb.appendAlert(deviceId, {
            tsMs: now,
            type: a.type,
            title,
            body,
            value: a.value,
            threshold: a.thr,
          })
            .then(() => console.log(`[alert] device=${deviceId} appended type=${a.type}`))
            .catch((e) => console.warn('[push] appendAlert failed:', e.message));

          if (pushTokens.length) {
            await sendExpoPush(pushTokens, title, body, { deviceId, type: a.type, value: a.value, threshold: a.thr });
          }
          d.alertState[key] = { above: true, lastSentMs: now };
        }
      })
      .catch((e) => console.warn('[push] token lookup failed:', e.message));
  } else {
    // Send a single "back to normal" alert on transition from above->below.
    const stNow = currentThresholdState(d, b);
    fb.getPushTokens(deviceId)
      .then(async (tokenObjs) => {
        const pushTokens = tokenObjs.map((x) => x.token).filter(Boolean);
        for (const key of ['co2', 'temp', 'hum']) {
          const prev = d.alertState[key] || { above: false, lastSentMs: 0 };
          const cur = stNow[key];
          if (!prev.above) continue; // was not above
          if (!cur || cur.above) continue; // still above or unknown

          // Recovery: only on transition.
          const title = 'Mushroom Nursery';
          const body =
            key === 'co2'
              ? `CO₂ back to normal: ${cur.value != null ? Math.round(cur.value) : '-'} ppm (threshold ${cur.thr})`
              : key === 'temp'
                ? `Temp back to normal: ${cur.value != null ? cur.value.toFixed(1) : '-'} °C (threshold ${cur.thr})`
                : `Humidity back to normal: ${cur.value != null ? cur.value.toFixed(0) : '-'}% (threshold ${cur.thr})`;

          await fb
            .appendAlert(deviceId, {
              tsMs: now,
              type: `${key}_normal`,
              title,
              body,
              value: cur.value ?? null,
              threshold: cur.thr ?? null,
            })
            .catch((e) => console.warn('[push] appendAlert failed:', e.message));

          if (pushTokens.length && now - prev.lastSentMs >= ALERT_COOLDOWN_MS) {
            await sendExpoPush(pushTokens, title, body, { deviceId, type: `${key}_normal`, value: cur.value, threshold: cur.thr });
          }

          d.alertState[key] = { above: false, lastSentMs: now };
        }
      })
      .catch((e) => console.warn('[push] token lookup failed:', e.message));
  }

  const client =
    req.ip ||
    (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
    req.socket.remoteAddress ||
    '?';
  console.log(
    `[telemetry] ${new Date(now).toISOString()} device=${deviceId} client=${client} ` +
      `tempC=${b.tempC ?? '-'} humPct=${b.humPct ?? '-'} co2ppm=${b.co2ppm ?? '-'} ` +
      `fanOn=${b.fanOn} co2Thr=${b.co2ThresholdPpm} Tfan>${b.tempFanOnC ?? '-'} Hfan>${b.humFanOnPct ?? '-'} ` +
      `override=${b.manualOverride} tsMs=${b.tsMs ?? '-'} unchanged=${unchanged ? '1' : '0'}`
  );

  res.json({ ok: true });
});

app.get('/api/devices/:deviceId/live', auth, (req, res) => {
  const d = getOrCreate(req.params.deviceId);
  res.json(d.live || {});
});

app.get('/api/devices/:deviceId/history24h', auth, (req, res) => {
  const d = getOrCreate(req.params.deviceId);
  res.json(history24hPayload(d));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mushroom nursery server http://0.0.0.0:${PORT}`);
  if (API_KEY) console.log('API key required (X-API-Key header)');
});
