import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { apiPut, devicePath } from '../lib/api';
import { FEATURES } from '../lib/features';
import { palette } from '../theme/palette';

const ROWS = [
  {
    key: 'exhaust',
    label: 'Exhaust',
    liveKey: 'fanOn',
    overrideKey: 'manualOverride',
    onKey: 'manualFanOn',
  },
  {
    key: 'intake',
    label: 'Intake',
    liveKey: 'intakeFanOn',
    overrideKey: 'manualIntakeFanOverride',
    onKey: 'manualIntakeFanOn',
  },
  {
    key: 'sprinkler',
    label: 'Sprinkler',
    liveKey: 'sprinklerOn',
    overrideKey: 'manualSprinklerOverride',
    onKey: 'manualSprinklerOn',
  },
  {
    key: 'heater',
    label: 'Heater',
    liveKey: 'heaterOn',
    overrideKey: 'manualHeaterOverride',
    onKey: 'manualHeaterOn',
  },
];

export default function OverridePanel({ deviceId, control, live, onSaved }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? palette.surfaceDark : palette.surfaceLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  const [pending, setPending] = useState({});

  const merged = useMemo(() => ({ ...(control || {}), ...pending }), [control, pending]);

  const persist = useCallback(
    async (key, patch) => {
      if (!deviceId) return;
      setPending((prev) => ({ ...prev, ...patch }));
      try {
        await apiPut(devicePath(deviceId, 'control'), patch);
        onSaved?.();
      } catch (e) {
        setPending((prev) => {
          const next = { ...prev };
          Object.keys(patch).forEach((k) => delete next[k]);
          return next;
        });
        Alert.alert('Override failed', String(e?.message || e));
      }
    },
    [deviceId, onSaved]
  );

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.title, { color: text }]}>Manual override</Text>
      <Text style={[styles.help, { color: sub }]}>
        Manual = you control it. Auto = sensors decide. Changes save immediately.
      </Text>

      {ROWS.filter((row) => row.key !== 'heater' || FEATURES.heater).map((row, i) => {
        const manual = !!merged[row.overrideKey];
        const forcedOn = !!merged[row.onKey];
        const liveOn = !!(live && live[row.liveKey]);
        const shownOn = manual ? forcedOn : liveOn;
        return (
          <View
            key={row.key}
            style={[
              styles.row,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border } : null,
            ]}
          >
            <View style={styles.nameCol}>
              <Text style={[styles.label, { color: text }]}>{row.label}</Text>
              <Text style={[styles.mode, { color: shownOn ? palette.forestGreen : sub }]}>
                {manual ? 'Manual' : 'Auto'} · {shownOn ? 'ON' : 'OFF'}
              </Text>
            </View>
            <View style={styles.switchCol}>
              <Text style={[styles.switchCap, { color: sub }]}>Manual</Text>
              <Switch
                value={manual}
                onValueChange={(v) =>
                  persist(row.key, { [row.overrideKey]: v, [row.onKey]: v ? forcedOn : false })
                }
                thumbColor={palette.forestGreen}
              />
            </View>
            <View style={[styles.switchCol, { opacity: manual ? 1 : 0.4 }]}>
              <Text style={[styles.switchCap, { color: sub }]}>On</Text>
              <Switch
                value={shownOn}
                disabled={!manual}
                onValueChange={(v) => persist(row.key, { [row.overrideKey]: true, [row.onKey]: v })}
                thumbColor={palette.forestGreen}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  title: { fontSize: 16, fontWeight: '800' },
  help: { fontSize: 12, marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  nameCol: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700' },
  mode: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  switchCol: { alignItems: 'center', width: 64 },
  switchCap: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
});
