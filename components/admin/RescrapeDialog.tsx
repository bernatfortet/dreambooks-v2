'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type EntityType = 'book' | 'series' | 'author'

type SkipOptions = {
  skipSeriesLink?: boolean
  skipAuthorDiscovery?: boolean
  skipBookDiscoveries?: boolean
  skipCoverDownload?: boolean
}

type RescrapeDialogProps = {
  entityType: EntityType
  entityId: Id<'books'> | Id<'series'> | Id<'authors'>
  hasSourceUrl: boolean
  onComplete?: () => void
}

const SKIP_OPTIONS_BY_TYPE: Record<EntityType, Array<{ key: keyof SkipOptions; label: string }>> = {
  book: [
    { key: 'skipSeriesLink', label: 'Skip series link (don\'t update series connection)' },
    { key: 'skipAuthorDiscovery', label: 'Skip author discovery (don\'t queue authors)' },
    { key: 'skipCoverDownload', label: 'Skip cover download' },
  ],
  series: [
    { key: 'skipBookDiscoveries', label: 'Skip book discoveries (don\'t queue books)' },
    { key: 'skipCoverDownload', label: 'Skip cover download' },
  ],
  author: [
    { key: 'skipBookDiscoveries', label: 'Skip book discoveries (don\'t queue books)' },
    { key: 'skipCoverDownload', label: 'Skip image download' },
  ],
}

export function RescrapeDialog({
  entityType,
  entityId,
  hasSourceUrl,
  onComplete,
}: RescrapeDialogProps) {
  const queueRescrape = useMutation(api.scrapeQueue.mutations.queueRescrape)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [skipOptions, setSkipOptions] = useState<SkipOptions>({})

  const options = SKIP_OPTIONS_BY_TYPE[entityType]

  async function handleRescrape() {
    setIsLoading(true)
    try {
      await queueRescrape({
        entityType,
        entityId,
        ...skipOptions,
      })
      setIsDialogOpen(false)
      setSkipOptions({})
      onComplete?.()
    } catch (error) {
      console.error('Failed to queue rescrape', error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenDialog() {
    setSkipOptions({})
    setIsDialogOpen(true)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenDialog}
        disabled={!hasSourceUrl}
        title={hasSourceUrl ? 'Re-scrape this entity' : 'No source URL available'}
      >
        Re-scrape
      </Button>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) {
            setSkipOptions({})
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-scrape {entityType}</DialogTitle>
            <DialogDescription>
              Queue this {entityType} for re-scraping. Select what to skip during the process.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {options.map((option) => (
              <label key={option.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipOptions[option.key] ?? false}
                  onChange={(event) =>
                    setSkipOptions((previous) => ({
                      ...previous,
                      [option.key]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false)
                setSkipOptions({})
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRescrape} disabled={isLoading}>
              {isLoading ? 'Queuing...' : 'Queue Re-scrape'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
