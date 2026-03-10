'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { NeedsReviewDialog } from '@/components/books/NeedsReviewDialog'
import { BookVisibilityButton } from '@/components/books/BookVisibilityButton'
import { RescrapeDialog } from '@/components/admin/RescrapeDialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type NeedsReviewData = NonNullable<FunctionReturnType<typeof api.admin.queries.listBooksNeedingReview>>
type ReviewBook = NeedsReviewData[number]

export function BooksNeedingReviewSection() {
  const booksNeedingReview = useQuery(api.admin.queries.listBooksNeedingReview)

  if (booksNeedingReview === undefined || booksNeedingReview.length === 0) {
    return null
  }

  return (
    <section className='mb-8'>
      <h2 className='text-xl font-semibold mb-4'>
        Books Needing Review
        <Badge variant='secondary' className='ml-2'>
          {booksNeedingReview.length}
        </Badge>
      </h2>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Scrape-time review queue</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            Review suspicious multi-book bundles, then either clear the flag or hide the book from public discovery.
          </p>

          <div className='space-y-2'>
            {booksNeedingReview.map((book) => (
              <NeedsReviewRow key={book._id} book={book} />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function NeedsReviewRow({ book }: { book: ReviewBook }) {
  const href = `/books/${book.slug ?? book._id}`

  return (
    <div className='rounded-md border p-3'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-1'>
          <Link href={href} className='text-sm font-medium text-blue-500 hover:underline'>
            {book.title}
          </Link>
          {book.needsReviewReason && <p className='text-sm text-muted-foreground'>{book.needsReviewReason}</p>}
        </div>

        <div className='flex flex-wrap gap-2'>
          <Link href={href} className='inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted'>
            Open
          </Link>
          <RescrapeDialog entityType='book' entityId={book._id} hasSourceUrl={!!book.amazonUrl} />
          <NeedsReviewDialog bookId={book._id} isNeedsReview initialReason={book.needsReviewReason} />
          <BookVisibilityButton bookId={book._id} isHidden={false} hideReason={book.needsReviewReason} />
        </div>
      </div>
    </div>
  )
}
