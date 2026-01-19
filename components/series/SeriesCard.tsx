'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

type SeriesCardProps = {
  seriesId: Id<'series'>
}

export function SeriesCard({ seriesId }: SeriesCardProps) {
  const series = useQuery(api.series.queries.getWithDiscoveries, { id: seriesId })
  const updateSourceUrl = useMutation(api.series.mutations.updateSourceUrl)

  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const [isSavingUrl, setIsSavingUrl] = useState(false)

  if (series === undefined) {
    return <p className="text-muted-foreground">Loading series...</p>
  }

  if (series === null) {
    return <p className="text-muted-foreground">Series not found</p>
  }

  async function handleSaveSourceUrl() {
    if (!sourceUrlInput.trim()) return

    setIsSavingUrl(true)
    try {
      await updateSourceUrl({ seriesId, sourceUrl: sourceUrlInput.trim() })
      setSourceUrlInput('')
    } catch (error) {
      console.error('Failed to save source URL', error)
    } finally {
      setIsSavingUrl(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Series Header */}
      <Card>
        <CardHeader>
          <div className="flex gap-2 mb-2">
            <Badge variant={series.scrapeStatus === 'complete' ? 'default' : 'secondary'}>
              {series.scrapeStatus}
            </Badge>
            <Badge variant={series.completeness === 'confident' ? 'default' : 'outline'}>
              {series.completeness}
            </Badge>
          </div>

          <CardTitle>{series.name}</CardTitle>

          {series.description && <CardDescription>{series.description}</CardDescription>}

          <div className="text-sm text-muted-foreground">
            {series.scrapedBookCount ?? 0} scraped / {series.discoveredBookCount ?? 0} discovered
            {series.expectedBookCount && ` / ${series.expectedBookCount} expected`}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {series.coverUrl && (
            <div className="relative w-64 h-40">
              <Image
                src={series.coverUrl}
                alt={`${series.name} series cover`}
                fill
                className="object-cover rounded-md"
                sizes="256px"
              />
            </div>
          )}

          {series.sourceUrl ? (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground mb-2">
                  Run this command locally to scrape the series:
                </p>
                <code className="text-xs bg-background px-2 py-1 rounded block overflow-x-auto">
                  bun scripts/scrape-series.ts {seriesId}
                </code>
              </div>

              <a
                href={series.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:underline self-center"
              >
                View on Amazon →
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                No Amazon series URL. Add one to enable scraping:
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.amazon.com/dp/..."
                  value={sourceUrlInput}
                  onChange={(event) => setSourceUrlInput(event.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleSaveSourceUrl}
                  disabled={isSavingUrl || !sourceUrlInput.trim()}
                >
                  {isSavingUrl ? 'Saving...' : 'Save URL'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scraped Books */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Books in Series ({series.books.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {series.books.length === 0 ? (
            <p className="text-muted-foreground">No books in this series yet.</p>
          ) : (
            <div className="space-y-3">
              {series.books.map((book: typeof series.books[number]) => (
                <div key={book._id} className="flex items-center gap-4 p-2 border rounded">
                  {book.coverUrl && (
                    <div className="relative w-12 h-16 shrink-0">
                      <Image
                        src={book.coverUrl}
                        alt={book.title}
                        fill
                        className="object-cover rounded"
                        sizes="48px"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={`/books/${book._id}`} className="font-medium hover:underline truncate block">
                      {book.seriesPosition && `#${book.seriesPosition} `}
                      {book.title}
                    </Link>
                    <p className="text-sm text-muted-foreground truncate">
                      {book.authors.join(', ')}
                    </p>
                  </div>
                  <Badge variant={book.detailsStatus === 'complete' ? 'default' : 'secondary'}>
                    {book.detailsStatus ?? 'unknown'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
