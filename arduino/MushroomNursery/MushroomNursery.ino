#if !defined(ARDUINO_ARCH_ESP32)
#error This sketch requires an ESP32 board. In Arduino IDE choose Board: ESP32 Dev Module (or your ESP32 model). Do not select Arduino AVR or UNO.
#endif

#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SensirionI2cScd4x.h>
#include <DHT.h>

#include "config.h"

#ifndef DEFAULT_TEMP_FAN_ON_C
#define DEFAULT_TEMP_FAN_ON_C 32.0f
#endif
#ifndef DEFAULT_HUM_FAN_ON_PCT
#define DEFAULT_HUM_FAN_ON_PCT 92.0f
#endif

#ifndef WIFI_RESET_PIN
#define WIFI_RESET_PIN 18
#endif
#ifndef WIFI_RESET_HOLD_MS
#define WIFI_RESET_HOLD_MS 600
#endif

#if !defined(SERVER_BASE_URL_DEFAULT) && defined(SERVER_BASE_URL)
#define SERVER_BASE_URL_DEFAULT SERVER_BASE_URL
#endif
#if !defined(SERVER_BASE_URL_DEFAULT)
#error Define SERVER_BASE_URL_DEFAULT in config.h (compile-time default; change anytime in WiFiManager portal).
#endif

static const char *kPrefNs = "mnurs";
static const char *kPrefServerUrl = "baseUrl";

// Buffer shown in WiFiManager portal (must outlive WiFiManagerParameter)
static char serverUrlFieldValue[96] = {0};
static WiFiManagerParameter serverUrlParam(
    "srv_base",
    "Node server base URL (http://IP:PORT, no trailing slash)",
    serverUrlFieldValue,
    sizeof(serverUrlFieldValue) - 1);
static bool wifiManagerParamsAdded = false;

static DHT dht(DHT_PIN, DHT_TYPE);
static SensirionI2cScd4x scd4x;
static WiFiManager wifiManager;

static const uint32_t PUBLISH_INTERVAL_MS = 5000;
static const uint32_t CONTROL_POLL_MS = 3000;
static uint32_t lastPublishMs = 0;
static uint32_t lastControlFetchMs = 0;
static int lastCo2ppm = -1;

static int co2ThresholdPpm = DEFAULT_CO2_THRESHOLD_PPM;
static float tempFanOnC = DEFAULT_TEMP_FAN_ON_C;
static float humFanOnPct = DEFAULT_HUM_FAN_ON_PCT;
static bool manualOverride = false;
static bool manualFanOn = false;
static bool fanOn = false;

static String normalizeServerBaseUrl(String u) {
  u.trim();
  while (u.length() > 0 && u.endsWith("/")) {
    u.remove(u.length() - 1);
  }
  return u;
}

static String loadServerBaseUrlFromNvs() {
  Preferences pref;
  pref.begin(kPrefNs, true);
  String s = pref.getString(kPrefServerUrl, SERVER_BASE_URL_DEFAULT);
  pref.end();
  s = normalizeServerBaseUrl(s);
  if (s.length() == 0) {
    s = normalizeServerBaseUrl(String(SERVER_BASE_URL_DEFAULT));
  }
  return s;
}

static void saveServerBaseUrlToNvs(const String &url) {
  String u = normalizeServerBaseUrl(url);
  if (u.length() == 0) return;
  Preferences pref;
  pref.begin(kPrefNs, false);
  pref.putString(kPrefServerUrl, u);
  pref.end();
}

static void syncServerUrlFieldForPortal() {
  const String cur = loadServerBaseUrlFromNvs();
  strncpy(serverUrlFieldValue, cur.c_str(), sizeof(serverUrlFieldValue) - 1);
  serverUrlFieldValue[sizeof(serverUrlFieldValue) - 1] = '\0';
  // WiFiManager 2.x: keep portal field in sync when reopening config
  serverUrlParam.setValue(serverUrlFieldValue, sizeof(serverUrlFieldValue));
}

static void persistServerUrlAfterPortal() {
  const char *submitted = serverUrlParam.getValue();
  if (!submitted || !submitted[0]) return;
  saveServerBaseUrlToNvs(String(submitted));
}

static String serverBaseUrl() {
  return loadServerBaseUrlFromNvs();
}

static void addApiKeyHeader(HTTPClient &http) {
  const char *k = SERVER_API_KEY;
  if (k != nullptr && k[0] != '\0') {
    http.addHeader("X-API-Key", k);
  }
}

