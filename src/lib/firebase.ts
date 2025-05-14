
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
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
  storageBucket: "fervoappusuarioeparceiro.appspot.com",
  messagingSenderId: "762698655248",
  appId: "1:762698655248:web:ef79742c8b4e53eccb0c95",
  measurementId: "G-GXSK4Y4P7V"
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
// Note: The Google Sign-In Web Client ID (e.g., 762698655248-6fep3lu3lumf7hsqirrecqussr08578t.apps.googleusercontent.com)
// is configured in your Firebase project settings under 'Authentication' > 'Sign-in method' > 'Google'.
// The Firebase SDK handles using this ID automatically when you use GoogleAuthProvider with Firebase Authentication.

if (typeof window !== 'undefined') {
  // Initialize Analytics only on the client side
  try {
    // Check if firebaseConfig has measurementId before initializing analytics
    if (firebaseConfig.measurementId) { 
      analytics = getAnalytics(app);
    } else {
      console.warn("Firebase measurementId not found in config, Analytics not initialized.");
    }
  } catch (e) {
    console.warn("Firebase Analytics could not be initialized:", e);
  }
}

export { app, auth, firestore, analytics, googleAuthProvider };
