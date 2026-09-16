import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OverridePanel from '../components/OverridePanel';
import { AppHeader, SegmentedControl } from '../components/ui';
import { FEATURES } from '../lib/features';
import { useSharedNurseryLive } from '../lib/NurseryLiveContext';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

const ACTUATORS = [
  { key: 'intake', label: 'Intake Fan', icon: 'enter-outline', liveKey: 'intakeFanOn' },
  { key: 'exhaust', label: 'Exhaust Fan', icon: 'exit-outline', liveKey: 'fanOn' },
  { key: 'mister', label: 'Mister', icon: 'water-outline', liveKey: 'sprinklerOn' },
  { key: 'heater', label: 'Heater', icon: 'flame-outline', liveKey: 'heaterOn' },
];

export default function ControlScreen({ deviceId }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { derived, control, loading, refreshControl } = useSharedNurseryLive();
  const [tab, setTab] = useState(derived.anyManual ? 'manual' : 'auto');

  const actuators = useMemo(
    () => ACTUATORS.filter((a) => a.key !== 'heater' || FEATURES.heater),
    []
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={palette.forestGreen} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppHeader title="Condition Control" />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'manual', label: 'Manual' },
          ]}
        />

        {tab === 'auto' ? (
          <>
            <View style={[styles.info, { backgroundColor: t.mint }]}>
              <View style={styles.infoHead}>
                <Text style={[styles.infoTitle, { color: t.text }]}>Automatic Control</Text>
                <View style={styles.autoBadge}>
                  <Text style={styles.autoBadgeText}>AUTO</Text>
                </View>
              </View>
              <Text style={[styles.infoBody, { color: t.sub }]}>
                {derived.anyManual
                  ? 'Some devices are still in override. Switch to Manual to change them, or return each one to auto.'
                  : FEATURES.heater
                    ? 'System is running in automatic mode. Fans, mister, and heater follow the target ranges.'
                    : 'System is running in automatic mode. Fans and mister follow the target ranges.'}
              </Text>
            </View>

            <View style={styles.actRow}>
              {actuators.map((a) => {
                const on = !!derived[a.liveKey];
                return (
                  <View key={a.key} style={[styles.actCard, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
                    <View style={[styles.actIcon, { backgroundColor: t.mint }]}>
                      <Ionicons name={a.icon} size={20} color={palette.forestGreen} />
                    </View>
                    <Text style={[styles.actLabel, { color: t.sub }]} numberOfLines={1}>
                      {a.label.replace(' Fan', '')}
                    </Text>
                    <Text style={[styles.actState, { color: on ? palette.forestGreen : t.sub }]}>
                      {on ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={[styles.info, { backgroundColor: t.mint }]}>
              <Text style={[styles.infoTitle, { color: t.text }]}>Manual Mode</Text>
              <Text style={[styles.infoBody, { color: t.sub }]}>
                You can override each device individually. Changes are temporary and will stay until
                override is disabled.
              </Text>
            </View>
            <OverridePanel
              deviceId={deviceId}
              control={control.value}
              live={{
                fanOn: derived.fanOn,
                intakeFanOn: derived.intakeFanOn,
                sprinklerOn: derived.sprinklerOn,
                heaterOn: derived.heaterOn,
              }}
              onSaved={refreshControl}
            />
            {derived.anyManual ? (
              <Pressable
                onPress={() => setTab('auto')}
                style={[styles.hintBtn, { borderColor: t.border }]}
              >
                <Text style={{ color: t.sub, fontWeight: '700' }}>View automatic status</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  info: { borderRadius: 18, padding: 14, gap: 6 },
  infoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoTitle: { fontSize: 16, fontWeight: '800' },
  infoBody: { fontSize: 13, lineHeight: 18 },
  autoBadge: {
    backgroundColor: palette.forestDeep,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  autoBadgeText: { color: 'white', fontSize: 11, fontWeight: '800' },
  actRow: { flexDirection: 'row', gap: 8 },
  actCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 6,
  },
  actIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actLabel: { fontSize: 11, fontWeight: '700' },
  actState: { fontSize: 12, fontWeight: '800' },
  hintBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
});
