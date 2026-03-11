'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type CreateChildProfileDialogProps = {
  onCreated: (profileId: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function CreateChildProfileDialog({
  onCreated,
  onOpenChange,
  open,
}: CreateChildProfileDialogProps) {
  const createChildProfile = useMutation(api.profiles.mutations.createChild)
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add child profile</DialogTitle>
          <DialogDescription>Create a managed profile for a child on this account.</DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          <Input
            placeholder='Profile name'
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (errorMessage) {
                setErrorMessage(null)
              }
            }}
            disabled={isSubmitting}
            autoFocus
          />
          {errorMessage ? <p className='text-sm text-destructive'>{errorMessage}</p> : null}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreateProfile()} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Creating...' : 'Create profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)

    if (nextOpen) return

    setName('')
    setErrorMessage(null)
    setIsSubmitting(false)
  }

  async function handleCreateProfile() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setErrorMessage('Profile name is required.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const profileId = await createChildProfile({
        name: trimmedName,
      })

      handleOpenChange(false)
      onCreated(profileId)
    } catch (error) {
      console.error('Failed to create child profile', error)
      setErrorMessage('Unable to create profile right now.')
      setIsSubmitting(false)
    }
  }
}
