'use client'

import { use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

type SeriesPageProps = {
  params: Promise<{ id: string }>
}

export default function SeriesPage({ params }: SeriesPageProps) {
  const { id } = use(params)
  const series = useQuery(api.series.queries.getWithBooks, { id: id as Id<'series'> })

  if (series === undefined) {
    return <SeriesDetailSkeleton />
  }

  if (series === null) {
    return (
      <main className="container mx-auto py-8 px-4">
        <Link href="/" className="text-sm text-muted-foreground hover:underline mb-4 block">
          ← Back to books
        </Link>
        <p className="text-muted-foreground">Series not found</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto py-8 px-4">
      <Link href="/" className="text-sm text-muted-foreground hover:underline mb-6 block">
        ← Back to books
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{series.name}</h1>

        {series.description && (
          <p className="text-muted-foreground mt-2 max-w-2xl">{series.description}</p>
        )}

        <p className="text-sm text-muted-foreground mt-2">
          {series.books.length} {series.books.length === 1 ? 'book' : 'books'}
        </p>
      </div>

      {series.books.length === 0 ? (
        <p className="text-muted-foreground">No books in this series yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {series.books.map((book) => (
            <SeriesBookItem
              key={book._id}
              id={book._id}
              title={book.title}
              authors={book.authors}
              coverUrl={book.coverUrl}
              position={book.seriesPosition}
            />
          ))}
        </div>
      )}
    </main>
  )
}

type SeriesBookItemProps = {
  id: string
  title: string
  authors: string[]
  coverUrl: string | null
  position?: number | null
}

function SeriesBookItem({ id, title, authors, coverUrl, position }: SeriesBookItemProps) {
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

        {position && (
          <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-medium">
            #{position}
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

function SeriesDetailSkeleton() {
  return (
    <main className="container mx-auto py-8 px-4">
      <div className="h-4 w-24 bg-muted rounded animate-pulse mb-6" />

      <div className="mb-8">
        <div className="h-8 bg-muted rounded animate-pulse w-1/3 mb-2" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/4" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="aspect-[2/3] bg-muted rounded-lg animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
    </main>
  )
}
