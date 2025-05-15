
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from './constants';

const knownTestKey = "sk_test_51RMuSWL8kxrPyagwNAjjZHKSmERMT6tO9v7OiH7AuuhScwahN47LZHKKX116pT0whLyFsjaKr0EYayxDhRYxmdgH00tjTLgvF9";
const oldPlaceholderKey = "YOUR_STRIPE_SECRET_KEY";
const oldLiveKeyPlaceholder = "sk_live_YOUR_STRIPE_LIVE_SECRET_KEY"; // Example of an old live placeholder


if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === oldPlaceholderKey || STRIPE_SECRET_KEY === oldLiveKeyPlaceholder) {
  throw new Error('STRIPE_SECRET_KEY is not set or is an old placeholder in environment variables.');
} else if (STRIPE_SECRET_KEY.startsWith("sk_live_") && STRIPE_SECRET_KEY !== oldLiveKeyPlaceholder) {
  console.warn('STRIPE_SECRET_KEY appears to be a live key. Ensure this is intended if running in a non-production environment.');
} else if (!STRIPE_SECRET_KEY.startsWith("sk_test_") && !STRIPE_SECRET_KEY.startsWith("sk_live_")) {
  console.warn('STRIPE_SECRET_KEY does not look like a standard Stripe key (test or live). Please verify its format.');
}


export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10', // Use the latest API version as per Stripe's recommendation
  typescript: true,
});
