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
#ifndef DEFAULT_SPRINKLER_ON_HUM_PCT
#define DEFAULT_SPRINKLER_ON_HUM_PCT 78.0f
#endif
#ifndef DEFAULT_SPRINKLER_OFF_HUM_PCT
#define DEFAULT_SPRINKLER_OFF_HUM_PCT 85.0f
#endif
#ifndef DEFAULT_SPRINKLER_MAX_ON_SEC
#define DEFAULT_SPRINKLER_MAX_ON_SEC 60
#endif
#ifndef DEFAULT_SPRINKLER_MIN_OFF_SEC
#define DEFAULT_SPRINKLER_MIN_OFF_SEC 300
#endif
#ifndef DEFAULT_HEATER_ON_TEMP_C
#define DEFAULT_HEATER_ON_TEMP_C 21.0f
#endif
#ifndef DEFAULT_HEATER_OFF_TEMP_C
#define DEFAULT_HEATER_OFF_TEMP_C 23.0f
#endif
#ifndef DEFAULT_HEATER_MAX_ON_SEC
#define DEFAULT_HEATER_MAX_ON_SEC 900
#endif
#ifndef DEFAULT_HEATER_MIN_OFF_SEC
#define DEFAULT_HEATER_MIN_OFF_SEC 60
#endif
#ifndef INTAKE_FAN_PIN
#define INTAKE_FAN_PIN -1
#endif
#ifndef INTAKE_RELAY_ACTIVE_HIGH
#define INTAKE_RELAY_ACTIVE_HIGH 1
#endif
#ifndef SPRINKLER_PIN
#define SPRINKLER_PIN -1
#endif
#ifndef SPRINKLER_RELAY_ACTIVE_HIGH
#define SPRINKLER_RELAY_ACTIVE_HIGH 1
#endif
#ifndef HEATER_PIN
#define HEATER_PIN -1
#endif
#ifndef HEATER_RELAY_ACTIVE_HIGH
#define HEATER_RELAY_ACTIVE_HIGH 1
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
static const uint32_t CONTROL_POLL_MS = 1000;
static const uint32_t CONTROL_HTTP_TIMEOUT_MS = 5000;
static const uint32_t TELEMETRY_HTTP_TIMEOUT_MS = 30000;
static uint32_t lastPublishMs = 0;
static uint32_t lastControlFetchMs = 0;
static int lastCo2ppm = -1;
static float lastTempC = NAN;
static float lastHumPct = NAN;
static bool scd41Ok = false;
static uint32_t lastCo2FreshMs = 0;
static uint32_t lastScd41BeginMs = 0;
static uint32_t lastScd41RetryMs = 0;

static int co2ThresholdPpm = DEFAULT_CO2_THRESHOLD_PPM;
static float tempFanOnC = DEFAULT_TEMP_FAN_ON_C;
static float humFanOnPct = DEFAULT_HUM_FAN_ON_PCT;
// Lower alert bound for temperature — also used for cold-inhibit gating on
// the sprinkler + exhaust humidity trigger (so they don't fight the heater).
// Default to just below the heater ON point.
static float tempMinC = DEFAULT_HEATER_ON_TEMP_C;
static bool manualOverride = false;
static bool manualFanOn = false;
static bool fanOn = false;

// Intake fan (independent from exhaust — fires on CO2 or temp above max).
static bool intakeFanEnabled = true;
static bool manualIntakeFanOverride = false;
static bool manualIntakeFanOn = false;
static bool intakeFanOn = false;

// Sprinkler / mister with hysteresis + safety-timer state machine.
static bool sprinklerEnabled = true;
static float sprinklerOnHumPct = DEFAULT_SPRINKLER_ON_HUM_PCT;
static float sprinklerOffHumPct = DEFAULT_SPRINKLER_OFF_HUM_PCT;
static uint32_t sprinklerMaxOnSec = DEFAULT_SPRINKLER_MAX_ON_SEC;
static uint32_t sprinklerMinOffSec = DEFAULT_SPRINKLER_MIN_OFF_SEC;
static bool manualSprinklerOverride = false;
static bool manualSprinklerOn = false;
static bool sprinklerOn = false;
static uint32_t sprinklerOnStartMs = 0;    // ms timestamp when current burst started (0 if off)
static uint32_t sprinklerLastOffMs = 0;    // ms timestamp when it last turned off (for cooldown)

