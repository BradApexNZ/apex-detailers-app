import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "apex-detailers.firebaseapp.com",
  projectId: "apex-detailers",
  storageBucket: "apex-detailers.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID_HERE",
  appId: "PASTE_APP_ID_HERE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
