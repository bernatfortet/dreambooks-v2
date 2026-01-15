'use client'

import { use } from 'react'
import { Id } from '@/convex/_generated/dataModel'
import { SeriesCard } from '@/components/series/SeriesCard'
import Link from 'next/link'

type AdminSeriesDetailPageProps = {
  params: Promise<{ id: string }>
}

export default function AdminSeriesDetailPage({ params }: AdminSeriesDetailPageProps) {
  const { id } = use(params)

  return (
    <main className="container mx-auto py-8 px-4">
      <Link href="/ad/series" className="text-sm text-muted-foreground hover:underline mb-4 block">
        ← Back to Series
      </Link>

      <SeriesCard seriesId={id as Id<'series'>} />
    </main>
  )
}
