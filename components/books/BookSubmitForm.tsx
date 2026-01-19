'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type UrlType = 'auto' | 'book' | 'series'

type BookSubmitFormProps = {
  url: string
  onUrlChange: (url: string) => void
}

export function BookSubmitForm({ url, onUrlChange }: BookSubmitFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [urlType, setUrlType] = useState<UrlType>('auto')

  const enqueueUrl = useMutation(api.scrapeQueue.mutations.enqueue)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!url.trim()) return

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Use manual type if specified, otherwise auto-detect
      const type = urlType === 'auto' ? detectUrlType(url.trim()) : urlType

      await enqueueUrl({
        url: url.trim(),
        type,
        scrapeFullSeries: true,
        source: 'user',
      })

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

  const detectedType = detectUrlType(url.trim())

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="url"
          placeholder="Enter Amazon URL (book or series)"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={isLoading}
          className="flex-1"
        />

        <Select value={urlType} onValueChange={(value) => setUrlType(value as UrlType)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto ({detectedType})</SelectItem>
            <SelectItem value="book">Book</SelectItem>
            <SelectItem value="series">Series</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" disabled={isLoading || !url.trim()}>
          {isLoading ? 'Adding...' : 'Add'}
        </Button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">
          ✅ Added to queue. The worker will process it shortly.
        </p>
      )}
    </div>
  )
}

function detectUrlType(url: string): 'book' | 'series' {
  // Series URL patterns from Amazon:
  // - ?series=XXXXXXXXXX
  // - /gp/series/XXXXXXXXXX
  // - /kindle-dbs/series?...&asin=XXXXXXXXXX
  const seriesPatterns = [
    /[?&]series=([A-Z0-9]+)/i,
    /\/gp\/series\/([A-Z0-9]+)/i,
    /\/kindle-dbs\/series/i,
  ]

  for (const pattern of seriesPatterns) {
    if (pattern.test(url)) {
      return 'series'
    }
  }

  return 'book'
}
