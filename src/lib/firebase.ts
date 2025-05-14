
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics"; // Ensured getAnalytics and Analytics type are imported
import { getAuth, type Auth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBeWIuua2ILzwVdJpw7bf5uYGpCVCt549o",
  authDomain: "fervoappusuarioeparceiro.firebaseapp.com",
  databaseURL: "https://fervoappusuarioeparceiro-default-rtdb.firebaseio.com",
  projectId: "fervoappusuarioeparceiro",
  storageBucket: "fervoappusuarioeparceiro.firebasestorage.app",
  messagingSenderId: "762698655248",
  appId: "1:762698655248:web:1a4a995fccd6bcf6cb0c95",
  measurementId: "G-3QD4RQHSMQ"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let analytics: Analytics | null = null;
let googleAuthProvider: GoogleAuthProvider;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

auth = getAuth(app);
firestore = getFirestore(app);

// Initialize GoogleAuthProvider
googleAuthProvider = new GoogleAuthProvider();
// Note: The Google Sign-In Web Client ID is configured in your Firebase project settings.

if (typeof window !== 'undefined') {
  // Initialize Analytics only on the client side
  try {
    // Check if firebaseConfig has measurementId before initializing analytics
    if (firebaseConfig.measurementId) {
      analytics = getAnalytics(app); // Initialize analytics
    } else {
      console.warn("Firebase measurementId not found in config, Analytics not initialized.");
    }
  } catch (e) {
    console.warn("Firebase Analytics could not be initialized:", e);
  }
}

export { app, auth, firestore, analytics, googleAuthProvider };
