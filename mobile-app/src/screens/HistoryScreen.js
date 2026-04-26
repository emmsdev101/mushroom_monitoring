import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { devicePath, useRtdbValue } from '../lib/rtdb';
import { palette } from '../theme/palette';

/**
 * @param {unknown} raw
 * @param {'co2ppm' | 'tempC' | 'humPct'} field
 * @param {{ startMs: number | null, endMs: number | null }} range
 */
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

  // For performance on low-end phones, cap displayed points.
  const capped = points.length > 220 ? points.slice(points.length - 220) : points;

  const spanMs =
    (typeof capped[0]?.tsMs === 'number' && typeof capped[capped.length - 1]?.tsMs === 'number')
      ? capped[capped.length - 1].tsMs - capped[0].tsMs
      : null;
  const showDate = spanMs != null && spanMs > 20 * 60 * 60 * 1000; // > ~20h

  const labelEvery = Math.max(1, Math.ceil(capped.length / 5)); // ~5 labels max
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
      dataPointText: '',
      label,
      ...(label ? { labelTextStyle: { fontSize: 10 } } : {}),
    };
  });
}

function chartMax(data, floor) {
  if (!data.length) return floor;
  const m = Math.max(...data.map((p) => p.value));
  return Math.max(floor, Math.ceil(m * 1.05) || floor);
}

function MiniChart({ title, data, color, surface, border, sub, maxValue, chartType, chartWidth }) {
  if (!data.length) {
    return (
      <View style={[styles.chartCard, { backgroundColor: surface, borderColor: border }]}>
        <Text style={[styles.chartTitle, { color: sub }]}>{title}</Text>
        <Text style={{ color: sub, fontSize: 12, marginTop: 8 }}>No points in this range yet.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chartCard, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.chartTitle, { color: sub }]}>{title}</Text>
      <View style={{ paddingRight: 10 }}>
        {chartType === 'bar' ? (
          <BarChart
            data={data}
            width={Math.max(180, chartWidth - 10)}
            barWidth={Math.max(4, Math.min(10, Math.floor(260 / data.length)))}
            spacing={Math.min(8, Math.max(2, 260 / data.length))}
            barBorderRadius={3}
            frontColor={color}
            yAxisColor={border}
            xAxisColor={border}
            yAxisTextStyle={{ color: sub, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: sub, fontSize: 10 }}
            xAxisTextNumberOfLines={2}
            xAxisLabelsHeight={36}
            noOfSections={4}
            maxValue={maxValue}
          />
        ) : (
          <LineChart
            data={data}
            width={Math.max(180, chartWidth - 10)}
            adjustToWidth
            disableScroll
            endSpacing={10}
            thickness={2}
            color={color}
            hideDataPoints
            spacing={Math.min(14, Math.max(4, 280 / data.length))}
            initialSpacing={0}
            yAxisColor={border}
            xAxisColor={border}
            yAxisTextStyle={{ color: sub, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: sub, fontSize: 10 }}
            xAxisTextNumberOfLines={2}
            xAxisLabelsHeight={36}
            backgroundColor={surface}
            noOfSections={4}
            maxValue={maxValue}
          />
        )}
      </View>
    </View>
  );
}

