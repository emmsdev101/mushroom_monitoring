import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, PillTabs } from '../components/ui';
import { devicePath, useApiValue } from '../lib/api';
import { useSharedNurseryLive } from '../lib/NurseryLiveContext';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

function normalizePoints(raw, field, range) {
  if (!raw || typeof raw !== 'object') return [];
  const points = Object.values(raw)
    .filter((x) => {
      if (!x || typeof x !== 'object') return false;
      if (typeof x.tsMs !== 'number') return false;
      if (typeof x[field] !== 'number') return false;
      if (range?.startMs != null && x.tsMs < range.startMs) return false;
      if (range?.endMs != null && x.tsMs > range.endMs) return false;
      return true;
    })
    .sort((a, b) => a.tsMs - b.tsMs);

  const capped = points.length > 220 ? points.slice(points.length - 220) : points;
  const spanMs =
    typeof capped[0]?.tsMs === 'number' && typeof capped[capped.length - 1]?.tsMs === 'number'
      ? capped[capped.length - 1].tsMs - capped[0].tsMs
      : null;
  const showDate = spanMs != null && spanMs > 20 * 60 * 60 * 1000;
  const labelEvery = Math.max(1, Math.ceil(capped.length / 5));
  const pad2 = (n) => String(n).padStart(2, '0');
  const tickLabel = (ms) => {
    const d = new Date(ms);
    return showDate
      ? `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
      : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  return capped.map((p, i) => {
    const label = i % labelEvery === 0 ? tickLabel(p.tsMs) : '';
    return {
      value: p[field],
      label,
      ...(label ? { labelTextStyle: { fontSize: 10, color: palette.subtextLight } } : {}),
    };
  });
}

function chartMax(data, floor) {
  if (!data.length) return floor;
  const m = Math.max(...data.map((p) => p.value));
  return Math.max(floor, Math.ceil(m * 1.05) || floor);
}

function parseLocalDateTime(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] != null ? Number(m[4]) : 0;
  const min = m[5] != null ? Number(m[5]) : 0;
  const d = new Date(year, month - 1, day, hour, min, 0, 0);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function fmtLocal(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const METRICS = {
  co2: { field: 'co2ppm', title: 'CO₂', unit: 'ppm', floor: 800, color: palette.forestGreen },
  humidity: { field: 'humPct', title: 'Humidity', unit: '%', floor: 100, color: '#2F7BD1' },
  temperature: { field: 'tempC', title: 'Temperature', unit: '°C', floor: 35, color: '#C45C26' },
};

export default function HistoryScreen({ deviceId }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const history = useApiValue(deviceId ? devicePath(deviceId, 'history24h') : null, { intervalMs: 15000 });
  const { derived } = useSharedNurseryLive();

  const [metric, setMetric] = useState('co2');
  const [preset, setPreset] = useState('24h');
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');

  const range = useMemo(() => {
    const now = Date.now();
    if (preset === '1h') return { startMs: now - 1 * 60 * 60 * 1000, endMs: now };
    if (preset === '6h') return { startMs: now - 6 * 60 * 60 * 1000, endMs: now };
    if (preset === '12h') return { startMs: now - 12 * 60 * 60 * 1000, endMs: now };
    if (preset === '24h') return { startMs: now - 24 * 60 * 60 * 1000, endMs: now };
    if (preset === '7d') return { startMs: now - 7 * 24 * 60 * 60 * 1000, endMs: now };
    return { startMs: parseLocalDateTime(startText), endMs: parseLocalDateTime(endText) };
  }, [preset, startText, endText]);

  const spec = METRICS[metric];
  const data = useMemo(
    () => normalizePoints(history.value, spec.field, range),
    [history.value, spec.field, range]
  );
  const maxValue = useMemo(
    () => (metric === 'humidity' ? 100 : chartMax(data, spec.floor)),
    [data, metric, spec.floor]
  );
  const latest = data.length ? data[data.length - 1].value : null;
  const chartWidth = Math.max(220, Math.floor(windowWidth - 20 * 2 - 16 * 2));

  const inRangeNote = (() => {
    if (metric === 'co2') {
      return derived.co2Status === 'good'
        ? 'CO₂ levels are stable and within the target range.'
        : `Target ${derived.co2Lo}–${derived.co2Hi} ppm.`;
    }
    if (metric === 'humidity') {
      return derived.humStatus === 'good'
        ? 'Humidity is stable and within the target range.'
        : `Target ${derived.humLo.toFixed(0)}–${derived.humHi.toFixed(0)} %.`;
    }
    return derived.tempStatus === 'good'
      ? 'Temperature is stable and within the target range.'
      : `Target ${derived.tempLo.toFixed(0)}–${derived.tempHi.toFixed(0)} °C.`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppHeader title="Environmental Charts" />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <PillTabs
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'co2', label: 'CO₂' },
            { value: 'humidity', label: 'Humidity' },
            { value: 'temperature', label: 'Temperature' },
          ]}
        />
        <PillTabs
          value={preset}
          onChange={(k) => {
            setPreset(k);
            if (k !== 'custom') {
              setStartText('');
              setEndText('');
            } else {
              const now = Date.now();
              setEndText(fmtLocal(now));
              setStartText(fmtLocal(now - 6 * 60 * 60 * 1000));
            }
          }}
          options={[
            { value: '1h', label: '1H' },
            { value: '6h', label: '6H' },
            { value: '12h', label: '12H' },
            { value: '24h', label: '24H' },
            { value: '7d', label: '7D' },
            { value: 'custom', label: 'Custom' },
          ]}
        />

        {preset === 'custom' && (
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <Text style={[styles.help, { color: t.sub }]}>Start</Text>
            <TextInput
              value={startText}
              onChangeText={setStartText}
              placeholder="2026-04-25 08:00"
              placeholderTextColor={t.placeholder}
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />
            <Text style={[styles.help, { color: t.sub, marginTop: 8 }]}>End</Text>
            <TextInput
              value={endText}
              onChangeText={setEndText}
              placeholder="2026-04-25 14:00"
              placeholderTextColor={t.placeholder}
              style={[styles.input, { color: t.text, borderColor: t.border }]}
            />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
          <View style={styles.chartHead}>
            <Text style={[styles.chartTitle, { color: t.text }]}>
              {spec.title} ({spec.unit})
            </Text>
            {latest != null && (
              <View style={styles.valueChip}>
                <Text style={styles.valueChipText}>
                  {metric === 'temperature' ? latest.toFixed(1) : Math.round(latest)} {spec.unit}
                </Text>
              </View>
            )}
          </View>

          {history.loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={palette.forestGreen} />
            </View>
          ) : data.length ? (
            <LineChart
              data={data}
              width={chartWidth}
              adjustToWidth
              disableScroll
              areaChart
              startFillColor={spec.color}
              endFillColor={t.surface}
              startOpacity={0.22}
              endOpacity={0.02}
              thickness={3}
              color={spec.color}
              hideDataPoints={data.length > 40}
              dataPointsColor={spec.color}
              dataPointsRadius={3}
              endSpacing={12}
              initialSpacing={6}
              yAxisColor="transparent"
              xAxisColor={t.border}
              yAxisTextStyle={{ color: t.sub, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: t.sub, fontSize: 10 }}
              xAxisTextNumberOfLines={2}
              xAxisLabelsHeight={32}
              rulesColor={t.border}
              rulesType="solid"
              backgroundColor={t.surface}
              noOfSections={4}
              maxValue={maxValue}
            />
          ) : (
            <Text style={{ color: t.sub, fontSize: 13, marginTop: 8 }}>No points in this range yet.</Text>
          )}
        </View>

        <View style={[styles.note, { backgroundColor: t.mint }]}>
          <Text style={{ fontSize: 16, color: palette.forestGreen }}>🌿</Text>
          <Text style={[styles.noteText, { color: t.sub }]}>{inRangeNote}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 14 },
  card: { borderRadius: 22, padding: 16, overflow: 'hidden' },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chartTitle: { fontSize: 15, fontWeight: '800' },
  valueChip: {
    backgroundColor: palette.mintStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  valueChipText: { color: palette.forestDeep, fontWeight: '800', fontSize: 12 },
  help: { fontSize: 12, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
