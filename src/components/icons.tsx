import type { SVGProps } from 'react';

export const FervoAppLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 50"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
    aria-label="Fervo App Logo"
  >
    <defs>
      <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 1 }} />
        <stop offset="50%" style={{ stopColor: 'hsl(var(--secondary))', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: 'hsl(var(--accent))', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    <path d="M10 40 C10 20, 30 20, 30 40 C30 60, 10 60, 10 40 Z M30 25 L50 25 M40 15 L40 35" stroke="url(#neonGradient)" strokeWidth="3" />
    <text x="60" y="35" fontFamily="Arial, sans-serif" fontSize="30" fontWeight="bold" fill="url(#neonGradient)">
      Fervo
    </text>
    <text x="145" y="35" fontFamily="Arial, sans-serif" fontSize="30" fill="url(#neonGradient)">
      App
    </text>
  </svg>
);

export const IconNightclub = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M8 2h8v2H8zM5 4h14v2H5zm-2 3h18v2H3zm2 3h14v10H5V10zm2 2v6h2v-6H7zm4 0v6h2v-6h-2zm4 0v6h2v-6h-2zM3 20h18v2H3z" />
  </svg>
); // Placeholder, simple disco ball like structure

export const IconBar = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M21 3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9V3zm-6 10.59L9.41 8h5.18L15 13.59zM5 5h14l-2.4 2.99H7.4L5 5z" />
  </svg>
); // Beer mug

export const IconStandUp = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.41 2.72 6.23 6 6.72V22h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
  </svg>
); // Microphone

export const IconShowHouse = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h2v2H6zm10-4h2v2h-2zm0 4h2v2h-2zm-5-4h2v2h-2zm0 4h2v2h-2z" />
  </svg>
); // Ticket / Stage like

export const IconAdultEntertainment = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props} className="text-sm">
    <path d="M19 13h-2.67l-1-2H11v меньше семи -2h-2v2H5c-1.1 0-2 .9-2 2v меньше семи -2h18v2c0-1.1-.9-2-2-2zm-8-5V6c0-1.66-1.34-3-3-3S5 4.34 5 6v2h6zm8 0V6c0-1.66-1.34-3-3-3s-3 1.34-3 3v2h6z" />
    <text x="50%" y="60%" dominantBaseline="middle" textAnchor="middle" fontSize="10" fontWeight="bold">18+</text>
  </svg>
);

export const IconLGBT = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" {...props}>
    <rect x="2" y="4" width="20" height="3" fill="#FF0000" /> {/* Red */}
    <rect x="2" y="7" width="20" height="3" fill="#FFA500" /> {/* Orange */}
    <rect x="2" y="10" width="20" height="3" fill="#FFFF00" /> {/* Yellow */}
    <rect x="2" y="13" width="20" height="3" fill="#008000" /> {/* Green */}
    <rect x="2" y="16" width="20" height="3" fill="#0000FF" /> {/* Blue */}
    <rect x="2" y="19" width="20" height="3" fill="#4B0082" /> {/* Indigo/Purple */}
  </svg>
); // Rainbow flag

export const IconMapPin = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

