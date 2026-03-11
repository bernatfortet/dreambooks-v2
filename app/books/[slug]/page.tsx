import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { BackLink } from '@/components/books/BackLink'
import { BookPageClient } from '@/components/books/BookPageClient'

const BOOK_PAGE_CLASS_NAME = 'container mx-auto px-4 py-6'
export const revalidate = 3600

type BookPageProps = {
  params: Promise<{ slug: string }>
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params
  const book = await fetchQuery(api.books.queries.getBySlugOrId, { slugOrId: slug })

  if (book === null) {
    return (
      <main className={BOOK_PAGE_CLASS_NAME}>
        <BackLink />
        <p className='text-muted-foreground'>Book not found</p>
      </main>
    )
  }

  return <BookPageClient book={book} />
}
