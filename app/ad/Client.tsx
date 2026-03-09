'use client'

import { useState } from 'react'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { QueueList } from '@/components/scrape-queue/QueueList'
import { PageContainer } from '@/components/ui/PageContainer'

export default function Client() {
  const [url, setUrl] = useState('')

  return (
    <PageContainer>
      <h1 className='mb-6 text-3xl font-bold'>Admin Dashboard</h1>
      <div className='space-y-8'>
        <section>
          <h2 className='mb-4 text-xl font-semibold'>Add Book</h2>
          <BookSubmitForm url={url} onUrlChange={setUrl} />
        </section>
        <section>
          <h2 className='mb-4 text-xl font-semibold'>Scrape Queue</h2>
          <QueueList />
        </section>
      </div>
    </PageContainer>
  )
}
