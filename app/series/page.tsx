'use client'

import { useConvexPageState } from '@/components/convex/useConvexPageState'
import { SeriesGrid } from '@/components/series/SeriesGrid'
import { PageContainer } from '@/components/ui/PageContainer'

export default function SeriesPage() {
  const { canRenderConvex, hasConvexUrl, isMounted } = useConvexPageState()

  if (!isMounted) {
    return (
      <PageContainer>
        <h1 className='text-3xl font-bold mb-6'>Series</h1>
        <p className='text-muted-foreground'>Loading series...</p>
      </PageContainer>
    )
  }

  if (!hasConvexUrl) {
    return (
      <PageContainer>
        <h1 className='text-3xl font-bold mb-6'>Series</h1>
        <p className='text-muted-foreground'>Set NEXT_PUBLIC_CONVEX_URL in Vercel to load series data.</p>
      </PageContainer>
    )
  }

  if (!canRenderConvex) return null

  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Series</h1>

      <SeriesGrid />
    </PageContainer>
  )
}
