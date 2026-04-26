# MushroomNursery (Arduino IDE)

ESP32 sketch for **Arduino IDE 2.x** + **ESP32**. Sends sensor data to the **`server/`** Node API over HTTP (WiFiManager for Wi‑Fi setup).

## Before first upload

1. Start the Node server on your PC (`../../server/README.md`).

2. **`config.h`**: copy **`config.h.example`** → **`config.h`** and edit (Wi‑Fi AP name, **`SERVER_BASE_URL_DEFAULT`** as the compile-time fallback, pins, `DEVICE_ID`). `config.h` is gitignored so secrets stay local. After Wi‑Fi setup, the captive portal includes **Node server base URL**; that value is stored in NVS and used for HTTP. You can reopen the portal to change it without recompiling.

   (If you still have the old macro **`SERVER_BASE_URL`**, the sketch maps it to the default for compatibility.)

3. In Arduino IDE, install boards support:
   - **File → Preferences → Additional boards manager URLs**  
     Add: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   - **Tools → Board → Boards Manager** → search **esp32** → install **esp32** (by Espressif Systems).

4. **Tools → Board** → e.g. **ESP32 Dev Module**.

5. **Tools → Port** → your ESP32 COM port.

6. **Sketch → Include Library → Manage Libraries** and install (both are required for SCD41):
   - **Sensirion Core** (Sensirion AG) — provides `SensirionCore.h` (used by the SCD4x driver).
   - **Sensirion I2C SCD4x** (Sensirion AG) — for **SCD41** (`SensirionI2cScd4x.h`).
   - **WiFiManager** (tzapu)
   - **DHT sensor library** (Adafruit)
   - **Adafruit Unified Sensor**
   - **ArduinoJson** (Benoit Blanchon)

7. Open **`MushroomNursery.ino`**, **Verify**, **Upload**.

## Sketch too big (only if the linker complains)

**Tools → Partition Scheme** → e.g. **Huge APP (3MB No OTA / 1MB SPIFFS)**.

## Serial monitor

**115200** baud. Lines prefixed with **`[srv]`** are HTTP calls to the Node server (`GET .../control`, `POST .../telemetry`): method, full URL, HTTP status, and a short detail (payload size or error text).

## Fan automation (Volvariella volvacea / straw mushroom)

With **manual override** off, the relay (fan) turns on if **any** of these is true: CO₂ above `co2ThresholdPpm`, **temperature above** `tempFanOnC` (default **32** °C), or **relative humidity above** `humFanOnPct` (default **92** %). Defaults target fruiting-range ventilation when heat or moisture rise too high.

**Control source:** The Expo app writes thresholds and manual fan to **Firebase** (`devices/<DEVICE_ID>/control`). The Node **`server/`** subscribes to Firebase and exposes them on **`GET .../control`**. The ESP32 loads them **after Wi‑Fi** and again every **3 s** (`CONTROL_POLL_MS` in the sketch). **Telemetry** (sensors + fan state to the server) runs every **5 s** (`PUBLISH_INTERVAL_MS`). Compile-time defaults in **`config.h`** apply until the first successful control fetch, or if the server is offline.

If the API runs on **Render** (or another host), set **Node server base URL** in the portal to your **`https://…`** URL (no trailing slash) and set **`SERVER_API_KEY`** in **`config.h`** to match Render’s **`API_KEY`** when you use one.

## First-time Wi‑Fi (WiFiManager)

If the ESP32 is not on a saved network, connect to the AP named **`WIFI_MANAGER_AP_NAME`** and complete the captive portal (or open **`192.168.4.1`**). Set **Node server base URL** to something like `http://192.168.1.50:3000` (no trailing slash).

## Factory Wi‑Fi reset (jumper)

With **`WIFI_RESET_PIN`** (default **GPIO 18** in `config.h`): tie that pin to **GND**, press **RESET** (or power-cycle) on the ESP32, and **keep the jumper for `WIFI_RESET_HOLD_MS`** (default **600 ms**) while the chip boots. The sketch calls **`WiFiManager.resetSettings()`**, which clears saved Wi‑Fi credentials; the next step runs **`autoConnect`**, which opens the **WiFiManager** captive portal so you can pick a new network. Remove the jumper after setup.

Set **`WIFI_RESET_PIN`** to **`-1`** in `config.h` to disable this feature. Pick a GPIO that is not used for sensors/relays and is not a strapping pin you rely on (avoid **GPIO 0** / **15** on many boards for this use).

## WiFiClass / wrong `WiFi.h`

Use an **ESP32** board in **Tools → Board**. Remove any user-installed **`WiFi`** folder under `Documents\Arduino\libraries\` that shadows the ESP32 core.

## `SensirionI2cScd4x.h: No such file or directory`

The sketch expects the official library **[Sensirion I2C SCD4x](https://github.com/Sensirion/arduino-i2c-scd4x)** (Arduino Library Manager: search **scd4x**, install **Sensirion I2C SCD4x**). After installing, you should have a folder under `Documents\Arduino\libraries\` containing `src\SensirionI2cScd4x.h` (exact spelling).

If you installed from a ZIP, the library folder must sit directly in `libraries\` (not double-nested). Restart the IDE after adding libraries.

### `SensirionCore.h: No such file or directory`

Install **Sensirion Core** from Library Manager (search **sensirion core**, author Sensirion AG). The **Sensirion I2C SCD4x** library includes that header indirectly; Arduino does not always install dependencies automatically, so install **Sensirion Core** first, then **Sensirion I2C SCD4x**.

If you are **not** using an SCD41 and only want temperature/humidity from the DHT, you would need to change the sketch (this repo version is built around the SCD41 for CO₂).
