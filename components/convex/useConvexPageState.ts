'use client'

import { useEffect, useState } from 'react'

export function useConvexPageState() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const hasConvexUrl = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

  return {
    isMounted,
    hasConvexUrl,
    canRenderConvex: isMounted && hasConvexUrl,
  }
}
