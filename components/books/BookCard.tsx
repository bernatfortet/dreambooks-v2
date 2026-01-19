'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useQuery, useAction, useMutation } from 'convex/react'
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
  const enrichBook = useAction(api.scraping.enrichBook.enrichBook)
  const scrapeSeries = useAction(api.scraping.scrapeSeries.scrapeSeries)
  const createSeriesFromBook = useMutation(api.series.mutations.createFromBook)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [isCreatingSeries, setIsCreatingSeries] = useState(false)
  const [isScrapingSeries, setIsScrapingSeries] = useState(false)

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

  async function handleEnrichBook() {
    setIsEnriching(true)
    try {
      await enrichBook({ bookId })
      console.log('✅ Book enriched')
    } catch (error) {
      console.error('🚨 Failed to enrich book', error)
    } finally {
      setIsEnriching(false)
    }
  }

  async function handleCreateSeries() {
    setIsCreatingSeries(true)
    try {
      const seriesId = await createSeriesFromBook({ bookId })
      console.log('✅ Created series', { seriesId })
    } catch (error) {
      console.error('🚨 Failed to create series', error)
    } finally {
      setIsCreatingSeries(false)
    }
  }

  async function handleScrapeSeries() {
    if (!book?.seriesId) return

    setIsScrapingSeries(true)
    try {
      const result = await scrapeSeries({ seriesId: book.seriesId })
      console.log('✅ Scraped series', result)
    } catch (error) {
      console.error('🚨 Failed to scrape series', error)
    } finally {
      setIsScrapingSeries(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex gap-2 mb-2">
          <Badge variant={book.detailsStatus === 'complete' ? 'default' : 'secondary'}>
            Details: {book.detailsStatus}
          </Badge>
          <Badge variant={book.coverStatus === 'complete' ? 'default' : 'secondary'}>
            Cover: {book.coverStatus}
          </Badge>
        </div>

        <CardTitle>{book.title}</CardTitle>

        {book.subtitle && <CardDescription>{book.subtitle}</CardDescription>}

        {/* Series info */}
        {(book.seriesName || book.seriesId) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {book.seriesName}
              {book.seriesPosition && ` #${book.seriesPosition}`}
            </span>

            {book.seriesId ? (
              <Link href={`/ad/series/${book.seriesId}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  View Series →
                </Badge>
              </Link>
            ) : book.seriesName ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateSeries}
                disabled={isCreatingSeries}
                className="h-6 text-xs"
              >
                {isCreatingSeries ? '🌀 Creating...' : '+ Create Series'}
              </Button>
            ) : null}

            {book.seriesUrl && !book.seriesId && (
              <a
                href={book.seriesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                (Amazon)
              </a>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          by {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author'}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-4 items-start">
          {book.coverUrl && <BookCoverImage url={book.coverUrl} title={book.title} />}

          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              {book.detailsStatus === 'basic' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleEnrichBook}
                  disabled={isEnriching}
                >
                  {isEnriching ? '🌀 Enriching...' : '✨ Enrich Book'}
                </Button>
              )}

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

              {book.seriesInfo?.sourceUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScrapeSeries}
                  disabled={isScrapingSeries}
                >
                  {isScrapingSeries ? '🌀 Scraping...' : '📚 Scrape Series'}
                </Button>
              )}

              {book.seriesInfo && !book.seriesInfo.sourceUrl && (
                <Link href={`/ad/series/${book.seriesId}`}>
                  <Button variant="outline" size="sm">
                    ⚠️ Add Series URL
                  </Button>
                </Link>
              )}
            </div>

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
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground mb-2">
                Run this command locally to scrape the book:
              </p>
              <code className="text-xs bg-background px-2 py-1 rounded block overflow-x-auto">
                bunx tsx scripts/scrape-book.ts "{book.amazonUrl}"
              </code>
            </div>

            <a
              href={book.amazonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-500 hover:underline"
            >
              View on Amazon →
            </a>
          </div>
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
