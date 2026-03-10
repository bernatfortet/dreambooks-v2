'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { BadScrapeDialog } from '@/components/admin/BadScrapeDialog'
import { RescrapeDialog } from '@/components/admin/RescrapeDialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type BadScrapesData = NonNullable<FunctionReturnType<typeof api.lib.badScrape.listBadScrapes>>
type BadScrapeBook = BadScrapesData['books'][number]
type BadScrapeSeries = BadScrapesData['series'][number]
type BadScrapeAuthor = BadScrapesData['authors'][number]
type BadScrapeEntityType = 'book' | 'series' | 'author'

export function BadScrapesSection() {
  const badScrapes = useQuery(api.lib.badScrape.listBadScrapes)

  if (badScrapes === undefined) {
    return null
  }

  const totalCount = badScrapes.books.length + badScrapes.series.length + badScrapes.authors.length

  if (totalCount === 0) {
    return null
  }

  const books = [...badScrapes.books].sort(sortByMarkedAt)
  const series = [...badScrapes.series].sort(sortByMarkedAt)
  const authors = [...badScrapes.authors].sort(sortByMarkedAt)

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
          <CardTitle className='text-base'>Flagged for review</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            Review the notes, open the entity, then queue a focused re-scrape only if needed.
          </p>

          {books.length > 0 && (
            <BadScrapeGroup title={`Books (${books.length})`}>
              {books.map((book: BadScrapeBook) => (
                <BadScrapeRow
                  key={book._id}
                  entityType='book'
                  entityId={book._id}
                  href={`/books/${book.slug ?? book._id}`}
                  label={book.title}
                  notes={book.badScrapeNotes}
                  hasSourceUrl={!!book.amazonUrl}
                />
              ))}
            </BadScrapeGroup>
          )}

          {series.length > 0 && (
            <BadScrapeGroup title={`Series (${series.length})`}>
              {series.map((seriesItem: BadScrapeSeries) => (
                <BadScrapeRow
                  key={seriesItem._id}
                  entityType='series'
                  entityId={seriesItem._id}
                  href={`/series/${seriesItem.slug ?? seriesItem._id}`}
                  label={seriesItem.name}
                  notes={seriesItem.badScrapeNotes}
                  hasSourceUrl={!!seriesItem.sourceUrl}
                />
              ))}
            </BadScrapeGroup>
          )}

          {authors.length > 0 && (
            <BadScrapeGroup title={`Authors (${authors.length})`}>
              {authors.map((author: BadScrapeAuthor) => (
                <BadScrapeRow
                  key={author._id}
                  entityType='author'
                  entityId={author._id}
                  href={`/authors/${author.slug ?? author._id}`}
                  label={author.name}
                  notes={author.badScrapeNotes}
                  hasSourceUrl={!!author.sourceUrl}
                />
              ))}
            </BadScrapeGroup>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

type BadScrapeGroupProps = {
  title: string
  children: React.ReactNode
}

function BadScrapeGroup({ title, children }: BadScrapeGroupProps) {
  return (
    <div>
      <h3 className='font-medium mb-2'>{title}</h3>
      <div className='space-y-2'>{children}</div>
    </div>
  )
}

type BadScrapeRowProps = {
  entityType: BadScrapeEntityType
  entityId: BadScrapeBook['_id'] | BadScrapeSeries['_id'] | BadScrapeAuthor['_id']
  href: string
  label: string
  notes?: string
  hasSourceUrl: boolean
}

function BadScrapeRow({
  entityType,
  entityId,
  href,
  label,
  notes,
  hasSourceUrl,
}: BadScrapeRowProps) {
  return (
    <div className='rounded-md border p-3'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='space-y-1'>
          <Link href={href} className='text-sm font-medium text-blue-500 hover:underline'>
            {label}
          </Link>
          {notes && <p className='text-sm text-muted-foreground'>{notes}</p>}
        </div>

        <div className='flex flex-wrap gap-2'>
          <Link href={href} className='inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted'>
            Open
          </Link>

          <RescrapeDialog entityType={entityType} entityId={entityId} hasSourceUrl={hasSourceUrl} />

          <BadScrapeDialog entityType={entityType} entityId={entityId} isBadScrape={true} />
        </div>
      </div>
    </div>
  )
}

function sortByMarkedAt(
  left: { badScrapeMarkedAt?: number },
  right: { badScrapeMarkedAt?: number },
) {
  return (right.badScrapeMarkedAt ?? 0) - (left.badScrapeMarkedAt ?? 0)
}
