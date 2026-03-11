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
import { Input } from '@/components/ui/input'

type ChangeAmazonUrlDialogProps = {
  bookId: Id<'books'>
  currentAmazonUrl?: string | null
}

export function ChangeAmazonUrlDialog(props: ChangeAmazonUrlDialogProps) {
  const { bookId, currentAmazonUrl } = props
  const updateAmazonUrl = useMutation(api.books.mutations.updateAmazonUrl)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [amazonUrl, setAmazonUrl] = useState(currentAmazonUrl ?? '')
  const [isLoading, setIsLoading] = useState(false)

  const trimmedAmazonUrl = amazonUrl.trim()
  const canSave = trimmedAmazonUrl.length > 0 && trimmedAmazonUrl !== (currentAmazonUrl ?? '')

  async function handleSave() {
    if (!canSave) return

    setIsLoading(true)
    try {
      await updateAmazonUrl({
        bookId,
        amazonUrl: trimmedAmazonUrl,
      })

      setIsDialogOpen(false)
    } catch (error) {
      console.error('Failed to change Amazon URL', error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenChange(open: boolean) {
    setIsDialogOpen(open)

    if (!open) {
      setAmazonUrl(currentAmazonUrl ?? '')
    }
  }

  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setIsDialogOpen(true)}>
        Change Amazon URL
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Amazon URL</DialogTitle>
            <DialogDescription>
              Save a new Amazon product URL for this book and immediately queue a fresh re-scrape.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2 py-4'>
            <Input
              value={amazonUrl}
              onChange={(event) => setAmazonUrl(event.target.value)}
              placeholder='https://www.amazon.com/dp/...'
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || isLoading}>
              {isLoading ? 'Saving...' : 'Save And Re-scrape'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
