import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/ui';
import { devicePath, useApiValue } from '../lib/api';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

function fmt(ms) {
  const d = new Date(ms);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}, ${time}`;
}

function toneFor(alert) {
  const hay = `${alert?.title || ''} ${alert?.type || ''} ${alert?.body || ''}`.toLowerCase();
  if (hay.includes('hum')) return { color: palette.info, icon: 'water' };
  if (hay.includes('heat') || hay.includes('temp')) return { color: palette.bad, icon: 'flame' };
  if (hay.includes('exhaust') || hay.includes('co2') || hay.includes('fan')) {
    return { color: palette.warn, icon: 'exit-outline' };
  }
  if (hay.includes('normal') || hay.includes('stable') || hay.includes('ok')) {
    return { color: palette.good, icon: 'checkmark' };
  }
  return { color: palette.forestGreen, icon: 'notifications' };
}

export default function NotificationsScreen({
  deviceId,
  unreadCount = 0,
  readKeys = {},
  markRead,
  markAllRead,
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const alerts = useApiValue(deviceId ? devicePath(deviceId, 'alerts') : null, { intervalMs: 8000 });
  const [inbox, setInbox] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const subRecv = Notifications.addNotificationReceivedListener((n) => {
      const content = n?.request?.content || {};
      const when = Date.now();
      setInbox((prev) =>
        [
          {
            tsMs: when,
            title: typeof content.title === 'string' ? content.title : 'Notification',
            body: typeof content.body === 'string' ? content.body : '',
            data: content.data || {},
            source: 'notification',
          },
          ...prev,
        ].slice(0, 25)
      );
    });
    return () => subRecv.remove();
  }, []);

  const items = useMemo(() => {
    const v = alerts.value;
    if (!v || typeof v !== 'object') return [];
    return Object.entries(v)
      .map(([key, val]) => ({ key, ...(val || {}) }))
      .filter((x) => x && typeof x === 'object' && typeof x.tsMs === 'number')
      .sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, 50);
  }, [alerts.value]);

  const merged = useMemo(() => {
    const combined = [...inbox, ...items].filter((x) => x && typeof x.tsMs === 'number');
    combined.sort((a, b) => a.tsMs - b.tsMs).reverse();
    const out = [];
    const seen = new Set();
    for (const a of combined) {
      const key = `${Math.floor(a.tsMs / 5000)}|${a.title || ''}|${a.body || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
      if (out.length >= 60) break;
    }
    return out;
  }, [inbox, items]);

  const expoGoAndroidRemotePushDisabled =
    Constants.appOwnership === 'expo' && (Constants.platform?.android || false);

  async function testLocalNotification() {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Test notification', body: `Device ${deviceId}`, sound: 'default' },
      trigger: null,
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppHeader title="Alerts" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.unread, { backgroundColor: t.mint }]}>
          <Text style={[styles.unreadText, { color: t.text }]}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
          {unreadCount > 0 && (
            <Pressable onPress={markAllRead}>
              <Text style={{ color: palette.forestGreen, fontWeight: '800' }}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {expoGoAndroidRemotePushDisabled && (
          <Pressable onPress={testLocalNotification} style={[styles.note, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <Text style={{ color: t.sub, fontSize: 12 }}>
              Remote push doesn’t work in Expo Go on Android. Tap to send a local test notification.
            </Text>
          </Pressable>
        )}

        {alerts.loading && !merged.length ? (
          <Text style={{ color: t.sub }}>Loading…</Text>
        ) : merged.length ? (
          merged.map((a, idx) => {
            const isServerAlert = typeof a.key === 'string' && a.key.length > 0;
            const isUnread = isServerAlert && !(readKeys && readKeys[a.key]);
            const tone = toneFor(a);
            return (
              <Pressable
                key={`${a.key || 'inbox'}-${idx}`}
                onPress={async () => {
                  setSelected(a);
                  if (isServerAlert && typeof markRead === 'function') await markRead(a.key);
                }}
                style={[styles.row, { backgroundColor: t.surface }, cardShadow(t.isDark)]}
              >
                <View style={[styles.icon, { backgroundColor: tone.color }]}>
                  <Ionicons name={tone.icon} size={18} color="white" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
                      {a.title || 'Alert'}
                    </Text>
                    <Text style={[styles.when, { color: t.sub }]}>{fmt(a.tsMs)}</Text>
                  </View>
                  {!!a.body && (
                    <Text style={[styles.body, { color: t.sub }]} numberOfLines={2}>
                      {a.body}
                    </Text>
                  )}
                  {isUnread && <Text style={styles.unreadTag}>Unread</Text>}
                </View>
              </Pressable>
            );
          })
        ) : (
          <Text style={{ color: t.sub, fontSize: 13 }}>No alerts yet.</Text>
        )}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.surface }]} onPress={() => {}}>
            <Text style={{ color: t.sub, fontSize: 12 }}>{selected?.tsMs ? fmt(selected.tsMs) : ''}</Text>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>
              {selected?.title || 'Alert'}
            </Text>
            {!!selected?.body && (
              <Text style={{ color: t.sub, fontSize: 13, marginTop: 6 }}>{selected.body}</Text>
            )}
            <Pressable
              onPress={() => setSelected(null)}
              style={{ marginTop: 16, alignSelf: 'flex-end', backgroundColor: palette.forestGreen, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 10 },
  unread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 12,
  },
  unreadText: { fontWeight: '800' },
  note: { borderRadius: 16, padding: 14 },
  row: { flexDirection: 'row', gap: 12, borderRadius: 18, padding: 14, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '800' },
  when: { fontSize: 11, fontWeight: '600' },
  body: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  unreadTag: { color: palette.forestGreen, fontSize: 12, fontWeight: '800', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 16, justifyContent: 'center' },
  modalCard: { borderRadius: 18, padding: 16 },
});
