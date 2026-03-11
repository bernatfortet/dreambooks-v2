import { fetchQuery } from 'convex/nextjs'
import Link from 'next/link'
import { api } from '@/convex/_generated/api'
import { SuperadminOnly } from '@/components/auth/SuperadminOnly'
import { BookCardBadge } from '@/components/books/BookCard'
import { SeriesProfileActions } from '@/components/series/SeriesProfileActions'
import { SeriesAdminPanel } from '@/components/series/SeriesAdminPanel'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { BookGridList } from '@/components/books/BookGrid'
import { PageContainer } from '@/components/ui/PageContainer'

type SeriesPageProps = {
  params: Promise<{ slug: string }>
}

export const revalidate = 3600

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { slug } = await params
  const series = await fetchQuery(api.series.queries.getWithBooksBySlugOrId, { slugOrId: slug })

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

        <div className='mt-4'>
          <SeriesProfileActions seriesId={series._id} />
        </div>
      </div>

      {series.books.length === 0 ? (
        <p className='text-muted-foreground'>No books in this series yet.</p>
      ) : (
        <BookGridList books={booksWithOrderBadges} />
      )}

      <SuperadminOnly>
        <SeriesAdminPanel seriesId={series._id} />
      </SuperadminOnly>

      <SuperadminOnly>
        <DataDebugPanel data={series} label='Series Data' />
      </SuperadminOnly>
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

