import { fetchQuery } from 'convex/nextjs'
import Link from 'next/link'
import { api } from '@/convex/_generated/api'
import { SuperadminOnly } from '@/components/auth/SuperadminOnly'
import { BookGridList } from '@/components/books/BookGrid'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { PageContainer } from '@/components/ui/PageContainer'

type PublisherPageProps = {
  params: Promise<{ slug: string }>
}

export const revalidate = 3600

export default async function PublisherPage({ params }: PublisherPageProps) {
  const { slug } = await params
  const publisher = await fetchQuery(api.publishers.queries.getBySlugWithBooks, { slug })

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

      <SuperadminOnly>
        <DataDebugPanel data={publisher} label='Publisher Data' />
      </SuperadminOnly>
    </PageContainer>
  )
}
