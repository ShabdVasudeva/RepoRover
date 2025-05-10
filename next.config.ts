
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
      {
        protocol: 'https',
        hostname: 'github.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  // Make environment variables available to the client-side
  // Note: Prefix with NEXT_PUBLIC_ to expose to the browser
  // These are already prefixed, so they are automatically available.
  // No explicit publicRuntimeConfig needed if using NEXT_PUBLIC_ prefix.
};

export default nextConfig;