/** Serial log for Node server HTTP calls (115200 Serial Monitor). */
static void logServerHttp(const char *method, const String &url, int httpCode, const String &detail = String()) {
  Serial.print("[srv] ");
  Serial.print(method);
  Serial.print(' ');
  Serial.print(url);
  Serial.print(" -> HTTP ");
  Serial.print(httpCode);
  if (detail.length() > 0) {
    Serial.print(" | ");
    Serial.print(detail);
  }
  Serial.println();
}

static void setRelay(bool on) {
  fanOn = on;
  const bool pinHigh = (RELAY_ACTIVE_HIGH ? on : !on);
  digitalWrite(RELAY_PIN, pinHigh ? HIGH : LOW);
}

#if WIFI_RESET_PIN >= 0
/** Jumper from WIFI_RESET_PIN to GND at boot, held for WIFI_RESET_HOLD_MS. */
static bool wifiResetJumperHeld() {
  pinMode(WIFI_RESET_PIN, INPUT_PULLUP);
  delay(80);
  if (digitalRead(WIFI_RESET_PIN) != LOW) {
    return false;
  }
  delay(WIFI_RESET_HOLD_MS);
  return digitalRead(WIFI_RESET_PIN) == LOW;
}

static void applyWifiFactoryResetIfJumper() {
  if (!wifiResetJumperHeld()) {
    return;
  }
  Serial.print("[WiFi] Factory reset: GPIO ");
  Serial.print(WIFI_RESET_PIN);
  Serial.println(" held to GND - erasing saved Wi-Fi credentials.");
  wifiManager.resetSettings();
  Serial.println("[WiFi] Connect to the setup AP and captive portal on next step.");
}
#else
static void applyWifiFactoryResetIfJumper() {}
#endif

static bool wifiConnectOrPortal() {
  if (WiFi.status() == WL_CONNECTED) return true;

  syncServerUrlFieldForPortal();
  if (!wifiManagerParamsAdded) {
    wifiManager.addParameter(&serverUrlParam);
    wifiManagerParamsAdded = true;
  }

  wifiManager.setConfigPortalTimeout(WIFI_MANAGER_CONFIG_PORTAL_TIMEOUT_SEC);
  const char *apPw = WIFI_MANAGER_AP_PASSWORD;
  bool ok = false;
  if (apPw != nullptr && apPw[0] != '\0') {
    ok = wifiManager.autoConnect(WIFI_MANAGER_AP_NAME, apPw);
  } else {
    ok = wifiManager.autoConnect(WIFI_MANAGER_AP_NAME);
  }
  if (ok) {
    persistServerUrlAfterPortal();
  }
  return ok;
}

static bool wifiEnsureConnected() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.reconnect();
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
    delay(200);
  }
  if (WiFi.status() == WL_CONNECTED) return true;

  return wifiConnectOrPortal();
}

static void scd41ReadCo2ppm(int &ppmOut) {
  ppmOut = lastCo2ppm;
  bool ready = false;
  if (scd4x.getDataReadyStatus(ready) != 0) return;
  if (!ready) return;

  uint16_t co2 = 0;
  float tS = 0.0f;
  float rhS = 0.0f;
  if (scd4x.readMeasurement(co2, tS, rhS) != 0) return;

  lastCo2ppm = (int)co2;
  ppmOut = lastCo2ppm;
}

static bool scd41Begin() {
  Wire.begin(SCD41_I2C_SDA, SCD41_I2C_SCL);
  scd4x.begin(Wire, SCD41_I2C_ADDR_62);

  delay(30);
  int16_t err = scd4x.wakeUp();
  if (err != 0) {
    Serial.print("SCD41 wakeUp err ");
    Serial.println(err);
  }
  err = scd4x.stopPeriodicMeasurement();
  if (err != 0) {
    Serial.print("SCD41 stopPeriodic err ");
    Serial.println(err);
  }
  delay(500);
  err = scd4x.startPeriodicMeasurement();
  if (err != 0) {
    Serial.print("SCD41 startPeriodic err ");
    Serial.println(err);
    return false;
  }
  Serial.println("SCD41 periodic measurement started (5s update interval)");
  return true;
}

