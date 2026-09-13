export const DEFAULT_TEMP_MIN_C = 21;
export const DEFAULT_TEMP_MAX_C = 27;
export const DEFAULT_HUM_MIN_PCT = 80;
export const DEFAULT_HUM_MAX_PCT = 90;
export const DEFAULT_CO2_MIN_PPM = 1000;
export const DEFAULT_CO2_MAX_PPM = 2000;

export function statusInRange(value, lo, hi, nearFrac = 0.1) {
  if (value == null) return 'warn';
  if (lo == null || hi == null || !(hi > lo)) return 'good';
  if (value >= hi || value <= lo) return 'bad';
  const span = hi - lo;
  const pad = span * nearFrac;
  if (value >= hi - pad || value <= lo + pad) return 'warn';
  return 'good';
}

export function statusForTemp(tempC, lo, hi) {
  return statusInRange(tempC, typeof lo === 'number' ? lo : DEFAULT_TEMP_MIN_C, typeof hi === 'number' ? hi : DEFAULT_TEMP_MAX_C);
}

export function statusForHum(humPct, lo, hi) {
  return statusInRange(humPct, typeof lo === 'number' ? lo : DEFAULT_HUM_MIN_PCT, typeof hi === 'number' ? hi : DEFAULT_HUM_MAX_PCT);
}

export function statusForCo2(co2ppm, lo, hi) {
  return statusInRange(co2ppm, typeof lo === 'number' ? lo : DEFAULT_CO2_MIN_PPM, typeof hi === 'number' ? hi : DEFAULT_CO2_MAX_PPM);
}

export function statusLabel(status) {
  if (status === 'bad') return 'Alert';
  if (status === 'warn') return 'Watch';
  return 'Normal';
}

export function formatAge(ms) {
  if (ms == null) return 'No recent updates';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
