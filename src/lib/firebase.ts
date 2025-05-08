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
  storageBucket: "fervoappusuarioeparceiro.appspot.com", // Corrected from .firebasestorage.app
  messagingSenderId: "762698655248",
  appId: "1:762698655248:web:ef79742c8b4e53eccb0c95",
  measurementId: "G-GXSK4Y4P7V"
};

// Informational Note on Google OAuth Client ID and 'auth/unauthorized-domain' errors:
// The Google OAuth Web Client ID, such as "762698655248-6fep3lu3lumf7hsqirrecqussr08578t.apps.googleusercontent.com",
// is configured within your Firebase project settings in the Firebase Console.
// Navigate to: Firebase Console > Your Project > Authentication > Sign-in method > Google.
// Ensure Google Sign-In is enabled and correctly configured there.

// To resolve "auth/unauthorized-domain" errors:
// You must add your application's serving domain(s) (e.g., localhost, your-dev-url.cloudworkstations.dev, etc.)
// to the "Authorized domains" list. This is found in:
// Firebase Console > Your Project > Authentication > Settings tab > Authorized domains.
// Add all relevant domains from which your app will be accessed.

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let analytics: Analytics | null = null;
let googleAuthProvider: GoogleAuthProvider;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);
  googleAuthProvider = new GoogleAuthProvider();
  if (typeof window !== 'undefined') {
    // Initialize Analytics only on the client side
    try {
      analytics = getAnalytics(app);
    } catch (e) {
      console.warn("Firebase Analytics could not be initialized:", e);
    }
  }
} else {
  app = getApps()[0];
  auth = getAuth(app);
  firestore = getFirestore(app);
  googleAuthProvider = new GoogleAuthProvider();
  if (typeof window !== 'undefined') {
     // Get Analytics instance if already initialized (e.g. HMR)
    try {
      analytics = getAnalytics(app);
    } catch (e) {
      console.warn("Firebase Analytics could not be re-initialized:", e);
    }
  }
}


export { app, auth, firestore, analytics, googleAuthProvider };
