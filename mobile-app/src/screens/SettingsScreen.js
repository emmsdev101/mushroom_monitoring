import { useEffect, useMemo, useRef, useState } from 'react';
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
import { apiPut, devicePath, useApiValue } from '../lib/api';
import { DEFAULT_SERVER_BASE_URL, useServerConfig } from '../lib/config';
import { FEATURES } from '../lib/features';
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
  const control = useApiValue(deviceId ? devicePath(deviceId, 'control') : null, { intervalMs: 8000 });
  const serverConfig = useServerConfig();

  // Server-connection fields — local state until the user hits Save.
  const [pendingServerUrl, setPendingServerUrl] = useState('');
  const [pendingApiKey, setPendingApiKey] = useState('');
  const [savingServer, setSavingServer] = useState(false);

  useEffect(() => {
    if (serverConfig.hydrated) {
      setPendingServerUrl(serverConfig.baseUrl || '');
      setPendingApiKey(serverConfig.apiKey || '');
    }
  }, [serverConfig.hydrated, serverConfig.baseUrl, serverConfig.apiKey]);

  const [pendingDeviceId, setPendingDeviceId] = useState(deviceId);
  // Upper bounds (fan-on above)
  const [co2Threshold, setCo2Threshold] = useState('');
  const [tempFanOnC, setTempFanOnC] = useState('');
  const [humFanOnPct, setHumFanOnPct] = useState('');
  // Lower bounds (alert-only)
  const [co2MinPpm, setCo2MinPpm] = useState('');
  const [tempMinC, setTempMinC] = useState('');
  const [humMinPct, setHumMinPct] = useState('');
  // Exhaust fan manual override
  const [manualOverride, setManualOverride] = useState(false);
  const [manualFanOn, setManualFanOn] = useState(false);
  // Intake fan
  const [intakeFanEnabled, setIntakeFanEnabled] = useState(true);
  const [manualIntakeFanOverride, setManualIntakeFanOverride] = useState(false);
  const [manualIntakeFanOn, setManualIntakeFanOn] = useState(false);
  // Sprinkler
  const [sprinklerEnabled, setSprinklerEnabled] = useState(true);
  const [sprinklerOnHumPct, setSprinklerOnHumPct] = useState('');
  const [sprinklerOffHumPct, setSprinklerOffHumPct] = useState('');
  const [sprinklerMaxOnSec, setSprinklerMaxOnSec] = useState('');
  const [sprinklerMinOffSec, setSprinklerMinOffSec] = useState('');
  const [manualSprinklerOverride, setManualSprinklerOverride] = useState(false);
  const [manualSprinklerOn, setManualSprinklerOn] = useState(false);
  // Heater
  const [heaterEnabled, setHeaterEnabled] = useState(true);
  const [heaterOnTempC, setHeaterOnTempC] = useState('');
  const [heaterOffTempC, setHeaterOffTempC] = useState('');
  const [heaterMaxOnSec, setHeaterMaxOnSec] = useState('');
  const [heaterMinOffSec, setHeaterMinOffSec] = useState('');
  const [manualHeaterOverride, setManualHeaterOverride] = useState(false);
  const [manualHeaterOn, setManualHeaterOn] = useState(false);
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

  // Hydrate the form once per device. Later polls must not overwrite switches
  // the user just flipped (that made override appear to "turn itself off").
  const hydratedFor = useRef(null);
  useEffect(() => {
    hydratedFor.current = null;
  }, [deviceId]);

  useEffect(() => {
    const v = control.value;
    if (!v || typeof v !== 'object') return;
    if (!deviceId || hydratedFor.current === deviceId) return;
    hydratedFor.current = deviceId;
    if (typeof v.co2ThresholdPpm === 'number') setCo2Threshold(String(v.co2ThresholdPpm));
    else setCo2Threshold('');
    if (typeof v.tempFanOnC === 'number') setTempFanOnC(String(v.tempFanOnC));
    else setTempFanOnC('');
    if (typeof v.humFanOnPct === 'number') setHumFanOnPct(String(v.humFanOnPct));
    else setHumFanOnPct('');
    if (typeof v.co2MinPpm === 'number') setCo2MinPpm(String(v.co2MinPpm));
    else setCo2MinPpm('');
    if (typeof v.tempMinC === 'number') setTempMinC(String(v.tempMinC));
    else setTempMinC('');
    if (typeof v.humMinPct === 'number') setHumMinPct(String(v.humMinPct));
    else setHumMinPct('');
    if (typeof v.manualOverride === 'boolean') setManualOverride(v.manualOverride);
    else setManualOverride(false);
    if (typeof v.manualFanOn === 'boolean') setManualFanOn(v.manualFanOn);
    else setManualFanOn(false);

    setIntakeFanEnabled(typeof v.intakeFanEnabled === 'boolean' ? v.intakeFanEnabled : true);
    setManualIntakeFanOverride(typeof v.manualIntakeFanOverride === 'boolean' ? v.manualIntakeFanOverride : false);
    setManualIntakeFanOn(typeof v.manualIntakeFanOn === 'boolean' ? v.manualIntakeFanOn : false);

    setSprinklerEnabled(typeof v.sprinklerEnabled === 'boolean' ? v.sprinklerEnabled : true);
    setSprinklerOnHumPct(typeof v.sprinklerOnHumPct === 'number' ? String(v.sprinklerOnHumPct) : '');
    setSprinklerOffHumPct(typeof v.sprinklerOffHumPct === 'number' ? String(v.sprinklerOffHumPct) : '');
    setSprinklerMaxOnSec(typeof v.sprinklerMaxOnSec === 'number' ? String(v.sprinklerMaxOnSec) : '');
    setSprinklerMinOffSec(typeof v.sprinklerMinOffSec === 'number' ? String(v.sprinklerMinOffSec) : '');
    setManualSprinklerOverride(typeof v.manualSprinklerOverride === 'boolean' ? v.manualSprinklerOverride : false);
    setManualSprinklerOn(typeof v.manualSprinklerOn === 'boolean' ? v.manualSprinklerOn : false);

    setHeaterEnabled(typeof v.heaterEnabled === 'boolean' ? v.heaterEnabled : true);
    setHeaterOnTempC(typeof v.heaterOnTempC === 'number' ? String(v.heaterOnTempC) : '');
    setHeaterOffTempC(typeof v.heaterOffTempC === 'number' ? String(v.heaterOffTempC) : '');
    setHeaterMaxOnSec(typeof v.heaterMaxOnSec === 'number' ? String(v.heaterMaxOnSec) : '');
    setHeaterMinOffSec(typeof v.heaterMinOffSec === 'number' ? String(v.heaterMinOffSec) : '');
    setManualHeaterOverride(typeof v.manualHeaterOverride === 'boolean' ? v.manualHeaterOverride : false);
    setManualHeaterOn(typeof v.manualHeaterOn === 'boolean' ? v.manualHeaterOn : false);
  }, [control.value, deviceId]);

  // Thesis target ranges — used as defaults when a field is left blank.
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
    if (!Number.isFinite(thr) || thr < 400 || thr > 10000) {
      return { ok: false, message: 'CO₂ max must be 400–10000 ppm (leave blank for default 2000).' };
    }
    const co2Lo = co2MinPpm.trim() === '' ? DEFAULTS.co2Min : Number(co2MinPpm);
    if (!Number.isFinite(co2Lo) || co2Lo < 300 || co2Lo > 5000) {
      return { ok: false, message: 'CO₂ min must be 300–5000 ppm (leave blank for default 1000).' };
    }
    if (co2Lo >= thr) {
      return { ok: false, message: 'CO₂ min must be less than CO₂ max.' };
    }

    const t = tempFanOnC.trim() === '' ? DEFAULTS.tempMax : Number(tempFanOnC);
    if (!Number.isFinite(t) || t < 15 || t > 45) {
      return { ok: false, message: 'Temp max must be 15–45 °C (leave blank for default 27).' };
    }
    const tLo = tempMinC.trim() === '' ? DEFAULTS.tempMin : Number(tempMinC);
    if (!Number.isFinite(tLo) || tLo < 5 || tLo > 30) {
      return { ok: false, message: 'Temp min must be 5–30 °C (leave blank for default 21).' };
    }
    if (tLo >= t) {
      return { ok: false, message: 'Temp min must be less than temp max.' };
    }

    const h = humFanOnPct.trim() === '' ? DEFAULTS.humMax : Number(humFanOnPct);
    if (!Number.isFinite(h) || h < 55 || h > 100) {
      return { ok: false, message: 'Humidity max must be 55–100% (leave blank for default 90).' };
    }
    const hLo = humMinPct.trim() === '' ? DEFAULTS.humMin : Number(humMinPct);
    if (!Number.isFinite(hLo) || hLo < 30 || hLo > 95) {
      return { ok: false, message: 'Humidity min must be 30–95% (leave blank for default 80).' };
    }
    if (hLo >= h) {
      return { ok: false, message: 'Humidity min must be less than humidity max.' };
    }

    const sOn = sprinklerOnHumPct.trim() === '' ? DEFAULTS.sprinklerOn : Number(sprinklerOnHumPct);
    if (!Number.isFinite(sOn) || sOn < 30 || sOn > 95) {
      return { ok: false, message: 'Sprinkler ON threshold must be 30–95% (blank uses 78).' };
    }
    const sOff = sprinklerOffHumPct.trim() === '' ? DEFAULTS.sprinklerOff : Number(sprinklerOffHumPct);
    if (!Number.isFinite(sOff) || sOff < 35 || sOff > 100) {
      return { ok: false, message: 'Sprinkler OFF threshold must be 35–100% (blank uses 85).' };
    }
    if (sOn >= sOff) {
      return { ok: false, message: 'Sprinkler ON threshold must be less than OFF threshold (hysteresis).' };
    }
    const sMax = sprinklerMaxOnSec.trim() === '' ? DEFAULTS.sprinklerMaxOn : Number(sprinklerMaxOnSec);
    if (!Number.isFinite(sMax) || sMax < 5 || sMax > 600) {
      return { ok: false, message: 'Sprinkler max burst must be 5–600 s (blank uses 60).' };
    }
    const sMin = sprinklerMinOffSec.trim() === '' ? DEFAULTS.sprinklerMinOff : Number(sprinklerMinOffSec);
    if (!Number.isFinite(sMin) || sMin < 30 || sMin > 3600) {
      return { ok: false, message: 'Sprinkler cooldown must be 30–3600 s (blank uses 300).' };
    }

    if (FEATURES.heater) {
      const heatOn = heaterOnTempC.trim() === '' ? DEFAULTS.heaterOn : Number(heaterOnTempC);
      if (!Number.isFinite(heatOn) || heatOn < 5 || heatOn > 28) {
        return { ok: false, message: 'Heater ON threshold must be 5–28 °C (blank uses 21).' };
      }
      const heatOff = heaterOffTempC.trim() === '' ? DEFAULTS.heaterOff : Number(heaterOffTempC);
      if (!Number.isFinite(heatOff) || heatOff < 6 || heatOff > 30) {
        return { ok: false, message: 'Heater OFF threshold must be 6–30 °C (blank uses 23).' };
      }
      if (heatOn >= heatOff) {
        return { ok: false, message: 'Heater ON threshold must be lower than OFF threshold (hysteresis).' };
      }
      const heatMax = heaterMaxOnSec.trim() === '' ? DEFAULTS.heaterMaxOn : Number(heaterMaxOnSec);
      if (!Number.isFinite(heatMax) || heatMax < 30 || heatMax > 3600) {
        return { ok: false, message: 'Heater max burst must be 30–3600 s (blank uses 900).' };
      }
      const heatMin = heaterMinOffSec.trim() === '' ? DEFAULTS.heaterMinOff : Number(heaterMinOffSec);
      if (!Number.isFinite(heatMin) || heatMin < 15 || heatMin > 1800) {
        return { ok: false, message: 'Heater cooldown must be 15–1800 s (blank uses 60).' };
      }
    }

    return { ok: true, message: '' };
  }

  const canSave = useMemo(() => {
    return validate().ok;
  }, [
    pendingDeviceId,
    co2Threshold, tempFanOnC, humFanOnPct,
    co2MinPpm, tempMinC, humMinPct,
    sprinklerOnHumPct, sprinklerOffHumPct, sprinklerMaxOnSec, sprinklerMinOffSec,
    heaterOnTempC, heaterOffTempC, heaterMaxOnSec, heaterMinOffSec,
  ]);

  async function save() {
    const v = validate();
    if (!v.ok) {
      Alert.alert('Invalid settings', v.message);
      return;
    }
    setSaving(true);
    try {
      const nextDeviceId = pendingDeviceId.trim();
      const thr = co2Threshold.trim() === '' ? DEFAULTS.co2Max : Number(co2Threshold);
      const tFan = tempFanOnC.trim() === '' ? DEFAULTS.tempMax : Number(tempFanOnC);
      const hFan = humFanOnPct.trim() === '' ? DEFAULTS.humMax : Number(humFanOnPct);
      const co2Lo = co2MinPpm.trim() === '' ? DEFAULTS.co2Min : Number(co2MinPpm);
      const tLo = tempMinC.trim() === '' ? DEFAULTS.tempMin : Number(tempMinC);
      const hLo = humMinPct.trim() === '' ? DEFAULTS.humMin : Number(humMinPct);

      if (nextDeviceId !== deviceId) {
        await setDeviceId(nextDeviceId);
      }

      const sOn = sprinklerOnHumPct.trim() === '' ? DEFAULTS.sprinklerOn : Number(sprinklerOnHumPct);
      const sOff = sprinklerOffHumPct.trim() === '' ? DEFAULTS.sprinklerOff : Number(sprinklerOffHumPct);
      const sMax = sprinklerMaxOnSec.trim() === '' ? DEFAULTS.sprinklerMaxOn : Number(sprinklerMaxOnSec);
      const sMin = sprinklerMinOffSec.trim() === '' ? DEFAULTS.sprinklerMinOff : Number(sprinklerMinOffSec);

      const heatOn = heaterOnTempC.trim() === '' ? DEFAULTS.heaterOn : Number(heaterOnTempC);
      const heatOff = heaterOffTempC.trim() === '' ? DEFAULTS.heaterOff : Number(heaterOffTempC);
      const heatMax = heaterMaxOnSec.trim() === '' ? DEFAULTS.heaterMaxOn : Number(heaterMaxOnSec);
      const heatMin = heaterMinOffSec.trim() === '' ? DEFAULTS.heaterMinOff : Number(heaterMinOffSec);

      // One PUT with the whole control payload — server merges + validates.
      await apiPut(devicePath(nextDeviceId, 'control'), {
        co2ThresholdPpm: thr,
        tempFanOnC: tFan,
        humFanOnPct: hFan,
        co2MinPpm: co2Lo,
        tempMinC: tLo,
        humMinPct: hLo,
        manualOverride,
        manualFanOn,

        intakeFanEnabled,
        manualIntakeFanOverride,
        manualIntakeFanOn,

        sprinklerEnabled,
        sprinklerOnHumPct: sOn,
        sprinklerOffHumPct: sOff,
        sprinklerMaxOnSec: sMax,
        sprinklerMinOffSec: sMin,
        manualSprinklerOverride,
        manualSprinklerOn,

        heaterEnabled: FEATURES.heater ? heaterEnabled : false,
        heaterOnTempC: heatOn,
        heaterOffTempC: heatOff,
        heaterMaxOnSec: heatMax,
        heaterMinOffSec: heatMin,
        manualHeaterOverride: FEATURES.heater ? manualHeaterOverride : false,
        manualHeaterOn: FEATURES.heater ? manualHeaterOn : false,
      });
    } catch (e) {
      Alert.alert('Save failed', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function persistSwitches(patch) {
    if (!deviceId) return;
    try {
      await apiPut(devicePath(deviceId, 'control'), patch);
    } catch (e) {
      Alert.alert('Override failed', String(e?.message || e));
    }
  }

  async function saveServerConfig() {
    const url = pendingServerUrl.trim();
    if (!url) {
      Alert.alert('Invalid server URL', 'URL cannot be empty.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid server URL', 'URL must start with http:// or https://');
      return;
    }
    setSavingServer(true);
    try {
      await serverConfig.update({ baseUrl: url, apiKey: pendingApiKey });
      Alert.alert('Saved', 'Server configuration updated. Data will refresh momentarily.');
      control.refresh?.();
    } catch (e) {
      Alert.alert('Save failed', String(e?.message || e));
    } finally {
      setSavingServer(false);
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
          Thresholds and fan override are saved through the Render API. The ESP32 pulls the same commands from the
          server.
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

        <Text style={[styles.section, { color: text }]}>Target ranges</Text>
        <Text style={[styles.sectionSub, { color: sub }]}>
          Thesis targets: 21–27 °C, 80–90 % RH, 1000–2000 ppm CO₂. Readings outside the range trigger an alert. The
          exhaust fan turns on when a reading exceeds the max (unless manual override is on). CO₂ safety still wins
          over humidity venting when it is unusually cool.
        </Text>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Temperature (°C)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Min</Text>
              <TextInput
                value={tempMinC}
                onChangeText={setTempMinC}
                keyboardType="decimal-pad"
                placeholder="21"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Max (fan-on)</Text>
              <TextInput
                value={tempFanOnC}
                onChangeText={setTempFanOnC}
                keyboardType="decimal-pad"
                placeholder="27"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>Min 5–30 °C, max 15–45 °C. Blank uses 21 / 27.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Humidity (%)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Min</Text>
              <TextInput
                value={humMinPct}
                onChangeText={setHumMinPct}
                keyboardType="decimal-pad"
                placeholder="80"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Max (fan-on)</Text>
              <TextInput
                value={humFanOnPct}
                onChangeText={setHumFanOnPct}
                keyboardType="decimal-pad"
                placeholder="90"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>Min 30–95 %, max 55–100 %. Blank uses 80 / 90.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>CO₂ (ppm)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Min</Text>
              <TextInput
                value={co2MinPpm}
                onChangeText={setCo2MinPpm}
                keyboardType="numeric"
                placeholder="1000"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Max (fan-on)</Text>
              <TextInput
                value={co2Threshold}
                onChangeText={setCo2Threshold}
                keyboardType="numeric"
                placeholder="2000"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>Min 300–5000 ppm, max 400–10000 ppm. Blank uses 1000 / 2000.</Text>
        </View>

        <Text style={[styles.section, { color: text, marginTop: 4 }]}>Exhaust fan</Text>
        <Text style={[styles.sectionSub, { color: sub }]}>
          Switches save immediately. Thresholds still need the Save button.
        </Text>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Manual Override</Text>
              <Text style={[styles.help, { color: sub }]}>Force exhaust fan state regardless of sensor readings.</Text>
            </View>
            <Switch
              value={manualOverride}
              onValueChange={(v) => {
                setManualOverride(v);
                persistSwitches({ manualOverride: v, manualFanOn });
              }}
              thumbColor={palette.forestGreen}
            />
          </View>

          <View style={[styles.row, { marginTop: 10, opacity: manualOverride ? 1 : 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Exhaust fan</Text>
              <Text style={[styles.help, { color: sub }]}>{manualFanOn ? 'ON' : 'OFF'}</Text>
            </View>
            <Switch
              value={manualFanOn}
              onValueChange={(v) => {
                setManualFanOn(v);
                persistSwitches({ manualOverride: true, manualFanOn: v });
              }}
              disabled={!manualOverride}
              thumbColor={palette.forestGreen}
            />
          </View>
        </View>

        <Text style={[styles.section, { color: text, marginTop: 4 }]}>Intake fan</Text>
        <Text style={[styles.sectionSub, { color: sub }]}>
          Independent of the exhaust: turns on when CO₂ or temperature exceeds the max (to pull in fresh outside air).
        </Text>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Enabled</Text>
              <Text style={[styles.help, { color: sub }]}>Turn off entirely to disable automatic intake operation.</Text>
            </View>
            <Switch
              value={intakeFanEnabled}
              onValueChange={(v) => {
                setIntakeFanEnabled(v);
                persistSwitches({ intakeFanEnabled: v });
              }}
              thumbColor={palette.forestGreen}
            />
          </View>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Manual Override</Text>
              <Text style={[styles.help, { color: sub }]}>Force intake state regardless of sensor readings.</Text>
            </View>
            <Switch
              value={manualIntakeFanOverride}
              onValueChange={(v) => {
                setManualIntakeFanOverride(v);
                persistSwitches({ manualIntakeFanOverride: v, manualIntakeFanOn });
              }}
              thumbColor={palette.forestGreen}
            />
          </View>

          <View style={[styles.row, { marginTop: 10, opacity: manualIntakeFanOverride ? 1 : 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Intake fan</Text>
              <Text style={[styles.help, { color: sub }]}>{manualIntakeFanOn ? 'ON' : 'OFF'}</Text>
            </View>
            <Switch
              value={manualIntakeFanOn}
              onValueChange={(v) => {
                setManualIntakeFanOn(v);
                persistSwitches({ manualIntakeFanOverride: true, manualIntakeFanOn: v });
              }}
              disabled={!manualIntakeFanOverride}
              thumbColor={palette.forestGreen}
            />
          </View>
        </View>

        <Text style={[styles.section, { color: text, marginTop: 4 }]}>Sprinkler / humidifier</Text>
        <Text style={[styles.sectionSub, { color: sub }]}>
          Hysteresis-based misting to keep humidity in the target range. ON when humidity drops to the ON threshold;
          OFF once it recovers to the OFF threshold or the max burst elapses. A cooldown between bursts prevents the
          sensor from lagging behind reality.
        </Text>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Enabled</Text>
              <Text style={[styles.help, { color: sub }]}>Turn off entirely to disable automatic misting.</Text>
            </View>
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
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>ON threshold (%)</Text>
              <TextInput
                value={sprinklerOnHumPct}
                onChangeText={setSprinklerOnHumPct}
                keyboardType="decimal-pad"
                placeholder="78"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>OFF threshold (%)</Text>
              <TextInput
                value={sprinklerOffHumPct}
                onChangeText={setSprinklerOffHumPct}
                keyboardType="decimal-pad"
                placeholder="85"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>ON must be lower than OFF. Blank uses 78 / 85.</Text>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Max burst (s)</Text>
              <TextInput
                value={sprinklerMaxOnSec}
                onChangeText={setSprinklerMaxOnSec}
                keyboardType="numeric"
                placeholder="60"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Cooldown (s)</Text>
              <TextInput
                value={sprinklerMinOffSec}
                onChangeText={setSprinklerMinOffSec}
                keyboardType="numeric"
                placeholder="300"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>Max burst 5–600 s, cooldown 30–3600 s. Blank uses 60 / 300.</Text>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Manual Override</Text>
              <Text style={[styles.help, { color: sub }]}>Force sprinkler state regardless of humidity.</Text>
            </View>
            <Switch
              value={manualSprinklerOverride}
              onValueChange={(v) => {
                setManualSprinklerOverride(v);
                persistSwitches({ manualSprinklerOverride: v, manualSprinklerOn });
              }}
              thumbColor={palette.forestGreen}
            />
          </View>

          <View style={[styles.row, { marginTop: 10, opacity: manualSprinklerOverride ? 1 : 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Sprinkler</Text>
              <Text style={[styles.help, { color: sub }]}>{manualSprinklerOn ? 'ON' : 'OFF'}</Text>
            </View>
            <Switch
              value={manualSprinklerOn}
              onValueChange={(v) => {
                setManualSprinklerOn(v);
                persistSwitches({ manualSprinklerOverride: true, manualSprinklerOn: v });
              }}
              disabled={!manualSprinklerOverride}
              thumbColor={palette.forestGreen}
            />
          </View>
        </View>

        {FEATURES.heater ? (
        <>
        <Text style={[styles.section, { color: text, marginTop: 4 }]}>Heater</Text>
        <Text style={[styles.sectionSub, { color: sub }]}>
          Hysteresis-based heating to keep temperature in the target range. ON when temperature drops to the ON
          threshold; OFF once it recovers to the OFF threshold or the max burst elapses. Cooldown between bursts
          prevents short-cycling. Room temp responds slowly, so defaults are longer than the sprinkler's.
        </Text>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Enabled</Text>
              <Text style={[styles.help, { color: sub }]}>Turn off entirely to disable automatic heating.</Text>
            </View>
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
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>ON threshold (°C)</Text>
              <TextInput
                value={heaterOnTempC}
                onChangeText={setHeaterOnTempC}
                keyboardType="decimal-pad"
                placeholder="21"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>OFF threshold (°C)</Text>
              <TextInput
                value={heaterOffTempC}
                onChangeText={setHeaterOffTempC}
                keyboardType="decimal-pad"
                placeholder="23"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>ON must be lower than OFF. Blank uses 21 / 23.</Text>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Max burst (s)</Text>
              <TextInput
                value={heaterMaxOnSec}
                onChangeText={setHeaterMaxOnSec}
                keyboardType="numeric"
                placeholder="900"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.help, { color: sub }]}>Cooldown (s)</Text>
              <TextInput
                value={heaterMinOffSec}
                onChangeText={setHeaterMinOffSec}
                keyboardType="numeric"
                placeholder="60"
                placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
                style={[styles.input, { color: text, borderColor: border }]}
              />
            </View>
          </View>
          <Text style={[styles.help, { color: sub }]}>Max burst 30–3600 s, cooldown 15–1800 s. Blank uses 900 / 60.</Text>

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Manual Override</Text>
              <Text style={[styles.help, { color: sub }]}>Force heater state regardless of temperature.</Text>
            </View>
            <Switch
              value={manualHeaterOverride}
              onValueChange={(v) => {
                setManualHeaterOverride(v);
                persistSwitches({ manualHeaterOverride: v, manualHeaterOn });
              }}
              thumbColor={palette.forestGreen}
            />
          </View>

          <View style={[styles.row, { marginTop: 10, opacity: manualHeaterOverride ? 1 : 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: sub }]}>Heater</Text>
              <Text style={[styles.help, { color: sub }]}>{manualHeaterOn ? 'ON' : 'OFF'}</Text>
            </View>
            <Switch
              value={manualHeaterOn}
              onValueChange={(v) => {
                setManualHeaterOn(v);
                persistSwitches({ manualHeaterOverride: true, manualHeaterOn: v });
              }}
              disabled={!manualHeaterOverride}
              thumbColor={palette.forestGreen}
            />
          </View>
        </View>
        </>
        ) : null}

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

