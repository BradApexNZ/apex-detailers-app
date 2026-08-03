import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
const missingConfig = requiredConfigKeys.filter(key => !firebaseConfig[key]);
if (missingConfig.length) {
  console.warn(`Missing Firebase config value(s): ${missingConfig.join(", ")}. Add them to your .env file.`);
}

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
