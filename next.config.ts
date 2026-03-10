import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Convex API and legacy file storage URLs
        protocol: 'https',
        hostname: '**.convex.cloud',
      },
      {
        // Convex file-serving URLs returned by storage.getUrl()
        protocol: 'https',
        hostname: '**.convex.site',
      },
      {
        // Convex root domains
        protocol: 'https',
        hostname: 'convex.cloud',
      },
      {
        protocol: 'https',
        hostname: 'convex.site',
      },
      {
        // Amazon image URLs
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
    ],
  },
}

export default nextConfig
