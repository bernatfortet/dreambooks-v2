'use client'

import type { ReactNode } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { BookCard } from '@/components/books/BookCard'
import { Id } from '@/convex/_generated/dataModel'
import type { BookFilters } from './filters/types'
import { BookMasonryGrid, BookMasonryList, type BookMasonryItem } from './masonry'

type BookItem = {
  _id: string
  slug?: string | null
  title: string
  authors: string[]
  cover?: {
    url?: string | null
    width?: number
    height?: number
  } | null
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
  const masonryBooks: BookMasonryItem[] = books.map((book) => ({
    _id: book._id,
    slug: book.slug,
    title: book.title,
    authors: book.authors,
    coverUrl: book.cover?.url ?? null,
    coverWidth: book.cover?.width ?? 200,
    coverHeight: book.cover?.height ?? 300,
    seriesPosition: book.seriesPosition,
  }))

  return <BookMasonryList books={masonryBooks} className={className} />
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
