import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MetricCard from '../components/MetricCard';
import StatusCard from '../components/StatusCard';
import { AppHeader, HeaderIcon, navigateRoot } from '../components/ui';
import { useSharedNurseryLive } from '../lib/NurseryLiveContext';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

const HERO = require('../../assets/hero-mushrooms.png');

export default function HomeScreen({ deviceId, unreadCount = 0 }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { derived, loading } = useSharedNurseryLive();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={palette.forestGreen} />
        <Text style={{ color: t.sub, marginTop: 8 }}>Loading live data…</Text>
      </View>
    );
  }

  const climateStatus = derived.anyBad ? 'bad' : derived.allGood ? 'good' : 'warn';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppHeader
        brand
        right={
          <>
            <HeaderIcon
              name="notifications-outline"
              badge={unreadCount > 0}
              onPress={() => navigateRoot(navigation, 'Alerts')}
            />
            <HeaderIcon name="settings-outline" onPress={() => navigation.navigate('Settings')} />
          </>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <StatusCard
          online={derived.online}
          lastSeenText={derived.lastSeenText}
          allGood={derived.allGood}
          anyBad={derived.anyBad}
        />

        {derived.anyManual ? (
          <Text style={[styles.overrideNote, { color: t.sub }]}>
            Manual override is on — fans will not follow the target ranges until you turn override off.
          </Text>
        ) : null}

        <Text style={[styles.section, { color: t.text }]}>Current Conditions</Text>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <MetricCard
              title="CO₂"
              icon="co2"
              value={derived.co2ppm != null ? derived.co2ppm.toFixed(0) : null}
              unit="ppm"
              status={derived.co2Status}
              subtitle={`Target: ${derived.co2Lo} – ${derived.co2Hi} ppm`}
            />
            <MetricCard
              title="Humidity"
              icon="humidity"
              value={derived.humPct != null ? derived.humPct.toFixed(0) : null}
              unit="%"
              status={derived.humStatus}
              subtitle={`Target: ${derived.humLo.toFixed(0)} – ${derived.humHi.toFixed(0)} %`}
            />
          </View>
          <View style={styles.gridRow}>
            <MetricCard
              title="Temperature"
              icon="temperature"
              value={derived.tempC != null ? derived.tempC.toFixed(1) : null}
              unit="°C"
              status={derived.tempStatus}
              subtitle={`Target: ${derived.tempLo.toFixed(0)} – ${derived.tempHi.toFixed(0)} °C`}
            />
            <MetricCard
              title="Climate"
              icon="climate"
              value={derived.anyBad ? 'Check' : derived.allGood ? 'Stable' : 'Watch'}
              status={climateStatus}
              subtitle={derived.allGood ? 'Growing well' : 'Keep an eye on targets'}
            />
          </View>
        </View>

        <View style={[styles.trend, { backgroundColor: t.mint }]}>
          <View style={[styles.trendIcon, { backgroundColor: t.surface }]}>
            <Ionicons name="leaf" size={18} color={palette.forestGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.trendTitle, { color: t.text }]}>Environment Trend</Text>
            <Text style={[styles.trendSub, { color: t.sub }]}>
              {derived.allGood
                ? 'Conditions are stable for the last 24 hours.'
                : derived.anyBad
                  ? 'One or more readings are outside the target range.'
                  : 'Readings are near the edge of the target range.'}
            </Text>
          </View>
        </View>

        <View style={[styles.heroWrap, cardShadow(t.isDark)]}>
          <Image source={HERO} style={styles.hero} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 14 },
  overrideNote: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  section: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 14,
  },
  trendIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendTitle: { fontSize: 15, fontWeight: '800' },
  trendSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  heroWrap: { height: 148, borderRadius: 22, overflow: 'hidden' },
  hero: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
