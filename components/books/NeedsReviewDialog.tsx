'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
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

type NeedsReviewDialogProps = {
  bookId: Id<'books'>
  isNeedsReview: boolean
  initialReason?: string | null
  onToggleComplete?: () => void
}

export function NeedsReviewDialog(props: NeedsReviewDialogProps) {
  const { bookId, isNeedsReview, initialReason, onToggleComplete } = props
  const markNeedsReview = useMutation(api.books.mutations.markNeedsReview)
  const clearNeedsReview = useMutation(api.books.mutations.clearNeedsReview)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [reason, setReason] = useState(initialReason ?? '')
  const [isLoading, setIsLoading] = useState(false)

  async function handleToggle() {
    if (isNeedsReview) {
      setIsLoading(true)
      try {
        await clearNeedsReview({ bookId })
        onToggleComplete?.()
      } catch (error) {
        console.error('Failed to clear needs review', error)
      } finally {
        setIsLoading(false)
      }
      return
    }

    setReason(initialReason ?? '')
    setIsDialogOpen(true)
  }

  async function handleSave() {
    setIsLoading(true)
    try {
      await markNeedsReview({
        bookId,
        reason: reason.trim() || undefined,
      })
      setIsDialogOpen(false)
      onToggleComplete?.()
    } catch (error) {
      console.error('Failed to mark needs review', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button variant={isNeedsReview ? 'outline' : 'secondary'} size='sm' onClick={handleToggle} disabled={isLoading}>
        {isLoading ? '...' : isNeedsReview ? 'Clear Review' : 'Mark Needs Review'}
      </Button>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) {
            setReason(initialReason ?? '')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Book For Review</DialogTitle>
            <DialogDescription>
              Add a note for why this book should stay in the review queue.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder='e.g., Looks like a boxed set or multi-book collection.'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setIsDialogOpen(false)
                setReason(initialReason ?? '')
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
