// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBeWIuua2ILzwVdJpw7bf5uYGpCVCt549o",
  authDomain: "fervoappusuarioeparceiro.firebaseapp.com",
  databaseURL: "https://fervoappusuarioeparceiro-default-rtdb.firebaseio.com",
  projectId: "fervoappusuarioeparceiro",
  storageBucket: "fervoappusuarioeparceiro.appspot.com", // Corrected storageBucket domain
  messagingSenderId: "762698655248",
  appId: "1:762698655248:web:ef79742c8b4e53eccb0c95",
  measurementId: "G-GXSK4Y4P7V"
};

// Initialize Firebase
let app: FirebaseApp;
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  if (typeof window !== 'undefined') {
    // Initialize Analytics only on the client side
    analytics = getAnalytics(app);
  }
} else {
  app = getApps()[0];
  if (typeof window !== 'undefined') {
     // Get Analytics instance if already initialized (e.g. HMR)
    try {
      analytics = getAnalytics(app);
    } catch (e) {
      console.warn("Firebase Analytics could not be initialized or re-initialized:", e);
    }
  }
}


export { app, analytics };
