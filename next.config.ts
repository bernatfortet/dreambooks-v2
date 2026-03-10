import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Convex file storage URLs
        protocol: 'https',
        hostname: '*.convex.cloud',
      },
      {
        // Convex file storage URLs (alternative pattern)
        protocol: 'https',
        hostname: 'convex.cloud',
      },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
  },
}

export default nextConfig
