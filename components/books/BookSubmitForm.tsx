'use client'

import { useState } from 'react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function BookSubmitForm() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crawlBook = useAction(api.scraping.crawlBook.crawlBook)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!url.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      await crawlBook({ url: url.trim() })
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scrape book')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="url"
        placeholder="Enter Amazon book URL (e.g., amazon.com/dp/...)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isLoading}
        className="flex-1"
      />

      <Button type="submit" disabled={isLoading || !url.trim()}>
        {isLoading ? 'Scraping...' : 'Add Book'}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  )
}
