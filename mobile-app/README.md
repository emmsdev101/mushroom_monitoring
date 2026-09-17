## Mobile App (Expo / React Native)

Talks to the **`server/`** HTTP API on Render. The ESP32 uses the same API. Firebase is only used on the server (mirroring), not by this app.

### Setup
1. Install dependencies:

```bash
cd mobile-app
npm install
```

2. Default API is Render (`https://mushroom-nursery-server.onrender.com`). To use a PC on your LAN instead, see the **root `README.md`** (“Run the API on your PC” and “Point the mobile app at the local server”). If the server has `API_KEY` set, enter the same key in Settings.

### Run
- Android (via Expo): `npm run android`
- Dev server: `npm start`

### API endpoints used
- **GET** `/api/devices/<id>/live`, `/control`, `/history24h`, `/alerts`
- **PUT** `/api/devices/<id>/control`
- **POST** `/api/devices/<id>/pushTokens`
