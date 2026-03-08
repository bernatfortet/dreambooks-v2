'use client'

import { useState } from 'react'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { QueueList } from '@/components/scrape-queue/QueueList'

export default function Client() {
  const [url, setUrl] = useState('')

  return (
    <div className='container mx-auto px-4 py-8 space-y-8'>
      <h1 className='text-3xl font-bold'>Admin</h1>
      <BookSubmitForm url={url} onUrlChange={setUrl} />
      <QueueList />
    </div>
  )
}
