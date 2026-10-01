/* SDK de Firebase para el PANEL ADMIN (Auth + Firestore + App Check).
   Se empaqueta en assets/vendor/firebase-admin.bundle.js con `npm run build:firebase`. */
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  initializeFirestore, doc, collection, writeBatch, getDoc, getDocs, query, where, orderBy,
  limit, serverTimestamp, Timestamp, documentId,
} from "firebase/firestore";
import {
  getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "firebase/auth";

window.SantevitFirebase = Object.freeze({
  initializeApp, initializeAppCheck, ReCaptchaV3Provider,
  initializeFirestore, doc, collection, writeBatch, getDoc, getDocs, query, where, orderBy,
  limit, serverTimestamp, Timestamp, documentId,
  getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged,
});
