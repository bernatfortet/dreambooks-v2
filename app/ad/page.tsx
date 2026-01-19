'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { BookSubmitForm } from '@/components/books/BookSubmitForm'
import { BookList } from '@/components/books/BookList'
import { QueueList } from '@/components/scrape-queue/QueueList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function AdminPage() {
  const [bookUrl, setBookUrl] = useState('')
  const queueStats = useQuery(api.scrapeQueue.queries.stats)

  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Dreambooks Admin</h1>
      <p className="text-muted-foreground mb-8">Manage books and series</p>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Add a Book or Series</h2>
          {queueStats && (
            <div className="flex gap-2 text-sm">
              <Badge variant="secondary">{queueStats.pending} pending</Badge>
              {queueStats.processing > 0 && (
                <Badge variant="default">{queueStats.processing} processing</Badge>
              )}
            </div>
          )}
        </div>

        <BookSubmitForm url={bookUrl} onUrlChange={setBookUrl} />

        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              URLs are added to a queue and processed by the local scraping worker.
            </p>
            <p>
              For books: the worker scrapes the book, its series, and all books in that series.
            </p>
            <p className="font-mono text-xs bg-muted p-2 rounded">
              Start the worker: bunx tsx scripts/worker/index.ts
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Scrape Queue</h2>
        <QueueList />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Books</h2>
        <BookList />
      </section>
    </main>
  )
}