function parseLocalDateTime(s) {
  // Accept: YYYY-MM-DD or YYYY-MM-DD HH:MM
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
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function fmtLocal(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HistoryScreen({ deviceId }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const bg = isDark ? palette.bgDark : palette.bgLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const surface = isDark ? palette.surfaceDark : palette.surfaceLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  const history = useRtdbValue(devicePath(deviceId, 'history24h'));

  const [chartType, setChartType] = useState('line'); // 'line' | 'bar'
  const [preset, setPreset] = useState('24h'); // '1h' | '6h' | '24h' | 'custom'
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');

  const range = useMemo(() => {
    const now = Date.now();
    if (preset === '1h') return { startMs: now - 1 * 60 * 60 * 1000, endMs: now };
    if (preset === '6h') return { startMs: now - 6 * 60 * 60 * 1000, endMs: now };
    if (preset === '24h') return { startMs: now - 24 * 60 * 60 * 1000, endMs: now };
    const s = parseLocalDateTime(startText);
    const e = parseLocalDateTime(endText);
    return { startMs: s, endMs: e };
  }, [preset, startText, endText]);

  const co2Data = useMemo(() => normalizePoints(history.value, 'co2ppm', range), [history.value, range]);
  const tempData = useMemo(() => normalizePoints(history.value, 'tempC', range), [history.value, range]);
  const humData = useMemo(() => normalizePoints(history.value, 'humPct', range), [history.value, range]);

  const co2Max = useMemo(() => chartMax(co2Data, 800), [co2Data]);
  const tempMax = useMemo(() => chartMax(tempData, 35), [tempData]);
  const humMax = 100;

  // Screen padding (16) + chart card padding (14) on both sides.
  const chartWidth = Math.max(220, Math.floor(windowWidth - 16 * 2 - 14 * 2));

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.h1, { color: text }]}>History (24h)</Text>
      <Text style={[styles.p, { color: sub }]}>
        Choose a chart style and filter by time range. Data comes from `{devicePath(deviceId, 'history24h')}`.
      </Text>

      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <Text style={[styles.label, { color: sub }]}>Chart type</Text>
        <View style={styles.rowWrap}>
          <Pressable
            onPress={() => setChartType('line')}
            style={[styles.pillBtn, { borderColor: border, backgroundColor: chartType === 'line' ? palette.forestGreen : 'transparent' }]}
          >
            <Text style={{ color: chartType === 'line' ? 'white' : sub, fontWeight: '800' }}>Line</Text>
          </Pressable>
          <Pressable
            onPress={() => setChartType('bar')}
            style={[styles.pillBtn, { borderColor: border, backgroundColor: chartType === 'bar' ? palette.forestGreen : 'transparent' }]}
          >
            <Text style={{ color: chartType === 'bar' ? 'white' : sub, fontWeight: '800' }}>Bar</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: sub, marginTop: 10 }]}>Time filter</Text>
        <View style={styles.rowWrap}>
          {['1h', '6h', '24h', 'custom'].map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                setPreset(k);
                if (k !== 'custom') {
                  setStartText('');
                  setEndText('');
                } else {
                  // Fill a helpful default range when switching to custom
                  const now = Date.now();
                  setEndText(fmtLocal(now));
                  setStartText(fmtLocal(now - 6 * 60 * 60 * 1000));
                }
              }}
              style={[styles.pillBtn, { borderColor: border, backgroundColor: preset === k ? palette.forestGreen : 'transparent' }]}
            >
              <Text style={{ color: preset === k ? 'white' : sub, fontWeight: '800' }}>{k === 'custom' ? 'Custom' : `Last ${k}`}</Text>
            </Pressable>
          ))}
        </View>

        {preset === 'custom' && (
          <View style={{ marginTop: 10, gap: 10 }}>
            <View>
              <Text style={[styles.help, { color: sub }]}>Start (YYYY-MM-DD or YYYY-MM-DD HH:MM)</Text>
              <TextInput
                value={startText}
                onChangeText={setStartText}
                placeholder="2026-04-25 08:00"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View>
              <Text style={[styles.help, { color: sub }]}>End (YYYY-MM-DD or YYYY-MM-DD HH:MM)</Text>
              <TextInput
                value={endText}
                onChangeText={setEndText}
                placeholder="2026-04-25 14:00"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <Text style={[styles.help, { color: sub }]}>
              Tip: leave one end blank to filter “from” or “until” only.
            </Text>
          </View>
        )}
      </View>

      {history.loading ? (
        <View style={[styles.center, { backgroundColor: surface, borderColor: border }]}>
          <ActivityIndicator />
          <Text style={{ color: sub, fontSize: 12 }}>Loading…</Text>
        </View>
      ) : (
        <>
          <MiniChart
            title="CO₂ (ppm)"
            data={co2Data}
            color={palette.forestGreen}
            surface={surface}
            border={border}
            sub={sub}
            maxValue={co2Max}
            chartType={chartType}
            chartWidth={chartWidth}
          />
          <MiniChart
            title="Temperature (°C)"
            data={tempData}
            color="#2E7D9A"
            surface={surface}
            border={border}
            sub={sub}
            maxValue={tempMax}
            chartType={chartType}
            chartWidth={chartWidth}
          />
          <MiniChart
            title="Humidity (%)"
            data={humData}
            color="#6B8E7A"
            surface={surface}
            border={border}
            sub={sub}
            maxValue={humMax}
            chartType={chartType}
            chartWidth={chartWidth}
          />
          {!co2Data.length && !tempData.length && !humData.length && (
            <Text style={{ color: sub, fontSize: 12 }}>
              No data at `{devicePath(deviceId, 'history24h')}` yet. Once the ESP32 posts telemetry through the server,
              points appear here.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  p: { marginTop: -6, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  help: { fontSize: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pillBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 999 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
    borderWidth: 1,
    borderRadius: 14,
  },
  chartCard: { borderWidth: 1, borderRadius: 14, padding: 14, paddingBottom: 4, overflow: 'hidden' },
  chartTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
});
