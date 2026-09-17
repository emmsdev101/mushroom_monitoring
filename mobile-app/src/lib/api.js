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

function describeNetworkError(url, err) {
  const raw = String(err?.message || err);
  if (/network request failed|failed to fetch|network error/i.test(raw)) {
    const http = /^http:\/\//i.test(url);
    return new Error(
      http
        ? `Cannot reach ${url}. This installed app blocks plain HTTP until it is rebuilt with cleartext traffic allowed. Use the LAN IP plus port, e.g. http://192.168.1.10:3000 — a phone browser can open HTTP even when the app cannot.`
        : `Cannot reach ${url}. Check Wi‑Fi, the URL, and that the server is running.`
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const caller = opts.signal;
  const onCallerAbort = () => controller.abort();
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener('abort', onCallerAbort);
  }
  try {
    const { signal: _ignored, ...rest } = opts;
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      if (caller?.aborted) throw e;
      throw new Error(`Timed out reaching ${url}`);
    }
    throw describeNetworkError(url, e);
  } finally {
    clearTimeout(t);
    if (caller) caller.removeEventListener('abort', onCallerAbort);
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

/** Probe a typed base URL (does not use the saved cache). */
export async function pingServer(baseUrl, { timeoutMs = 8000 } = {}) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('Server base URL is not configured.');
  const url = `${base}/health`;
  const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, timeoutMs);
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = body && typeof body === 'object' && body.error ? body.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

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

  const fetchOnce = useCallback(async (opts = {}) => {
    if (!path || !enabled) return;
    // Skip overlapping polls instead of aborting — aborting a slow Render
    // request every 3s meant live/control never completed, so overrides looked dead.
    if (inFlightRef.current) {
      if (!opts.force) return;
      inFlightRef.current.abort();
    }
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

  return { ...state, refresh: () => fetchOnce({ force: true }) };
}

// -----------------------------------------------------------------------------
// Path helpers so callers don't repeat the /api/devices/<id>/... prefix.
// -----------------------------------------------------------------------------

export function devicePath(deviceId, suffix) {
  const id = deviceId || '';
  const s = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
  return `/api/devices/${encodeURIComponent(id)}${s}`;
}