// Heater — same state-machine pattern as sprinkler, but temperature-driven.
static bool heaterEnabled = true;
static float heaterOnTempC = DEFAULT_HEATER_ON_TEMP_C;
static float heaterOffTempC = DEFAULT_HEATER_OFF_TEMP_C;
static uint32_t heaterMaxOnSec = DEFAULT_HEATER_MAX_ON_SEC;
static uint32_t heaterMinOffSec = DEFAULT_HEATER_MIN_OFF_SEC;
static bool manualHeaterOverride = false;
static bool manualHeaterOn = false;
static bool heaterOn = false;
static uint32_t heaterOnStartMs = 0;
static uint32_t heaterLastOffMs = 0;

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

static void httpBeginSmart(HTTPClient &http, const String &url, uint32_t timeoutMs = TELEMETRY_HTTP_TIMEOUT_MS) {
    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        secureClient.setTimeout(timeoutMs);
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }

    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.setTimeout(timeoutMs);
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

static void setIntakeRelay(bool on) {
  intakeFanOn = on;
#if INTAKE_FAN_PIN >= 0
  const bool pinHigh = (INTAKE_RELAY_ACTIVE_HIGH ? on : !on);
  digitalWrite(INTAKE_FAN_PIN, pinHigh ? HIGH : LOW);
#endif
}

static void setSprinklerRelay(bool on) {
  const uint32_t now = millis();
  if (on && !sprinklerOn) {
    sprinklerOnStartMs = now;
  } else if (!on && sprinklerOn) {
    sprinklerLastOffMs = now;
  }
  sprinklerOn = on;
#if SPRINKLER_PIN >= 0
  const bool pinHigh = (SPRINKLER_RELAY_ACTIVE_HIGH ? on : !on);
  digitalWrite(SPRINKLER_PIN, pinHigh ? HIGH : LOW);
#endif
}

