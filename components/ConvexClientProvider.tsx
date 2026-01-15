'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ReactNode, useMemo } from 'react'

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!url) {
      // During build or when URL is not set, return null
      return null
    }
    return new ConvexReactClient(url)
  }, [])

  if (!convex) {
    // Render children without Convex during build
    return <>{children}</>
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}
