'use client'

import { useState } from 'react'
import { BadScrapesSection } from '@/components/admin/BadScrapesSection'
import { BookIntakeSection } from '@/components/admin/BookIntakeSection'
import { BooksNeedingReviewSection } from '@/components/admin/BooksNeedingReviewSection'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { QueueList } from '@/components/scrape-queue/QueueList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSuperadmin } from '@/components/auth/use-superadmin'
import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'

export default function AdminPage() {
  const [queueUrl, setQueueUrl] = useState('')
  const [showDatabaseStats, setShowDatabaseStats] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const { isLoading, isSuperadmin } = useSuperadmin()

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
      <div className='flex items-center justify-between gap-4 mb-8'>
        <div className='flex items-center gap-4'>
          <h1 className='text-3xl font-bold'>Dreambooks Admin</h1>
          {showDatabaseStats ? <DatabaseStatsSummary /> : null}
        </div>
        <Button variant='outline' size='sm' onClick={() => setShowDatabaseStats((value) => !value)}>
          {showDatabaseStats ? 'Hide database stats' : 'Load database stats'}
        </Button>
      </div>

      <section className='mb-8'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-xl font-semibold'>Add a Book, Series, or Author</h2>
          {!showQueue ? <Badge variant='outline'>Queue hidden by default to reduce Convex reads</Badge> : null}
        </div>

        <BookSubmitForm url={queueUrl} onUrlChange={setQueueUrl} />
      </section>

      <section className='mb-8'>
        <div className='mb-4 flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-xl font-semibold'>Scrape Queue</h2>
            <p className='text-sm text-muted-foreground'>Open this only when you need live queue state.</p>
          </div>
          <Button variant='outline' size='sm' onClick={() => setShowQueue((value) => !value)}>
            {showQueue ? 'Hide queue' : 'Load queue'}
          </Button>
        </div>
        {showQueue ? <QueueList /> : null}
      </section>

      <BookIntakeSection />

      <BooksNeedingReviewSection />

      <BadScrapesSection />
    </main>
  )
}

function DatabaseStatsSummary() {
  const dbStats = useQuery(api.admin.queries.stats, {})

  if (!dbStats) return null

  return (
    <div className='flex items-center gap-4 text-sm text-muted-foreground'>
      <span>Books: {dbStats.books.toLocaleString()}</span>
      <span>Series: {dbStats.series.toLocaleString()}</span>
      <span>Authors: {dbStats.authors.toLocaleString()}</span>
    </div>
  )
}
