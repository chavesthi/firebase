
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from './constants';

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === "YOUR_STRIPE_SECRET_KEY" || STRIPE_SECRET_KEY === "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") {
  // Allow the new test key or if it's not a placeholder
  if (STRIPE_SECRET_KEY !== "sk_test_51RMuSWL8kxrPyagwNAjjZHKSmERMT6tO9v7OiH7AuuhScwahN47LZHKKX116pT0whLyFsjaKr0EYayxDhRYxmdgH00tjTLgvF9" && STRIPE_SECRET_KEY.startsWith("sk_live_")) {
     console.warn('STRIPE_SECRET_KEY might be a production key. Ensure this is intended for development.');
  } else if (STRIPE_SECRET_KEY === "YOUR_STRIPE_SECRET_KEY" || STRIPE_SECRET_KEY === "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") {
     throw new Error('STRIPE_SECRET_KEY is not set or is an old placeholder in environment variables.');
  }
}


export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10', // Use the latest API version as per Stripe's recommendation
  typescript: true,
});

