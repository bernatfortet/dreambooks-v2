'use client'

import { useState } from 'react'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BadScrapeDialog } from '@/components/admin/BadScrapeDialog'
import { RescrapeDialog } from '@/components/admin/RescrapeDialog'
import { DeleteDialog } from '@/components/admin/DeleteDialog'
import { ChangeCoverDialog } from '@/components/books/ChangeCoverDialog'
import { BookEditionsList } from '@/components/books/BookEditionsList'
import { DataDebugPanel } from '@/components/ui/DataDebugPanel'

type Book = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>

type BookAdminPanelProps = {
  book: Book
}

// TypeScript doesn't support bracket notation for slash-separated module paths in the generated API type
// Extract types from Convex queries using FunctionReturnType
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
const editionsQueryRef = (api as any)['bookEditions/queries']['listByBookId']

type EditionArray = NonNullable<FunctionReturnType<typeof editionsQueryRef>>
type Edition = EditionArray[number]

export function BookAdminPanel({ book }: BookAdminPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const bookId = book._id
  const refreshCover = useAction(api.scraping.refreshCover.forceDownloadCover)
  // TypeScript doesn't support bracket notation for slash-separated module paths in the generated API type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editionsQuery = (api as any)['bookEditions/queries']?.listByBookId

  const editions = useQuery(editionsQuery, bookId ? { bookId } : 'skip') as Edition[] | undefined

  async function handleRefreshCover() {
    setIsRefreshing(true)

    try {
      await refreshCover({ bookId })
    } catch (err) {
      // Error handling can be added here if needed
      console.error('Failed to refresh cover:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book Admin</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Admin Actions */}
        <div className='flex items-center gap-2 flex-wrap'>
          <BadScrapeDialog entityType='book' entityId={bookId} isBadScrape={!!book.badScrape} />

          <RescrapeDialog entityType='book' entityId={bookId} hasSourceUrl={!!book.amazonUrl} />

          <DeleteDialog entityType='book' entityId={bookId} entityName={book.title} />

          <Button variant='outline' size='sm' onClick={handleRefreshCover} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh Cover'}
          </Button>

          <ChangeCoverDialog bookId={bookId} currentCoverUrl={book.cover?.sourceUrl} />
        </div>

        {book.amazonUrl && (
          <a href={book.amazonUrl} target='_blank' rel='noopener noreferrer' className='text-sm text-blue-500 hover:underline'>
            View on Amazon →
          </a>
        )}

        {editions && <BookEditionsList editions={editions} primaryEditionId={book.primaryEditionId} />}

        {/* Ratings (for admin/debugging - not displayed in public UI) */}
        <div className='space-y-2'>
          <h3 className='text-sm font-semibold'>Ratings</h3>
          <div className='grid grid-cols-2 gap-4 text-sm'>
            <div>
              <span className='text-muted-foreground'>Amazon:</span>{' '}
              {book.amazonRatingAverage != null ? (
                <>
                  <span className='font-medium'>{book.amazonRatingAverage.toFixed(1)}</span>
                  {book.amazonRatingCount != null && (
                    <span className='text-muted-foreground'> ({book.amazonRatingCount.toLocaleString()} reviews)</span>
                  )}
                </>
              ) : (
                <span className='text-muted-foreground italic'>Not scraped</span>
              )}
            </div>
            <div>
              <span className='text-muted-foreground'>Goodreads:</span>{' '}
              {book.goodreadsRatingAverage != null ? (
                <>
                  <span className='font-medium'>{book.goodreadsRatingAverage.toFixed(1)}</span>
                  {book.goodreadsRatingCount != null && (
                    <span className='text-muted-foreground'> ({book.goodreadsRatingCount.toLocaleString()} ratings)</span>
                  )}
                </>
              ) : (
                <span className='text-muted-foreground italic'>Not scraped</span>
              )}
            </div>
            <div className='col-span-2 pt-2 border-t'>
              <span className='text-muted-foreground'>Computed Score:</span>{' '}
              {book.ratingScore != null ? (
                <>
                  <span className='font-semibold'>{book.ratingScore.toFixed(2)}</span>
                  <span className='text-muted-foreground text-xs ml-2'>(used for sorting)</span>
                </>
              ) : (
                <span className='text-muted-foreground italic'>Not computed</span>
              )}
            </div>
          </div>
        </div>

        <DataDebugPanel data={book} label='Book Data' />
      </CardContent>
    </Card>
  )
}
