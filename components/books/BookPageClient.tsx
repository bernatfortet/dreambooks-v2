'use client'

import { useState } from 'react'
import { api } from '@/convex/_generated/api'
import { SuperadminOnly } from '@/components/auth/SuperadminOnly'
import { BackLink } from '@/components/books/BackLink'
import { BookAdminPanel } from '@/components/books/BookAdminPanel'
import { BookCover, isLandscapeCover } from '@/components/books/BookCover'
import { BookDetails } from '@/components/books/BookDetails'
import { getBookCoverKey } from '@/lib/book-cover'
import type { FunctionReturnType } from 'convex/server'

const BOOK_PAGE_CLASS_NAME = 'container mx-auto px-4 py-6'

type Book = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>

type MeasuredLandscape = {
  coverKey: string
  isLandscape: boolean
}

export function BookPageClient({ book }: { book: Book }) {
  const [measuredLandscape, setMeasuredLandscape] = useState<MeasuredLandscape | null>(null)

  const coverKey = getBookCoverKey(book)
  const measuredIsLandscape = measuredLandscape?.coverKey === coverKey ? measuredLandscape.isLandscape : null
  const isLandscape = measuredIsLandscape ?? isLandscapeCover(book.cover?.width, book.cover?.height)
  const layoutClass = getLayoutClass(isLandscape)

  return (
    <main className={BOOK_PAGE_CLASS_NAME}>
      <BackLink />

      <div className={layoutClass}>
        <BookCover book={book} onLandscapeChange={handleLandscapeChange} />
        <BookDetails book={book} />
      </div>

      <SuperadminOnly>
        <BookAdminPanel book={book} />
      </SuperadminOnly>
    </main>
  )

  function handleLandscapeChange(nextIsLandscape: boolean) {
    setMeasuredLandscape((currentMeasuredLandscape) => {
      if (currentMeasuredLandscape?.coverKey === coverKey && currentMeasuredLandscape.isLandscape === nextIsLandscape) {
        return currentMeasuredLandscape
      }

      return {
        coverKey,
        isLandscape: nextIsLandscape,
      }
    })
  }
}

function getLayoutClass(isLandscape: boolean): string {
  if (isLandscape) return 'flex flex-col gap-8 mb-8'

  return 'flex flex-col md:flex-row gap-8 mb-8'
}
