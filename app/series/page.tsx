'use client'

import { SeriesGrid } from '@/components/series/SeriesGrid'
import { PageContainer } from '@/components/ui/PageContainer'

export default function SeriesPage() {
  return (
    <PageContainer>
      <h1 className='text-3xl font-bold mb-6'>Series</h1>

      <SeriesGrid />
    </PageContainer>
  )
}
