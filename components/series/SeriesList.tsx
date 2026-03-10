'use client'

import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'

type SeriesListData = NonNullable<FunctionReturnType<typeof api.series.queries.list>>
type SeriesListItem = SeriesListData[number]

export function SeriesList() {
  const seriesList: SeriesListData | undefined = useQuery(api.series.queries.list)

  if (seriesList === undefined) {
    return <p className='text-muted-foreground'>Loading series...</p>
  }

  if (seriesList.length === 0) {
    return <p className='text-muted-foreground'>No series yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Books</TableHead>
          <TableHead>Completeness</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {seriesList.map((series: SeriesListItem) => (
          <TableRow key={series._id}>
            <TableCell>
              <Link href={`/series/${series.slug ?? series._id}`} className='text-blue-500 hover:underline font-medium'>
                {series.name}
              </Link>
            </TableCell>
            <TableCell>
              <BookCountBadge
                expected={series.expectedBookCount}
                discovered={series.discoveredBookCount}
                scraped={series.scrapedBookCount}
              />
            </TableCell>
            <TableCell>
              <CompletenessBadge completeness={series.completeness} />
            </TableCell>
            <TableCell>
              <StatusBadge status={series.scrapeStatus} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function BookCountBadge(props: { expected?: number; discovered?: number; scraped?: number }) {
  const { expected, discovered, scraped } = props
  const parts: string[] = []

  if (scraped !== undefined) parts.push(`${scraped} scraped`)
  if (discovered !== undefined) parts.push(`${discovered} discovered`)
  if (expected !== undefined) parts.push(`${expected} expected`)

  if (parts.length === 0) return <span className='text-muted-foreground'>-</span>

  return <span className='text-sm'>{parts.join(' / ')}</span>
}

function CompletenessBadge(props: { completeness: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
    confident: 'default',
    partial: 'secondary',
    unknown: 'outline',
  }

  return <Badge variant={variants[props.completeness] ?? 'outline'}>{props.completeness}</Badge>
}

function StatusBadge(props: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    complete: 'default',
    partial: 'secondary',
    processing: 'secondary',
    pending: 'outline',
    error: 'destructive',
  }

  return <Badge variant={variants[props.status] ?? 'outline'}>{props.status}</Badge>
}
