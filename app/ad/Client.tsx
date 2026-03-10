'use client'

import { BadScrapesSection } from '@/components/admin/BadScrapesSection'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { QueueList } from '@/components/scrape-queue/QueueList'
import { Badge } from '@/components/ui/badge'
import { api } from '@/convex/_generated/api'
import { isDev } from '@/lib/env'
import { useQuery } from 'convex/react'
import { useState } from 'react'

export default function AdminPage() {
  const [bookUrl, setBookUrl] = useState('')
  const queueStats = useQuery(api.scrapeQueue.queries.stats)
  const dbStats = useQuery(api.admin.queries.stats)

  if (!isDev()) {
    return (
      <main className='container mx-auto py-8 px-4'>
        <p className='text-muted-foreground'>Admin dashboard is only available in development.</p>
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
          <h2 className='text-xl font-semibold'>Add a Book or Series</h2>
          {queueStats && (
            <div className='flex gap-2 text-sm'>
              <Badge variant='secondary'>{queueStats.pending} pending</Badge>
              {queueStats.processing > 0 && <Badge variant='default'>{queueStats.processing} processing</Badge>}
            </div>
          )}
        </div>

        <BookSubmitForm url={bookUrl} onUrlChange={setBookUrl} />
      </section>

      <section className='mb-8'>
        <h2 className='text-xl font-semibold mb-4'>Scrape Queue</h2>
        <QueueList />
      </section>

      <BadScrapesSection />
    </main>
  )
}
