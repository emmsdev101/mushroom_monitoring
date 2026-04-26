#if !defined(ARDUINO_ARCH_ESP32)
#error Select an ESP32 board in Arduino IDE (Tools -> Board).
#endif

#include <DHT.h>

// Match MushroomNursery config.h — change if your wiring differs.
#define DHT_PIN 4
#define DHT_TYPE DHT11

static DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("DHT test — GPIO data pin = " + String(DHT_PIN) +
                 "  type = DHT" + String(DHT_TYPE == DHT11 ? "11" : "22"));
  dht.begin();
}

void loop() {
  const float h = dht.readHumidity();
  const float t = dht.readTemperature();
  const float tF = dht.readTemperature(true);

  Serial.print(millis() / 1000);
  Serial.print("s  ");

  if (isnan(h) || isnan(t)) {
    Serial.println("READ FAIL (NaN) — check pin, 3V3/GND, pull-up, DHT11 vs DHT22");
  } else {
    Serial.print("H=");
    Serial.print(h, 1);
    Serial.print("%  T=");
    Serial.print(t, 1);
    Serial.print("C  ");
    if (!isnan(tF)) {
      Serial.print(tF, 1);
      Serial.print("F");
    }
    Serial.println();
  }

  delay(2000);
}
