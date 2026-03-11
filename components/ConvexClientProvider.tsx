'use client'

import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs'
import { ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'
import { ActiveProfileProvider } from '@/components/profiles/ActiveProfileProvider'

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return <>{children}</>
  }

  return (
    <ConvexAuthNextjsProvider client={convex}>
      <ActiveProfileProvider>{children}</ActiveProfileProvider>
    </ConvexAuthNextjsProvider>
  )
}
