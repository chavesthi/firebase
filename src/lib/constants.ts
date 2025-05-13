
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

// Reward amount for sharing an event (per venue)
export const FERVO_COINS_SHARE_REWARD = 2;

// Coupon System Constants (Venue-Specific)
export const FERVO_COINS_FOR_COUPON = 20; // Coins needed *per venue*
// Dynamic description created in handleShareEvent, this is the base reward
export const COUPON_REWARD_DESCRIPTION = "1 Lata Cerveja 350ml ou Refrigerante 350ml";
export const COUPON_CODE_PREFIX = "FERVO";

// Stripe API Keys - Replace with your actual keys in .env
export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || "pk_test_51RMuSWL8kxrPyagwamO1hVrwaZq84lMkkzQ1AS4dW64zRYj1jVOUIX4z4BujhowqwOh7dfWRyYY8tD61nVsKfMBW00nuPQSLiU";
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_51RMuSWL8kxrPyagwNAjjZHKSmERMT6tO9v7OiH7AuuhScwahN47LZHKKX116pT0whLyFsjaKr0EYayxDhRYxmdgH00tjTLgvF9";


// IMPORTANT: This MUST be a Stripe PRICE ID (e.g., price_xxxxxxxxxxxxxx), NOT a Product ID.
// To use your product (e.g., prod_SIMUUs67RhC80g), create a Price for it in your Stripe Dashboard
// and set NEXT_PUBLIC_STRIPE_PRICE_ID in your .env file to that Price ID.
export const STRIPE_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || "price_YOUR_FERVO_PLAN_PRICE_ID"; 

// App URL
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9002";

// PagBank Pre-approval Code (if still used as an alternative)
export const PAGBANK_PRE_APPROVAL_CODE = "A584618E1414728444067FA92A607421";




