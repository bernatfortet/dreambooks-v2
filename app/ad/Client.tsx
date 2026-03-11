'use client'

import { BadScrapesSection } from '@/components/admin/BadScrapesSection'
import { BookIntakeSection } from '@/components/admin/BookIntakeSection'
import { BooksNeedingReviewSection } from '@/components/admin/BooksNeedingReviewSection'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { QueueList } from '@/components/scrape-queue/QueueList'
import { Badge } from '@/components/ui/badge'
import { useSuperadmin } from '@/components/auth/use-superadmin'
import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useState } from 'react'

export default function AdminPage() {
  const [queueUrl, setQueueUrl] = useState('')
  const { isLoading, isSuperadmin } = useSuperadmin()
  const queueStats = useQuery(api.scrapeQueue.queries.stats, isSuperadmin ? {} : 'skip')
  const dbStats = useQuery(api.admin.queries.stats, isSuperadmin ? {} : 'skip')

  if (isLoading) {
    return (
      <main className='container mx-auto py-8 px-4'>
        <p className='text-muted-foreground'>Loading admin access...</p>
      </main>
    )
  }

  if (!isSuperadmin) {
    return (
      <main className='container mx-auto py-8 px-4'>
        <p className='text-muted-foreground'>This admin dashboard is only available to superusers.</p>
      </main>
    )
  }

  return (
    <main className='container mx-auto py-8 px-4'>
      <div className='flex items-center gap-4 mb-8'>
        <h1 className='text-3xl font-bold'>Dreambooks Admin</h1>
        {dbStats && (
          <div className='flex items-center gap-4 text-sm text-muted-foreground'>
            <span>Books: {dbStats.books.toLocaleString()}</span>
            <span>Series: {dbStats.series.toLocaleString()}</span>
            <span>Authors: {dbStats.authors.toLocaleString()}</span>
          </div>
        )}
      </div>

      <section className='mb-8'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-xl font-semibold'>Add a Book, Series, or Author</h2>
          {queueStats && (
            <div className='flex gap-2 text-sm'>
              <Badge variant='secondary'>{queueStats.pending} pending</Badge>
              {queueStats.processing > 0 && <Badge variant='default'>{queueStats.processing} processing</Badge>}
            </div>
          )}
        </div>

        <BookSubmitForm url={queueUrl} onUrlChange={setQueueUrl} />
      </section>

      <section className='mb-8'>
        <h2 className='text-xl font-semibold mb-4'>Scrape Queue</h2>
        <QueueList />
      </section>

      <BookIntakeSection />

      <BooksNeedingReviewSection />

      <BadScrapesSection />
    </main>
  )
}
