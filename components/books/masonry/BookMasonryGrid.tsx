'use client'

import { useRef, useLayoutEffect, useMemo, useState } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Id } from '@/convex/_generated/dataModel'
import type { BookFilters } from '../filters/types'
import { BookMasonryCard } from './BookMasonryCard'
import { calculateMasonryLayout, type MasonryItem } from './useMasonryLayout'
import { getColumnCount, MASONRY_GAP } from './constants'

function BookMasonrySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className='grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className='space-y-2'>
          <div className='aspect-2/3 bg-muted rounded-md animate-pulse' />
          <div className='h-4 bg-muted rounded animate-pulse w-3/4' />
          <div className='h-3 bg-muted rounded animate-pulse w-1/2' />
        </div>
      ))}
    </div>
  )
}

export type BookMasonryItem = {
  _id: string
  slug?: string | null
  title: string
  authors: string[]
  coverUrl: string | null
  coverWidth: number
  coverHeight: number
  dominantColor?: string | null
  seriesPosition?: number | null
}

type BookMasonryListProps = {
  books: BookMasonryItem[]
  className?: string
}

export function BookMasonryList({ books, className }: BookMasonryListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => {
      setContainerWidth(container.offsetWidth)
    }

    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const layout = useMemo(() => {
    if (containerWidth === null || books.length === 0) {
      return { positions: new Map(), containerHeight: 0 }
    }

    const columnCount = getColumnCount(containerWidth)
    const masonryItems: MasonryItem[] = books.map((book) => ({
      id: book._id,
      title: book.title,
      coverWidth: book.coverWidth,
      coverHeight: book.coverHeight,
    }))

    return calculateMasonryLayout(masonryItems, containerWidth, columnCount, MASONRY_GAP)
  }, [containerWidth, books])

  if (books.length === 0) {
    return <p className='text-center text-muted-foreground py-12'>No books yet.</p>
  }

  if (containerWidth === null) {
    return (
      <div ref={containerRef} className={className}>
        <BookMasonrySkeleton count={Math.min(books.length, 12)} />
      </div>
    )
  }

  const columnCount = getColumnCount(containerWidth)
  const priorityCount = columnCount * 2

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', height: layout.containerHeight }}>
      {books.map((book, index) => {
        const position = layout.positions.get(book._id)
        if (!position) return null

        return (
          <BookMasonryCard
            key={book._id}
            slug={book.slug ?? book._id}
            title={book.title}
            authors={book.authors}
            coverUrl={book.coverUrl}
            dominantColor={book.dominantColor}
            seriesPosition={book.seriesPosition}
            style={{
              position: 'absolute',
              top: `${position.y}px`,
              left: `${position.x}px`,
              width: `${position.width}px`,
              height: `${position.height}px`,
            }}
            imageHeight={position.imageHeight}
            priority={index < priorityCount}
          />
        )
      })}
    </div>
  )
}

type BookMasonryGridProps = {
  filters?: BookFilters
}

// Transform query result to BookMasonryItem format
type QueryBook = {
  _id: string
  slug?: string | null
  title: string
  authors: string[]
  cover: {
    url: string | null
    urlThumb?: string | null
    width: number
    height: number
    dominantColor?: string | null
  }
  seriesPosition?: number | null
}

function transformToMasonryItem(book: QueryBook): BookMasonryItem {
  return {
    _id: book._id,
    slug: book.slug,
    title: book.title,
    authors: book.authors,
    coverUrl: book.cover?.url ?? null,
    coverWidth: book.cover?.width ?? 200,
    coverHeight: book.cover?.height ?? 300,
    dominantColor: book.cover?.dominantColor,
    seriesPosition: book.seriesPosition,
  }
}

export function BookMasonryGrid({ filters }: BookMasonryGridProps) {
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

  const {
    results: rawResults,
    status,
    loadMore,
  } = usePaginatedQuery(query as any, queryArgs, { initialNumItems: 24 }) as {
    results: QueryBook[]
    status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
    loadMore: (numItems: number) => void
  }

  const results = rawResults.map(transformToMasonryItem)

  if (status === 'LoadingFirstPage') {
    return <BookMasonrySkeleton />
  }

  return (
    <div className='space-y-8'>
      <BookMasonryList books={results} />

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
