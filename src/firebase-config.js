// Shared by firebase.js (owner surfaces) and firebase-public.js (booking page)
// so the two initialisation paths can never drift apart.
const productionFirebaseConfig = {
  apiKey: "AIzaSyDtSvqhxrk9o1k4AeiXMNQs1Ug2QwdXYNs",
  authDomain: "apex-detailers.firebaseapp.com",
  projectId: "apex-detailers",
  storageBucket: "apex-detailers.firebasestorage.app",
  messagingSenderId: "845997886809",
  appId: "1:845997886809:web:0f2f2a1ff25b55cdf99048",
  measurementId: "G-F0B7ENR8RE"
};

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || productionFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || productionFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || productionFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || productionFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || productionFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || productionFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || productionFirebaseConfig.measurementId
};
