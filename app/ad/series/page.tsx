'use client'

import { SeriesList } from '@/components/series/SeriesList'
import Link from 'next/link'

export default function AdminSeriesPage() {
  return (
    <main className="container mx-auto py-8 px-4">
      <Link href="/ad" className="text-sm text-muted-foreground hover:underline mb-4 block">
        ← Back to admin
      </Link>

      <h1 className="text-3xl font-bold mb-6">Series</h1>

      <SeriesList />
    </main>
  )
}
