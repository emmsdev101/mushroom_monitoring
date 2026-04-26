import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Fill this from Firebase console (Project settings -> Your apps -> Web app).
// Prototype: keep in sync with `server/firebaseConfig.js` (Node server uses the same object).
const firebaseConfig = {
  apiKey: "AIzaSyDcgszJFmkeiIehrfi3MSv_gYVihLCAYqk",
  authDomain: "mushroom-a8443.firebaseapp.com",
  databaseURL: "https://mushroom-a8443-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mushroom-a8443",
  storageBucket: "mushroom-a8443.firebasestorage.app",
  messagingSenderId: "958029308054",
  appId: "1:958029308054:web:14067a90d01c49de35a2b7",
  measurementId: "G-2LMBFCDVJB"
};

export function getFirebaseApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  return getDatabase(getFirebaseApp());
}

export async function ensureSignedIn() {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;

  const existing = await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
  if (existing) return existing;

  const res = await signInAnonymously(auth);
  return res.user;
}

