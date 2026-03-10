'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type EntityType = 'book' | 'series' | 'author'
type EntityId = Id<'books'> | Id<'series'> | Id<'authors'>

type DeleteDialogProps = {
  entityType: EntityType
  entityId: EntityId
  entityName: string
  onDeleted?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  redirectTo?: string | null
  showDefaultTrigger?: boolean
}

const mutationMap = {
  book: api.books.mutations.deleteBook,
  series: api.series.mutations.deleteSeries,
  author: api.authors.mutations.deleteAuthor,
} as const

const warningMessages = {
  book: 'This will permanently delete this book and its cover image. Authors and series will NOT be deleted.',
  series: 'This will permanently delete this series AND ALL BOOKS in the series. This cannot be undone.',
  author: 'This will permanently delete this author and unlink them from books. Books will NOT be deleted.',
} as const

export function DeleteDialog({
  entityType,
  entityId,
  entityName,
  onDeleted,
  open,
  onOpenChange,
  redirectTo = '/ad',
  showDefaultTrigger = true,
}: DeleteDialogProps) {
  const deleteMutation = useMutation(mutationMap[entityType])
  const router = useRouter()

  const [internalIsDialogOpen, setInternalIsDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isDialogOpen = open ?? internalIsDialogOpen

  async function handleDelete() {
    setIsDeleting(true)
    try {
      if (entityType === 'book') {
        await deleteMutation({ bookId: entityId as Id<'books'> })
      } else if (entityType === 'series') {
        await deleteMutation({ seriesId: entityId as Id<'series'> })
      } else {
        await deleteMutation({ authorId: entityId as Id<'authors'> })
      }
      setDialogOpen(false)
      onDeleted?.()

      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error(`Failed to delete ${entityType}`, error)
      alert(`Failed to delete ${entityType}. Check console for details.`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      {showDefaultTrigger ? (
        <Button variant='destructive' size='sm' onClick={() => setDialogOpen(true)}>
          🗑️ Delete
        </Button>
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {entityType.charAt(0).toUpperCase() + entityType.slice(1)}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{entityName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className='py-4'>
            <p className='text-sm text-destructive'>{warningMessages[entityType]}</p>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

  function setDialogOpen(nextOpen: boolean) {
    onOpenChange?.(nextOpen)

    if (open !== undefined) return

    setInternalIsDialogOpen(nextOpen)
  }
}
