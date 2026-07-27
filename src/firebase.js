import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "australia-southeast1");
export const analyticsPromise = firebaseConfig.measurementId
  ? isSupported().then(supported => (supported ? getAnalytics(app) : null)).catch(error => {
      console.warn("Firebase Analytics is not available in this environment.", error);
      return null;
    })
  : Promise.resolve(null);
