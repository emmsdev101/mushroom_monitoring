import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Default server base URL used before the user overrides it in Settings.
// Change this if you deploy the server somewhere else (Render, self-hosted).
export const DEFAULT_SERVER_BASE_URL = 'https://mushroom-nursery-server.onrender.com';

const KEY_BASE_URL = 'mushroomNursery.serverBaseUrl';
const KEY_API_KEY = 'mushroomNursery.serverApiKey';

// Trailing slashes make request URL construction awkward; strip them uniformly.
function normalizeBaseUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

/** In-memory cache so hot paths (fetch calls) don't pay AsyncStorage on every request. */
let cachedBaseUrl = DEFAULT_SERVER_BASE_URL;
let cachedApiKey = '';
let cacheHydrated = false;
const listeners = new Set();

async function hydrateCacheOnce() {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const [u, k] = await Promise.all([
      AsyncStorage.getItem(KEY_BASE_URL),
      AsyncStorage.getItem(KEY_API_KEY),
    ]);
    if (u) cachedBaseUrl = normalizeBaseUrl(u) || DEFAULT_SERVER_BASE_URL;
    if (typeof k === 'string') cachedApiKey = k;
  } catch {
    // ignore — defaults are fine
  }
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

// Kick off hydration eagerly so first fetch call has the right values.
hydrateCacheOnce();

export function getServerBaseUrl() {
  return cachedBaseUrl;
}

export function getServerApiKey() {
  return cachedApiKey;
}

export async function setServerBaseUrl(next) {
  const norm = normalizeBaseUrl(next);
  cachedBaseUrl = norm || DEFAULT_SERVER_BASE_URL;
  if (norm) await AsyncStorage.setItem(KEY_BASE_URL, norm);
  else await AsyncStorage.removeItem(KEY_BASE_URL);
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export async function setServerApiKey(next) {
  const s = String(next || '');
  cachedApiKey = s;
  if (s) await AsyncStorage.setItem(KEY_API_KEY, s);
  else await AsyncStorage.removeItem(KEY_API_KEY);
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

/**
 * Hook that returns the current server URL / API key and re-renders when the
 * user updates them from Settings.
 */
export function useServerConfig() {
  const [state, setState] = useState({
    baseUrl: cachedBaseUrl,
    apiKey: cachedApiKey,
    hydrated: cacheHydrated,
  });

  useEffect(() => {
    const fn = () => setState({
      baseUrl: cachedBaseUrl,
      apiKey: cachedApiKey,
      hydrated: true,
    });
    listeners.add(fn);
    // In case hydration finished between mount and effect.
    if (cacheHydrated) fn();
    else hydrateCacheOnce().then(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const update = useCallback(async (next = {}) => {
    if (next.baseUrl !== undefined) await setServerBaseUrl(next.baseUrl);
    if (next.apiKey !== undefined) await setServerApiKey(next.apiKey);
  }, []);

  return { ...state, update };
}
