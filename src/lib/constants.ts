export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "YOUR_DEFAULT_API_KEY_HERE";

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