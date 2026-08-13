import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserLocalPersistence, getAuth, setPersistence, signOut } from "firebase/auth";
import {
  clearIndexedDbPersistence,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate
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

// Keep the public booking page's dependency surface as small as possible: it
// gets one shot at a customer before they give up and call someone else, so
// anything that can silently stall on a blocked/slow third-party network call
// (reCAPTCHA, Google Analytics collection, Firebase Installations) comes out
// entirely on this page rather than being raced against a timeout after the
// fact. HQ and the owner tools keep the full feature set - they're used by
// Brad on his own devices, not a first-time customer on an unknown setup.
const isPublicBookingPage = typeof window !== "undefined" && /^\/(?:book|booking(?:\.html)?)$/.test(window.location.pathname);

const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
// The public booking functions no longer require an App Check token server-side
// (see functions/index.js), but the client SDK still blocks the first callable
// request on getting one when App Check is initialized at all - if reCAPTCHA is
// slow or silently blocked (a content blocker, a privacy setting), that stalls
// a booking that would otherwise succeed immediately with no token attached.
if (typeof window !== "undefined" && !isPublicBookingPage && (appCheckSiteKey || appCheckDebugToken)) {
  // PR preview channels get a fresh, unregistered hostname each time, so reCAPTCHA
  // can't validate them. Setting this before initializeAppCheck makes the SDK use
  // Firebase's debug provider instead, sending the fixed token registered above.
  if (appCheckDebugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey || "debug-preview"),
    isTokenAutoRefreshEnabled: true
  });
}

const privateOfflinePath =
  typeof window !== "undefined" && /^\/(?:hq(?:\.html)?|tools|data-tools(?:\.html)?)$/.test(window.location.pathname);

export const offlinePersistenceEnabled = privateOfflinePath;
export const auth = getAuth(app);

// Keep the signed-in Firebase user on this device across app closes and reloads.
// The catch prevents storage-restricted browsers from blocking the app startup.
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn("Persistent Firebase login is unavailable in this browser.", error);
});

export const db = initializeFirestore(app, {
  localCache: privateOfflinePath ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache()
});
export const storage = getStorage(app);

// Owner data (customers, jobs, revenue) is cached in IndexedDB on /hq and /tools
// for offline use. signOut() alone leaves that cache readable on-device, so a
// deliberate sign-out must also drop the local cache. Firestore requires the SDK
// to be terminated before it can be cleared, so we reload afterwards for a clean
// re-initialised state rather than trying to resurrect `db` mid-session.
//
// terminate()/clearIndexedDbPersistence() can hang indefinitely if another tab
// still holds the multi-tab persistence lock - with no timeout that silently
// blocks the reload below forever, making Sign out look like a dead button.
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms))]);

export async function signOutAndClearCache() {
  await signOut(auth);
  if (offlinePersistenceEnabled) {
    try {
      await withTimeout(terminate(db), 3000);
      await withTimeout(clearIndexedDbPersistence(db), 3000);
    } catch (error) {
      console.warn("Could not clear cached Apex HQ data on this device.", error);
    }
  }
  window.location.reload();
}

export const functions = getFunctions(app, "australia-southeast1");
export const analyticsPromise =
  firebaseConfig.measurementId && !isPublicBookingPage
    ? isSupported()
        .then(supported => (supported ? getAnalytics(app) : null))
        .catch(error => {
          console.warn("Firebase Analytics is not available in this environment.", error);
          return null;
        })
    : Promise.resolve(null);
