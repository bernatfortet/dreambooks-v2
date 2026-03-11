'use client'

import { useRef, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { getAwardTitleMarkerByResultType } from '@/components/awards/AwardResultMarker'
import { useSuperadmin } from '@/components/auth/use-superadmin'
import { PaginatedCollectionSection } from '@/components/collections/PaginatedCollectionSection'
import { Id } from '@/convex/_generated/dataModel'
import type { BookFilters } from '../filters/types'
import { BookMasonryCard } from './BookMasonryCard'
import { calculateMasonryLayout, type MasonryItem, type MasonryLayoutMode } from './useMasonryLayout'
import { getColumnCount, getColumnWidth, MASONRY_GAP } from './constants'

const BOOK_PAGE_SIZE = 24

function BookMasonrySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className='grid gap-3'
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}
    >
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
  _id: Id<'books'>
  slug?: string | null
  title: string
  authors: string[]
  coverUrl: string | null
  coverWidth: number
  coverHeight: number
  dominantColor?: string | null
  seriesPosition?: number | null
  badge?: ReactNode
  titleMarker?: ReactNode
}

type MeasuredDimensions = {
  width: number
  height: number
}

type BookMasonryListProps = {
  books: BookMasonryItem[]
  className?: string
  showProfileActions?: boolean
  layoutMode?: MasonryLayoutMode
}

export function BookMasonryList({ books, className, showProfileActions = true, layoutMode = 'masonry' }: BookMasonryListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [measuredDimensionsById, setMeasuredDimensionsById] = useState<Record<string, MeasuredDimensions>>({})
  const { isSuperadmin } = useSuperadmin()

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
      coverWidth: measuredDimensionsById[book._id]?.width ?? book.coverWidth,
      coverHeight: measuredDimensionsById[book._id]?.height ?? book.coverHeight,
    }))

    return calculateMasonryLayout(masonryItems, containerWidth, columnCount, MASONRY_GAP, layoutMode)
  }, [containerWidth, books, layoutMode, measuredDimensionsById])

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
  const columnWidth = getColumnWidth(containerWidth, columnCount)
  const priorityCount = columnCount * 2

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', height: layout.containerHeight, minHeight: columnWidth * 1.5 }}
    >
      {books.map((book, index) => {
        const position = layout.positions.get(book._id)
        if (!position) return null

        return (
          <BookMasonryCard
            key={book._id}
            bookId={book._id}
            slug={book.slug ?? book._id}
            title={book.title}
            authors={book.authors}
            coverUrl={book.coverUrl}
            dominantColor={book.dominantColor}
            seriesPosition={book.seriesPosition}
            badge={book.badge}
            titleMarker={book.titleMarker}
            canManageBooks={isSuperadmin}
            showProfileActions={showProfileActions}
            style={{
              position: 'absolute',
              top: `${position.y}px`,
              left: `${position.x}px`,
              width: `${position.width}px`,
              height: `${position.height}px`,
            }}
            imageHeight={position.imageHeight}
            priority={index < priorityCount}
            onImageMeasure={(dimensions) => {
              setMeasuredDimensionsById((current) => {
                const existing = current[book._id]
                if (existing && existing.width === dimensions.width && existing.height === dimensions.height) {
                  return current
                }

                return {
                  ...current,
                  [book._id]: dimensions,
                }
              })
            }}
          />
        )
      })}
    </div>
  )
}

type BookMasonryGridProps = {
  filters?: BookFilters
}

type QueryBook = {
  _id: Id<'books'>
  slug?: string | null
  title: string
  authors: string[]
  topAwardResultType?: 'winner' | 'honor' | null
  cover: {
    url: string | null
    urlThumb?: string | null
    width: number
    height: number
    dominantColor?: string | null
  }
  seriesPosition?: number | null
}

export function BookMasonryGrid({ filters }: BookMasonryGridProps) {
  if (hasBookFilters(filters)) {
    return <FilteredBookMasonryGrid filters={filters} />
  }

  return <AllBooksMasonryGrid />
}

function FilteredBookMasonryGrid({ filters }: { filters: BookFilters }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.books.queries.listPaginatedWithFilters,
    buildFilteredQueryArgs(filters),
    { initialNumItems: BOOK_PAGE_SIZE },
  )

  return <PaginatedBookMasonryResults rawResults={results} status={status} loadMore={loadMore} />
}

function AllBooksMasonryGrid() {
  const { results, status, loadMore } = usePaginatedQuery(api.books.queries.listPaginated, {}, { initialNumItems: BOOK_PAGE_SIZE })

  return <PaginatedBookMasonryResults rawResults={results} status={status} loadMore={loadMore} />
}

type PaginatedBookMasonryResultsProps = {
  rawResults: QueryBook[]
  status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
  loadMore: (numItems: number) => void
}

function PaginatedBookMasonryResults({ rawResults, status, loadMore }: PaginatedBookMasonryResultsProps) {
  return (
    <PaginatedCollectionSection
      emptyState={<p className='text-center text-muted-foreground py-12'>No books yet.</p>}
      items={rawResults}
      loadMore={loadMore}
      loadingFallback={<BookMasonrySkeleton />}
      manualLoadLabel='Load more books'
      pageSize={BOOK_PAGE_SIZE}
      renderItems={renderPaginatedBookMasonryItems}
      rootMargin='1400px 0px'
      status={status}
    />
  )
}

function renderPaginatedBookMasonryItems(rawResults: QueryBook[]) {
  const results = rawResults.map(transformToMasonryItem)

  return <BookMasonryList books={results} />
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
    titleMarker: getAwardTitleMarkerByResultType(book.topAwardResultType),
  }
}

function hasBookFilters(filters: BookFilters | undefined): filters is BookFilters {
  if (!filters) return false

  return Object.keys(filters).some((key) => filters[key as keyof BookFilters] !== undefined)
}

function buildFilteredQueryArgs(filters: BookFilters) {
  return {
    filters: {
      ...(filters.ageRangeBuckets?.length ? { ageRangeBuckets: filters.ageRangeBuckets } : {}),
      ...(filters.gradeLevelBuckets?.length ? { gradeLevelBuckets: filters.gradeLevelBuckets } : {}),
      ...(filters.awardIds?.length ? { awardIds: filters.awardIds as Id<'awards'>[] } : {}),
      ...(filters.seriesFilter && filters.seriesFilter !== 'all' ? { seriesFilter: filters.seriesFilter } : {}),
    },
  }
}
