import { useEffect, useMemo, useState } from 'react';
import { devicePath, useApiValue } from './api';
import { FEATURES } from './features';
import {
  DEFAULT_CO2_MAX_PPM,
  DEFAULT_CO2_MIN_PPM,
  DEFAULT_HUM_MAX_PCT,
  DEFAULT_HUM_MIN_PCT,
  DEFAULT_TEMP_MAX_C,
  DEFAULT_TEMP_MIN_C,
  formatAge,
  statusForCo2,
  statusForHum,
  statusForTemp,
} from './status';

const ONLINE_WINDOW_MS = 30 * 1000;

function useNowMs(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useNurseryLive(deviceId) {
  const live = useApiValue(deviceId ? devicePath(deviceId, 'live') : null, { intervalMs: 3000 });
  const control = useApiValue(deviceId ? devicePath(deviceId, 'control') : null, { intervalMs: 5000 });
  const nowMs = useNowMs(1000);
  const [presence, setPresence] = useState({ ageMs: null, fetchedAt: 0 });

  useEffect(() => {
    const v = live.value || {};
    const fetchedAt = Date.now();
    let ageMs = null;
    if (typeof v.ageMs === 'number') ageMs = v.ageMs;
    else if (typeof v.serverTsMs === 'number') ageMs = Math.max(0, fetchedAt - v.serverTsMs);
    setPresence({ ageMs, fetchedAt });
  }, [live.value]);

  const derived = useMemo(() => {
    const v = live.value || {};
    const c = control.value || {};
    const tempC = typeof v.tempC === 'number' ? v.tempC : null;
    const humPct = typeof v.humPct === 'number' ? v.humPct : null;
    const co2ppm = typeof v.co2ppm === 'number' ? v.co2ppm : null;

    const tempLo = typeof c.tempMinC === 'number' ? c.tempMinC : DEFAULT_TEMP_MIN_C;
    const tempHi = typeof c.tempFanOnC === 'number' ? c.tempFanOnC : DEFAULT_TEMP_MAX_C;
    const humLo = typeof c.humMinPct === 'number' ? c.humMinPct : DEFAULT_HUM_MIN_PCT;
    const humHi = typeof c.humFanOnPct === 'number' ? c.humFanOnPct : DEFAULT_HUM_MAX_PCT;
    const co2Lo = typeof c.co2MinPpm === 'number' ? c.co2MinPpm : DEFAULT_CO2_MIN_PPM;
    const co2Hi = typeof c.co2ThresholdPpm === 'number' ? c.co2ThresholdPpm : DEFAULT_CO2_MAX_PPM;

    const tempStatus = statusForTemp(tempC, tempLo, tempHi);
    const humStatus = statusForHum(humPct, humLo, humHi);
    const co2Status = statusForCo2(co2ppm, co2Lo, co2Hi);
    const allGood = tempStatus === 'good' && humStatus === 'good' && co2Status === 'good';
    const anyBad = tempStatus === 'bad' || humStatus === 'bad' || co2Status === 'bad';

    const age =
      presence.ageMs != null && presence.fetchedAt
        ? presence.ageMs + Math.max(0, nowMs - presence.fetchedAt)
        : null;

    const fanOn = c.manualOverride ? !!c.manualFanOn : !!v.fanOn;
    const intakeFanOn = c.manualIntakeFanOverride ? !!c.manualIntakeFanOn : !!v.intakeFanOn;
    const sprinklerOn = c.manualSprinklerOverride ? !!c.manualSprinklerOn : !!v.sprinklerOn;
    const heaterOn = c.manualHeaterOverride ? !!c.manualHeaterOn : !!v.heaterOn;

    const anyManual = !!(
      c.manualOverride ||
      c.manualIntakeFanOverride ||
      c.manualSprinklerOverride ||
      (FEATURES.heater && c.manualHeaterOverride)
    );

    return {
      tempC,
      humPct,
      co2ppm,
      tempLo,
      tempHi,
      humLo,
      humHi,
      co2Lo,
      co2Hi,
      tempStatus,
      humStatus,
      co2Status,
      allGood,
      anyBad,
      fanOn,
      intakeFanOn,
      sprinklerOn,
      heaterOn,
      anyManual,
      online: age != null && age < ONLINE_WINDOW_MS,
      lastSeenText:
        age != null ? `Last update: ${formatAge(age)}` : 'Last update: (waiting for device heartbeat)',
    };
  }, [live.value, control.value, nowMs, presence]);

  return {
    live,
    control,
    derived,
    loading: live.loading,
    refreshControl: control.refresh,
  };
}
