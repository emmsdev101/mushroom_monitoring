import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import MetricCard from '../components/MetricCard';
import StatusCard from '../components/StatusCard';
import { devicePath, useRtdbValue } from '../lib/rtdb';
import { palette } from '../theme/palette';

function formatAge(ms) {
  if (ms == null) return 'No recent updates';
  if (ms < 1000) return 'Just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/** Uses optional comfort floor; fan-on ceiling from Settings (`control`). */
function statusForTemp(tempC, tempFanOnC) {
  if (tempC == null) return 'warn';
  const hi = typeof tempFanOnC === 'number' ? tempFanOnC : 32;
  if (tempC >= hi) return 'bad';
  if (tempC >= hi - 2) return 'warn';
  if (tempC < 12) return 'bad';
  if (tempC < 16) return 'warn';
  return 'good';
}

function statusForHum(humPct, humFanOnPct) {
  if (humPct == null) return 'warn';
  const hi = typeof humFanOnPct === 'number' ? humFanOnPct : 92;
  if (humPct >= hi) return 'bad';
  if (humPct >= hi - 3) return 'warn';
  if (humPct < 50) return 'bad';
  if (humPct < 60) return 'warn';
  return 'good';
}

function statusForCo2(co2ppm, threshold) {
  if (co2ppm == null) return 'warn';
  if (threshold != null && co2ppm > threshold + 300) return 'bad';
  if (threshold != null && co2ppm > threshold) return 'warn';
  return 'good';
}

export default function DashboardScreen({ deviceId }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const live = useRtdbValue(devicePath(deviceId, 'live'));
  const control = useRtdbValue(devicePath(deviceId, 'control'));
  const heartbeat = useRtdbValue(devicePath(deviceId, 'heartbeatServerMs'));
  const heartbeatFallback = useRtdbValue(devicePath(deviceId, 'heartbeatMs'));

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

    const co2ThresholdPpm =
      typeof c.co2ThresholdPpm === 'number'
        ? c.co2ThresholdPpm
        : typeof v.co2ThresholdPpm === 'number'
          ? v.co2ThresholdPpm
          : null;
    const tempFanOnC = typeof c.tempFanOnC === 'number' ? c.tempFanOnC : null;
    const humFanOnPct = typeof c.humFanOnPct === 'number' ? c.humFanOnPct : null;

    const hb = typeof heartbeat.value === 'number' ? heartbeat.value : null;
    const hbFb = typeof heartbeatFallback.value === 'number' ? heartbeatFallback.value : null;

    const ts = hb ?? (typeof v.tsServerMs === 'number' ? v.tsServerMs : null);
    const age = ts != null ? Date.now() - ts : null;

    const online = ts != null ? age < 90000 : hbFb != null || v.tsMs != null;

    return {
      tempC,
      humPct,
      co2ppm,
      fanOn,
      co2ThresholdPpm,
      tempFanOnC,
      humFanOnPct,
      online,
      lastSeenText:
        ts != null ? `Last update: ${formatAge(age)}` : 'Last update: (waiting for device heartbeat)',
    };
  }, [live.value, control.value, heartbeat.value, heartbeatFallback.value]);

  if (live.loading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator />
        <Text style={[styles.centerText, { color: sub }]}>Loading live data…</Text>
      </View>
    );
  }

  const tempSub =
    derived.tempFanOnC != null
      ? `Fan if above ${derived.tempFanOnC.toFixed(0)} °C (set in Thresholds)`
      : 'Set temp fan-on in Settings → Thresholds';
  const humSub =
    derived.humFanOnPct != null
      ? `Fan if above ${derived.humFanOnPct.toFixed(0)} % (set in Thresholds)`
      : 'Set humidity fan-on in Settings → Thresholds';
  const co2Sub =
    derived.co2ThresholdPpm != null
      ? `Fan if above ${derived.co2ThresholdPpm} ppm (set in Thresholds)`
      : 'Set CO₂ threshold in Settings → Thresholds';

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.h1, { color: text }]}>Monitoring</Text>
      <Text style={[styles.p, { color: sub }]}>
        Device: {deviceId} — live temperature, humidity, and CO₂ from the nursery.
      </Text>

      <StatusCard online={derived.online} lastSeenText={derived.lastSeenText} fanOn={derived.fanOn} />

      <View style={styles.grid}>
        <MetricCard
          title="Temperature"
          value={derived.tempC != null ? derived.tempC.toFixed(1) : null}
          unit="°C"
          status={statusForTemp(derived.tempC, derived.tempFanOnC)}
          subtitle={tempSub}
        />
        <MetricCard
          title="Humidity"
          value={derived.humPct != null ? derived.humPct.toFixed(0) : null}
          unit="%"
          status={statusForHum(derived.humPct, derived.humFanOnPct)}
          subtitle={humSub}
        />
        <MetricCard
          title="CO₂"
          value={derived.co2ppm != null ? derived.co2ppm.toFixed(0) : null}
          unit="ppm"
          status={statusForCo2(derived.co2ppm, derived.co2ThresholdPpm)}
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
