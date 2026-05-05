import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { getFirebaseAuth } from './firebase';

export function useAuthUser() {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setState({ loading: false, user: u || null });
    });
    return () => unsub();
  }, []);

  return state;
}

export async function signInAdmin(email, password) {
  const auth = getFirebaseAuth();
  const res = await signInWithEmailAndPassword(auth, email, password);
  return res.user;
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

