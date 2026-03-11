'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePaginatedQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { PaginatedCollectionSection } from '@/components/collections/PaginatedCollectionSection'

const SERIES_PAGE_SIZE = 24

type SeriesListData = NonNullable<FunctionReturnType<typeof api.series.queries.listPaginated>>
type SeriesListItem = SeriesListData['page'][number]

export function SeriesGrid() {
  const { results, status, loadMore } = usePaginatedQuery(api.series.queries.listPaginated, {}, {
    initialNumItems: SERIES_PAGE_SIZE,
  })

  return (
    <PaginatedCollectionSection
      emptyState={<p className='text-center text-muted-foreground py-12'>No series yet.</p>}
      items={results}
      loadMore={loadMore}
      loadingFallback={<SeriesGridSkeleton />}
      manualLoadLabel='Load more series'
      pageSize={SERIES_PAGE_SIZE}
      renderItems={renderSeriesItems}
      rootMargin='700px 0px'
      status={status}
    />
  )
}

export type SeriesGridItemProps = {
  slug: string
  name: string
  coverUrl: string | null
}

export function SeriesGridItem({ slug, name, coverUrl }: SeriesGridItemProps) {
  return (
    <Link href={`/series/${slug}`} className='group block'>
      <div className='aspect-32/25 relative bg-muted rounded-lg overflow-hidden mb-2'>
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={name}
            fill
            className='object-cover group-hover:scale-105 transition-transform duration-200'
            sizes='(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw'
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center'>{name}</div>
        )}
      </div>

      <h3 className='font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors'>{name}</h3>
    </Link>
  )
}

function SeriesGridSkeleton() {
  return (
    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className='space-y-2'>
          <div className='aspect-32/25 bg-muted rounded-lg animate-pulse' />
          <div className='h-4 bg-muted rounded animate-pulse w-3/4' />
        </div>
      ))}
    </div>
  )
}

function renderSeriesItems(seriesList: SeriesListItem[]) {
  return (
    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
      {seriesList.map((series) => (
        <SeriesGridItem key={series._id} slug={series.slug ?? series._id} name={series.name} coverUrl={series.coverUrl} />
      ))}
    </div>
  )
}
