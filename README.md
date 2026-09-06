## Mushroom Nursery (ESP32 + Node server + mobile app)

This repo follows `implementation_plan.md`: grow-room sensors, relay control, and a monitoring app.

### Components
- **arduino/MushroomNursery/**: ESP32 sketch for **Arduino IDE** — DHT + **Sensirion SCD41** (I²C CO₂), relay, **WiFiManager**, HTTP to **`server/`**.
- **server/**: Node (Express) service — telemetry ingest, control state, in-memory history.
- **mobile-app/**: Expo app — polls the **`server/`** HTTP API on Render (no direct Firebase access).
- **firebase/**: Optional / future.

### Quick start
1. **Server**: `cd server && npm install && npm start` — set **`SERVER_BASE_URL`** in `arduino/MushroomNursery/config.h` to your PC’s LAN URL.
2. **ESP32**: See **`arduino/MushroomNursery/README.md`** (open the `.ino` in Arduino IDE, install libraries, upload).
3. **Mobile app**: See **`mobile-app/README.md`**.
