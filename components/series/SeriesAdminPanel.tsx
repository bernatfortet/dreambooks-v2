'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BadScrapeDialog } from '@/components/admin/BadScrapeDialog'
import { RescrapeDialog } from '@/components/admin/RescrapeDialog'
import { DeleteDialog } from '@/components/admin/DeleteDialog'

type SeriesAdminPanelProps = {
  seriesId: Id<'series'>
}

export function SeriesAdminPanel({ seriesId }: SeriesAdminPanelProps) {
  const series = useQuery(api.series.queries.getWithDiscoveries, { id: seriesId })
  const updateSourceUrl = useMutation(api.series.mutations.updateSourceUrl)

  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  if (series === undefined || series === null) {
    return null
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

  const hasAdminInfo =
    series.scrapeStatus !== 'complete' ||
    series.completeness !== 'confident' ||
    series.badScrape ||
    !series.sourceUrl ||
    (series.scrapedBookCount ?? 0) < (series.discoveredBookCount ?? 0)

  if (!hasAdminInfo) {
    return null
  }

  return (
    <div className='mt-8 border-t pt-6'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex items-center gap-2'>
          <h2 className='text-lg font-semibold'>Admin</h2>
          <div className='flex gap-2 flex-wrap'>
            <Badge variant='outline'>v:{series.scrapeVersion ?? '?'}</Badge>
            <Badge variant={series.scrapeStatus === 'complete' ? 'default' : 'secondary'}>{series.scrapeStatus}</Badge>
            <Badge variant={series.completeness === 'confident' ? 'default' : 'outline'}>{series.completeness}</Badge>
            {series.badScrape && <Badge variant='destructive'>Bad Scrape</Badge>}
          </div>
        </div>
        <Button variant='ghost' size='sm' onClick={() => setIsExpanded(!isExpanded)} className='text-xs'>
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>

      {series.badScrape && series.badScrapeNotes && (
        <div className='text-sm text-destructive bg-destructive/10 p-2 rounded mb-4'>{series.badScrapeNotes}</div>
      )}

      {isExpanded && (
        <div className='space-y-4 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-900'>
          <div className='text-sm text-muted-foreground'>
            {series.scrapedBookCount ?? 0} scraped / {series.discoveredBookCount ?? 0} discovered
            {series.expectedBookCount && ` / ${series.expectedBookCount} expected`}
          </div>

          <div className='flex gap-2 flex-wrap'>
            <BadScrapeDialog entityType='series' entityId={seriesId} isBadScrape={!!series.badScrape} />

            <RescrapeDialog entityType='series' entityId={seriesId} hasSourceUrl={!!series.sourceUrl} />

            <DeleteDialog entityType='series' entityId={seriesId} entityName={series.name} />
          </div>

          {series.sourceUrl ? (
            <a href={series.sourceUrl} target='_blank' rel='noopener noreferrer' className='text-sm text-blue-500 hover:underline'>
              View on Amazon →
            </a>
          ) : (
            <div className='space-y-2'>
              <p className='text-sm text-muted-foreground'>No Amazon series URL. Add one to enable scraping:</p>
              <div className='flex gap-2'>
                <Input
                  placeholder='https://www.amazon.com/dp/...'
                  value={sourceUrlInput}
                  onChange={(event) => setSourceUrlInput(event.target.value)}
                  className='flex-1'
                />
                <Button onClick={handleSaveSourceUrl} disabled={isSavingUrl || !sourceUrlInput.trim()}>
                  {isSavingUrl ? 'Saving...' : 'Save URL'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
