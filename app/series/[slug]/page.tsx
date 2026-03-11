'use client'

import { use } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { BookCardBadge } from '@/components/books/BookCard'
import { useSuperadmin } from '@/components/auth/use-superadmin'
import { SeriesAdminPanel } from '@/components/series/SeriesAdminPanel'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { BookGridList, BookGridSkeleton } from '@/components/books/BookGrid'
import { PageContainer } from '@/components/ui/PageContainer'

type SeriesPageProps = {
  params: Promise<{ slug: string }>
}

export default function SeriesPage({ params }: SeriesPageProps) {
  const { slug } = use(params)
  const series = useQuery(api.series.queries.getWithBooksBySlugOrId, { slugOrId: slug })
  const { isSuperadmin } = useSuperadmin()

  if (series === undefined) {
    return <SeriesDetailSkeleton />
  }

  if (series === null) {
    return (
      <PageContainer>
        <Link href='/' className='text-sm text-muted-foreground hover:underline mb-4 block'>
          ← Back to books
        </Link>
        <p className='text-muted-foreground'>Series not found</p>
      </PageContainer>
    )
  }

  const booksWithOrderBadges = buildBooksWithOrderBadges(series.books)

  return (
    <PageContainer>
      <Link href='/' className='text-sm text-muted-foreground hover:underline mb-6 block'>
        ← Back to books
      </Link>

      <div className='mb-8'>
        <h1 className='text-3xl font-bold'>{series.name}</h1>

        {series.description && <p className='text-muted-foreground mt-2 max-w-2xl'>{series.description}</p>}

        <p className='text-sm text-muted-foreground mt-2'>
          {series.books.length} {series.books.length === 1 ? 'book' : 'books'}
        </p>
      </div>

      {series.books.length === 0 ? (
        <p className='text-muted-foreground'>No books in this series yet.</p>
      ) : (
        <BookGridList books={booksWithOrderBadges} />
      )}

      {isSuperadmin ? <SeriesAdminPanel seriesId={series._id} /> : null}

      {isSuperadmin ? <DataDebugPanel data={series} label='Series Data' /> : null}
    </PageContainer>
  )
}

function buildBooksWithOrderBadges<
  TBook extends {
    seriesPosition?: number | null
  },
>(books: TBook[]) {
  return books.map((book, index) => {
    const orderNumber = book.seriesPosition ?? index + 1

    return {
      ...book,
      badge: <BookCardBadge>#{orderNumber}</BookCardBadge>,
    }
  })
}

function SeriesDetailSkeleton() {
  return (
    <PageContainer>
      <div className='h-4 w-24 bg-muted rounded animate-pulse mb-6' />

      <div className='mb-8'>
        <div className='h-8 bg-muted rounded animate-pulse w-1/3 mb-2' />
        <div className='h-4 bg-muted rounded animate-pulse w-1/4' />
      </div>

      <BookGridSkeleton count={6} />
    </PageContainer>
  )
}
