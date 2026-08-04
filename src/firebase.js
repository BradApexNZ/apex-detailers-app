import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const productionFirebaseConfig = {
  apiKey: "AIzaSyDtSvqhxrk9o1k4AeiXMNQs1Ug2QwdXYNs",
  authDomain: "apex-detailers.firebaseapp.com",
  projectId: "apex-detailers",
  storageBucket: "apex-detailers.firebasestorage.app",
  messagingSenderId: "845997886809",
  appId: "1:845997886809:web:0f2f2a1ff25b55cdf99048",
  measurementId: "G-F0B7ENR8RE"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || productionFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || productionFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || productionFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || productionFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || productionFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || productionFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || productionFirebaseConfig.measurementId
};

export const app = initializeApp(firebaseConfig);

const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
if (typeof window !== "undefined" && appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

const privateOfflinePath = typeof window !== "undefined"
  && /^\/(?:hq(?:\.html)?|tools|data-tools(?:\.html)?)$/.test(window.location.pathname);

export const offlinePersistenceEnabled = privateOfflinePath;
export const auth = getAuth(app);

// Keep the signed-in Firebase user on this device across app closes and reloads.
// The catch prevents storage-restricted browsers from blocking the app startup.
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn("Persistent Firebase login is unavailable in this browser.", error);
});

export const db = initializeFirestore(app, {
  localCache: privateOfflinePath
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache()
});
export const storage = getStorage(app);
export const functions = getFunctions(app, "australia-southeast1");
export const analyticsPromise = firebaseConfig.measurementId
  ? isSupported().then(supported => (supported ? getAnalytics(app) : null)).catch(error => {
      console.warn("Firebase Analytics is not available in this environment.", error);
      return null;
    })
  : Promise.resolve(null);
