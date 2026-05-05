const express = require('express');
const cors = require('cors');
const fb = require('./firebaseControl');
const PDFDocument = require('pdfkit');

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

function drawBox(doc, x, y, w, h, title, subtitle) {
  doc.roundedRect(x, y, w, h, 8).stroke();
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111').text(title, x + 10, y + 10, { width: w - 20 });
  doc.fontSize(9).font('Helvetica').fillColor('#444444').text(subtitle, x + 10, y + 28, { width: w - 20 });
}

function drawArrow(doc, x1, y1, x2, y2, label) {
  doc.save();
  doc.strokeColor('#555555').lineWidth(1);
  doc.moveTo(x1, y1).lineTo(x2, y2).stroke();

  // Arrow head
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 7;
  const ax = x2 - Math.cos(angle) * headLen;
  const ay = y2 - Math.sin(angle) * headLen;
  doc
    .moveTo(x2, y2)
    .lineTo(ax + Math.cos(angle + Math.PI / 2) * 4, ay + Math.sin(angle + Math.PI / 2) * 4)
    .lineTo(ax + Math.cos(angle - Math.PI / 2) * 4, ay + Math.sin(angle - Math.PI / 2) * 4)
    .closePath()
    .fill('#555555');

  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    doc.fontSize(8).fillColor('#555555').text(label, mx - 80, my - 12, { width: 160, align: 'center' });
  }
  doc.restore();
}

function buildArchitecturePdf(res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.info.Title = 'MushroomNursery Architecture';

  doc.pipe(res);

  // Title
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111').text('MushroomNursery Architecture', { align: 'left' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#444444')
    .text('ESP32 ↔ Render Node API ↔ Firebase RTDB ↔ Expo mobile app', { align: 'left' });
  doc.moveDown(0.8);

  // Diagram coordinates
  const leftX = 40;
  const midX = 310;
  const rightX = 580;
  const topY = 120;
  const gapY = 95;
  const boxW = 240;
  const boxH = 54;

  // Boxes
  drawBox(doc, leftX, topY, boxW, boxH, 'ESP32 (MushroomNursery)', 'DHT22 + SCD41, relay fan, WiFiManager');
  drawBox(doc, leftX, topY + gapY, boxW, boxH, 'WiFiManager portal', 'Wi‑Fi creds + server base URL (NVS)');

  drawBox(doc, midX, topY, boxW, boxH, 'Render Web Service', 'https://mushroom-nursery-server.onrender.com');
  drawBox(doc, midX, topY + gapY, boxW, boxH, 'Node API (Express)', '/control, /telemetry, /live, /history24h');

  drawBox(doc, rightX, topY, boxW, boxH, 'Firebase RTDB', 'devices/<deviceId>/{control,live,history24h,alerts}');
  drawBox(doc, rightX, topY + gapY, boxW, boxH, 'Expo Mobile App', 'Dashboard, History, Notifications, Settings');

  // Arrows
  const cY0 = topY + boxH / 2;
  const cY1 = topY + gapY + boxH / 2;

  drawArrow(doc, leftX + boxW, cY0, midX, cY0, 'POST /telemetry (5s)');
  drawArrow(doc, midX, cY0 + 18, leftX + boxW, cY0 + 18, 'GET /control (3s)');

  drawArrow(doc, midX + boxW, cY1, rightX, cY0 + 18, 'mirror live/history/alerts');
  drawArrow(doc, rightX, cY1, midX + boxW, cY1, 'control subscription');

  drawArrow(doc, rightX + boxW, cY0, rightX + boxW, cY1, 'app reads/writes RTDB');

  // Footer notes
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#444444')
    .text(
      'Notes: Render free tier can sleep (first request may be slow). ESP32 uses HTTPS to avoid HTTP→HTTPS redirects; mobile app uses local admin auth (admin/admin by default).',
      40,
      330,
      { width: 760 }
    );

  // Page 2: key paths + endpoints
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111').text('Key RTDB paths and API endpoints');
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(12).text('RTDB paths');
  doc.font('Helvetica').fontSize(10).fillColor('#111111');
  doc.text('- devices/<deviceId>/control: co2ThresholdPpm, tempFanOnC, humFanOnPct, manualOverride, manualFanOn');
  doc.text('- devices/<deviceId>/live: tempC, humPct, co2ppm, fanOn, serverTsMs');
  doc.text('- devices/<deviceId>/history24h: p0..pN { tsMs, tempC, humPct, co2ppm }');
  doc.text('- devices/<deviceId>/alerts: appended alert entries (high + back-to-normal)');
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(12).text('Server endpoints');
  doc.font('Helvetica').fontSize(10).fillColor('#111111');
  doc.text('- GET /health');
  doc.text('- GET /api/devices/:id/control');
  doc.text('- PUT /api/devices/:id/control');
  doc.text('- POST /api/devices/:id/telemetry');
  doc.text('- GET /api/devices/:id/live');
  doc.text('- GET /api/devices/:id/history24h');
  doc.moveDown(0.8);

  doc.font('Helvetica').fontSize(9).fillColor('#444444').text('Generated by the server. If you change the architecture, update /architecture.pdf drawing.');

  doc.end();
}

app.get('/architecture', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MushroomNursery Architecture</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; color: #111; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; max-width: 980px; }
      h1 { font-size: 22px; margin: 0 0 8px; }
      p { margin: 8px 0; color: #444; }
      a { color: #0b57d0; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .btn { display: inline-block; margin-top: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #0b57d0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>MushroomNursery Architecture</h1>
      <p>Download the PDF diagram here:</p>
      <a class="btn" href="/architecture.pdf">Download architecture.pdf</a>
      <p style="margin-top:14px;font-size:12px;">Tip: If your service is behind an API key, these routes stay public (not under <code>/api</code>).</p>
    </div>
  </body>
</html>`);
});

app.get('/architecture.pdf', (req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="mushroomnursery-architecture.pdf"');
  buildArchitecturePdf(res);
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
