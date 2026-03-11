'use client'

import { use } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useSuperadmin } from '@/components/auth/use-superadmin'
import { BookAdminPanel } from '@/components/books/BookAdminPanel'
import { BookCover, isLandscapeCover } from '@/components/books/BookCover'
import { BookDetails } from '@/components/books/BookDetails'
import { BookPageSkeleton } from '@/components/books/BookPageSkeleton'
import { BackLink } from '@/components/books/BackLink'

type BookPageProps = {
  params: Promise<{ slug: string }>
}

export default function BookPage({ params }: BookPageProps) {
  const { slug } = use(params)
  const book = useQuery(api.books.queries.getBySlugOrId, { slugOrId: slug })
  const { isSuperadmin } = useSuperadmin()

  if (book === undefined) return <BookPageSkeleton />

  if (book === null) {
    return (
      <main className='w-full max-w-content mx-auto px-4 py-6'>
        <BackLink />
        <p className='text-muted-foreground'>Book not found</p>
      </main>
    )
  }

  const isLandscape = isLandscapeCover(book.cover?.width, book.cover?.height)

  // Landscape covers stack vertically, portrait covers display side-by-side on desktop
  const layoutClass = isLandscape ? 'flex flex-col gap-8 mb-8' : 'flex flex-col md:flex-row gap-8 mb-8'

  return (
    <main className='w-full max-w-content mx-auto px-4 py-6'>
      <BackLink />

      <div className={layoutClass}>
        <BookCover book={book} />
        <BookDetails book={book} />
      </div>

      {isSuperadmin ? <BookAdminPanel book={book} /> : null}
    </main>
  )
}
