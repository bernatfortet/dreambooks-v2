'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

type SeriesCardProps = {
  seriesId: Id<'series'>
}

export function SeriesCard({ seriesId }: SeriesCardProps) {
  const series = useQuery(api.series.queries.getWithDiscoveries, { id: seriesId })
  const scrapeSeries = useAction(api.scraping.scrapeSeries.scrapeSeries)
  const scrapeDiscovery = useAction(api.scraping.scrapeSeries.scrapeDiscovery)
  const [isScraping, setIsScraping] = useState(false)
  const [scrapingDiscoveryId, setScrapingDiscoveryId] = useState<Id<'seriesBookDiscoveries'> | null>(null)

  if (series === undefined) {
    return <p className="text-muted-foreground">Loading series...</p>
  }

  if (series === null) {
    return <p className="text-muted-foreground">Series not found</p>
  }

  async function handleScrapeSeries() {
    setIsScraping(true)
    try {
      await scrapeSeries({ seriesId })
    } catch (error) {
      console.error('🚨 Failed to scrape series', error)
    } finally {
      setIsScraping(false)
    }
  }

  async function handleScrapeDiscovery(discoveryId: Id<'seriesBookDiscoveries'>) {
    setScrapingDiscoveryId(discoveryId)
    try {
      await scrapeDiscovery({ discoveryId })
    } catch (error) {
      console.error('🚨 Failed to scrape discovery', error)
    } finally {
      setScrapingDiscoveryId(null)
    }
  }

  const pendingDiscoveries = series.discoveries.filter((d: typeof series.discoveries[number]) => d.status === 'pending')
  const completedDiscoveries = series.discoveries.filter((d: typeof series.discoveries[number]) => d.status === 'complete' || d.status === 'skipped')

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

          {series.sourceUrl && (
            <div className="flex gap-2">
              <Button
                onClick={handleScrapeSeries}
                disabled={isScraping || series.scrapeStatus === 'processing'}
              >
                {isScraping || series.scrapeStatus === 'processing'
                  ? '🌀 Scraping...'
                  : series.scrapeStatus === 'partial'
                    ? '📚 Continue Scraping'
                    : '📚 Scrape Amazon Series'}
              </Button>

              <a
                href={series.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:underline self-center"
              >
                View on Amazon →
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scraped Books */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scraped Books ({series.books.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {series.books.length === 0 ? (
            <p className="text-muted-foreground">No books scraped yet.</p>
          ) : (
            <div className="space-y-3">
              {series.books.map((book: typeof series.books[number]) => (
                <div key={book._id} className="flex items-center gap-4 p-2 border rounded">
                  {book.coverUrl && (
                    <div className="relative w-12 h-16 flex-shrink-0">
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
                  <Badge variant={book.scrapeStatus === 'complete' ? 'default' : 'secondary'}>
                    {book.scrapeStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Discoveries */}
      {pendingDiscoveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Discoveries ({pendingDiscoveries.length})</CardTitle>
            <CardDescription>Books found in this series that haven't been scraped yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingDiscoveries.map((discovery: typeof pendingDiscoveries[number]) => (
                <div key={discovery._id} className="flex items-center gap-4 p-2 border rounded">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {discovery.position && `#${discovery.position} `}
                      {discovery.title ?? 'Unknown title'}
                    </p>
                    <a
                      href={discovery.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate block"
                    >
                      {discovery.sourceUrl.slice(0, 60)}...
                    </a>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleScrapeDiscovery(discovery._id)}
                    disabled={scrapingDiscoveryId === discovery._id}
                  >
                    {scrapingDiscoveryId === discovery._id ? '🌀' : '📖 Scrape'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed/Skipped Discoveries (collapsed) */}
      {completedDiscoveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">
              Processed Discoveries ({completedDiscoveries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm text-muted-foreground">
              {completedDiscoveries.map((discovery: typeof completedDiscoveries[number]) => (
                <div key={discovery._id} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {discovery.status}
                  </Badge>
                  <span className="truncate">
                    {discovery.position && `#${discovery.position} `}
                    {discovery.title ?? discovery.sourceUrl.slice(0, 40)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
