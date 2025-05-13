
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
      // Add other image domains if needed, e.g., for user-uploaded content
    ],
  },
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0",
  }
};

export default nextConfig;

