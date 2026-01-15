'use client'

import { SeriesList } from '@/components/series/SeriesList'

export default function SeriesPage() {
  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Series</h1>

      <SeriesList />
    </main>
  )
}
