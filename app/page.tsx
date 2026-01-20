'use client'

import { useState } from 'react'
import { BookGrid } from '@/components/books/BookGrid'
import { BookFilterBar } from '@/components/books/BookFilterBar'
import type { BookFilters } from '@/components/books/filters/types'
import { PageContainer } from '@/components/ui/PageContainer'

export default function HomePage() {
  const [filters, setFilters] = useState<BookFilters>({})

  return (
    <main className='w-full'>
      <BookFilterBar filters={filters} onFiltersChange={setFilters} />
      <PageContainer>
        <BookGrid filters={filters} />
      </PageContainer>
    </main>
  )
}
