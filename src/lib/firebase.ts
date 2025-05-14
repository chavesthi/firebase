
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getAuth, type Auth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfQZt7CSmW1abKH_wS3Z86-Sibutu19Oc",
  authDomain: "fervofinder.firebaseapp.com",
  projectId: "fervofinder",
  storageBucket: "fervofinder.appspot.com", // Corrected to .appspot.com
  messagingSenderId: "260397392453",
  appId: "1:260397392453:web:0c1a11dc41b3dcf9ae392c"
  // measurementId is not present in the new config
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
    // @ts-ignore
    if (firebaseConfig.measurementId) { 
      // @ts-ignore
      analytics = getAnalytics(app);
    } else {
      console.warn("Firebase measurementId not found in new config, Analytics not initialized.");
    }
  } catch (e) {
    console.warn("Firebase Analytics could not be initialized:", e);
  }
}

export { app, auth, firestore, analytics, googleAuthProvider };
