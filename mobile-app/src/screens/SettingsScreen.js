import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { devicePath, rtdbSet, useRtdbValue } from '../lib/rtdb';
import { palette } from '../theme/palette';

import { changeLocalCreds, getLocalCreds } from '../lib/localAuth';

export default function SettingsScreen({ deviceIdState, onSignOut }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? palette.bgDark : palette.bgLight;
  const surface = isDark ? palette.surfaceDark : palette.surfaceLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  const { deviceId, setDeviceId, loading: deviceIdLoading } = deviceIdState;
  const control = useRtdbValue(devicePath(deviceId, 'control'));

  const [pendingDeviceId, setPendingDeviceId] = useState(deviceId);
  const [co2Threshold, setCo2Threshold] = useState('');
  const [tempFanOnC, setTempFanOnC] = useState('');
  const [humFanOnPct, setHumFanOnPct] = useState('');
  const [manualOverride, setManualOverride] = useState(false);
  const [manualFanOn, setManualFanOn] = useState(false);
  const [saving, setSaving] = useState(false);

  const [adminUser, setAdminUser] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [changingCreds, setChangingCreds] = useState(false);

  useEffect(() => setPendingDeviceId(deviceId), [deviceId]);

  useEffect(() => {
    getLocalCreds()
      .then((c) => setAdminUser(c.username))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const v = control.value || {};
    if (typeof v.co2ThresholdPpm === 'number') setCo2Threshold(String(v.co2ThresholdPpm));
    else setCo2Threshold('');
    if (typeof v.tempFanOnC === 'number') setTempFanOnC(String(v.tempFanOnC));
    else setTempFanOnC('');
    if (typeof v.humFanOnPct === 'number') setHumFanOnPct(String(v.humFanOnPct));
    else setHumFanOnPct('');
    if (typeof v.manualOverride === 'boolean') setManualOverride(v.manualOverride);
    else setManualOverride(false);
    if (typeof v.manualFanOn === 'boolean') setManualFanOn(v.manualFanOn);
    else setManualFanOn(false);
  }, [control.value]);

  function validate() {
    const nextDeviceId = pendingDeviceId.trim();
    if (!nextDeviceId) return { ok: false, message: 'Device ID is required.' };

    const thr = co2Threshold.trim() === '' ? 800 : Number(co2Threshold);
    if (!Number.isFinite(thr) || thr < 400 || thr > 10000) {
      return { ok: false, message: 'CO₂ threshold must be 400–10000 ppm (leave blank for default 800).' };
    }

    const t = tempFanOnC.trim() === '' ? 32 : Number(tempFanOnC);
    if (!Number.isFinite(t) || t < 15 || t > 45) {
      return { ok: false, message: 'Temp fan-on must be 15–45 °C (leave blank for default 32).' };
    }

    const h = humFanOnPct.trim() === '' ? 92 : Number(humFanOnPct);
    if (!Number.isFinite(h) || h < 55 || h > 100) {
      return { ok: false, message: 'Humidity fan-on must be 55–100% (leave blank for default 92).' };
    }

    return { ok: true, message: '' };
  }

  const canSave = useMemo(() => {
    return validate().ok;
  }, [pendingDeviceId, co2Threshold, tempFanOnC, humFanOnPct]);

  async function save() {
    const v = validate();
    if (!v.ok) {
      Alert.alert('Invalid settings', v.message);
      return;
    }
    setSaving(true);
    try {
      const nextDeviceId = pendingDeviceId.trim();
      const thr = co2Threshold.trim() === '' ? 800 : Number(co2Threshold);
      const tFan = tempFanOnC.trim() === '' ? 32 : Number(tempFanOnC);
      const hFan = humFanOnPct.trim() === '' ? 92 : Number(humFanOnPct);

      if (nextDeviceId !== deviceId) {
        await setDeviceId(nextDeviceId);
      }

      await rtdbSet(devicePath(nextDeviceId, 'control/co2ThresholdPpm'), thr);
      await rtdbSet(devicePath(nextDeviceId, 'control/tempFanOnC'), tFan);
      await rtdbSet(devicePath(nextDeviceId, 'control/humFanOnPct'), hFan);
      await rtdbSet(devicePath(nextDeviceId, 'control/manualOverride'), manualOverride);
      await rtdbSet(devicePath(nextDeviceId, 'control/manualFanOn'), manualFanOn);
    } catch (e) {
      Alert.alert('Save failed', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (deviceIdLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator />
        <Text style={{ color: sub }}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.h1, { color: text }]}>Settings</Text>
        <Text style={[styles.p, { color: sub }]}>
          Thresholds and fan override are stored in Firebase. The Node server reads them and the ESP32 pulls commands
          from the server.
        </Text>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Device ID</Text>
          <TextInput
            value={pendingDeviceId}
            onChangeText={setPendingDeviceId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="nursery-01"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />
          <Text style={[styles.help, { color: sub }]}>
            Must match the ESP32 `DEVICE_ID` used in firmware.
          </Text>
        </View>

        <Text style={[styles.section, { color: text }]}>Thresholds</Text>
        <Text style={[styles.sectionSub, { color: sub }]}>
          When readings cross these limits, the fan turns on (unless manual override is on). Same values as on the
          Monitoring tab.
        </Text>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>CO₂ Threshold (ppm)</Text>
          <TextInput
            value={co2Threshold}
            onChangeText={setCo2Threshold}
            keyboardType="numeric"
            placeholder="800"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />
          <Text style={[styles.help, { color: sub }]}>When CO₂ exceeds this, the exhaust fan turns on (unless overridden).</Text>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Temp fan-on (°C)</Text>
          <TextInput
            value={tempFanOnC}
            onChangeText={setTempFanOnC}
            keyboardType="decimal-pad"
            placeholder="32"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />
          <Text style={[styles.help, { color: sub }]}>
            Fan runs when temperature rises above this value (15–45 °C). Leave empty for 32.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Humidity fan-on (%)</Text>
          <TextInput
            value={humFanOnPct}
            onChangeText={setHumFanOnPct}
            keyboardType="decimal-pad"
            placeholder="92"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />
          <Text style={[styles.help, { color: sub }]}>
            Fan runs when humidity rises above this value (55–100 %). Leave empty for 92.
          </Text>
        </View>

        <Text style={[styles.section, { color: text, marginTop: 4 }]}>Manual fan</Text>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Manual Override</Text>
              <Text style={[styles.help, { color: sub }]}>Force fan state regardless of sensor readings.</Text>
            </View>
            <Switch value={manualOverride} onValueChange={setManualOverride} thumbColor={palette.forestGreen} />
          </View>

          <View style={[styles.row, { marginTop: 10, opacity: manualOverride ? 1 : 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Fan</Text>
              <Text style={[styles.help, { color: sub }]}>{manualFanOn ? 'ON' : 'OFF'}</Text>
            </View>
            <Switch
              value={manualFanOn}
              onValueChange={setManualFanOn}
              disabled={!manualOverride}
              thumbColor={palette.forestGreen}
            />
          </View>
        </View>

        <View style={styles.footerRow}>
          <Text style={{ color: sub, fontSize: 12 }}>
            {control.loading ? 'Loading device control…' : control.error ? 'Control read error' : 'Ready'}
          </Text>
          <Text
            onPress={saving ? undefined : save}
            style={[
              styles.saveBtn,
              {
                backgroundColor: canSave ? palette.forestGreen : 'rgba(127,127,127,0.3)',
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </View>

        <Text style={[styles.section, { color: text, marginTop: 6 }]}>Admin account</Text>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Username</Text>
          <TextInput
            value={adminUser}
            onChangeText={setAdminUser}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="admin"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />

          <Text style={[styles.label, { color: sub, marginTop: 10 }]}>Current password</Text>
          <TextInput
            value={currentPass}
            onChangeText={setCurrentPass}
            secureTextEntry
            placeholder="admin"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />

          <Text style={[styles.label, { color: sub, marginTop: 10 }]}>New password</Text>
          <TextInput
            value={newPass}
            onChangeText={setNewPass}
            secureTextEntry
            placeholder="••••"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />

          <Text
            onPress={
              changingCreds
                ? undefined
                : async () => {
                    setChangingCreds(true);
                    try {
                      await changeLocalCreds({
                        currentPassword: currentPass,
                        nextUsername: adminUser,
                        nextPassword: newPass || currentPass,
                      });
                      setCurrentPass('');
                      setNewPass('');
                      Alert.alert('Saved', 'Admin username/password updated on this phone.');
                    } catch (e) {
                      Alert.alert('Update failed', String(e?.message || e));
                    } finally {
                      setChangingCreds(false);
                    }
                  }
            }
            style={[
              styles.saveBtn,
              {
                marginTop: 12,
                alignSelf: 'flex-end',
                backgroundColor: palette.forestGreen,
                opacity: changingCreds ? 0.7 : 1,
              },
            ]}
          >
            {changingCreds ? 'Saving…' : 'Save credentials'}
          </Text>

          <Text
            onPress={typeof onSignOut === 'function' ? onSignOut : undefined}
            style={[
              styles.saveBtn,
              {
                marginTop: 10,
                alignSelf: 'flex-end',
                backgroundColor: 'rgba(200, 70, 70, 0.85)',
              },
            ]}
          >
            Sign out
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  p: { marginTop: -6, fontSize: 13 },
  section: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  sectionSub: { fontSize: 12, marginTop: -4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  help: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    fontWeight: '800',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
});

