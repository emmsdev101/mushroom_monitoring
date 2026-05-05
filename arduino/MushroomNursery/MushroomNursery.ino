/**
 * IMPROVED ESP32 Cloud Connectivity for Render/HTTPS
 * * Major Fixes applied:
 * 1. Persistent WiFiClientSecure: Reusing the client prevents the high overhead of 
 * re-negotiating SSL handshakes on every single request.
 * 2. Handshake Timeout: Increased timeouts to account for Render's cold starts.
 * 3. Memory Management: Added client.stop() logic to prevent socket leakage.
 * 4. Header Optimization: Simplified headers to ensure they fit standard buffers.
 */

#if !defined(ARDUINO_ARCH_ESP32)
#error This sketch requires an ESP32 board. In Arduino IDE choose Board: ESP32 Dev Module (or your ESP32 model). Do not select Arduino AVR or UNO.
#endif

#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
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

// Global client to reuse SSL sessions (Critical for HTTPS performance)
static WiFiClientSecure secureClient;

// Buffer shown in WiFiManager portal (must outlive WiFiManagerParameter)
static char serverUrlFieldValue[96] = {0};
static WiFiManagerParameter serverUrlParam(
    "srv_base",
    "Node server base URL (https://HOST or http://IP:PORT, no trailing slash)",
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
  if (u.startsWith("http://") && u.indexOf(".onrender.com") >= 0) {
    u.replace("http://", "https://");
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

static void httpBeginSmart(HTTPClient &http, const String &url) {
    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        // Render free tier can take 30s+ to wake up from cold sleep
        secureClient.setTimeout(30000); 
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }

    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.setTimeout(30000);
    http.useHTTP10(false); // Modern cloud hosts prefer HTTP/1.1
}

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
  Serial.print("[WiFi] Factory reset requested.");
  wifiManager.resetSettings();
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
  scd4x.wakeUp();
  scd4x.stopPeriodicMeasurement();
  delay(500);
  if (scd4x.startPeriodicMeasurement() != 0) {
    return false;
  }
  return true;
}

static void readControlFromServer() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/control";
  
  httpBeginSmart(http, url);
  addApiKeyHeader(http);
  
  const int code = http.GET();
  if (code == HTTP_CODE_OK) {
    const String payload = http.getString();
    StaticJsonDocument<320> doc;
    if (!deserializeJson(doc, payload)) {
      logServerHttp("GET", url, code, "ok");
      if (doc["co2ThresholdPpm"].is<int>()) co2ThresholdPpm = doc["co2ThresholdPpm"];
      if (!doc["tempFanOnC"].isNull()) tempFanOnC = doc["tempFanOnC"];
      if (!doc["humFanOnPct"].isNull()) humFanOnPct = doc["humFanOnPct"];
      if (doc["manualOverride"].is<bool>()) manualOverride = doc["manualOverride"];
      if (doc["manualFanOn"].is<bool>()) manualFanOn = doc["manualFanOn"];
    }
  } else {
    logServerHttp("GET", url, code, http.errorToString(code));
    if (code < 0) secureClient.stop(); // Clear stale SSL if connection failed
  }
  http.end();
}

static void postTelemetryToServer(float tempC, float humPct, int co2ppm) {
    if (WiFi.status() != WL_CONNECTED) return;

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
    const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/telemetry";
    
    httpBeginSmart(http, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "ESP32-SCD41-Node"); 
    addApiKeyHeader(http);

    const int code = http.POST(body);

    if (code < 0) {
        logServerHttp("POST", url, code, http.errorToString(code));
        secureClient.stop(); // Force reset SSL session on error
    } else if (code != HTTP_CODE_OK && code != 201) {
        logServerHttp("POST", url, code, "telemetry rejected");
    } else {
        logServerHttp("POST", url, code, "ok");
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
    Serial.println("SCD41 init failed");
  }

  if (!wifiConnectOrPortal()) {
    delay(3000);
    ESP.restart();
  }

  if (WiFi.status() == WL_CONNECTED) {
    readControlFromServer();
    lastControlFetchMs = millis();
  }
}

void loop() {
  wifiEnsureConnected();

  const uint32_t now = millis();
  
  if (WiFi.status() == WL_CONNECTED && (now - lastControlFetchMs >= CONTROL_POLL_MS)) {
    lastControlFetchMs = now;
    readControlFromServer();
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
  }

  delay(50);
}
