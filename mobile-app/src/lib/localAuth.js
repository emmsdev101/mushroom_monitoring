import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY_CREDS = 'mushroomNursery.localAuth.creds';
const KEY_SESSION = 'mushroomNursery.localAuth.session';

const DEFAULT_CREDS = { username: 'admin', password: 'admin' };

async function loadCreds() {
  const raw = await AsyncStorage.getItem(KEY_CREDS);
  if (!raw) return DEFAULT_CREDS;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.username === 'string' && typeof v.password === 'string') return v;
  } catch {
    // ignore
  }
  return DEFAULT_CREDS;
}

export function useLocalSession() {
  const [state, setState] = useState({ loading: true, signedIn: false });

  useEffect(() => {
    AsyncStorage.getItem(KEY_SESSION)
      .then((v) => setState({ loading: false, signedIn: v === '1' }))
      .catch(() => setState({ loading: false, signedIn: false }));
  }, []);

  const signIn = useCallback(async (username, password) => {
    const u = String(username || '').trim();
    const p = String(password || '');
    const creds = await loadCreds();
    if (u !== creds.username || p !== creds.password) {
      const err = new Error('Invalid username or password.');
      err.code = 'local-auth/invalid-credentials';
      throw err;
    }
    await AsyncStorage.setItem(KEY_SESSION, '1');
    setState({ loading: false, signedIn: true });
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(KEY_SESSION);
    setState({ loading: false, signedIn: false });
  }, []);

  return { ...state, signIn, signOut };
}

export async function getLocalCreds() {
  return await loadCreds();
}

export async function changeLocalCreds({ currentPassword, nextUsername, nextPassword }) {
  const cur = await loadCreds();
  if (String(currentPassword || '') !== cur.password) {
    const err = new Error('Current password is incorrect.');
    err.code = 'local-auth/wrong-password';
    throw err;
  }
  const u = String(nextUsername || '').trim();
  const p = String(nextPassword || '');
  if (!u) {
    const err = new Error('Username cannot be empty.');
    err.code = 'local-auth/invalid-username';
    throw err;
  }
  if (p.length < 3) {
    const err = new Error('Password must be at least 3 characters.');
    err.code = 'local-auth/invalid-password';
    throw err;
  }
  await AsyncStorage.setItem(KEY_CREDS, JSON.stringify({ username: u, password: p }));
  return true;
}