static void readControlFromServer() {
  HTTPClient http;
  const String url =
      serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/control";
  http.begin(url);
  addApiKeyHeader(http);
  const int code = http.GET();
  if (code < 0) {
    logServerHttp("GET", url, code, http.errorToString(code));
    http.end();
    return;
  }
  if (code != HTTP_CODE_OK) {
    logServerHttp("GET", url, code, "control fetch failed");
    http.end();
    return;
  }

  const String payload = http.getString();
  http.end();

  StaticJsonDocument<320> doc;
  if (deserializeJson(doc, payload)) {
    logServerHttp("GET", url, code, "JSON parse error");
    return;
  }
  logServerHttp("GET", url, code, String("ok bytes=") + String(payload.length()));

  if (doc["co2ThresholdPpm"].is<int>()) {
    const int v = doc["co2ThresholdPpm"].as<int>();
    if (v >= 400 && v <= 10000) co2ThresholdPpm = v;
  }
  if (!doc["tempFanOnC"].isNull()) {
    const float v = doc["tempFanOnC"].as<float>();
    if (v >= 15.0f && v <= 45.0f) tempFanOnC = v;
  }
  if (!doc["humFanOnPct"].isNull()) {
    const float v = doc["humFanOnPct"].as<float>();
    if (v >= 55.0f && v <= 100.0f) humFanOnPct = v;
  }
  if (doc["manualOverride"].is<bool>()) {
    manualOverride = doc["manualOverride"].as<bool>();
  }
  if (doc["manualFanOn"].is<bool>()) {
    manualFanOn = doc["manualFanOn"].as<bool>();
  }
}

static void postTelemetryToServer(float tempC, float humPct, int co2ppm) {
  StaticJsonDocument<384> doc;
  if (!isnan(tempC)) doc["tempC"] = tempC;
  if (!isnan(humPct)) doc["humPct"] = humPct;
  if (co2ppm > 0) doc["co2ppm"] = co2ppm;
  doc["fanOn"] = fanOn;
  doc["co2ThresholdPpm"] = co2ThresholdPpm;
  doc["tempFanOnC"] = tempFanOnC;
  doc["humFanOnPct"] = humFanOnPct;
  doc["manualOverride"] = manualOverride;
  doc["tsMs"] = (int)millis();

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  const String url =
      serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/telemetry";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  addApiKeyHeader(http);
  const int code = http.POST(body);
  if (code < 0) {
    logServerHttp("POST", url, code, http.errorToString(code));
  } else if (code != HTTP_CODE_OK) {
    logServerHttp("POST", url, code, "telemetry rejected");
  } else {
    logServerHttp("POST", url, code, String("ok bytes=") + String(body.length()));
  }
  http.end();
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);

  Serial.begin(115200);
  delay(200);

  applyWifiFactoryResetIfJumper();

  dht.begin();
  if (!scd41Begin()) {
    Serial.println("SCD41 init failed; check I2C wiring (SDA/SCL) and power");
  }

  if (!wifiConnectOrPortal()) {
    Serial.println("WiFi setup failed; restarting in 3s");
    delay(3000);
    ESP.restart();
  }
  Serial.print("WiFi OK, IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Server: ");
  Serial.println(serverBaseUrl());

  if (WiFi.status() == WL_CONNECTED) {
    readControlFromServer();
    lastControlFetchMs = millis();
    Serial.println("Control presets loaded from server (thresholds + manual commands).");
  }
}

void loop() {
  wifiEnsureConnected();

  const uint32_t now = millis();
  if (WiFi.status() == WL_CONNECTED) {
    if (now - lastControlFetchMs >= CONTROL_POLL_MS) {
      lastControlFetchMs = now;
      readControlFromServer();
    }
  }

  if (now - lastPublishMs >= PUBLISH_INTERVAL_MS || lastPublishMs == 0) {
    lastPublishMs = now;

    const float hum = dht.readHumidity();
    const float temp = dht.readTemperature();

    int co2ppm = -1;
    scd41ReadCo2ppm(co2ppm);

    bool desiredFanOn = false;
    if (manualOverride) {
      desiredFanOn = manualFanOn;
    } else {
      if (co2ppm > 0 && co2ppm > co2ThresholdPpm) desiredFanOn = true;
      if (!isnan(temp) && temp > tempFanOnC) desiredFanOn = true;
      if (!isnan(hum) && hum > humFanOnPct) desiredFanOn = true;
    }
    if (desiredFanOn != fanOn) setRelay(desiredFanOn);

    if (WiFi.status() == WL_CONNECTED) {
      postTelemetryToServer(temp, hum, co2ppm);
    }

    Serial.print("T=");
    Serial.print(temp);
    Serial.print("C H=");
    Serial.print(hum);
    Serial.print("% CO2=");
    Serial.print(co2ppm);
    Serial.print("ppm fanOn=");
    Serial.print(fanOn ? "1" : "0");
    Serial.print(" co2Thr=");
    Serial.print(co2ThresholdPpm);
    Serial.print(" Tfan>");
    Serial.print(tempFanOnC);
    Serial.print(" Hfan>");
    Serial.print(humFanOnPct);
    Serial.print(" override=");
    Serial.println(manualOverride ? "1" : "0");
  }

  delay(50);
}
