'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function SeriesGrid() {
  const seriesList = useQuery(api.series.queries.list)

  if (!seriesList) return <div className='py-8 text-center text-gray-500'>Loading series...</div>
  if (seriesList.length === 0) return <div className='py-8 text-center text-gray-500'>No series found</div>

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {seriesList.map((series) => (
        <div key={series._id} className='rounded-lg border p-4'>
          <h3 className='font-semibold'>{series.name}</h3>
          <p className='mt-1 text-sm text-gray-600'>
            {series.scrapeStatus} &middot; {series.expectedBookCount ?? '?'} books
          </p>
        </div>
      ))}
    </div>
  )
}
