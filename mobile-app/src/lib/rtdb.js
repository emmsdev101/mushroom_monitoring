import { getFirebaseDb } from './firebase';
import { off, onValue, ref, set, update } from 'firebase/database';
import { useEffect, useState } from 'react';

export function devicePath(deviceId, suffix) {
  return `/devices/${deviceId}${suffix ? `/${suffix}` : ''}`;
}

export function useRtdbValue(path) {
  const [state, setState] = useState({ loading: true, value: null, error: null });

  useEffect(() => {
    if (!path) return;

    const db = getFirebaseDb();
    const r = ref(db, path);
    setState({ loading: true, value: null, error: null });

    const unsub = onValue(
      r,
      (snap) => {
        setState({ loading: false, value: snap.exists() ? snap.val() : null, error: null });
      },
      (err) => {
        setState({ loading: false, value: null, error: err });
      }
    );

    return () => {
      try {
        off(r);
        unsub();
      } catch {
        // ignore
      }
    };
  }, [path]);

  return state;
}

export async function rtdbSet(path, value) {
  const db = getFirebaseDb();
  await set(ref(db, path), value);
}

export async function rtdbUpdate(path, value) {
  const db = getFirebaseDb();
  await update(ref(db, path), value);
}

