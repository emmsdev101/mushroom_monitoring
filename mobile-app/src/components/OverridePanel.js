import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { apiPut, devicePath } from '../lib/api';
import { FEATURES } from '../lib/features';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

const ROWS = [
  {
    key: 'intake',
    label: 'Intake Fan',
    icon: 'enter-outline',
    liveKey: 'intakeFanOn',
    overrideKey: 'manualIntakeFanOverride',
    onKey: 'manualIntakeFanOn',
  },
  {
    key: 'exhaust',
    label: 'Exhaust Fan',
    icon: 'exit-outline',
    liveKey: 'fanOn',
    overrideKey: 'manualOverride',
    onKey: 'manualFanOn',
  },
  {
    key: 'sprinkler',
    label: 'Mister',
    icon: 'water-outline',
    liveKey: 'sprinklerOn',
    overrideKey: 'manualSprinklerOverride',
    onKey: 'manualSprinklerOn',
  },
  {
    key: 'heater',
    label: 'Heater',
    icon: 'flame-outline',
    liveKey: 'heaterOn',
    overrideKey: 'manualHeaterOverride',
    onKey: 'manualHeaterOn',
  },
];

function detailFor(row, control) {
  if (row.key === 'sprinkler') {
    const on = typeof control?.sprinklerMaxOnSec === 'number' ? control.sprinklerMaxOnSec : 60;
    const off = typeof control?.sprinklerMinOffSec === 'number' ? control.sprinklerMinOffSec : 300;
    return `Duration: ${on}s / ${Math.round(off / 60)}min`;
  }
  if (row.key === 'heater') {
    const temp = typeof control?.heaterOnTempC === 'number' ? control.heaterOnTempC : 21;
    return `Temperature: ${temp} °C`;
  }
  return null;
}

export default function OverridePanel({ deviceId, control, live, onSaved, compact = false }) {
  const t = useTheme();
  const [pending, setPending] = useState({});
  const merged = useMemo(() => ({ ...(control || {}), ...pending }), [control, pending]);

  const persist = useCallback(
    async (patch) => {
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

  const rows = ROWS.filter((row) => row.key !== 'heater' || FEATURES.heater);

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const manual = !!merged[row.overrideKey];
        const forcedOn = !!merged[row.onKey];
        const liveOn = !!(live && live[row.liveKey]);
        const shownOn = manual ? forcedOn : liveOn;
        const extra = detailFor(row, merged);
        return (
          <View key={row.key} style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <View style={[styles.iconCircle, { backgroundColor: t.mint }]}>
              <Ionicons name={row.icon} size={22} color={palette.forestGreen} />
            </View>
            <View style={styles.body}>
              <Text style={[styles.label, { color: t.text }]}>{row.label}</Text>
              <Text style={[styles.meta, { color: t.sub }]}>
                {shownOn ? 'ON' : 'OFF'}
                {extra ? `  ·  ${extra}` : ''}
              </Text>
              {!compact && (
                <Pressable
                  onPress={() => persist({ [row.overrideKey]: !manual, [row.onKey]: !manual ? forcedOn : false })}
                  style={styles.overrideRow}
                >
                  <Text style={[styles.overrideLabel, { color: t.sub }]}>Override</Text>
                  <View
                    style={[
                      styles.overridePill,
                      { backgroundColor: manual ? palette.forestGreen : t.mint },
                    ]}
                  >
                    <Text style={[styles.overridePillText, { color: manual ? 'white' : t.sub }]}>
                      {manual ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
            <Switch
              value={shownOn}
              disabled={!manual}
              onValueChange={(v) => persist({ [row.overrideKey]: true, [row.onKey]: v })}
              trackColor={{ false: t.isDark ? '#3A4440' : '#D5DDD8', true: palette.mintStrong }}
              thumbColor={shownOn ? palette.forestGreen : '#f4f4f4'}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    padding: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  label: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  overrideLabel: { fontSize: 12, fontWeight: '700' },
  overridePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  overridePillText: { fontSize: 11, fontWeight: '800' },
});
