'use client'

import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { PaginatedCollectionSection } from '@/components/collections/PaginatedCollectionSection'
import { BookMasonryList, type BookMasonryItem } from './BookMasonryGrid'

const DEFAULT_PAGE_SIZE = 24

type PublicShelfQueryResult = FunctionReturnType<typeof api.profiles.queries.listPublicShelf>
type PublicShelfBook = PublicShelfQueryResult['page'][number]

export function PaginatedBookMasonrySection({
  emptyMessage,
  items,
  loadMore,
  status,
}: {
  emptyMessage: string
  items: PublicShelfBook[]
  loadMore: (numItems: number) => void
  status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
}) {
  const masonryItems = items.map(toBookMasonryItem)

  return (
    <PaginatedCollectionSection
      emptyState={<p className='py-12 text-center text-muted-foreground'>{emptyMessage}</p>}
      items={masonryItems}
      loadMore={loadMore}
      loadingFallback={<BookShelfLoadingSkeleton />}
      manualLoadLabel='Load more books'
      pageSize={DEFAULT_PAGE_SIZE}
      renderItems={(loadedItems) => <BookMasonryList books={loadedItems} showProfileActions={false} />}
      status={status}
    />
  )
}

function BookShelfLoadingSkeleton() {
  return (
    <div
      className='grid gap-3'
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}
    >
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className='space-y-2'>
          <div className='aspect-2/3 animate-pulse rounded-md bg-muted' />
          <div className='h-4 w-3/4 animate-pulse rounded bg-muted' />
          <div className='h-3 w-1/2 animate-pulse rounded bg-muted' />
        </div>
      ))}
    </div>
  )
}

function toBookMasonryItem(book: PublicShelfBook): BookMasonryItem {
  return {
    _id: book._id,
    slug: book.slug,
    title: book.title,
    authors: book.authors,
    coverUrl: book.cover.url ?? book.cover.urlThumb,
    coverWidth: book.cover.width,
    coverHeight: book.cover.height,
    dominantColor: book.cover.dominantColor,
  }
}
