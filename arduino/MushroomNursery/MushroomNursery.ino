/**
 * ESP32 nursery node: sensors + relays, HTTPS to the Render API.
 *
 * HTTPS notes (ESP32 Arduino 3.x / Render):
 * - One TLS session per loop. Back-to-back GET+POST on a reused
 *   NetworkClientSecure is reported as HTTP -1 "connection refused".
 * - Recreate the secure client before every request so mbedTLS state is clean.
 * - HTTP/1.0 so Render/Express send Content-Length instead of chunked bodies.
 */
// 
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
#define INTAKE_RELAY_ACTIVE_HIGH 0
#endif
#ifndef SPRINKLER_PIN
#define SPRINKLER_PIN -1
#endif
#ifndef SPRINKLER_RELAY_ACTIVE_HIGH
#define SPRINKLER_RELAY_ACTIVE_HIGH 0
#endif
#ifndef HEATER_PIN
#define HEATER_PIN -1
#endif
#ifndef HEATER_RELAY_ACTIVE_HIGH
#define HEATER_RELAY_ACTIVE_HIGH 0
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

// Heap-allocated so each request gets a fresh mbedTLS context (ESP32 core 3.x).


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
static const uint32_t CONTROL_HTTP_TIMEOUT_MS = 12000;
static const uint32_t TELEMETRY_HTTP_TIMEOUT_MS = 15000;
static const uint8_t TELEMETRY_RETRIES = 2;
static const uint32_t TELEMETRY_RETRY_DELAY_MS = 1500;
static const uint32_t TLS_SETTLE_MS = 150;
static String cachedServerBaseUrl;
static bool serverUrlCached = false;
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
  cachedServerBaseUrl = u;
  serverUrlCached = true;
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
  if (!serverUrlCached) {
    cachedServerBaseUrl = loadServerBaseUrlFromNvs();
    serverUrlCached = true;
  }
  return cachedServerBaseUrl;
}

static void addApiKeyHeader(HTTPClient &http) {
  const char *k = SERVER_API_KEY;
  if (k != nullptr && k[0] != '\0') {
    http.addHeader("X-API-Key", k);
  }
}

static bool parseHttpUrl(const String &url, String &host, uint16_t &port, String &path, bool &https) {
  String rest = url;
  if (rest.startsWith("https://")) {
    https = true;
    rest.remove(0, 8);
    port = 443;
  } else if (rest.startsWith("http://")) {
    https = false;
    rest.remove(0, 7);
    port = 80;
  } else {
    return false;
  }
  const int slash = rest.indexOf('/');
  const String hostport = slash < 0 ? rest : rest.substring(0, slash);
  path = slash < 0 ? "/" : rest.substring(slash);
  const int colon = hostport.indexOf(':');
  if (colon >= 0) {
    host = hostport.substring(0, colon);
    const int p = hostport.substring(colon + 1).toInt();
    if (p > 0) port = (uint16_t)p;
  } else {
    host = hostport;
  }
  return host.length() > 0;
}

static void logWifiAndDns(const String &url) {
  Serial.printf(
      "[wifi] ip=%s gw=%s dns=%s rssi=%d\n",
      WiFi.localIP().toString().c_str(),
      WiFi.gatewayIP().toString().c_str(),
      WiFi.dnsIP().toString().c_str(),
      WiFi.RSSI());
  String host, path;
  uint16_t port = 0;
  bool https = false;
  if (!parseHttpUrl(url, host, port, path, https)) {
    Serial.printf("[dns] bad url %s\n", url.c_str());
    return;
  }
  IPAddress ip;
  if (WiFi.hostByName(host.c_str(), ip)) {
    Serial.printf("[dns] %s -> %s:%u\n", host.c_str(), ip.toString().c_str(), port);
  } else {
    Serial.printf("[dns] FAIL %s\n", host.c_str());
  }
}

static void wifiUseStationOnly() {
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
}

static WiFiClientSecure *secureClient = nullptr;

static void destroySecureClient() {
  if (!secureClient) return;
  secureClient->stop();
  delay(30);
  delete secureClient;
  secureClient = nullptr;
}

static WiFiClientSecure &freshSecureClient() {
  destroySecureClient();
  delay(TLS_SETTLE_MS);
  secureClient = new WiFiClientSecure();
  secureClient->setInsecure();
  secureClient->setHandshakeTimeout(20);
  return *secureClient;
}

