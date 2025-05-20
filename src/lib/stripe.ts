
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from './constants';

if (!STRIPE_SECRET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error("CRITICAL: Stripe Secret Key is missing in a production environment. Payments will fail.");
    // In a real production scenario, you might want to throw an error here to prevent the app from starting without Stripe.
    // throw new Error("Stripe Secret Key is not configured for production.");
  } else {
    console.warn(
      "Stripe Secret Key is missing. Using a fallback or no key. " +
      "Ensure STRIPE_SECRET_KEY environment variable is set for full functionality, especially for production. " +
      "The current fallback key might be a test key or a restricted key, check its capabilities."
    );
  }
}

// Initialize Stripe with the secret key.
// The check above warns if it's not set, but we proceed to allow parts of the app
// that might not depend on server-side Stripe to still function during development.
export const stripe = new Stripe(STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10', // Use the latest API version you are developing against
  typescript: true,
});

// Note: The "Run Payments with Stripe" Firebase Extension handles most direct Stripe API interactions
// on the backend via Firebase Functions. This client-side initialized 'stripe' instance
// is typically less used when the extension is in place, except potentially for
// client-side tokenization if you were building a custom payment form (which we are not doing here).
// The primary interaction with the extension from the client-side is by writing to specific
// Firestore collections (e.g., `customers/{uid}/checkout_sessions`).
