import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';
import { useColorScheme } from 'react-native';

export default function StatusCard({ online, lastSeenText, fanOn }) {
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
        <View style={{ flex: 1 }} />
        <Text style={[styles.value, { color: text }]}>{fanOn ? 'Fan: ON' : 'Fan: OFF'}</Text>
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
  value: { fontSize: 14, fontWeight: '700' },
  sub: { marginTop: 6, fontSize: 12 },
});

