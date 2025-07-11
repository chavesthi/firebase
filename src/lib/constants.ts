
export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0";

export enum UserRole {
  USER = 'user',
  PARTNER = 'partner',
}

export enum VenueType {
  NIGHTCLUB = 'nightclub',
  BAR = 'bar',
  STAND_UP = 'stand_up',
  SHOW_HOUSE = 'show_house',
  ADULT_ENTERTAINMENT = 'adult_entertainment',
  LGBT = 'lgbt',
}

export const VENUE_TYPE_OPTIONS = [
  { value: VenueType.NIGHTCLUB, label: 'Balada' },
  { value: VenueType.BAR, label: 'Bar' },
  { value: VenueType.STAND_UP, label: 'Stand Up Comedy' },
  { value: VenueType.SHOW_HOUSE, label: 'Casa de Show' },
  { value: VenueType.ADULT_ENTERTAINMENT, label: 'Entretenimento Adulto' },
  { value: VenueType.LGBT, label: 'LGBTQIA+' },
];

export enum MusicStyle {
  ELECTRONIC = 'electronic',
  ROCK = 'rock',
  SAMBA_PAGODE = 'samba_pagode',
  SERTANEJO = 'sertanejo',
  REGGAE = 'reggae',
  FUNK_RAP = 'funk_rap',
  POP = 'pop',
  METAL = 'metal',
  BLUES_JAZZ = 'blues_jazz',
  OTHER = 'other',
}

export const MUSIC_STYLE_OPTIONS = [
  { value: MusicStyle.ELECTRONIC, label: 'Eletrônica' },
  { value: MusicStyle.ROCK, label: 'Rock' },
  { value: MusicStyle.SAMBA_PAGODE, label: 'Samba/Pagode' },
  { value: MusicStyle.SERTANEJO, label: 'Sertanejo' },
  { value: MusicStyle.REGGAE, label: 'Reggae' },
  { value: MusicStyle.FUNK_RAP, label: 'Funk/Rap' },
  { value: MusicStyle.POP, label: 'Pop' },
  { value: MusicStyle.METAL, label: 'Metal' },
  { value: MusicStyle.BLUES_JAZZ, label: 'Blues/Jazz' },
  { value: MusicStyle.OTHER, label: 'Outros' },
];

export enum PricingType {
  FREE = 'free',
  ENTRY_FEE = 'entry_fee',
  CONSUMPTION = 'consumption',
}

export const PRICING_TYPE_OPTIONS = [
  { value: PricingType.FREE, label: 'Entrada Grátis' },
  { value: PricingType.ENTRY_FEE, label: 'Taxa de Entrada' },
  { value: PricingType.CONSUMPTION, label: 'Consumação Mínima' },
];

export const FERVO_COINS_SHARE_REWARD = 2;
export const FERVO_COINS_FOR_COUPON = 20;
export const COUPON_REWARD_DESCRIPTION = "1 Lata Cerveja 350ml ou Refrigerante 350ml";
export const COUPON_CODE_PREFIX = "FERVO";

// App URL - Ensure this matches your Firebase Hosting URL for production,
// or your local dev URL for development.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fervoapp1--fervoappusuarioeparceiro.us-central1.hosted.app";
// For local dev, you might use:
// export const APP_URL = "http://localhost:9003";


// Stripe Constants for Partner Subscription (using Firebase Extension "firestore-stripe-payments")
// IMPORTANT: This Price ID MUST be a LIVE Price ID if your extension is in LIVE mode,
// or a TEST Price ID if your extension is in TEST mode.
// Ensure this Price ID corresponds to the Product ID for the Fervo Partner plan.
// The Price ID below should be the one associated with the Fervo Partner monthly plan in your Stripe dashboard.
// Make sure to set NEXT_PUBLIC_STRIPE_PRICE_ID in your .env.local or hosting environment.
export const STRIPE_PRICE_ID_FERVO_PARTNER_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || "price_1RSMZiL8kxrPyagwWB7l4fUK";

// This Product ID should match the Product associated with the Price ID above in your Stripe dashboard.
// Make sure to set NEXT_PUBLIC_STRIPE_PRODUCT_ID in your .env.local or hosting environment.
export const STRIPE_PRODUCT_ID = process.env.NEXT_PUBLIC_STRIPE_PRODUCT_ID || "prod_SN6pgrZHBiL4Wi";

// Stripe API Keys - Use environment variables for these in production!
// For client-side usage (e.g., with loadStripe from @stripe/stripe-js)
// Make sure to set NEXT_PUBLIC_STRIPE_PUBLIC_KEY in your .env.local or hosting environment.
export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || "pk_test_51RMuSWL8kxrPyagwamO1hVrwaZq84lMkkzQ1AS4dW64zRYj1jVOUIX4z4BujhowqwOh7dfWRyYY8tD61nVsKfMBW00nuPQSLiU";

// WARNING: It's highly recommended to use your full sk_live_... or sk_test_... secret key
// for the Firebase Stripe Extension. A restricted key (rk_...) might not have sufficient permissions.
// Monitor Firebase Function logs for Stripe API errors if payments fail.
// Make sure to set STRIPE_SECRET_KEY as a server-side environment variable.
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_51RMuSWL8kxrPyagwNAjjZHKSmERMT6tO9v7OiH7AuuhScwahN47LZHKKX116pT0whLyFsjaKr0EYayxDhRYxmdgH00tjTLgvF9";

// PagBank (kept for reference if PagBank button is still used as alternative)
export const PAGBANK_PRE_APPROVAL_CODE = "A584618E1414728444067FA92A607421";
//A584618E-1414-7284-4406-7FA92A607421
