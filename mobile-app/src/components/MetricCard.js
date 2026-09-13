import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { statusLabel } from '../lib/status';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

const ICONS = {
  co2: 'cloud-outline',
  humidity: 'water-outline',
  temperature: 'thermometer-outline',
  climate: 'leaf-outline',
};

export default function MetricCard({
  title,
  value,
  unit,
  status = 'good',
  subtitle,
  icon = 'co2',
}) {
  const t = useTheme();
  const color = status === 'bad' ? palette.bad : status === 'warn' ? palette.warn : palette.good;

  return (
    <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
      <View style={styles.top}>
        <View style={[styles.iconBox, { backgroundColor: t.mint }]}>
          <Ionicons name={ICONS[icon] || 'ellipse-outline'} size={18} color={palette.forestGreen} />
        </View>
        <Text style={[styles.title, { color: t.sub }]}>{title}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: t.text }]}>{value ?? '--'}</Text>
        {!!unit && <Text style={[styles.unit, { color: t.sub }]}>{unit}</Text>}
      </View>
      {!!subtitle && (
        <Text style={[styles.subtitle, { color: t.sub }]} numberOfLines={2}>
          {subtitle}
        </Text>
      )}
      <Text style={[styles.status, { color }]}>{statusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '700' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12, gap: 4 },
  value: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  unit: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  subtitle: { marginTop: 4, fontSize: 11, lineHeight: 15 },
  status: { marginTop: 8, fontSize: 12, fontWeight: '800' },
});
