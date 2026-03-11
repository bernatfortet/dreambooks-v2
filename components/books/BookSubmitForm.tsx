'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type UrlType = 'auto' | 'book' | 'series' | 'author'

const AUTHOR_URL_PATTERNS = [/\/e\/([A-Z0-9]+)/i, /\/author\//i]
const SERIES_URL_PATTERNS = [/[?&]series=([A-Z0-9]+)/i, /\/gp\/series\/([A-Z0-9]+)/i, /\/kindle-dbs\/series/i]

type BookSubmitFormProps = {
  url: string
  onUrlChange: (url: string) => void
}

export function BookSubmitForm({ url, onUrlChange }: BookSubmitFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [urlType, setUrlType] = useState<UrlType>('auto')
  const trimmedUrl = url.trim()

  const enqueueUrl = useMutation(api.scrapeQueue.mutations.enqueue)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!trimmedUrl) return

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Use manual type if specified, otherwise auto-detect
      const type = urlType === 'auto' ? detectUrlType(trimmedUrl) : urlType

      const result = await enqueueUrl({
        url: trimmedUrl,
        type,
        scrapeFullSeries: true,
        source: 'user',
        referrerUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        referrerReason: 'manual',
      })

      // Handle different result statuses
      if (result.status === 'blocked') {
        setError('This URL is blocked from being queued')
        return
      }

      if (result.status === 'skipped_up_to_date') {
        setError('This item already exists and is up-to-date')
        return
      }

      // queued or already_queued - both are success states
      setSuccess(true)
      onUrlChange('')
      setUrlType('auto')

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to queue')
    } finally {
      setIsLoading(false)
    }
  }

  const detectedType = detectUrlType(trimmedUrl)

  return (
    <div className='space-y-2'>
      <form onSubmit={handleSubmit} className='flex gap-2'>
        <Input
          type='url'
          placeholder='Enter Amazon URL (book, series, or author)'
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={isLoading}
          className='flex-1'
        />

        <Select value={urlType} onValueChange={(value) => setUrlType(value as UrlType)}>
          <SelectTrigger className='w-[120px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='auto'>Auto ({detectedType})</SelectItem>
            <SelectItem value='book'>Book</SelectItem>
            <SelectItem value='series'>Series</SelectItem>
            <SelectItem value='author'>Author</SelectItem>
          </SelectContent>
        </Select>

        <Button type='submit' disabled={isLoading || !trimmedUrl}>
          {isLoading ? 'Adding...' : 'Add'}
        </Button>
      </form>

      {error && <p className='text-sm text-red-500'>{error}</p>}
      {success && <p className='text-sm text-green-600'>✅ Added to queue. The worker will process it shortly.</p>}
    </div>
  )
}

function detectUrlType(url: string): 'book' | 'series' | 'author' {
  for (const pattern of AUTHOR_URL_PATTERNS) {
    if (pattern.test(url)) {
      return 'author'
    }
  }

  // Series URL patterns from Amazon:
  // - ?series=XXXXXXXXXX
  // - /gp/series/XXXXXXXXXX
  // - /kindle-dbs/series?...&asin=XXXXXXXXXX
  for (const pattern of SERIES_URL_PATTERNS) {
    if (pattern.test(url)) {
      return 'series'
    }
  }

  return 'book'
}
