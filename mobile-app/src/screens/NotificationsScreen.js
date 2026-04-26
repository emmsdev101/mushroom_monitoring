import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { devicePath, useRtdbValue } from '../lib/rtdb';
import { palette } from '../theme/palette';

function fmt(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}`;
}

export default function NotificationsScreen({
  deviceId,
  unreadCount = 0,
  readKeys = {},
  markRead,
  markAllRead,
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? palette.bgDark : palette.bgLight;
  const surface = isDark ? palette.surfaceDark : palette.surfaceLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  const alerts = useRtdbValue(devicePath(deviceId, 'alerts'));
  const [inbox, setInbox] = useState([]);

  useEffect(() => {
    // While the app is open: capture any notifications received (local or remote).
    const subRecv = Notifications.addNotificationReceivedListener((n) => {
      const content = n?.request?.content || {};
      const when = Date.now();
      setInbox((prev) => [
        {
          tsMs: when,
          title: typeof content.title === 'string' ? content.title : 'Notification',
          body: typeof content.body === 'string' ? content.body : '',
          data: content.data || {},
          source: 'notification',
        },
        ...prev,
      ].slice(0, 25));
    });
    return () => {
      subRecv.remove();
    };
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
    combined.sort((a, b) => b.tsMs - a.tsMs);
    // De-dupe by (title+body+ts bucket) so server+push don't show twice.
    const out = [];
    const seen = new Set();
    for (const a of combined) {
      const t = String(a.title || '');
      const b = String(a.body || '');
      const bucket = Math.floor(a.tsMs / 5000); // 5s bucket
      const key = `${bucket}|${t}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
      if (out.length >= 60) break;
    }
    return out;
  }, [inbox, items]);

  const expoGoAndroidRemotePushDisabled =
    Constants.appOwnership === 'expo' && (Constants.platform?.android || false);

  const [selected, setSelected] = useState(null);

  async function testLocalNotification() {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test notification',
        body: `Device ${deviceId}`,
        sound: 'default',
      },
      trigger: null,
    });
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.h1, { color: text }]}>Notifications</Text>
      <Text style={[styles.p, { color: sub }]}>
        Device: {deviceId}. Alerts are created by the server when thresholds are reached and stored at `{devicePath(deviceId, 'alerts')}`.
      </Text>

      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.label, { color: text }]}>Unread</Text>
          <Text style={{ color: text, fontWeight: '900' }}>{unreadCount}</Text>
        </View>
        <Pressable
          onPress={typeof markAllRead === 'function' ? markAllRead : undefined}
          style={[styles.btn, { backgroundColor: unreadCount > 0 ? palette.forestGreen : 'rgba(127,127,127,0.35)' }]}
          disabled={unreadCount <= 0 || typeof markAllRead !== 'function'}
        >
          <Text style={styles.btnText}>Mark all as read</Text>
        </Pressable>
        <Text style={[styles.help, { color: sub }]}>
          Unread count is based on the last time you marked alerts as read on this device id.
        </Text>
      </View>

      {expoGoAndroidRemotePushDisabled && (
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: text }]}>Expo Go limitation</Text>
          <Text style={[styles.help, { color: sub }]}>
            Remote push notifications don’t work in Expo Go on Android (SDK 53+). Use a Development Build to receive
            remote pushes. This screen will still show server alert history.
          </Text>
          <Pressable onPress={testLocalNotification} style={[styles.btn, { backgroundColor: palette.forestGreen }]}>
            <Text style={styles.btnText}>Send test local notification</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <Text style={[styles.label, { color: text }]}>Recent alerts</Text>
        {!!alerts.error && (
          <Text style={[styles.help, { color: sub }]}>
            Read error: {String(alerts.error?.message || alerts.error)}
          </Text>
        )}
        {alerts.loading ? (
          <Text style={[styles.help, { color: sub }]}>Loading…</Text>
        ) : merged.length ? (
          merged.map((a, idx) => {
            const isServerAlert = typeof a.key === 'string' && a.key.length > 0;
            const isUnread = isServerAlert && !(readKeys && readKeys[a.key]);
            return (
              <Pressable
                key={`${a.key || 'inbox'}-${idx}`}
                onPress={async () => {
                  setSelected(a);
                  if (isServerAlert && typeof markRead === 'function') {
                    await markRead(a.key);
                  }
                }}
                style={[
                  styles.alertRow,
                  {
                    borderColor: border,
                    backgroundColor: isUnread ? (isDark ? 'rgba(48, 196, 122, 0.12)' : 'rgba(25, 140, 85, 0.08)') : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: sub, fontSize: 12 }}>{fmt(a.tsMs)}</Text>
                <Text style={{ color: text, fontSize: 14, fontWeight: '800' }}>{a.title || 'Alert'}</Text>
                <Text style={{ color: sub, fontSize: 12 }}>{a.body || ''}</Text>
                {isUnread && <Text style={{ color: palette.forestGreen, fontSize: 12, fontWeight: '900' }}>Unread</Text>}
              </Pressable>
            );
          })
        ) : (
          <Text style={[styles.help, { color: sub }]}>No alerts yet. Lower a threshold in Settings to test.</Text>
        )}
      </View>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: surface, borderColor: border }]} onPress={() => {}}>
            <Text style={{ color: sub, fontSize: 12 }}>{selected?.tsMs ? fmt(selected.tsMs) : ''}</Text>
            <Text style={{ color: text, fontSize: 18, fontWeight: '900', marginTop: 6 }}>{selected?.title || 'Alert'}</Text>
            {!!selected?.body && <Text style={{ color: sub, fontSize: 13, marginTop: 6 }}>{selected.body}</Text>}
            {selected?.type && (
              <Text style={{ color: sub, fontSize: 12, marginTop: 10 }}>
                Type: {String(selected.type)}
              </Text>
            )}
            {selected?.threshold != null && (
              <Text style={{ color: sub, fontSize: 12 }}>
                Threshold: {String(selected.threshold)}
              </Text>
            )}
            {selected?.value != null && (
              <Text style={{ color: sub, fontSize: 12 }}>
                Value: {String(selected.value)}
              </Text>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 }}>
              <Pressable onPress={() => setSelected(null)} style={[styles.btnSmall, { backgroundColor: palette.forestGreen }]}>
                <Text style={styles.btnText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  p: { marginTop: -6, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  label: { fontSize: 15, fontWeight: '900' },
  help: { fontSize: 12 },
  btn: { paddingVertical: 10, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  btnText: { color: 'white', fontWeight: '900' },
  alertRow: { borderTopWidth: 1, paddingTop: 10, gap: 2, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 16, justifyContent: 'center' },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  btnSmall: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
});

