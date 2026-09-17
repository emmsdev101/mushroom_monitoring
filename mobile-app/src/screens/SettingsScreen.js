import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, navigateRoot } from '../components/ui';
import { apiPut, devicePath, pingServer } from '../lib/api';
import { DEFAULT_SERVER_BASE_URL, useServerConfig } from '../lib/config';
import { FEATURES } from '../lib/features';
import { changeLocalCreds, getLocalCreds } from '../lib/localAuth';
import { useSharedNurseryLive } from '../lib/NurseryLiveContext';
import { palette } from '../theme/palette';
import { cardShadow, useTheme } from '../theme/useTheme';

function Field({ label, value, onChangeText, placeholder, keyboardType, t }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.help, { color: t.sub }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={t.placeholder}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
      />
    </View>
  );
}

function InfoRow({ icon, label, value, onPress, t }) {
  const inner = (
    <View style={styles.infoRow}>
      <View style={[styles.smallIcon, { backgroundColor: t.mint }]}>
        <Ionicons name={icon} size={16} color={palette.forestGreen} />
      </View>
      <Text style={[styles.infoLabel, { color: t.sub }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: t.text }]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={t.sub} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable onPress={onPress}>{inner}</Pressable>;
}

export default function SettingsScreen({ deviceIdState, onSignOut }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { deviceId, setDeviceId, loading: deviceIdLoading } = deviceIdState;
  const serverConfig = useServerConfig();
  const { derived, control, refreshControl } = useSharedNurseryLive();

  const [pendingServerUrl, setPendingServerUrl] = useState('');
  const [pendingApiKey, setPendingApiKey] = useState('');
  const [savingServer, setSavingServer] = useState(false);
  const [pendingDeviceId, setPendingDeviceId] = useState(deviceId);
  const [co2Threshold, setCo2Threshold] = useState('');
  const [tempFanOnC, setTempFanOnC] = useState('');
  const [humFanOnPct, setHumFanOnPct] = useState('');
  const [co2MinPpm, setCo2MinPpm] = useState('');
  const [tempMinC, setTempMinC] = useState('');
  const [humMinPct, setHumMinPct] = useState('');
  const [intakeFanEnabled, setIntakeFanEnabled] = useState(true);
  const [sprinklerEnabled, setSprinklerEnabled] = useState(true);
  const [sprinklerOnHumPct, setSprinklerOnHumPct] = useState('');
  const [sprinklerOffHumPct, setSprinklerOffHumPct] = useState('');
  const [sprinklerMaxOnSec, setSprinklerMaxOnSec] = useState('');
  const [sprinklerMinOffSec, setSprinklerMinOffSec] = useState('');
  const [heaterEnabled, setHeaterEnabled] = useState(true);
  const [heaterOnTempC, setHeaterOnTempC] = useState('');
  const [heaterOffTempC, setHeaterOffTempC] = useState('');
  const [heaterMaxOnSec, setHeaterMaxOnSec] = useState('');
  const [heaterMinOffSec, setHeaterMinOffSec] = useState('');
  const [saving, setSaving] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [changingCreds, setChangingCreds] = useState(false);

  useEffect(() => {
    if (serverConfig.hydrated) {
      setPendingServerUrl(serverConfig.baseUrl || '');
      setPendingApiKey(serverConfig.apiKey || '');
    }
  }, [serverConfig.hydrated, serverConfig.baseUrl, serverConfig.apiKey]);

  useEffect(() => setPendingDeviceId(deviceId), [deviceId]);
  useEffect(() => {
    getLocalCreds()
      .then((c) => setAdminUser(c.username))
      .catch(() => {});
  }, []);

  const hydratedFor = useRef(null);
  useEffect(() => {
    hydratedFor.current = null;
  }, [deviceId]);

  useEffect(() => {
    const v = control.value;
    if (!v || typeof v !== 'object') return;
    if (!deviceId || hydratedFor.current === deviceId) return;
    hydratedFor.current = deviceId;
    setCo2Threshold(typeof v.co2ThresholdPpm === 'number' ? String(v.co2ThresholdPpm) : '');
    setTempFanOnC(typeof v.tempFanOnC === 'number' ? String(v.tempFanOnC) : '');
    setHumFanOnPct(typeof v.humFanOnPct === 'number' ? String(v.humFanOnPct) : '');
    setCo2MinPpm(typeof v.co2MinPpm === 'number' ? String(v.co2MinPpm) : '');
    setTempMinC(typeof v.tempMinC === 'number' ? String(v.tempMinC) : '');
    setHumMinPct(typeof v.humMinPct === 'number' ? String(v.humMinPct) : '');
    setIntakeFanEnabled(typeof v.intakeFanEnabled === 'boolean' ? v.intakeFanEnabled : true);
    setSprinklerEnabled(typeof v.sprinklerEnabled === 'boolean' ? v.sprinklerEnabled : true);
    setSprinklerOnHumPct(typeof v.sprinklerOnHumPct === 'number' ? String(v.sprinklerOnHumPct) : '');
    setSprinklerOffHumPct(typeof v.sprinklerOffHumPct === 'number' ? String(v.sprinklerOffHumPct) : '');
    setSprinklerMaxOnSec(typeof v.sprinklerMaxOnSec === 'number' ? String(v.sprinklerMaxOnSec) : '');
    setSprinklerMinOffSec(typeof v.sprinklerMinOffSec === 'number' ? String(v.sprinklerMinOffSec) : '');
    setHeaterEnabled(typeof v.heaterEnabled === 'boolean' ? v.heaterEnabled : true);
    setHeaterOnTempC(typeof v.heaterOnTempC === 'number' ? String(v.heaterOnTempC) : '');
    setHeaterOffTempC(typeof v.heaterOffTempC === 'number' ? String(v.heaterOffTempC) : '');
    setHeaterMaxOnSec(typeof v.heaterMaxOnSec === 'number' ? String(v.heaterMaxOnSec) : '');
    setHeaterMinOffSec(typeof v.heaterMinOffSec === 'number' ? String(v.heaterMinOffSec) : '');
  }, [control.value, deviceId]);

  const DEFAULTS = {
    co2Max: 2000, co2Min: 1000,
    tempMax: 27, tempMin: 21,
    humMax: 90, humMin: 80,
    sprinklerOn: 78, sprinklerOff: 85,
    sprinklerMaxOn: 60, sprinklerMinOff: 300,
    heaterOn: 21, heaterOff: 23,
    heaterMaxOn: 900, heaterMinOff: 60,
  };

  function validate() {
    const nextDeviceId = pendingDeviceId.trim();
    if (!nextDeviceId) return { ok: false, message: 'Device ID is required.' };
    const thr = co2Threshold.trim() === '' ? DEFAULTS.co2Max : Number(co2Threshold);
    if (!Number.isFinite(thr) || thr < 400 || thr > 10000) return { ok: false, message: 'CO₂ max must be 400–10000 ppm.' };
    const co2Lo = co2MinPpm.trim() === '' ? DEFAULTS.co2Min : Number(co2MinPpm);
    if (!Number.isFinite(co2Lo) || co2Lo < 300 || co2Lo > 5000) return { ok: false, message: 'CO₂ min must be 300–5000 ppm.' };
    if (co2Lo >= thr) return { ok: false, message: 'CO₂ min must be less than CO₂ max.' };
    const tMax = tempFanOnC.trim() === '' ? DEFAULTS.tempMax : Number(tempFanOnC);
    if (!Number.isFinite(tMax) || tMax < 15 || tMax > 45) return { ok: false, message: 'Temp max must be 15–45 °C.' };
    const tLo = tempMinC.trim() === '' ? DEFAULTS.tempMin : Number(tempMinC);
    if (!Number.isFinite(tLo) || tLo < 5 || tLo > 30) return { ok: false, message: 'Temp min must be 5–30 °C.' };
    if (tLo >= tMax) return { ok: false, message: 'Temp min must be less than temp max.' };
    const h = humFanOnPct.trim() === '' ? DEFAULTS.humMax : Number(humFanOnPct);
    if (!Number.isFinite(h) || h < 55 || h > 100) return { ok: false, message: 'Humidity max must be 55–100%.' };
    const hLo = humMinPct.trim() === '' ? DEFAULTS.humMin : Number(humMinPct);
    if (!Number.isFinite(hLo) || hLo < 30 || hLo > 95) return { ok: false, message: 'Humidity min must be 30–95%.' };
    if (hLo >= h) return { ok: false, message: 'Humidity min must be less than humidity max.' };
    const sOn = sprinklerOnHumPct.trim() === '' ? DEFAULTS.sprinklerOn : Number(sprinklerOnHumPct);
    if (!Number.isFinite(sOn) || sOn < 30 || sOn > 95) return { ok: false, message: 'Mister ON threshold must be 30–95%.' };
    const sOff = sprinklerOffHumPct.trim() === '' ? DEFAULTS.sprinklerOff : Number(sprinklerOffHumPct);
    if (!Number.isFinite(sOff) || sOff < 35 || sOff > 100) return { ok: false, message: 'Mister OFF threshold must be 35–100%.' };
    if (sOn >= sOff) return { ok: false, message: 'Mister ON must be less than OFF.' };
    const sMax = sprinklerMaxOnSec.trim() === '' ? DEFAULTS.sprinklerMaxOn : Number(sprinklerMaxOnSec);
    if (!Number.isFinite(sMax) || sMax < 5 || sMax > 600) return { ok: false, message: 'Mister max burst must be 5–600 s.' };
    const sMin = sprinklerMinOffSec.trim() === '' ? DEFAULTS.sprinklerMinOff : Number(sprinklerMinOffSec);
    if (!Number.isFinite(sMin) || sMin < 30 || sMin > 3600) return { ok: false, message: 'Mister cooldown must be 30–3600 s.' };
    if (FEATURES.heater) {
      const heatOn = heaterOnTempC.trim() === '' ? DEFAULTS.heaterOn : Number(heaterOnTempC);
      if (!Number.isFinite(heatOn) || heatOn < 5 || heatOn > 28) return { ok: false, message: 'Heater ON must be 5–28 °C.' };
      const heatOff = heaterOffTempC.trim() === '' ? DEFAULTS.heaterOff : Number(heaterOffTempC);
      if (!Number.isFinite(heatOff) || heatOff < 6 || heatOff > 30) return { ok: false, message: 'Heater OFF must be 6–30 °C.' };
      if (heatOn >= heatOff) return { ok: false, message: 'Heater ON must be lower than OFF.' };
      const heatMax = heaterMaxOnSec.trim() === '' ? DEFAULTS.heaterMaxOn : Number(heaterMaxOnSec);
      if (!Number.isFinite(heatMax) || heatMax < 30 || heatMax > 3600) return { ok: false, message: 'Heater max burst must be 30–3600 s.' };
      const heatMin = heaterMinOffSec.trim() === '' ? DEFAULTS.heaterMinOff : Number(heaterMinOffSec);
      if (!Number.isFinite(heatMin) || heatMin < 15 || heatMin > 1800) return { ok: false, message: 'Heater cooldown must be 15–1800 s.' };
    }
    return { ok: true, message: '' };
  }

  const canSave = useMemo(() => validate().ok, [
    pendingDeviceId, co2Threshold, tempFanOnC, humFanOnPct, co2MinPpm, tempMinC, humMinPct,
    sprinklerOnHumPct, sprinklerOffHumPct, sprinklerMaxOnSec, sprinklerMinOffSec,
    heaterOnTempC, heaterOffTempC, heaterMaxOnSec, heaterMinOffSec,
  ]);

  async function persistSwitches(patch) {
    if (!deviceId) return;
    try {
      await apiPut(devicePath(deviceId, 'control'), patch);
      await refreshControl?.();
    } catch (e) {
      Alert.alert('Save failed', String(e?.message || e));
    }
  }

  async function save() {
    const v = validate();
    if (!v.ok) {
      Alert.alert('Invalid settings', v.message);
      return;
    }
    setSaving(true);
    try {
      const nextDeviceId = pendingDeviceId.trim();
      if (nextDeviceId !== deviceId) await setDeviceId(nextDeviceId);
      const saved = await apiPut(devicePath(nextDeviceId, 'control'), {
        co2ThresholdPpm: co2Threshold.trim() === '' ? DEFAULTS.co2Max : Number(co2Threshold),
        tempFanOnC: tempFanOnC.trim() === '' ? DEFAULTS.tempMax : Number(tempFanOnC),
        humFanOnPct: humFanOnPct.trim() === '' ? DEFAULTS.humMax : Number(humFanOnPct),
        co2MinPpm: co2MinPpm.trim() === '' ? DEFAULTS.co2Min : Number(co2MinPpm),
        tempMinC: tempMinC.trim() === '' ? DEFAULTS.tempMin : Number(tempMinC),
        humMinPct: humMinPct.trim() === '' ? DEFAULTS.humMin : Number(humMinPct),
        intakeFanEnabled,
        sprinklerEnabled,
        sprinklerOnHumPct: sprinklerOnHumPct.trim() === '' ? DEFAULTS.sprinklerOn : Number(sprinklerOnHumPct),
        sprinklerOffHumPct: sprinklerOffHumPct.trim() === '' ? DEFAULTS.sprinklerOff : Number(sprinklerOffHumPct),
        sprinklerMaxOnSec: sprinklerMaxOnSec.trim() === '' ? DEFAULTS.sprinklerMaxOn : Number(sprinklerMaxOnSec),
        sprinklerMinOffSec: sprinklerMinOffSec.trim() === '' ? DEFAULTS.sprinklerMinOff : Number(sprinklerMinOffSec),
        heaterEnabled: FEATURES.heater ? heaterEnabled : false,
        heaterOnTempC: heaterOnTempC.trim() === '' ? DEFAULTS.heaterOn : Number(heaterOnTempC),
        heaterOffTempC: heaterOffTempC.trim() === '' ? DEFAULTS.heaterOff : Number(heaterOffTempC),
        heaterMaxOnSec: heaterMaxOnSec.trim() === '' ? DEFAULTS.heaterMaxOn : Number(heaterMaxOnSec),
        heaterMinOffSec: heaterMinOffSec.trim() === '' ? DEFAULTS.heaterMinOff : Number(heaterMinOffSec),
        // Saving ranges means automatic control — release any leftover overrides
        // (e.g. exhaust held OFF) so the new max can actually move the relays.
        manualOverride: false,
        manualFanOn: false,
        manualIntakeFanOverride: false,
        manualIntakeFanOn: false,
        manualSprinklerOverride: false,
        manualSprinklerOn: false,
        manualHeaterOverride: false,
        manualHeaterOn: false,
      }, { timeoutMs: 30000 });
      await refreshControl?.();
      if (saved?.persisted !== true) {
        Alert.alert(
          'Not saved to database',
          saved?.error || 'The server did not confirm a Firebase write. Check Render logs and RTDB rules.'
        );
        return;
      }
      Alert.alert('Target ranges saved', `The nursery will use temp ${saved.tempMinC}–${saved.tempFanOnC} °C.`);
    } catch (e) {
      Alert.alert('Save failed', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function commitServerConfig(url) {
    await serverConfig.update({ baseUrl: url, apiKey: pendingApiKey });
    Alert.alert('Connection saved', 'This phone will use the new API address. Target ranges were not changed.');
    refreshControl?.();
  }

  async function saveServerConfig() {
    const url = pendingServerUrl.trim();
    if (!url) return Alert.alert('Invalid server URL', 'URL cannot be empty.');
    if (!/^https?:\/\//i.test(url)) return Alert.alert('Invalid server URL', 'URL must start with http:// or https://');
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
      return Alert.alert(
        'Use the LAN IP',
        'localhost is this phone, not your PC. Use http://192.168.x.x:3000 (the address that works in the phone browser).'
      );
    }
    setSavingServer(true);
    try {
      await pingServer(url);
      await commitServerConfig(url);
    } catch (e) {
      const message = String(e?.message || e);
      Alert.alert('Cannot reach server', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save anyway', onPress: () => commitServerConfig(url) },
      ]);
    } finally {
      setSavingServer(false);
    }
  }

  if (deviceIdLoading) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={palette.forestGreen} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppHeader title="Settings" />
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: 36 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.section, { color: t.text }]}>1. Target ranges</Text>
          <Text style={[styles.hint, { color: t.sub }]}>
            Min and max for the grow room. This is what the fans{FEATURES.heater ? ', mister, and heater' : ' and mister'} follow. Use the green button below — not Save connection.
          </Text>
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <InfoRow icon="cloud-outline" label="CO₂" value={`${co2MinPpm || DEFAULTS.co2Min} – ${co2Threshold || DEFAULTS.co2Max} ppm`} t={t} />
            <View style={styles.row}>
              <Field label="Min" value={co2MinPpm} onChangeText={setCo2MinPpm} placeholder="1000" keyboardType="numeric" t={t} />
              <Field label="Max" value={co2Threshold} onChangeText={setCo2Threshold} placeholder="2000" keyboardType="numeric" t={t} />
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <InfoRow icon="water-outline" label="Humidity" value={`${humMinPct || DEFAULTS.humMin} – ${humFanOnPct || DEFAULTS.humMax} %`} t={t} />
            <View style={styles.row}>
              <Field label="Min" value={humMinPct} onChangeText={setHumMinPct} placeholder="80" keyboardType="decimal-pad" t={t} />
              <Field label="Max" value={humFanOnPct} onChangeText={setHumFanOnPct} placeholder="90" keyboardType="decimal-pad" t={t} />
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <InfoRow icon="thermometer-outline" label="Temperature" value={`${tempMinC || DEFAULTS.tempMin} – ${tempFanOnC || DEFAULTS.tempMax} °C`} t={t} />
            <View style={styles.row}>
              <Field label="Min" value={tempMinC} onChangeText={setTempMinC} placeholder="21" keyboardType="decimal-pad" t={t} />
              <Field label="Max" value={tempFanOnC} onChangeText={setTempFanOnC} placeholder="27" keyboardType="decimal-pad" t={t} />
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <Text style={[styles.label, { color: t.text }]}>{FEATURES.heater ? 'Mister & heater timing' : 'Mister timing'}</Text>
            <Text style={[styles.hint, { color: t.sub, marginTop: 0 }]}>Saved together with the ranges above.</Text>
            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: t.text }]}>Intake fan enabled</Text>
              <Switch
                value={intakeFanEnabled}
                onValueChange={(v) => {
                  setIntakeFanEnabled(v);
                  persistSwitches({ intakeFanEnabled: v });
                }}
                thumbColor={palette.forestGreen}
              />
            </View>
            <View style={[styles.switchRow, { marginTop: 8 }]}>
              <Text style={[styles.label, { color: t.text }]}>Mister enabled</Text>
              <Switch
                value={sprinklerEnabled}
                onValueChange={(v) => {
                  setSprinklerEnabled(v);
                  persistSwitches({ sprinklerEnabled: v });
                }}
                thumbColor={palette.forestGreen}
              />
            </View>
            <View style={[styles.row, { marginTop: 10 }]}>
              <Field label="Mister ON %" value={sprinklerOnHumPct} onChangeText={setSprinklerOnHumPct} placeholder="78" keyboardType="decimal-pad" t={t} />
              <Field label="Mister OFF %" value={sprinklerOffHumPct} onChangeText={setSprinklerOffHumPct} placeholder="85" keyboardType="decimal-pad" t={t} />
            </View>
            <View style={[styles.row, { marginTop: 10 }]}>
              <Field label="Max burst (s)" value={sprinklerMaxOnSec} onChangeText={setSprinklerMaxOnSec} placeholder="60" keyboardType="numeric" t={t} />
              <Field label="Cooldown (s)" value={sprinklerMinOffSec} onChangeText={setSprinklerMinOffSec} placeholder="300" keyboardType="numeric" t={t} />
            </View>
            {FEATURES.heater ? (
              <>
                <View style={[styles.switchRow, { marginTop: 14 }]}>
                  <Text style={[styles.label, { color: t.text }]}>Heater enabled</Text>
                  <Switch
                    value={heaterEnabled}
                    onValueChange={(v) => {
                      setHeaterEnabled(v);
                      persistSwitches({ heaterEnabled: v });
                    }}
                    thumbColor={palette.forestGreen}
                  />
                </View>
                <View style={[styles.row, { marginTop: 10 }]}>
                  <Field label="Heater ON °C" value={heaterOnTempC} onChangeText={setHeaterOnTempC} placeholder="21" keyboardType="decimal-pad" t={t} />
                  <Field label="Heater OFF °C" value={heaterOffTempC} onChangeText={setHeaterOffTempC} placeholder="23" keyboardType="decimal-pad" t={t} />
                </View>
                <View style={[styles.row, { marginTop: 10 }]}>
                  <Field label="Max burst (s)" value={heaterMaxOnSec} onChangeText={setHeaterMaxOnSec} placeholder="900" keyboardType="numeric" t={t} />
                  <Field label="Cooldown (s)" value={heaterMinOffSec} onChangeText={setHeaterMinOffSec} placeholder="60" keyboardType="numeric" t={t} />
                </View>
              </>
            ) : null}
          </View>

          <Pressable
            onPress={save}
            disabled={!canSave || saving}
            style={[styles.saveBtn, { opacity: !canSave || saving ? 0.5 : 1 }]}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving ranges…' : 'Save target ranges'}</Text>
          </Pressable>

          <Text style={[styles.section, { color: t.text }]}>Notifications</Text>
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <InfoRow
              icon="notifications-outline"
              label="Alerts & Notifications"
              value="Open"
              t={t}
              onPress={() => navigateRoot(navigation, 'Alerts')}
            />
          </View>

          <Text style={[styles.section, { color: t.text }]}>2. Phone connection</Text>
          <Text style={[styles.hint, { color: t.sub }]}>
            Only for this phone: which nursery it talks to. This does not change temperature, humidity, or CO₂ targets.
          </Text>
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <InfoRow icon="hardware-chip-outline" label="Device ID" value={pendingDeviceId || '—'} t={t} />
            <TextInput
              value={pendingDeviceId}
              onChangeText={setPendingDeviceId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="nursery-01"
              placeholderTextColor={t.placeholder}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <InfoRow icon="wifi-outline" label="Device status" value={derived.online ? 'Online' : 'Offline'} t={t} />
            <Text style={[styles.help, { color: t.sub, marginTop: 8 }]}>API address</Text>
            <Text style={[styles.hint, { color: t.sub, marginTop: 0 }]}>
              Local server example: http://192.168.1.10:3000 — include the port. A browser can open HTTP; this app needs a rebuild to allow it.
            </Text>
            <TextInput
              value={pendingServerUrl}
              onChangeText={setPendingServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={DEFAULT_SERVER_BASE_URL}
              placeholderTextColor={t.placeholder}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <Text style={[styles.help, { color: t.sub, marginTop: 8 }]}>API key (optional)</Text>
            <TextInput
              value={pendingApiKey}
              onChangeText={setPendingApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="••••"
              placeholderTextColor={t.placeholder}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <Pressable
              onPress={saveServerConfig}
              style={[styles.secondaryBtn, { borderColor: t.border, opacity: savingServer ? 0.7 : 1 }]}
            >
              <Text style={[styles.secondaryBtnText, { color: t.text }]}>
                {savingServer ? 'Saving…' : 'Save connection'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.section, { color: t.text }]}>3. Admin account</Text>
          <View style={[styles.card, { backgroundColor: t.surface }, cardShadow(t.isDark)]}>
            <Text style={[styles.help, { color: t.sub }]}>Username</Text>
            <TextInput value={adminUser} onChangeText={setAdminUser} autoCapitalize="none" style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]} />
            <Text style={[styles.help, { color: t.sub, marginTop: 8 }]}>Current password</Text>
            <TextInput value={currentPass} onChangeText={setCurrentPass} secureTextEntry style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]} />
            <Text style={[styles.help, { color: t.sub, marginTop: 8 }]}>New password</Text>
            <TextInput value={newPass} onChangeText={setNewPass} secureTextEntry style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]} />
            <Pressable
              onPress={async () => {
                setChangingCreds(true);
                try {
                  await changeLocalCreds({ currentPassword: currentPass, nextUsername: adminUser, nextPassword: newPass || currentPass });
                  setCurrentPass('');
                  setNewPass('');
                  Alert.alert('Saved', 'Admin username/password updated on this phone.');
                } catch (e) {
                  Alert.alert('Update failed', String(e?.message || e));
                } finally {
                  setChangingCreds(false);
                }
              }}
              style={[styles.saveBtn, { marginTop: 12, opacity: changingCreds ? 0.7 : 1 }]}
            >
              <Text style={styles.saveBtnText}>{changingCreds ? 'Saving…' : 'Save login'}</Text>
            </Pressable>
            <Pressable onPress={onSignOut} style={[styles.saveBtn, { marginTop: 10, backgroundColor: '#C45C4A' }]}>
              <Text style={styles.saveBtnText}>Sign out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 12 },
  section: { fontSize: 18, fontWeight: '800', marginTop: 8 },
  hint: { fontSize: 13, fontWeight: '600', lineHeight: 18, marginTop: -4 },
  card: { borderRadius: 20, padding: 14, gap: 8 },
  label: { fontSize: 14, fontWeight: '700' },
  help: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '600', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  smallIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  infoValue: { fontSize: 13, fontWeight: '800', maxWidth: 160 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveBtn: { backgroundColor: palette.forestGreen, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  secondaryBtnText: { fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
