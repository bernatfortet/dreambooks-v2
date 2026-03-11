'use client'

import { use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { AwardGrid } from '@/components/awards/AwardGrid'
import { BookGridList, BookGridSkeleton } from '@/components/books/BookGrid'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { AwardHonorMarker, AwardWinnerMarker } from '@/components/awards/AwardResultMarker'
import { PageContainer } from '@/components/ui/PageContainer'

type AwardPageProps = {
  params: Promise<{ slug: string }>
}

type AwardPageData = NonNullable<FunctionReturnType<typeof api.awards.queries.getWithBooksBySlug>>
type AwardBook = AwardPageData['books'][number]
type AwardBookGroup = {
  year: number | null
  books: AwardBook[]
}

export default function AwardPage({ params }: AwardPageProps) {
  const { slug } = use(params)
  const award = useQuery(api.awards.queries.getWithBooksBySlug, { slug })

  if (award === undefined) {
    return <AwardDetailSkeleton />
  }

  if (award === null) {
    return (
      <PageContainer>
        <Link href='/awards' className='text-sm text-muted-foreground hover:underline mb-4 block'>
          ← Back to awards
        </Link>
        <p className='text-muted-foreground'>Award not found</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Link href='/awards' className='text-sm text-muted-foreground hover:underline mb-6 block'>
        ← Back to awards
      </Link>

      <div className='mb-8'>
        <div className='flex items-start gap-6'>
          {award.imageUrl && (
            <div className='shrink-0'>
              <div className='relative w-24 h-24'>
                <Image src={award.imageUrl} alt={award.name} fill className='object-contain' sizes='96px' />
              </div>
            </div>
          )}

          <div className='flex-1'>
            <h1 className='text-3xl font-bold'>{award.name}</h1>

            {award.description && <p className='text-muted-foreground mt-2 max-w-2xl'>{award.description}</p>}

            <p className='text-sm text-muted-foreground mt-2'>{formatBookCountLabel(award.books.length)}</p>
          </div>
        </div>
      </div>

      {award.books.length === 0 ? (
        <p className='text-muted-foreground'>No books have won this award yet.</p>
      ) : (
        <div className='space-y-4'>
          {groupAwardBooksByYear(award.books).map((group) => (
            <AwardYearSection key={group.year ?? 'unknown'} group={group} />
          ))}
        </div>
      )}

      <section className='mt-16 space-y-6'>
        <div>
          <h2 className='text-2xl font-semibold'>More awards</h2>
          <p className='mt-2 text-muted-foreground'>Browse the rest of the awards collection.</p>
        </div>

        <AwardGrid
          excludedAwardId={award._id}
          emptyState={<p className='py-12 text-center text-muted-foreground'>No other awards yet.</p>}
        />
      </section>

      <DataDebugPanel data={award} label='Award Data' />
    </PageContainer>
  )
}

function AwardYearSection({ group }: { group: AwardBookGroup }) {
  return (
    <section className='space-y-4'>
      <div className='flex items-center gap-3'>
        <h2 className='text-2xl font-semibold'>{group.year ?? 'Other'}</h2>
        <p className='text-sm text-muted-foreground'>{formatBookCountLabel(group.books.length)}</p>
      </div>

      <BookGridList
        books={buildAwardDisplayBooks(group.books)}
      />
    </section>
  )
}

function getAwardTitleMarker(category?: string | null) {
  if (category === 'Winner') {
    return <AwardWinnerMarker />
  }

  if (category === 'Honor Book') {
    return <AwardHonorMarker />
  }

  return undefined
}

function groupAwardBooksByYear(books: AwardBook[]): AwardBookGroup[] {
  const booksByYear = new Map<number | null, AwardBook[]>()

  for (const book of books) {
    const year = book.year ?? null
    const yearBooks = booksByYear.get(year)

    if (yearBooks) {
      yearBooks.push(book)
      continue
    }

    booksByYear.set(year, [book])
  }

  return [...booksByYear.entries()]
    .sort(([leftYear], [rightYear]) => {
      if (leftYear === null) return 1
      if (rightYear === null) return -1
      return rightYear - leftYear
    })
    .map(([year, yearBooks]) => ({
      year,
      books: yearBooks,
    }))
}

function buildAwardDisplayBooks(books: AwardBook[]) {
  return books.map((book) => ({
    ...book,
    titleMarker: getAwardTitleMarker(book.category),
  }))
}

function formatBookCountLabel(count: number) {
  return `${count} ${count === 1 ? 'book' : 'books'}`
}

function AwardDetailSkeleton() {
  return (
    <PageContainer>
      <div className='h-4 w-24 bg-muted rounded animate-pulse mb-6' />

      <div className='mb-8'>
        <div className='flex items-start gap-6'>
          <div className='w-24 h-24 bg-muted rounded-lg animate-pulse shrink-0' />
          <div className='flex-1 space-y-2'>
            <div className='h-8 bg-muted rounded animate-pulse w-1/3' />
            <div className='h-4 bg-muted rounded animate-pulse w-full' />
            <div className='h-4 bg-muted rounded animate-pulse w-1/4' />
          </div>
        </div>
      </div>

      <BookGridSkeleton count={6} />
    </PageContainer>
  )
}
