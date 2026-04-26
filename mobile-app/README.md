## Mobile App (Expo / React Native)

The ESP32 firmware uses the **`server/`** HTTP API. This app is still configured for **Firebase** in `src/lib/firebase.js` until you switch it to call the same REST endpoints as the server (or add Firebase mirroring in Node).

### Setup
1. Install dependencies:

```bash
cd mobile-app
npm install
```

2. Fill Firebase config in `src/lib/firebase.js`.

### Run
- Android (via Expo): `npm run android`
- Dev server: `npm start`

### Realtime DB paths used
- **Reads**: `/devices/<deviceId>/live`, `/devices/<deviceId>/heartbeatServerMs`, `/devices/<deviceId>/control/*`
- **Writes**: `/devices/<deviceId>/control/*` (manual override + threshold)

