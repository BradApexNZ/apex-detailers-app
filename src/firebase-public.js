import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { firebaseConfig } from "./firebase-config";

// The public booking page needs exactly one Firebase product: callable
// Functions. Importing the shared firebase.js instead pulled in Auth,
// Firestore and Storage as a side effect of module evaluation - and Auth in
// particular injects a hidden cross-origin iframe
// (apex-detailers.firebaseapp.com/__/auth/iframe) that loads Google's gapi
// script to resolve pending sign-in redirects. On a page with no sign-in at
// all that is pure liability: it is third-party framed storage access, which
// is exactly what Safari's tracking protection stalls or blocks, and it can
// take the page down with it. Keeping this module free of Auth/Firestore/
// Storage keeps that iframe off the booking page entirely.
export const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app, "australia-southeast1");
