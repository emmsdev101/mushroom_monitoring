import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

export default function StatusCard({ online, lastSeenText, allGood, anyBad }) {
  const t = useTheme();
  const bg = online ? palette.forestBanner : t.isDark ? '#3A1A1A' : '#5C2A2A';
  const title = online ? 'System Online' : 'System Offline';
  const subtitle = !online
    ? lastSeenText
    : anyBad
      ? 'Some conditions need attention'
      : allGood
        ? 'All conditions are normal'
        : 'Conditions are close to the target range';

  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={online ? 'wifi' : 'cloud-offline'} size={18} color="white" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      <Ionicons name={online ? 'radio' : 'alert-circle'} size={18} color="rgba(255,255,255,0.85)" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...cardShadow(false),
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: 'white', fontSize: 16, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2 },
});
