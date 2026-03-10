'use client'

import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import Image from 'next/image'
import Link from 'next/link'

type PublisherListData = NonNullable<FunctionReturnType<typeof api.publishers.queries.listWithTopBooks>>
type PublisherListItem = PublisherListData[number]

export function PublisherList() {
  const publishers: PublisherListData | undefined = useQuery(api.publishers.queries.listWithTopBooks)

  if (publishers === undefined) {
    return <PublisherListSkeleton />
  }

  if (publishers.length === 0) {
    return <p className='text-center text-muted-foreground py-12'>No publishers yet.</p>
  }

  return (
    <div className='space-y-8'>
      {publishers.map((publisher: PublisherListItem) => (
        <PublisherItem
          key={publisher._id}
          slug={publisher.slug ?? publisher._id}
          name={publisher.name}
          bookCount={publisher.bookCount}
          books={publisher.books}
        />
      ))}
    </div>
  )
}

type PublisherItemProps = {
  slug: string
  name: string
  bookCount: number
  books: Array<{
    _id: string
    slug?: string | null
    title: string
    coverUrl: string | null
  }>
}

function PublisherItem({ slug, name, bookCount, books }: PublisherItemProps) {
  return (
    <div className='flex gap-4'>
      <div className='shrink-0'>
        <div className='w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-medium text-lg'>
          {name.charAt(0).toUpperCase()}
        </div>
      </div>

      <div className='flex-1'>
        <Link href={`/publishers/${slug}`}>
          <h2 className='text-xl font-semibold hover:text-primary transition-colors'>
            {name}
            <span className='text-sm font-normal text-muted-foreground ml-2'>
              ({bookCount} {bookCount === 1 ? 'book' : 'books'})
            </span>
          </h2>
        </Link>

        {books.length === 0 ? (
          <p className='text-sm text-muted-foreground mt-2'>No books yet.</p>
        ) : (
          <div className='flex gap-3 overflow-x-auto pb-2 mt-3'>
            {books.map((book) => (
              <Link key={book._id} href={`/books/${book.slug ?? book._id}`} className='shrink-0 group'>
                <div className='w-20 aspect-2/3 relative bg-muted rounded-lg overflow-hidden mb-1'>
                  {book.coverUrl ? (
                    <Image
                      src={book.coverUrl}
                      alt={book.title}
                      fill
                      className='object-cover group-hover:scale-105 transition-transform duration-200'
                      sizes='80px'
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center text-muted-foreground text-xs p-2 text-center'>
                      {book.title}
                    </div>
                  )}
                </div>
                <p className='text-xs text-muted-foreground line-clamp-2 group-hover:text-primary transition-colors max-w-[80px]'>
                  {book.title}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PublisherListSkeleton() {
  return (
    <div className='space-y-8'>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className='flex gap-4'>
          <div className='w-16 h-16 rounded-lg bg-muted animate-pulse shrink-0' />
          <div className='flex-1 space-y-3'>
            <div className='h-6 bg-muted rounded animate-pulse w-48' />
            <div className='flex gap-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='w-20 aspect-2/3 bg-muted rounded-lg animate-pulse shrink-0' />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
