import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
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

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
];

const missingConfig = requiredConfigKeys.filter(key => !firebaseConfig[key]);

if (missingConfig.length) {
  console.warn(
    `Missing Firebase config value(s): ${missingConfig.join(", ")}. Add them to your .env file.`
  );
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const analyticsPromise = firebaseConfig.measurementId
  ? isSupported()
      .then(supported => (supported ? getAnalytics(app) : null))
      .catch(error => {
        console.warn("Firebase Analytics is not available in this environment.", error);
        return null;
      })
  : Promise.resolve(null);
