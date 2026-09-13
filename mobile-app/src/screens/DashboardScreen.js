import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import MetricCard from '../components/MetricCard';
import OverridePanel from '../components/OverridePanel';
import StatusCard from '../components/StatusCard';
import { devicePath, useApiValue } from '../lib/api';
import { palette } from '../theme/palette';

const ONLINE_WINDOW_MS = 30 * 1000;

function formatAge(ms) {
  if (ms == null) return 'No recent updates';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function useNowMs(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Status derived from the target range [lo, hi]:
//   inside range        -> 'good'
//   near either edge    -> 'warn'
//   outside range       -> 'bad'
// `nearFrac` sets the "near-edge" band width as a fraction of the range.
function statusInRange(value, lo, hi, nearFrac = 0.1) {
  if (value == null) return 'warn';
  if (lo == null || hi == null || !(hi > lo)) return 'good';
  if (value >= hi || value <= lo) return 'bad';
  const span = hi - lo;
  const pad = span * nearFrac;
  if (value >= hi - pad || value <= lo + pad) return 'warn';
  return 'good';
}

// Thesis target ranges — used as fallbacks when `control` hasn't loaded yet.
const DEFAULT_TEMP_MIN_C = 21;
const DEFAULT_TEMP_MAX_C = 27;
const DEFAULT_HUM_MIN_PCT = 80;
const DEFAULT_HUM_MAX_PCT = 90;
const DEFAULT_CO2_MIN_PPM = 1000;
const DEFAULT_CO2_MAX_PPM = 2000;

function statusForTemp(tempC, lo, hi) {
  return statusInRange(
    tempC,
    typeof lo === 'number' ? lo : DEFAULT_TEMP_MIN_C,
    typeof hi === 'number' ? hi : DEFAULT_TEMP_MAX_C
  );
}

function statusForHum(humPct, lo, hi) {
  return statusInRange(
    humPct,
    typeof lo === 'number' ? lo : DEFAULT_HUM_MIN_PCT,
    typeof hi === 'number' ? hi : DEFAULT_HUM_MAX_PCT
  );
}

function statusForCo2(co2ppm, lo, hi) {
  return statusInRange(
    co2ppm,
    typeof lo === 'number' ? lo : DEFAULT_CO2_MIN_PPM,
    typeof hi === 'number' ? hi : DEFAULT_CO2_MAX_PPM
  );
}

export default function DashboardScreen({ deviceId }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const live = useApiValue(deviceId ? devicePath(deviceId, 'live') : null, { intervalMs: 3000 });
  const control = useApiValue(deviceId ? devicePath(deviceId, 'control') : null, { intervalMs: 5000 });
  const nowMs = useNowMs(1000);
  const [presence, setPresence] = useState({ ageMs: null, fetchedAt: 0 });

  useEffect(() => {
    const v = live.value || {};
    const fetchedAt = Date.now();
    let ageMs = null;
    if (typeof v.ageMs === 'number') ageMs = v.ageMs;
    else if (typeof v.serverTsMs === 'number') ageMs = Math.max(0, fetchedAt - v.serverTsMs);
    setPresence({ ageMs, fetchedAt });
  }, [live.value]);

  const bg = isDark ? palette.bgDark : palette.bgLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;

  const derived = useMemo(() => {
    const v = live.value || {};
    const c = control.value || {};
    const tempC = typeof v.tempC === 'number' ? v.tempC : null;
    const humPct = typeof v.humPct === 'number' ? v.humPct : null;
    const co2ppm = typeof v.co2ppm === 'number' ? v.co2ppm : null;
    const fanOn = !!v.fanOn;
    const intakeFanOn = !!v.intakeFanOn;
    const sprinklerOn = !!v.sprinklerOn;
    const heaterOn = !!v.heaterOn;

    const co2ThresholdPpm =
      typeof c.co2ThresholdPpm === 'number'
        ? c.co2ThresholdPpm
        : typeof v.co2ThresholdPpm === 'number'
          ? v.co2ThresholdPpm
          : null;
    const tempFanOnC = typeof c.tempFanOnC === 'number' ? c.tempFanOnC : null;
    const humFanOnPct = typeof c.humFanOnPct === 'number' ? c.humFanOnPct : null;
    const tempMinC = typeof c.tempMinC === 'number' ? c.tempMinC : null;
    const humMinPct = typeof c.humMinPct === 'number' ? c.humMinPct : null;
    const co2MinPpm = typeof c.co2MinPpm === 'number' ? c.co2MinPpm : null;

    // Seconds since the Arduino's last telemetry POST (same clock as Online).
    const age =
      presence.ageMs != null && presence.fetchedAt
        ? presence.ageMs + Math.max(0, nowMs - presence.fetchedAt)
        : null;
    const online = age != null && age < ONLINE_WINDOW_MS;

    return {
      tempC,
      humPct,
      co2ppm,
      fanOn,
      intakeFanOn,
      sprinklerOn,
      heaterOn,
      co2MinPpm,
      co2ThresholdPpm,
      tempMinC,
      tempFanOnC,
      humMinPct,
      humFanOnPct,
      online,
      lastSeenText:
        age != null ? `Last update: ${formatAge(age)}` : 'Last update: (waiting for device heartbeat)',
    };
  }, [live.value, control.value, nowMs, presence]);

  if (live.loading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator />
        <Text style={[styles.centerText, { color: sub }]}>Loading live data…</Text>
      </View>
    );
  }

  const tempLo = derived.tempMinC ?? DEFAULT_TEMP_MIN_C;
  const tempHi = derived.tempFanOnC ?? DEFAULT_TEMP_MAX_C;
  const humLo = derived.humMinPct ?? DEFAULT_HUM_MIN_PCT;
  const humHi = derived.humFanOnPct ?? DEFAULT_HUM_MAX_PCT;
  const co2Lo = derived.co2MinPpm ?? DEFAULT_CO2_MIN_PPM;
  const co2Hi = derived.co2ThresholdPpm ?? DEFAULT_CO2_MAX_PPM;

  const tempSub = `Target ${tempLo.toFixed(0)}–${tempHi.toFixed(0)} °C · fan on above ${tempHi.toFixed(0)}`;
  const humSub = `Target ${humLo.toFixed(0)}–${humHi.toFixed(0)} % · fan on above ${humHi.toFixed(0)}`;
  const co2Sub = `Target ${co2Lo}–${co2Hi} ppm · fan on above ${co2Hi}`;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.h1, { color: text }]}>Monitoring</Text>
      <Text style={[styles.p, { color: sub }]}>
        Device: {deviceId} — live temperature, humidity, and CO₂ from the nursery.
      </Text>

      <StatusCard
        online={derived.online}
        lastSeenText={derived.lastSeenText}
        fanOn={derived.fanOn}
        intakeFanOn={derived.intakeFanOn}
        sprinklerOn={derived.sprinklerOn}
        heaterOn={derived.heaterOn}
        control={control.value}
      />

      <OverridePanel
        deviceId={deviceId}
        control={control.value}
        live={{
          fanOn: derived.fanOn,
          intakeFanOn: derived.intakeFanOn,
          sprinklerOn: derived.sprinklerOn,
          heaterOn: derived.heaterOn,
        }}
        onSaved={control.refresh}
      />

      <View style={styles.grid}>
        <MetricCard
          title="Temperature"
          value={derived.tempC != null ? derived.tempC.toFixed(1) : null}
          unit="°C"
          status={statusForTemp(derived.tempC, derived.tempMinC, derived.tempFanOnC)}
          subtitle={tempSub}
        />
        <MetricCard
          title="Humidity"
          value={derived.humPct != null ? derived.humPct.toFixed(0) : null}
          unit="%"
          status={statusForHum(derived.humPct, derived.humMinPct, derived.humFanOnPct)}
          subtitle={humSub}
        />
        <MetricCard
          title="CO₂"
          value={derived.co2ppm != null ? derived.co2ppm.toFixed(0) : null}
          unit="ppm"
          status={statusForCo2(derived.co2ppm, derived.co2MinPpm, derived.co2ThresholdPpm)}
          subtitle={co2Sub}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  p: { marginTop: -6, fontSize: 13 },
  grid: { gap: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { fontSize: 13 },
});
