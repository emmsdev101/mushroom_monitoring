## Mobile App (Expo / React Native)

Talks to the **`server/`** HTTP API on Render. The ESP32 uses the same API. Firebase is only used on the server (mirroring), not by this app.

### Setup
1. Install dependencies:

```bash
cd mobile-app
npm install
```

2. Confirm the Render URL in **Settings → Server** (default: `https://mushroom-nursery-server.onrender.com`). If the server has `API_KEY` set, enter the same key there.

### Run
- Android (via Expo): `npm run android`
- Dev server: `npm start`

### API endpoints used
- **GET** `/api/devices/<id>/live`, `/control`, `/history24h`, `/alerts`
- **PUT** `/api/devices/<id>/control`
- **POST** `/api/devices/<id>/pushTokens`
