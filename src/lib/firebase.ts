
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics"; 
import { getAuth, type Auth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from 'firebase/functions';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBeWIuua2ILzwVdJpw7bf5uYGpCVCt549o",
  authDomain: "fervoappusuarioeparceiro.firebaseapp.com",
  databaseURL: "https://fervoappusuarioeparceiro-default-rtdb.firebaseio.com",
  projectId: "fervoappusuarioeparceiro",
  storageBucket: "fervoappusuarioeparceiro.appspot.com", // Corrected to .appspot.com as per previous context
  messagingSenderId: "762698655248",
  appId: "1:762698655248:web:1a4a995fccd6bcf6cb0c95",
  measurementId: "G-3QD4RQHSMQ"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let storage: FirebaseStorage;
let functions: Functions;
let analytics: Analytics | null = null;
let googleAuthProvider: GoogleAuthProvider;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

auth = getAuth(app);
firestore = getFirestore(app);
storage = getStorage(app);
functions = getFunctions(app);
googleAuthProvider = new GoogleAuthProvider();

if (typeof window !== 'undefined') {
  // Initialize Analytics only on the client side
  try {
    if (firebaseConfig.measurementId) {
      analytics = getAnalytics(app); 
    } else {
      console.warn("Firebase measurementId not found in config, Analytics not initialized.");
    }
  } catch (e) {
    console.warn("Firebase Analytics could not be initialized:", e);
  }
}

export { app, auth, firestore, storage, analytics, googleAuthProvider, functions };
