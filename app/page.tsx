'use client'

import { useState } from 'react'
import { BookGrid } from '@/components/books/BookGrid'
import { BookFilterBar } from '@/components/books/BookFilterBar'
import { useConvexPageState } from '@/components/convex/useConvexPageState'
import type { BookFilters } from '@/components/books/filters/types'
import { PageContainer } from '@/components/ui/PageContainer'

export default function HomePage() {
  const [filters, setFilters] = useState<BookFilters>({})
  const { canRenderConvex, hasConvexUrl, isMounted } = useConvexPageState()

  if (!isMounted) {
    return (
      <main className='w-full'>
        <PageContainer>
          <p className='text-muted-foreground'>Loading books...</p>
        </PageContainer>
      </main>
    )
  }

  if (!hasConvexUrl) {
    return (
      <main className='w-full'>
        <PageContainer>
          <p className='text-muted-foreground'>Set NEXT_PUBLIC_CONVEX_URL in Vercel to load the book catalog.</p>
        </PageContainer>
      </main>
    )
  }

  if (!canRenderConvex) return null

  return (
    <main className='w-full'>
      <BookFilterBar filters={filters} onFiltersChange={setFilters} />
      <PageContainer>
        <BookGrid filters={filters} />
      </PageContainer>
    </main>
  )
}