static void httpBeginSmart(HTTPClient &http, const String &url, uint32_t timeoutMs = TELEMETRY_HTTP_TIMEOUT_MS) {
    String host, path;
    uint16_t port = 0;
    bool https = false;
    parseHttpUrl(url, host, port, path, https);

    if (https) {
        http.begin(freshSecureClient(), url);
    } else {
        http.begin(url);
    }

    http.setConnectTimeout((int32_t)timeoutMs);
    http.setTimeout((uint16_t)timeoutMs);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    http.useHTTP10(true);
    http.setReuse(false);
    http.addHeader("Accept", "application/json");
    http.addHeader("Accept-Encoding", "identity");
}

static void httpFinish(HTTPClient &http) {
  http.end();
  destroySecureClient();
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
    wifiUseStationOnly();
  }
  return ok;
}

static bool wifiEnsureConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFi.setSleep(false);
    return true;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
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

static void applyAutoActuators(float temp, float hum, int co2ppm) {
  const bool coldNow = !isnan(temp) && temp < tempMinC;

  if (!manualOverride) {
    bool desiredFanOn = false;
    if (co2ppm > 0 && co2ppm > co2ThresholdPpm) desiredFanOn = true;
    if (!isnan(temp) && temp > tempFanOnC) desiredFanOn = true;
    if (!coldNow && !isnan(hum) && hum > humFanOnPct) desiredFanOn = true;
    if (desiredFanOn != fanOn) setRelay(desiredFanOn);
  }

  if (!manualIntakeFanOverride) {
    bool desiredIntakeOn = false;
    if (intakeFanEnabled) {
      if (co2ppm > 0 && co2ppm > co2ThresholdPpm) desiredIntakeOn = true;
      if (!isnan(temp) && temp > tempFanOnC) desiredIntakeOn = true;
    }
#if INTAKE_FAN_PIN >= 0
    if (desiredIntakeOn != intakeFanOn) setIntakeRelay(desiredIntakeOn);
#else
    if (intakeFanOn) intakeFanOn = false;
#endif
  }

  if (!manualSprinklerOverride) {
    bool desiredSprinklerOn = sprinklerOn;
    const uint32_t nowMs = millis();
    if (!sprinklerEnabled || coldNow || isnan(hum)) {
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
  }

  if (!manualHeaterOverride) {
    bool desiredHeaterOn = heaterOn;
    const uint32_t nowMs = millis();
    if (!heaterEnabled || isnan(temp)) {
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
}

static void applyOverrideActuators() {
  if (manualOverride && manualFanOn != fanOn) setRelay(manualFanOn);
  if (manualIntakeFanOverride && manualIntakeFanOn != intakeFanOn) {
#if INTAKE_FAN_PIN >= 0
    setIntakeRelay(manualIntakeFanOn);
#else
    intakeFanOn = false;
#endif
  }
  if (manualSprinklerOverride && manualSprinklerOn != sprinklerOn) {
#if SPRINKLER_PIN >= 0
    setSprinklerRelay(manualSprinklerOn);
#else
    sprinklerOn = false;
#endif
  }
  if (manualHeaterOverride && manualHeaterOn != heaterOn) {
#if HEATER_PIN >= 0
    setHeaterRelay(manualHeaterOn);
#else
    heaterOn = false;
#endif
  }
}

static bool applyControlPayload(const String &payload) {
  StaticJsonDocument<4096> doc;
  const DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("control parse failed: %s len=%u heap=%u\n", err.c_str(), (unsigned)payload.length(), (unsigned)ESP.getFreeHeap());
    return false;
  }

  // POST returns { ok, control: {...} }. GET returns the object itself.
  // Do not use is<JsonObject>() — ArduinoJson often reports that false on const variants.
  JsonVariantConst c = doc["control"];
  if (c.isNull()) c = doc.as<JsonVariantConst>();
  if (c["manualOverride"].isNull() && c["co2ThresholdPpm"].isNull()) {
    Serial.println("control payload has no control fields");
    return false;
  }

  if (!c["co2ThresholdPpm"].isNull()) co2ThresholdPpm = (int)c["co2ThresholdPpm"];
  if (!c["tempFanOnC"].isNull()) tempFanOnC = c["tempFanOnC"];
  if (!c["humFanOnPct"].isNull()) humFanOnPct = c["humFanOnPct"];
  if (!c["manualOverride"].isNull()) manualOverride = (bool)c["manualOverride"];
  if (!c["manualFanOn"].isNull()) manualFanOn = (bool)c["manualFanOn"];
  if (!c["intakeFanEnabled"].isNull()) intakeFanEnabled = (bool)c["intakeFanEnabled"];
  if (!c["manualIntakeFanOverride"].isNull()) manualIntakeFanOverride = (bool)c["manualIntakeFanOverride"];
  if (!c["manualIntakeFanOn"].isNull()) manualIntakeFanOn = (bool)c["manualIntakeFanOn"];
  if (!c["sprinklerEnabled"].isNull()) sprinklerEnabled = (bool)c["sprinklerEnabled"];
  if (!c["sprinklerOnHumPct"].isNull()) sprinklerOnHumPct = c["sprinklerOnHumPct"];
  if (!c["sprinklerOffHumPct"].isNull()) sprinklerOffHumPct = c["sprinklerOffHumPct"];
  if (!c["sprinklerMaxOnSec"].isNull()) sprinklerMaxOnSec = (uint32_t)(int)c["sprinklerMaxOnSec"];
  if (!c["sprinklerMinOffSec"].isNull()) sprinklerMinOffSec = (uint32_t)(int)c["sprinklerMinOffSec"];
  if (!c["manualSprinklerOverride"].isNull()) manualSprinklerOverride = (bool)c["manualSprinklerOverride"];
  if (!c["manualSprinklerOn"].isNull()) manualSprinklerOn = (bool)c["manualSprinklerOn"];
  if (!c["tempMinC"].isNull()) tempMinC = c["tempMinC"];
  if (!c["heaterEnabled"].isNull()) heaterEnabled = (bool)c["heaterEnabled"];
  if (!c["heaterOnTempC"].isNull()) heaterOnTempC = c["heaterOnTempC"];
  if (!c["heaterOffTempC"].isNull()) heaterOffTempC = c["heaterOffTempC"];
  if (!c["heaterMaxOnSec"].isNull()) heaterMaxOnSec = (uint32_t)(int)c["heaterMaxOnSec"];
  if (!c["heaterMinOffSec"].isNull()) heaterMinOffSec = (uint32_t)(int)c["heaterMinOffSec"];
  if (!c["manualHeaterOverride"].isNull()) manualHeaterOverride = (bool)c["manualHeaterOverride"];
  if (!c["manualHeaterOn"].isNull()) manualHeaterOn = (bool)c["manualHeaterOn"];
  applyOverrideActuators();
  applyAutoActuators(lastTempC, lastHumPct, lastCo2ppm);
  Serial.printf(
      "control applied ov=%d fanWant=%d Tmax=%.1f exhaust=%d\n",
      manualOverride, manualFanOn, tempFanOnC, fanOn);
  return true;
}

static bool readControlFromServer() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/control";

  httpBeginSmart(http, url, CONTROL_HTTP_TIMEOUT_MS);
  addApiKeyHeader(http);

  bool ok = false;
  const int code = http.GET();
  if (code == HTTP_CODE_OK) {
    const String payload = http.getString();
    if (applyControlPayload(payload)) {
      logServerHttp("GET", url, code, "ok");
      ok = true;
    } else {
      logServerHttp("GET", url, code, "control parse failed");
    }
  } else {
    logServerHttp("GET", url, code, http.errorToString(code));
  }
  httpFinish(http);
  return ok;
}

static void fetchRangesOnBoot() {
  const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/control";
  Serial.println("boot: fetching target ranges from server");
  Serial.printf("boot url %s\n", url.c_str());
  delay(3000);
  logWifiAndDns(url);

  for (uint8_t attempt = 1; attempt <= 8; attempt++) {
    if (readControlFromServer()) {
      Serial.printf(
          "boot ranges Tmin=%.1f Tmax=%.1f Hmax=%.0f CO2max=%d\n",
          tempMinC, tempFanOnC, humFanOnPct, co2ThresholdPpm);
      return;
    }
    Serial.printf("boot ranges retry %u/8\n", (unsigned)attempt);
    if (attempt == 1 || attempt == 4) logWifiAndDns(url);
    delay(5000);
  }
  Serial.printf(
      "boot ranges fallback Tmax=%.1f Hmax=%.0f CO2max=%d\n",
      tempFanOnC, humFanOnPct, co2ThresholdPpm);
}

static bool postTelemetryToServer(float tempC, float humPct, int co2ppm) {
    if (WiFi.status() != WL_CONNECTED) return false;

    StaticJsonDocument<512> doc;
    if (!isnan(tempC)) doc["tempC"] = tempC;
    if (!isnan(humPct)) doc["humPct"] = humPct;
    if (co2ppm > 0) doc["co2ppm"] = co2ppm;
    doc["fanOn"] = fanOn;
    doc["intakeFanOn"] = intakeFanOn;
    doc["sprinklerOn"] = sprinklerOn;
    doc["heaterOn"] = heaterOn;
    doc["tsMs"] = (int)millis();

    String body;
    serializeJson(doc, body);

    const String url = serverBaseUrl() + "/api/devices/" + DEVICE_ID + "/telemetry";
    bool appliedControl = false;
    bool telemetrySent = false;
    int code = 0;

    for (uint8_t attempt = 1; attempt <= TELEMETRY_RETRIES; attempt++) {
      HTTPClient http;
      httpBeginSmart(http, url, TELEMETRY_HTTP_TIMEOUT_MS);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("User-Agent", "ESP32-SCD41-Node");
      http.addHeader("Connection", "close");
      addApiKeyHeader(http);

      code = http.POST(body);

      if (code < 0) {
        logServerHttp("POST", url, code, http.errorToString(code));
        Serial.printf("telemetry fail heap=%u\n", (unsigned)ESP.getFreeHeap());
        httpFinish(http);
        if (attempt < TELEMETRY_RETRIES) {
          Serial.printf("telemetry retry %u/%u\n", (unsigned)(attempt + 1), (unsigned)TELEMETRY_RETRIES);
          delay(TELEMETRY_RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      if (code != HTTP_CODE_OK && code != HTTP_CODE_CREATED && code != HTTP_CODE_ACCEPTED) {
        logServerHttp("POST", url, code, "telemetry rejected");
        httpFinish(http);
        break;
      }

      const String payload = http.getString();
      telemetrySent = true;
      appliedControl = applyControlPayload(payload);
      logServerHttp("POST", url, code, appliedControl ? "ok + control" : "ok");
      if (!appliedControl) {
        Serial.printf("POST body len=%u heap=%u\n", (unsigned)payload.length(), (unsigned)ESP.getFreeHeap());
      }
      httpFinish(http);
      break;
    }

    return telemetrySent;
}

void setup() {
  // Drive the idle level before pinMode so an active-LOW module does not
  // latch on while the pin is still floating.
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);
#if INTAKE_FAN_PIN >= 0
  digitalWrite(INTAKE_FAN_PIN, INTAKE_RELAY_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(INTAKE_FAN_PIN, OUTPUT);
  setIntakeRelay(false);
#endif
#if SPRINKLER_PIN >= 0
  digitalWrite(SPRINKLER_PIN, SPRINKLER_RELAY_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(SPRINKLER_PIN, OUTPUT);
  setSprinklerRelay(false);
#endif
#if HEATER_PIN >= 0
  digitalWrite(HEATER_PIN, HEATER_RELAY_ACTIVE_HIGH ? LOW : HIGH);
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
  wifiUseStationOnly();

  // I2C after Wi-Fi: ESP32 radio init often leaves the SCD41 bus stuck.
  if (!scd41Begin()) {
    Serial.println("SCD41 init failed");
  }

  if (WiFi.status() == WL_CONNECTED) {
    fetchRangesOnBoot();
  }
}

void loop() {
  const uint32_t cycleStart = millis();
  wifiEnsureConnected();

  lastHumPct = dht.readHumidity();
  lastTempC = dht.readTemperature();
  scd41Ensure(millis());
  scd41ReadCo2ppm(lastCo2ppm);
  Serial.printf("1 sensors T=%.1f H=%.0f CO2=%d\n", lastTempC, lastHumPct, lastCo2ppm);

  applyAutoActuators(lastTempC, lastHumPct, lastCo2ppm);
  Serial.printf(
      "2 auto exhaust=%d intake=%d sprinkler=%d heater=%d Tmax=%.1f ov=%d\n",
      fanOn, intakeFanOn, sprinklerOn, heaterOn, tempFanOnC, manualOverride);

  // Send telemetry once. Do not immediately issue a GET when POST fails;
  // that creates unnecessary back-to-back TLS connections.
  if (WiFi.status() == WL_CONNECTED) {
    const bool sent = postTelemetryToServer(lastTempC, lastHumPct, lastCo2ppm);
    Serial.println(sent ? "[telemetry] SUCCESS" : "[telemetry] FAILED");
  }
  Serial.printf(
      "4 override exhaust=%d/%d intake=%d/%d sprinkler=%d/%d heater=%d/%d\n",
      manualOverride, fanOn,
      manualIntakeFanOverride, intakeFanOn,
      manualSprinklerOverride, sprinklerOn,
      manualHeaterOverride, heaterOn);

  const uint32_t elapsed = millis() - cycleStart;
  if (elapsed < PUBLISH_INTERVAL_MS) {
    delay(PUBLISH_INTERVAL_MS - elapsed);
  }
}
