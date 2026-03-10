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
import { Textarea } from '@/components/ui/textarea'

type EntityType = 'book' | 'series' | 'author'
type EntityId = Id<'books'> | Id<'series'> | Id<'authors'>

type BadScrapeDialogProps = {
  entityType: EntityType
  entityId: EntityId
  isBadScrape: boolean
  onToggleComplete?: () => void
}

export function BadScrapeDialog({
  entityType,
  entityId,
  isBadScrape,
  onToggleComplete,
}: BadScrapeDialogProps) {
  const markBadScrape = useMutation(api.lib.badScrape.markBadScrape)
  const clearBadScrape = useMutation(api.lib.badScrape.clearBadScrape)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleToggle() {
    if (isBadScrape) {
      setIsLoading(true)
      try {
        await clearBadScrape({ entityId })
        onToggleComplete?.()
      } catch (error) {
        console.error('Failed to clear bad scrape', error)
      } finally {
        setIsLoading(false)
      }
    } else {
      setNotes('')
      setIsDialogOpen(true)
    }
  }

  async function handleSave() {
    setIsLoading(true)
    try {
      await markBadScrape({
        entityType,
        entityId,
        notes: notes.trim() || undefined,
      })
      setIsDialogOpen(false)
      setNotes('')
      onToggleComplete?.()
    } catch (error) {
      console.error('Failed to mark bad scrape', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        variant={isBadScrape ? 'outline' : 'destructive'}
        size="sm"
        onClick={handleToggle}
        disabled={isLoading}
      >
        {isLoading ? '...' : isBadScrape ? 'Clear Bad Flag' : 'Flag Bad Scrape'}
      </Button>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) {
            setNotes('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Bad Scrape</DialogTitle>
            <DialogDescription>
              Add notes about why this scrape is bad (optional). Press ESC to cancel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="e.g., Missing cover image, incorrect description, wrong series information..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false)
                setNotes('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
