import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = firebaseReady ? getAuth(app) : null;
export const db = firebaseReady ? getFirestore(app) : null;

export async function ensureUser() {
  if (!firebaseReady) return null;
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      try {
        if (user) return resolve(user);
        const result = await signInAnonymously(auth);
        resolve(result.user);
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function loadCloudState() {
  const user = await ensureUser();
  if (!user) return null;
  const ref = doc(db, 'users', user.uid, 'ascend', 'current');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveCloudState(state) {
  const user = await ensureUser();
  if (!user) return false;
  const ref = doc(db, 'users', user.uid, 'ascend', 'current');
  await setDoc(ref, { ...state, updatedAt: new Date().toISOString() }, { merge: true });
  return true;
}
