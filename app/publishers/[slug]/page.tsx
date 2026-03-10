'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { BookGridList, BookGridSkeleton } from '@/components/books/BookGrid'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { PageContainer } from '@/components/ui/PageContainer'

type PublisherPageProps = {
  params: Promise<{ slug: string }>
}

type PublisherPageData = NonNullable<FunctionReturnType<typeof api.publishers.queries.getBySlugWithBooks>>
type PublisherBook = PublisherPageData['books'][number]

export default function PublisherPage({ params }: PublisherPageProps) {
  const { slug } = use(params)
  const publisher = useQuery(api.publishers.queries.getBySlugWithBooks, { slug })

  if (publisher === undefined) {
    return <PublisherDetailSkeleton />
  }

  if (publisher === null) {
    return (
      <PageContainer>
        <Link href='/publishers' className='text-sm text-muted-foreground hover:underline mb-4 block'>
          ← Back to publishers
        </Link>
        <p className='text-muted-foreground'>Publisher not found</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Link href='/publishers' className='text-sm text-muted-foreground hover:underline mb-6 block'>
        ← Back to publishers
      </Link>

      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>{publisher.name}</h1>

        <p className='text-sm text-muted-foreground mt-2'>
          {publisher.bookCount} {publisher.bookCount === 1 ? 'book' : 'books'}
        </p>
      </div>

      {publisher.books.length === 0 ? (
        <p className='text-muted-foreground'>No books from this publisher yet.</p>
      ) : (
        <BookGridList books={publisher.books} />
      )}

      <DataDebugPanel data={publisher} label='Publisher Data' />
    </PageContainer>
  )
}

function PublisherDetailSkeleton() {
  return (
    <PageContainer>
      <div className='h-4 w-32 bg-muted rounded animate-pulse mb-6' />

      <div className='mb-8'>
        <div className='h-8 bg-muted rounded animate-pulse w-1/3 mb-2' />
        <div className='h-4 bg-muted rounded animate-pulse w-1/4' />
      </div>

      <BookGridSkeleton count={6} />
    </PageContainer>
  )
}