static void setHeaterRelay(bool on) {
  const uint32_t now = millis();
  if (on && !heaterOn) {
    heaterOnStartMs = now;
  } else if (!on && heaterOn) {
    heaterLastOffMs = now;
  }
  heaterOn = on;
#if HEATER_PIN >= 0
  const bool pinHigh = (HEATER_RELAY_ACTIVE_HIGH ? on : !on);
  digitalWrite(HEATER_PIN, pinHigh ? HIGH : LOW);
#endif
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

static bool scd41Begin() {
  Wire.end();
  delay(20);
  Wire.begin(SCD41_I2C_SDA, SCD41_I2C_SCL);
  Wire.setClock(100000);
  scd4x.begin(Wire, SCD41_I2C_ADDR_62);

  delay(30);
  scd4x.wakeUp();
  delay(30);
  scd4x.stopPeriodicMeasurement();
  delay(500);
  if (scd4x.startPeriodicMeasurement() != 0) {
    scd41Ok = false;
    return false;
  }
  scd41Ok = true;
  lastCo2FreshMs = 0;
  lastScd41BeginMs = millis();
  Serial.printf("SCD41 started on SDA=%d SCL=%d\n", SCD41_I2C_SDA, SCD41_I2C_SCL);
  return true;
}

static void scd41Ensure(uint32_t now) {
  if (scd41Ok) {
    if (lastCo2FreshMs == 0) {
      if (now - lastScd41BeginMs < 25000) return;
    } else if (now - lastCo2FreshMs <= 20000) {
      return;
    }
  }
  if (lastScd41RetryMs != 0 && now - lastScd41RetryMs < 15000) return;
  lastScd41RetryMs = now;
  Serial.println(scd41Ok ? "SCD41 silent — reinit" : "SCD41 init retry");
  if (!scd41Begin()) {
    Serial.println("SCD41 init failed");
  }
}

static void scd41ReadCo2ppm(int &ppmOut) {
  ppmOut = lastCo2ppm;
  bool ready = false;
  if (scd4x.getDataReadyStatus(ready) != 0) {
    scd41Ok = false;
    return;
  }
  if (!ready) return;

  uint16_t co2 = 0;
  float tS = 0.0f;
  float rhS = 0.0f;
  if (scd4x.readMeasurement(co2, tS, rhS) != 0) {
    scd41Ok = false;
    return;
  }

  if (co2 == 0) return;

  lastCo2ppm = (int)co2;
  lastCo2FreshMs = millis();
  scd41Ok = true;
  ppmOut = lastCo2ppm;
}

static void applyActuators(float temp, float hum, int co2ppm) {
    const bool coldNow = !isnan(temp) && temp < tempMinC;

    bool desiredFanOn = false;
    if (manualOverride) {
      desiredFanOn = manualFanOn;
    } else {
      if (co2ppm > 0 && co2ppm > co2ThresholdPpm) desiredFanOn = true;
      if (!isnan(temp) && temp > tempFanOnC) desiredFanOn = true;
      if (!coldNow && !isnan(hum) && hum > humFanOnPct) desiredFanOn = true;
    }
    if (desiredFanOn != fanOn) setRelay(desiredFanOn);

    bool desiredIntakeOn = false;
    if (manualIntakeFanOverride) {
      desiredIntakeOn = manualIntakeFanOn;
    } else if (intakeFanEnabled) {
      if (co2ppm > 0 && co2ppm > co2ThresholdPpm) desiredIntakeOn = true;
      if (!isnan(temp) && temp > tempFanOnC) desiredIntakeOn = true;
    }
#if INTAKE_FAN_PIN >= 0
    if (desiredIntakeOn != intakeFanOn) setIntakeRelay(desiredIntakeOn);
#else
    if (intakeFanOn) intakeFanOn = false;
#endif

    bool desiredSprinklerOn = sprinklerOn;
    const uint32_t nowMs = millis();
    if (manualSprinklerOverride) {
      desiredSprinklerOn = manualSprinklerOn;
    } else if (!sprinklerEnabled) {
      desiredSprinklerOn = false;
    } else if (coldNow) {
      desiredSprinklerOn = false;
    } else if (isnan(hum)) {
      desiredSprinklerOn = false;
    } else if (sprinklerOn) {
      const bool humRecovered = hum >= sprinklerOffHumPct;
      const bool maxBurstElapsed = (nowMs - sprinklerOnStartMs) >= sprinklerMaxOnSec * 1000UL;
      if (humRecovered || maxBurstElapsed) desiredSprinklerOn = false;
    } else {
      const bool humLow = hum <= sprinklerOnHumPct;
      const bool cooldownOk =
          sprinklerLastOffMs == 0 ||
          (nowMs - sprinklerLastOffMs) >= sprinklerMinOffSec * 1000UL;
      if (humLow && cooldownOk) desiredSprinklerOn = true;
    }
#if SPRINKLER_PIN >= 0
    if (desiredSprinklerOn != sprinklerOn) setSprinklerRelay(desiredSprinklerOn);
#else
    if (sprinklerOn) sprinklerOn = false;
#endif

    bool desiredHeaterOn = heaterOn;
    if (manualHeaterOverride) {
      desiredHeaterOn = manualHeaterOn;
    } else if (!heaterEnabled) {
      desiredHeaterOn = false;
    } else if (isnan(temp)) {
      desiredHeaterOn = false;
    } else if (heaterOn) {
      const bool tempRecovered = temp >= heaterOffTempC;
      const bool maxBurstElapsed = (nowMs - heaterOnStartMs) >= heaterMaxOnSec * 1000UL;
      if (tempRecovered || maxBurstElapsed) desiredHeaterOn = false;
    } else {
      const bool tempLow = temp <= heaterOnTempC;
      const bool cooldownOk =
          heaterLastOffMs == 0 ||
          (nowMs - heaterLastOffMs) >= heaterMinOffSec * 1000UL;
      if (tempLow && cooldownOk) desiredHeaterOn = true;
    }
#if HEATER_PIN >= 0
    if (desiredHeaterOn != heaterOn) setHeaterRelay(desiredHeaterOn);
#else
    if (heaterOn) heaterOn = false;
#endif
}

static void readControlFromServer() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/control";
  
  httpBeginSmart(http, url, CONTROL_HTTP_TIMEOUT_MS);
  addApiKeyHeader(http);
  
  const int code = http.GET();
  if (code == HTTP_CODE_OK) {
    const String payload = http.getString();
    // 1024 covers the full control payload including intake-fan and sprinkler
    // fields. Response is ~350 bytes JSON + ArduinoJson key copies + slot
    // overhead; leaves comfortable headroom.
    StaticJsonDocument<1024> doc;
    if (!deserializeJson(doc, payload)) {
      logServerHttp("GET", url, code, "ok");
      if (doc["co2ThresholdPpm"].is<int>()) co2ThresholdPpm = doc["co2ThresholdPpm"];
      if (!doc["tempFanOnC"].isNull()) tempFanOnC = doc["tempFanOnC"];
      if (!doc["humFanOnPct"].isNull()) humFanOnPct = doc["humFanOnPct"];
      if (doc["manualOverride"].is<bool>()) manualOverride = doc["manualOverride"];
      if (doc["manualFanOn"].is<bool>()) manualFanOn = doc["manualFanOn"];
      // Intake fan
      if (doc["intakeFanEnabled"].is<bool>()) intakeFanEnabled = doc["intakeFanEnabled"];
      if (doc["manualIntakeFanOverride"].is<bool>()) manualIntakeFanOverride = doc["manualIntakeFanOverride"];
      if (doc["manualIntakeFanOn"].is<bool>()) manualIntakeFanOn = doc["manualIntakeFanOn"];
      // Sprinkler
      if (doc["sprinklerEnabled"].is<bool>()) sprinklerEnabled = doc["sprinklerEnabled"];
      if (!doc["sprinklerOnHumPct"].isNull()) sprinklerOnHumPct = doc["sprinklerOnHumPct"];
      if (!doc["sprinklerOffHumPct"].isNull()) sprinklerOffHumPct = doc["sprinklerOffHumPct"];
      if (doc["sprinklerMaxOnSec"].is<int>()) sprinklerMaxOnSec = (uint32_t)(int)doc["sprinklerMaxOnSec"];
      if (doc["sprinklerMinOffSec"].is<int>()) sprinklerMinOffSec = (uint32_t)(int)doc["sprinklerMinOffSec"];
      if (doc["manualSprinklerOverride"].is<bool>()) manualSprinklerOverride = doc["manualSprinklerOverride"];
      if (doc["manualSprinklerOn"].is<bool>()) manualSprinklerOn = doc["manualSprinklerOn"];
      // Lower alert bound — used for cold-inhibit gating.
      if (!doc["tempMinC"].isNull()) tempMinC = doc["tempMinC"];
      // Heater
      if (doc["heaterEnabled"].is<bool>()) heaterEnabled = doc["heaterEnabled"];
      if (!doc["heaterOnTempC"].isNull()) heaterOnTempC = doc["heaterOnTempC"];
      if (!doc["heaterOffTempC"].isNull()) heaterOffTempC = doc["heaterOffTempC"];
      if (doc["heaterMaxOnSec"].is<int>()) heaterMaxOnSec = (uint32_t)(int)doc["heaterMaxOnSec"];
      if (doc["heaterMinOffSec"].is<int>()) heaterMinOffSec = (uint32_t)(int)doc["heaterMinOffSec"];
      if (doc["manualHeaterOverride"].is<bool>()) manualHeaterOverride = doc["manualHeaterOverride"];
      if (doc["manualHeaterOn"].is<bool>()) manualHeaterOn = doc["manualHeaterOn"];
      applyActuators(lastTempC, lastHumPct, lastCo2ppm);
    }
  } else {
    logServerHttp("GET", url, code, http.errorToString(code));
    if (code < 0) secureClient.stop(); // Clear stale SSL if connection failed
  }
  http.end();
}

