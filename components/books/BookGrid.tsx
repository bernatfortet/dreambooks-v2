'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'

export function BookGrid() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.books.queries.listPaginated,
    {},
    { initialNumItems: 24 },
  ) as {
    results: Array<{
      _id: string
      title: string
      authors: string[]
      coverUrl: string | null
    }>
    status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
    loadMore: (numItems: number) => void
  }

  if (status === 'LoadingFirstPage') {
    return <BookGridSkeleton />
  }

  if (results.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No books yet.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {results.map((book) => (
          <BookGridItem
            key={book._id}
            id={book._id}
            title={book.title}
            authors={book.authors}
            coverUrl={book.coverUrl}
          />
        ))}
      </div>

      {status === 'CanLoadMore' && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(24)}>
            Load more
          </Button>
        </div>
      )}

      {status === 'LoadingMore' && (
        <div className="flex justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      )}
    </div>
  )
}

type BookGridItemProps = {
  id: string
  title: string
  authors: string[]
  coverUrl: string | null
}

function BookGridItem({ id, title, authors, coverUrl }: BookGridItemProps) {
  return (
    <Link href={`/books/${id}`} className="group block">
      <div className="aspect-[2/3] relative bg-muted rounded-lg overflow-hidden mb-2">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
            {title}
          </div>
        )}
      </div>

      <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
        {title}
      </h3>

      <p className="text-xs text-muted-foreground line-clamp-1">
        {authors.join(', ')}
      </p>
    </Link>
  )
}

function BookGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="aspect-[2/3] bg-muted rounded-lg animate-pulse" />
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
        </div>
      ))}
    </div>
  )
}
