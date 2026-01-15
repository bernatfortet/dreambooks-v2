'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type BookCardProps = {
  bookId: Id<'books'>
}

export function BookCard({ bookId }: BookCardProps) {
  const book = useQuery(api.books.queries.get, { id: bookId })
  const refreshCover = useAction(api.scraping.refreshCover.refreshCoverFromAmazon)
  const [isRefreshing, setIsRefreshing] = useState(false)

  if (book === undefined) {
    return <p className="text-muted-foreground">Loading book...</p>
  }

  if (book === null) {
    return <p className="text-muted-foreground">Book not found</p>
  }

  async function handleRefreshCover() {
    setIsRefreshing(true)
    try {
      await refreshCover({ bookId })
    } catch (error) {
      console.error('🚨 Failed to refresh cover', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex gap-2 mb-2">
          <Badge variant={book.scrapeStatus === 'complete' ? 'default' : 'secondary'}>
            Scrape: {book.scrapeStatus}
          </Badge>
          <Badge variant={book.coverStatus === 'complete' ? 'default' : 'secondary'}>
            Cover: {book.coverStatus}
          </Badge>
        </div>

        <CardTitle>{book.title}</CardTitle>

        {book.subtitle && <CardDescription>{book.subtitle}</CardDescription>}

        {book.seriesName && (
          <p className="text-sm text-muted-foreground">
            {book.seriesUrl ? (
              <a href={book.seriesUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {book.seriesName}
                {book.seriesPosition && ` #${book.seriesPosition}`}
              </a>
            ) : (
              <>
                {book.seriesName}
                {book.seriesPosition && ` #${book.seriesPosition}`}
              </>
            )}
          </p>
        )}

        <p className="text-sm text-muted-foreground">by {book.authors.join(', ')}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-4 items-start">
          {book.coverUrl && <BookCoverImage url={book.coverUrl} title={book.title} />}

          <div className="space-y-2">
            {book.amazonUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshCover}
                disabled={isRefreshing || book.coverStatus === 'pending'}
              >
                {isRefreshing || book.coverStatus === 'pending' ? '🌀 Refreshing...' : '🔄 Refresh Cover'}
              </Button>
            )}

            {/* Debug: Cover URL links */}
            <div className="text-xs space-y-1 text-muted-foreground">
              {book.coverSourceUrl && (
                <div>
                  <span className="font-medium">Original: </span>
                  <a href={book.coverSourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                    {book.coverSourceUrl.slice(0, 60)}...
                  </a>
                </div>
              )}
              {book.coverUrl && (
                <div>
                  <span className="font-medium">Stored: </span>
                  <a href={book.coverUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                    {book.coverUrl.slice(0, 60)}...
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {book.description && (
          <div>
            <h3 className="font-semibold mb-1">Description</h3>
            <p className="text-sm text-muted-foreground">{book.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          {book.publisher && (
            <div>
              <span className="font-medium">Publisher:</span> {book.publisher}
            </div>
          )}

          {book.publishedDate && (
            <div>
              <span className="font-medium">Published:</span> {book.publishedDate}
            </div>
          )}

          {book.pageCount && (
            <div>
              <span className="font-medium">Pages:</span> {book.pageCount}
            </div>
          )}

          {book.lexileScore && (
            <div>
              <span className="font-medium">Lexile:</span> {book.lexileScore}
            </div>
          )}

          {book.ageRange && (
            <div>
              <span className="font-medium">Age Range:</span> {book.ageRange}
            </div>
          )}

          {book.gradeLevel && (
            <div>
              <span className="font-medium">Grade Level:</span> {book.gradeLevel}
            </div>
          )}

          {book.asin && (
            <div>
              <span className="font-medium">ASIN:</span> {book.asin}
            </div>
          )}

          {book.isbn13 && (
            <div>
              <span className="font-medium">ISBN-13:</span> {book.isbn13}
            </div>
          )}
        </div>

        {book.amazonUrl && (
          <a
            href={book.amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:underline"
          >
            View on Amazon →
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function BookCoverImage({ url, title }: { url: string; title: string }) {
  return (
    <div className="relative w-48 h-72">
      <Image
        src={url}
        alt={`Cover of ${title}`}
        fill
        className="object-cover rounded-md"
        sizes="192px"
      />
    </div>
  )
}
