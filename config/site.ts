const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const siteConfig = {
  name: 'Dreambooks',
  description: 'Discover, browse, and manage beautiful children\'s books.',
  url: siteUrl,
  ogImage: `${siteUrl}/og.png`,
}
