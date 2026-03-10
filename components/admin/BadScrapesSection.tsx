'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function BadScrapesSection() {
  const badScrapes = useQuery(api.lib.badScrape.listBadScrapes)

  if (badScrapes === undefined) {
    return null
  }

  const totalCount = badScrapes.books.length + badScrapes.series.length + badScrapes.authors.length

  if (totalCount === 0) {
    return null
  }

  return (
    <section className='mb-8'>
      <h2 className='text-xl font-semibold mb-4'>
        Bad Scrapes
        <Badge variant='destructive' className='ml-2'>
          {totalCount}
        </Badge>
      </h2>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Flagged for re-scraping</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {badScrapes.books.length > 0 && (
            <div>
              <h3 className='font-medium mb-2'>Books ({badScrapes.books.length})</h3>
              <div className='space-y-1'>
                {badScrapes.books.map((book) => (
                  <div key={book._id} className='flex items-center gap-2 text-sm'>
                    <Link href={`/books/${book.slug ?? book._id}`} className='text-blue-500 hover:underline'>
                      {book.title}
                    </Link>
                    {book.badScrapeNotes && <span className='text-muted-foreground'>- {book.badScrapeNotes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {badScrapes.series.length > 0 && (
            <div>
              <h3 className='font-medium mb-2'>Series ({badScrapes.series.length})</h3>
              <div className='space-y-1'>
                {badScrapes.series.map((series) => (
                  <div key={series._id} className='flex items-center gap-2 text-sm'>
                    <Link href={`/series/${series.slug ?? series._id}`} className='text-blue-500 hover:underline'>
                      {series.name}
                    </Link>
                    {series.badScrapeNotes && <span className='text-muted-foreground'>- {series.badScrapeNotes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {badScrapes.authors.length > 0 && (
            <div>
              <h3 className='font-medium mb-2'>Authors ({badScrapes.authors.length})</h3>
              <div className='space-y-1'>
                {badScrapes.authors.map((author) => (
                  <div key={author._id} className='flex items-center gap-2 text-sm'>
                    <span>{author.name}</span>
                    {author.badScrapeNotes && <span className='text-muted-foreground'>- {author.badScrapeNotes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
