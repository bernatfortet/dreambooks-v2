'use client'

import type { ReactNode } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { BookCard } from '@/components/books/BookCard'
import { Id } from '@/convex/_generated/dataModel'
import type { BookFilters } from './filters/types'

type BookItem = {
  _id: string
  slug?: string | null
  title: string
  authors: string[]
  coverUrl: string | null
  seriesPosition?: number | null
}

const BOOK_GRID_CLASSES = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'

type BookGridContainerProps = {
  children: React.ReactNode
  className?: string
}

export function BookGridContainer({ children, className }: BookGridContainerProps) {
  return <div className={`${BOOK_GRID_CLASSES} ${className ?? ''}`}>{children}</div>
}

type BookGridListProps = {
  books: BookItem[]
  className?: string
}

export function BookGridList({ books, className }: BookGridListProps) {
  if (books.length === 0) {
    return <p className='text-center text-muted-foreground py-12'>No books yet.</p>
  }

  return (
    <BookGridContainer className={className}>
      {books.map((book) => (
        <BookCard
          key={book._id}
          slug={book.slug ?? book._id}
          title={book.title}
          authors={book.authors}
          coverUrl={book.coverUrl}
          seriesPosition={book.seriesPosition}
        />
      ))}
    </BookGridContainer>
  )
}

type BookGridProps = {
  filters?: BookFilters
}

export function BookGrid({ filters }: BookGridProps) {
  const hasFilters = filters && Object.keys(filters).some((key) => filters[key as keyof BookFilters] !== undefined)

  const queryArgs = hasFilters
    ? {
        filters: {
          ...(filters.ageRangeBuckets && filters.ageRangeBuckets.length > 0 && { ageRangeBuckets: filters.ageRangeBuckets }),
          ...(filters.gradeLevelBuckets && filters.gradeLevelBuckets.length > 0 && { gradeLevelBuckets: filters.gradeLevelBuckets }),
          ...(filters.awardIds &&
            filters.awardIds.length > 0 && {
              awardIds: filters.awardIds as Id<'awards'>[],
            }),
          ...(filters.seriesFilter && filters.seriesFilter !== 'all' && { seriesFilter: filters.seriesFilter }),
        },
      }
    : {}

  const query = hasFilters ? api.books.queries.listPaginatedWithFilters : api.books.queries.listPaginated

  const { results, status, loadMore } = usePaginatedQuery(query as any, queryArgs, { initialNumItems: 24 }) as {
    results: BookItem[]
    status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
    loadMore: (numItems: number) => void
  }

  if (status === 'LoadingFirstPage') {
    return <BookGridSkeleton />
  }

  return (
    <div className='space-y-8'>
      <BookGridList books={results} />

      {status === 'CanLoadMore' && (
        <div className='flex justify-center'>
          <Button variant='outline' onClick={() => loadMore(24)}>
            Load more
          </Button>
        </div>
      )}

      {status === 'LoadingMore' && (
        <div className='flex justify-center'>
          <p className='text-muted-foreground'>Loading...</p>
        </div>
      )}
    </div>
  )
}

type BookGridSkeletonProps = {
  count?: number
}

export function BookGridSkeleton({ count = 12 }: BookGridSkeletonProps) {
  return (
    <BookGridContainer>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className='space-y-2'>
          <div className='aspect-2/3 bg-muted rounded-md animate-pulse' />
          <div className='h-4 bg-muted rounded animate-pulse w-3/4' />
          <div className='h-3 bg-muted rounded animate-pulse w-1/2' />
        </div>
      ))}
    </BookGridContainer>
  )
}
