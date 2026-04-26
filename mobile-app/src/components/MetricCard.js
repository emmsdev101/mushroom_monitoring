import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { palette } from '../theme/palette';

export default function MetricCard({ title, value, unit, status = 'good', subtitle }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const color = status === 'bad' ? palette.bad : status === 'warn' ? palette.warn : palette.good;
  const bg = isDark ? palette.surfaceDark : palette.surfaceLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: sub }]}>{title}</Text>
        <View style={[styles.pill, { backgroundColor: color }]} />
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: text }]}>{value ?? '--'}</Text>
        {!!unit && <Text style={[styles.unit, { color: sub }]}>{unit}</Text>}
      </View>
      {!!subtitle && <Text style={[styles.subtitle, { color: sub }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '600' },
  pill: { width: 10, height: 10, borderRadius: 5 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  value: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  unit: { marginLeft: 6, marginBottom: 6, fontSize: 14, fontWeight: '600' },
  subtitle: { marginTop: 6, fontSize: 12 },
});

