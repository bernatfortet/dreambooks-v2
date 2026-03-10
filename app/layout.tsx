import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ConvexClientProvider } from '@/components/ConvexClientProvider'
import { Nav } from '@/components/Nav'
import './globals.css'
import { siteConfig } from '@/config/site'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FFFFFF',
}

export const metadata: Metadata = {
  // Check https://github.com/shadcn-ui/ui/blob/main/apps/www/app/layout.tsx for examples on how to fill this in
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: {
    canonical: siteConfig.url,
  },

  keywords: ["Children's books", 'Juvenile fiction', 'Caldecott', 'Newbery', 'Dream Books'],

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: '@shadcn',
  },

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
    // apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: `${siteConfig.url}/site.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.name,
  },
  formatDetection: {
    telephone: false,
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
            <Nav />
            <main className='min-h-[calc(100vh-52px)]'>{children}</main>
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  )
}