static void postTelemetryToServer(float tempC, float humPct, int co2ppm) {
    if (WiFi.status() != WL_CONNECTED) return;

    StaticJsonDocument<512> doc;
    if (!isnan(tempC)) doc["tempC"] = tempC;
    if (!isnan(humPct)) doc["humPct"] = humPct;
    if (co2ppm > 0) doc["co2ppm"] = co2ppm;
    doc["fanOn"] = fanOn;
    doc["intakeFanOn"] = intakeFanOn;
    doc["sprinklerOn"] = sprinklerOn;
    doc["heaterOn"] = heaterOn;
    doc["co2ThresholdPpm"] = co2ThresholdPpm;
    doc["tempFanOnC"] = tempFanOnC;
    doc["humFanOnPct"] = humFanOnPct;
    doc["manualOverride"] = manualOverride;
    doc["tsMs"] = (int)millis();

    String body;
    serializeJson(doc, body);

    HTTPClient http;
    const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/telemetry";
    
    httpBeginSmart(http, url, TELEMETRY_HTTP_TIMEOUT_MS);
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
#if INTAKE_FAN_PIN >= 0
  pinMode(INTAKE_FAN_PIN, OUTPUT);
  setIntakeRelay(false);
#endif
#if SPRINKLER_PIN >= 0
  pinMode(SPRINKLER_PIN, OUTPUT);
  setSprinklerRelay(false);
#endif
#if HEATER_PIN >= 0
  pinMode(HEATER_PIN, OUTPUT);
  setHeaterRelay(false);
#endif

  Serial.begin(115200);
  delay(200);

  applyWifiFactoryResetIfJumper();

  dht.begin();

  if (!wifiConnectOrPortal()) {
    delay(3000);
    ESP.restart();
  }

  // I2C after Wi-Fi: ESP32 radio init often leaves the SCD41 bus stuck.
  if (!scd41Begin()) {
    Serial.println("SCD41 init failed");
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

    lastHumPct = dht.readHumidity();
    lastTempC = dht.readTemperature();
    scd41Ensure(now);
    scd41ReadCo2ppm(lastCo2ppm);
    Serial.printf("sensors T=%.1f H=%.0f CO2=%d\n", lastTempC, lastHumPct, lastCo2ppm);
    applyActuators(lastTempC, lastHumPct, lastCo2ppm);

    if (WiFi.status() == WL_CONNECTED) {
      postTelemetryToServer(lastTempC, lastHumPct, lastCo2ppm);
    }
  }

  delay(50);
}
