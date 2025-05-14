
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
  apiKey: "AIzaSyAfQZt7CSmW1abKH_wS3Z86-Sibutu19Oc",
  authDomain: "fervofinder.firebaseapp.com",
  projectId: "fervofinder",
  storageBucket: "fervofinder.firebasestorage.app",
  messagingSenderId: "260397392453",
  appId: "1:260397392453:web:0c1a11dc41b3dcf9ae392c",
  // measurementId: "G-XXXXXXXXXX" // Optional: Add if you have one for the new project
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
    // If measurementId is not in your new config, getAnalytics might still work or you might not need it.
    if (firebaseConfig.measurementId) { 
      analytics = getAnalytics(app);
    } else {
      // Attempt to initialize analytics even without measurementId, getAnalytics might handle it
      // or you might decide not to use Analytics if measurementId isn't present.
      // For now, let's attempt and warn if it fails due to missing measurementId or other reasons.
      try {
        analytics = getAnalytics(app);
        console.info("Firebase Analytics initialized (measurementId might be optional or handled by SDK).");
      } catch (analyticsError) {
        console.warn("Firebase Analytics could not be initialized (measurementId might be required or other issue):", analyticsError);
      }
    }
  } catch (e) {
    console.warn("Error during Firebase Analytics setup:", e);
  }
}

export { app, auth, firestore, analytics, googleAuthProvider };

