
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
  storageBucket: "fervofinder.appspot.com", // Corrected storageBucket format
  messagingSenderId: "260397392453",
  appId: "1:260397392453:web:0c1a11dc41b3dcf9ae392c"
  // measurementId is optional and not provided in the new config, so it's omitted.
};


// Informational Note on Google OAuth Client ID and 'auth/unauthorized-domain' errors:
// The Google OAuth Web Client ID, such as "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
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
} else {
  app = getApps()[0];
}

auth = getAuth(app);
firestore = getFirestore(app);
googleAuthProvider = new GoogleAuthProvider();

if (typeof window !== 'undefined') {
  // Initialize Analytics only on the client side
  try {
    // Check if firebaseConfig has measurementId before initializing analytics
    if (firebaseConfig.projectId) { // Check if projectId exists as a proxy for full config
      analytics = getAnalytics(app);
    } else {
      console.warn("Firebase measurementId not found in config, Analytics not initialized.");
    }
  } catch (e) {
    console.warn("Firebase Analytics could not be initialized:", e);
  }
}

export { app, auth, firestore, analytics, googleAuthProvider };
