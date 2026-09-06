import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getServerApiKey, getServerBaseUrl } from './config';

// -----------------------------------------------------------------------------
// Low-level fetch helpers. All Render API traffic goes through these so we
// have a single place to attach the API key header, set timeouts, and handle
// errors uniformly.
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15000;

function buildUrl(path) {
  const base = getServerBaseUrl();
  if (!base) throw new Error('Server base URL is not configured.');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function buildHeaders(extra) {
  const headers = { Accept: 'application/json', ...(extra || {}) };
  const key = getServerApiKey();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

/** GET a JSON response from the API. Throws Error on non-2xx. */
export async function apiGet(path, { signal, timeoutMs } = {}) {
  const res = await fetchWithTimeout(buildUrl(path), {
    method: 'GET',
    headers: buildHeaders(),
    signal,
  }, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = body && typeof body === 'object' && body.error ? body.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

async function apiWrite(method, path, body, { signal, timeoutMs } = {}) {
  const res = await fetchWithTimeout(buildUrl(path), {
    method,
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: body == null ? undefined : JSON.stringify(body),
    signal,
  }, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const parsed = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = parsed && typeof parsed === 'object' && parsed.error ? parsed.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed;
}

export function apiPut(path, body, opts) { return apiWrite('PUT', path, body, opts); }
export function apiPost(path, body, opts) { return apiWrite('POST', path, body, opts); }

// -----------------------------------------------------------------------------
// Polling hook. Drop-in replacement for `useRtdbValue`: gives you the same
// { loading, value, error } shape and re-renders on new data. Poll pauses
// while the app is in the background so we don't burn battery / free-tier
// bandwidth. `refresh()` lets a screen force an immediate re-fetch.
// -----------------------------------------------------------------------------

export function useApiValue(path, { intervalMs = 5000, enabled = true } = {}) {
  const [state, setState] = useState({ loading: true, value: null, error: null });
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(null);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  const fetchOnce = useCallback(async () => {
    if (!path || !enabled) return;
    // Cancel any pending previous fetch to avoid race conditions.
    if (inFlightRef.current) inFlightRef.current.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      const value = await apiGet(path, { signal: controller.signal });
      if (!isMountedRef.current) return;
      setState({ loading: false, value, error: null });
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (!isMountedRef.current) return;
      setState((prev) => ({ loading: false, value: prev.value, error: e }));
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, [path, enabled]);

  useEffect(() => {
    if (!path || !enabled) return undefined;

    setState({ loading: true, value: null, error: null });
    fetchOnce();

    let timer = null;
    let active = true;

    function schedule() {
      if (!active) return;
      timer = setTimeout(async () => {
        if (!active) return;
        await fetchOnce();
        schedule();
      }, intervalMs);
    }
    schedule();

    // Pause polling while backgrounded; refresh once when coming back.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        fetchOnce();
      }
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (inFlightRef.current) inFlightRef.current.abort();
      sub.remove();
    };
  }, [path, intervalMs, enabled, fetchOnce]);

  return { ...state, refresh: fetchOnce };
}

// -----------------------------------------------------------------------------
// Path helpers so callers don't repeat the /api/devices/<id>/... prefix.
// -----------------------------------------------------------------------------

export function devicePath(deviceId, suffix) {
  const id = deviceId || '';
  const s = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
  return `/api/devices/${encodeURIComponent(id)}${s}`;
}
