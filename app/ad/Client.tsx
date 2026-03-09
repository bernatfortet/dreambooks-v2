'use client'

import { useEffect, useState } from 'react'

import { BookList } from '@/components/books/BookList'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { QueueList } from '@/components/scrape-queue/QueueList'
import { SeriesList } from '@/components/series/SeriesList'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/components/ui/PageContainer'

export default function Client() {
  const [url, setUrl] = useState('')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <PageContainer className='space-y-8'>
        <div className='space-y-2'>
          <h1 className='text-3xl font-bold tracking-tight'>Admin</h1>
          <p className='text-muted-foreground'>Loading admin dashboard...</p>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer className='space-y-8'>
      <div className='space-y-2'>
        <h1 className='text-3xl font-bold tracking-tight'>Admin</h1>
        <p className='text-muted-foreground'>Queue new Amazon URLs, monitor scraping progress, and review the current catalog.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add book or series</CardTitle>
          <CardDescription>Paste an Amazon URL to queue it for scraping.</CardDescription>
        </CardHeader>
        <CardContent>
          <BookSubmitForm url={url} onUrlChange={setUrl} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scrape queue</CardTitle>
          <CardDescription>Recent pending, processing, error, and completed queue items.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueueList />
        </CardContent>
      </Card>

      <div className='grid gap-8 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Books</CardTitle>
            <CardDescription>Current books stored in Dreambooks.</CardDescription>
          </CardHeader>
          <CardContent>
            <BookList />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Series</CardTitle>
            <CardDescription>Current series stored in Dreambooks.</CardDescription>
          </CardHeader>
          <CardContent>
            <SeriesList />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
