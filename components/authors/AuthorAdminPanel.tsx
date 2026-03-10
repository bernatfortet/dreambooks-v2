'use client'

import { useState } from 'react'
import { Id } from '@/convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BadScrapeDialog } from '@/components/admin/BadScrapeDialog'
import { RescrapeDialog } from '@/components/admin/RescrapeDialog'
import { DeleteDialog } from '@/components/admin/DeleteDialog'

type AuthorData = NonNullable<FunctionReturnType<typeof api.authors.queries.getBySlugOrId>>

type AuthorAdminPanelProps = {
  author: AuthorData
}

export function AuthorAdminPanel({ author }: AuthorAdminPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const hasAdminInfo = author.scrapeStatus !== 'complete' || author.badScrape || author.sourceUrl

  if (!hasAdminInfo) {
    return null
  }

  return (
    <div className='mt-8 border-t pt-6'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex items-center gap-2'>
          <h2 className='text-lg font-semibold'>Admin</h2>
          <div className='flex gap-2 flex-wrap'>
            <Badge variant='outline'>v:{author.scrapeVersion ?? '?'}</Badge>
            <Badge variant={author.scrapeStatus === 'complete' ? 'default' : 'secondary'}>{author.scrapeStatus}</Badge>
            {author.badScrape && <Badge variant='destructive'>Bad Scrape</Badge>}
          </div>
        </div>
        <Button variant='ghost' size='sm' onClick={() => setIsExpanded(!isExpanded)} className='text-xs'>
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>

      {author.badScrape && author.badScrapeNotes && (
        <div className='text-sm text-destructive bg-destructive/10 p-2 rounded mb-4'>{author.badScrapeNotes}</div>
      )}

      {isExpanded && (
        <div className='space-y-4 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-900'>
          <div className='flex gap-2 flex-wrap'>
            <BadScrapeDialog entityType='author' entityId={author._id} isBadScrape={!!author.badScrape} />

            <RescrapeDialog entityType='author' entityId={author._id} hasSourceUrl={!!author.sourceUrl} />

            <DeleteDialog entityType='author' entityId={author._id} entityName={author.name} />
          </div>

          {author.sourceUrl && (
            <a href={author.sourceUrl} target='_blank' rel='noopener noreferrer' className='text-sm text-blue-500 hover:underline'>
              View on Amazon →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
