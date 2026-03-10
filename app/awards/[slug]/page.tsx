'use client'

import { use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { BookGridList, BookGridSkeleton } from '@/components/books/BookGrid'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'
import { BookCardBadge } from '@/components/books/BookCard'
import { PageContainer } from '@/components/ui/PageContainer'

type AwardPageProps = {
  params: Promise<{ slug: string }>
}

type AwardPageData = NonNullable<FunctionReturnType<typeof api.awards.queries.getWithBooksBySlug>>
type AwardBook = AwardPageData['books'][number]

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

            <p className='text-sm text-muted-foreground mt-2'>
              {award.books.length} {award.books.length === 1 ? 'book' : 'books'}
            </p>
          </div>
        </div>
      </div>

      {award.books.length === 0 ? (
        <p className='text-muted-foreground'>No books have won this award yet.</p>
      ) : (
        <BookGridList
          books={award.books.map((book: AwardBook) => ({
            ...book,
            badge: formatAwardBadge(book.year, book.category),
          }))}
        />
      )}

      <DataDebugPanel data={award} label='Award Data' />
    </PageContainer>
  )
}

function formatAwardBadge(year?: number | null, category?: string | null) {
  if (!year && !category) return undefined

  const parts = []
  if (year) parts.push(year)
  if (category) parts.push(category)

  return <BookCardBadge>{parts.join(' • ')}</BookCardBadge>
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
