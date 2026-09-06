# Mushroom Nursery API server

Small **Express** service the ESP32 calls over HTTP. **Control** and **live** data are mirrored to **Firebase Realtime Database** using the same **`firebaseConfig`** as the Expo app (`server/firebaseConfig.js` + **`firebase` JS SDK** + **anonymous sign-in**). No service account file.

## Run

```bash
cd server
npm install
npm start
```

Default: **http://0.0.0.0:3000** (reachable on your LAN as `http://<PC-LAN-IP>:3000`).

## Deploy on Render

The repo includes **`render.yaml`** at the **repository root** (Blueprint). You can also create the service manually with the same settings.

1. Push this repo to **GitHub** (or GitLab / Bitbucket supported by Render).
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (or **Web Service**).
3. **Blueprint**: connect the repo and select **`render.yaml`**.  
   **Web Service (manual)** instead:
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. **Environment** (recommended):
   - **`API_KEY`**: long random string. The ESP32 **`config.h`** `SERVER_API_KEY` and HTTP header **`X-API-Key`** must match. Leave empty only for unsecured prototypes.
5. After deploy, copy the public URL (e.g. `https://mushroom-nursery-server.onrender.com`).  
   - **ESP32 / WiFiManager**: set **Node server base URL** to `https://...` (no trailing slash). `HTTPClient` on ESP32 supports HTTPS.  
   - **Free tier**: the service **spins down** after idle time; first request after sleep can take **30–60+ seconds** and may time out. For reliable grow-room telemetry use a **paid** instance or keep using a **LAN** server.

Render sets **`PORT`** and **`RENDER`**; the app listens on **`0.0.0.0`** and enables **`trust proxy`** when `RENDER` is set so client IPs in logs work behind Render’s proxy.

### Phone / ESP32 still cannot open `http://<PC-IP>:3000/health`

Confirm the server is running (`npm run dev` in `server/`) and **`netstat -ano | findstr :3000`** shows **`LISTENING`** on **`0.0.0.0:3000`**.

1. **Use `http://` not `https://`**  
   Many phone browsers default to HTTPS. You must open exactly:  
   `http://192.168.1.35:3000/health` (replace with your PC IPv4 from `ipconfig`).

2. **Same LAN as the PC**  
   Phone Wi‑Fi must be the **same router / same SSID** as the PC (not cellular data, not a **Guest** or **IoT** Wi‑Fi if that SSID uses **AP / client isolation**). If the router has **“AP isolation”**, **“Wireless isolation”**, or **“Station separation”**, turn it **off** for that SSID, or put both devices on the main LAN.

3. **Windows Firewall allow rule** (Administrator **cmd**):

```text
netsh advfirewall firewall add rule name="Mushroom Nursery TCP 3000" dir=in action=allow protocol=TCP localport=3000
```

If the command says the rule already exists, that part is done. Optionally set the PC Wi‑Fi profile to **Private**: **Settings → Network & Internet → Wi‑Fi → your network → Network profile type → Private**. Or in **Admin PowerShell**:

```text
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

(Change **`Wi-Fi`** if `Get-NetConnectionProfile` shows a different **InterfaceAlias**.)

4. **Third‑party antivirus / “network protection”**  
   Some suites block incoming connections even when Windows Firewall allows them. Temporarily disable their firewall or add an allow rule for **TCP 3000** / **node.exe**.

5. **Sanity check from another PC on the same Wi‑Fi**  
   Open `http://<PC-IP>:3000/health` in a browser. If another PC fails too, the block is on the server PC or the router, not the phone.

## Firebase / rules

Uses **`server/firebaseConfig.js`** (same fields as **`mobile-app/src/lib/firebase.js`**). The server uses the **`firebase` Web SDK** in Node (no service account).

**Option A — Anonymous (recommended for a bit of structure)**  
1. **Authentication → Sign-in method → Anonymous → Enable.**  
2. RTDB rules example:

```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

**Option B — Prototype only (no Anonymous)**  
If Anonymous is not enabled, the server skips sign-in and talks to RTDB **without an ID token**. Your rules must allow unauthenticated access to the paths you use (only for local demos):

```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Tighten rules before any real deployment.

## Environment

| Variable | Meaning |
|----------|---------|
| `PORT` | Listen port (default `3000`) |
| `API_KEY` | If set, all `/api/*` routes require header `X-API-Key: <value>` |

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness; `firebaseControl` true after anonymous RTDB session is ready |
| GET | `/api/devices/:id/control` | ESP32 reads thresholds + manual fan (from RTDB via listener) |
| PUT | `/api/devices/:id/control` | Merges into RTDB `control` (falls back to in-memory if Firebase fails) |
| POST | `/api/devices/:id/telemetry` | ESP32 snapshot; mirrors `live`, `heartbeatServerMs`, and `history24h` to RTDB |
| GET | `/api/devices/:id/live` | Latest telemetry (in-memory on server) |
| GET | `/api/devices/:id/history24h` | Last 24h points (in-memory; backfilled from RTDB) |
| GET | `/api/devices/:id/alerts` | Alert log (in-memory + RTDB) |
| POST | `/api/devices/:id/pushTokens` | Register Expo push token for this device |

## Control JSON (`GET` `/api/devices/:id/control`)

Same shape as **`/devices/<deviceId>/control`** in Firebase.

## ESP32 `config.h`

Set `SERVER_BASE_URL_DEFAULT` (or WiFiManager **Node server base URL**) to your PC’s address. Match **`DEVICE_ID`** to the Expo device id.

Firewall: allow inbound TCP on the chosen port from your LAN.
