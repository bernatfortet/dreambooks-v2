'use client'

import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { BookMasonryCard } from '@/components/books/masonry/BookMasonryCard'
import { BookMasonryGrid, type BookMasonryItem } from '@/components/books/masonry'
import type { Id } from '@/convex/_generated/dataModel'
import type { BookFilters } from './filters/types'

type BookItem = {
  _id: Id<'books'>
  slug?: string | null
  title: string
  authors?: string[]
  cover?: {
    url?: string | null
    width?: number
    height?: number
    dominantColor?: string | null
  } | null
  coverUrl?: string | null
  coverWidth?: number
  coverHeight?: number
  dominantColor?: string | null
  seriesPosition?: number | null
  badge?: ReactNode
  titleMarker?: ReactNode
}

const BOOK_GRID_CLASSES = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 justify-start'

type BookGridContainerProps = {
  children: ReactNode
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
  const viewer = useQuery(api.users.queries.viewer)
  const canManageBooks = viewer?.isSuperadmin === true

  return (
    <BookGridContainer className={className}>
      {books.map((book, index) => {
        const normalizedBook = normalizeBookForMasonry(book)
        const coverAspectRatio =
          normalizedBook.coverWidth > 0 && normalizedBook.coverHeight > 0
            ? normalizedBook.coverWidth / normalizedBook.coverHeight
            : 2 / 3

        return (
          <BookMasonryCard
            key={normalizedBook._id}
            bookId={normalizedBook._id}
            slug={normalizedBook.slug ?? normalizedBook._id}
            title={normalizedBook.title}
            authors={normalizedBook.authors}
            coverUrl={normalizedBook.coverUrl}
            dominantColor={normalizedBook.dominantColor}
            seriesPosition={normalizedBook.seriesPosition}
            badge={normalizedBook.badge}
            titleMarker={normalizedBook.titleMarker}
            canManageBooks={canManageBooks}
            style={{}}
            imageHeight={0}
            imageAspectRatio={coverAspectRatio}
            priority={index < 12}
          />
        )
      })}
    </BookGridContainer>
  )
}

type BookGridProps = {
  filters?: BookFilters
}

export function BookGrid({ filters }: BookGridProps) {
  return <BookMasonryGrid filters={filters} />
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

function normalizeBookForMasonry(book: BookItem): BookMasonryItem {
  const coverWidth = book.cover?.width ?? book.coverWidth ?? 200
  const coverHeight = book.cover?.height ?? book.coverHeight ?? 300

  return {
    _id: book._id,
    slug: book.slug,
    title: book.title,
    authors: book.authors ?? [],
    coverUrl: book.cover?.url ?? book.coverUrl ?? null,
    coverWidth,
    coverHeight,
    dominantColor: book.cover?.dominantColor ?? book.dominantColor ?? null,
    seriesPosition: book.seriesPosition,
    badge: book.badge,
    titleMarker: book.titleMarker,
  }
}
