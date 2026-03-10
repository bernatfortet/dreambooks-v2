'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'

type BookVisibilityButtonProps = {
  bookId: Id<'books'>
  isHidden: boolean
  hideReason?: string | null
}

export function BookVisibilityButton(props: BookVisibilityButtonProps) {
  const { bookId, isHidden, hideReason } = props
  const hideBook = useMutation(api.books.mutations.hideBook)
  const unhideBook = useMutation(api.books.mutations.unhideBook)
  const [isLoading, setIsLoading] = useState(false)

  async function handleClick() {
    setIsLoading(true)

    try {
      if (isHidden) {
        await unhideBook({ bookId })
      } else {
        await hideBook({
          bookId,
          hiddenReason: hideReason ?? undefined,
        })
      }
    } catch (error) {
      console.error('Failed to update book visibility', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button variant='outline' size='sm' onClick={handleClick} disabled={isLoading}>
      {isLoading ? '...' : isHidden ? 'Unhide Book' : 'Hide Book'}
    </Button>
  )
}
