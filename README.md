## Mushroom Nursery (ESP32 + Node server + mobile app)

This repo follows `implementation_plan.md`: grow-room sensors, relay control, and a monitoring app.

### Components
- **arduino/MushroomNursery/**: ESP32 sketch for **Arduino IDE** — DHT + **Sensirion SCD41** (I²C CO₂), relay, **WiFiManager**, HTTP to **`server/`**.
- **server/**: Node (Express) service — telemetry ingest, control state, in-memory history.
- **mobile-app/**: Expo app — polls the **`server/`** HTTP API (Render or a PC on your LAN). No direct Firebase access from the phone.
- **firebase/**: Optional / future.

---

## Run the API on your PC

You need **Node.js 18+**. The server listens on **all interfaces** (`0.0.0.0`), default port **3000**.

```bash
cd server
npm install
npm start
```

You should see:

```text
Mushroom nursery server http://0.0.0.0:3000
```

Leave that terminal open. To stop the server, press **Ctrl+C**.

### Find your PC’s LAN address

On Windows, in a new terminal:

```text
ipconfig
```

Under **Wi-Fi** (or Ethernet), copy **IPv4 Address**. It looks like `192.168.1.10`.

The URL the phone and ESP32 must use is:

```text
http://192.168.1.10:3000
```

Replace `192.168.1.10` with your IPv4. **Include the port.** Do **not** use `localhost` or `127.0.0.1` on the phone — those point at the phone itself, not your PC.

### Confirm the server from a browser

On the **PC**, open:

```text
http://127.0.0.1:3000/health
```

On the **phone** (same Wi‑Fi, Chrome or Safari), open:

```text
http://192.168.1.10:3000/health
```

You want JSON with `"ok": true`. If the PC works and the phone does not, see **If the phone cannot reach the server** below.

Optional: if `server/.env` (or the shell) sets `API_KEY`, `/api/*` routes need the same key. `/health` does not.

---

## Point the mobile app at the local server

1. Phone and PC on the **same Wi‑Fi** (not mobile data, not a guest SSID with client isolation).
2. Open the nursery app → **Settings**.
3. Under **2. Phone connection**:
   - **Device ID** — must match the ESP32 (`nursery-01` unless you changed it).
   - **API address** — `http://192.168.1.10:3000` (your IPv4 + port, no trailing slash).
   - **API key** — leave empty unless the server has `API_KEY` set; then paste the same value.
4. Tap **Save connection** (the outline button). This does **not** change temperature / humidity / CO₂ targets.
5. The app pings `/health`. If that succeeds, the phone will poll this PC instead of Render.

To go back to the hosted API later, set the address to:

```text
https://mushroom-nursery-server.onrender.com
```

### HTTP from the app (Android)

A **phone browser** can open `http://192.168…`. A **built Android APK** blocks plain HTTP until the app is rebuilt with cleartext traffic allowed (already set in `mobile-app/app.json`).

After pulling this repo:

1. Rebuild and reinstall the APK (dev client or preview). A JavaScript reload is **not** enough.
2. Then save the `http://…:3000` address again.

```bash
cd mobile-app
npm install
npm run android
```

Or build a preview APK (`mobile-app/eas.json` **preview** profile / `npm run build:android:preview`).

Until that new native build is on the phone, Save connection will fail even if `/health` works in Chrome.

---

## If the phone cannot reach the server

1. URL must start with **`http://`**, not `https://`, and must include **`:3000`**.
2. Same Wi‑Fi as the PC. Guest / AP isolation on the router will block phone → PC.
3. Windows Firewall — allow inbound TCP 3000 (Administrator **cmd**):

```text
netsh advfirewall firewall add rule name="Mushroom Nursery TCP 3000" dir=in action=allow protocol=TCP localport=3000
```

Set the PC network profile to **Private** if Windows treats Wi‑Fi as Public.

4. Confirm Node is listening: `netstat -ano | findstr :3000` should show **`0.0.0.0:3000`**.
5. Antivirus “network protection” can still block `node.exe`; allow TCP 3000 if needed.

More detail: **`server/README.md`**.

---

## ESP32 (optional, same local server)

Set **Node server base URL** in the WiFiManager portal (or `SERVER_BASE_URL_DEFAULT` in `arduino/MushroomNursery/config.h`) to the same `http://192.168.x.x:3000`. See **`arduino/MushroomNursery/README.md`**.

Wiring diagram: **`arduino/MushroomNursery/wiring-diagram.png`**.

---

## Other docs

- **server/README.md** — API, Render deploy, Firebase rules, firewall
- **mobile-app/README.md** — Expo install and run
- **arduino/MushroomNursery/README.md** — Arduino IDE, libraries, pins, Wi‑Fi reset, [wiring diagram](arduino/MushroomNursery/wiring-diagram.png)
