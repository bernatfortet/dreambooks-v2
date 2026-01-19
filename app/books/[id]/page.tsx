'use client'

import { use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

type BookPageProps = {
  params: Promise<{ id: string }>
}

export default function BookPage({ params }: BookPageProps) {
  const { id } = use(params)
  const book = useQuery(api.books.queries.get, { id: id as Id<'books'> })

  if (book === undefined) {
    return <BookDetailSkeleton />
  }

  if (book === null) {
    return (
      <main className="container mx-auto py-8 px-4">
        <Link href="/" className="text-sm text-muted-foreground hover:underline mb-4 block">
          ← Back to books
        </Link>
        <p className="text-muted-foreground">Book not found</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto py-8 px-4">
      <Link href="/" className="text-sm text-muted-foreground hover:underline mb-6 block">
        ← Back to books
      </Link>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Cover */}
        <div className="flex-shrink-0">
          {book.coverUrl ? (
            <div className="relative w-48 h-72 md:w-64 md:h-96">
              <Image
                src={book.coverUrl}
                alt={book.title}
                fill
                className="object-cover rounded-lg shadow-lg"
                sizes="(max-width: 768px) 192px, 256px"
                priority
              />
            </div>
          ) : (
            <div className="w-48 h-72 md:w-64 md:h-96 bg-muted rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground text-center p-4">{book.title}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{book.title}</h1>

            {book.subtitle && (
              <p className="text-lg text-muted-foreground mt-1">{book.subtitle}</p>
            )}

            <p className="text-muted-foreground mt-2">by {book.authors.join(', ')}</p>
          </div>

          {/* Series Link */}
          {book.seriesId && book.seriesName && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Part of</span>
              <Link
                href={`/series/${book.seriesId}`}
                className="text-sm font-medium hover:underline"
              >
                {book.seriesName}
                {book.seriesPosition && ` #${book.seriesPosition}`}
              </Link>
            </div>
          )}

          {/* Description */}
          {book.description && (
            <div>
              <h2 className="font-semibold mb-2">About this book</h2>
              <p className="text-muted-foreground leading-relaxed">{book.description}</p>
            </div>
          )}

          {/* Meta Grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm pt-4">
            {book.publisher && (
              <MetaItem label="Publisher" value={book.publisher} />
            )}

            {book.publishedDate && (
              <MetaItem label="Published" value={book.publishedDate} />
            )}

            {book.pageCount && (
              <MetaItem label="Pages" value={String(book.pageCount)} />
            )}

            {book.lexileScore && (
              <MetaItem label="Lexile" value={String(book.lexileScore)} />
            )}

            {book.ageRange && (
              <MetaItem label="Age Range" value={book.ageRange} />
            )}

            {book.gradeLevel && (
              <MetaItem label="Grade Level" value={book.gradeLevel} />
            )}

          </div>
        </div>
      </div>
    </main>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-medium">{value}</span>
    </div>
  )
}

function BookDetailSkeleton() {
  return (
    <main className="container mx-auto py-8 px-4">
      <div className="h-4 w-24 bg-muted rounded animate-pulse mb-6" />

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-48 h-72 md:w-64 md:h-96 bg-muted rounded-lg animate-pulse flex-shrink-0" />

        <div className="flex-1 space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          <div className="h-20 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </main>
  )
}
