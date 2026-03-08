'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function SeriesGrid() {
  const series = useQuery(api.series.queries.list)

  if (!series) {
    return <p className='text-muted-foreground'>Loading series...</p>
  }

  if (series.length === 0) {
    return <p className='text-muted-foreground'>No series found.</p>
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
      {series.map((s) => (
        <div key={s._id} className='border rounded-lg p-4'>
          <h3 className='font-semibold'>{s.name}</h3>
        </div>
      ))}
    </div>
  )
}
