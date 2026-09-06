import { StyleSheet, Text, View } from 'react-native';
import { FEATURES } from '../lib/features';
import { palette } from '../theme/palette';
import { useColorScheme } from 'react-native';

function ActuatorPill({ label, on, isDark }) {
  const bg = on ? palette.forestGreen : isDark ? 'rgba(231,239,233,0.10)' : 'rgba(17,24,21,0.06)';
  const fg = on ? 'white' : isDark ? palette.subtextDark : palette.subtextLight;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>
        {label}: {on ? 'ON' : 'OFF'}
      </Text>
    </View>
  );
}

export default function StatusCard({
  online,
  lastSeenText,
  fanOn,
  intakeFanOn,
  sprinklerOn,
  heaterOn,
  control,
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const dotColor = online ? palette.good : palette.bad;
  const bg = isDark ? palette.surfaceDark : palette.surfaceLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.label, { color: text }]}>{online ? 'Online' : 'Offline'}</Text>
      </View>
      <View style={styles.pillRow}>
        <ActuatorPill
          label="Exhaust"
          on={control?.manualOverride ? !!control.manualFanOn : !!fanOn}
          isDark={isDark}
        />
        <ActuatorPill
          label="Intake"
          on={control?.manualIntakeFanOverride ? !!control.manualIntakeFanOn : !!intakeFanOn}
          isDark={isDark}
        />
        <ActuatorPill
          label="Sprinkler"
          on={control?.manualSprinklerOverride ? !!control.manualSprinklerOn : !!sprinklerOn}
          isDark={isDark}
        />
        {FEATURES.heater ? (
          <ActuatorPill
            label="Heater"
            on={control?.manualHeaterOverride ? !!control.manualHeaterOn : !!heaterOn}
            isDark={isDark}
          />
        ) : null}
      </View>
      <Text style={[styles.sub, { color: sub }]}>{lastSeenText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  label: { fontSize: 16, fontWeight: '700' },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '700' },
  sub: { marginTop: 8, fontSize: 12 },
});

