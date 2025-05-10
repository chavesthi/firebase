import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from './constants';

if (!STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables.');
}

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10', // Use the latest API version as per Stripe's recommendation
  typescript: true,
});