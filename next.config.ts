import type { NextConfig } from 'next';

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'stc.pagseguro.uol.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0',
  },
  experimental: {
    allowedDevOrigins: [
      'https://9003-firebase-studio-1746595136928.cluster-m7tpz3bmgjgoqrktlvd4ykrc2m.cloudworkstations.dev',
    ],
  },
} as NextConfig | any; // <- Tipagem ajustada para aceitar experimental extra

export default nextConfig;
