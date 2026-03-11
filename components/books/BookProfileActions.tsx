'use client'

import { useState, type ReactNode } from 'react'
import { BookCheck, Heart } from 'lucide-react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { Id } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { useActiveProfile } from '@/components/profiles/ActiveProfileProvider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type BookProfileActionsProps = {
  bookId: Id<'books'>
  layout?: 'panel' | 'card-overlay'
}

export function BookProfileActions(props: BookProfileActionsProps) {
  const { bookId, layout = 'panel' } = props
  const { isAuthenticated } = useConvexAuth()
  const { activeProfile, activeProfileId, isLoading: isProfileLoading } = useActiveProfile()
  const toggleLike = useMutation(api.profileBookStates.mutations.toggleLike)
  const toggleRead = useMutation(api.profileBookStates.mutations.toggleRead)
  const profileBookState = useQuery(
    api.profileBookStates.queries.getForBook,
    activeProfileId
      ? {
          profileId: activeProfileId as Id<'profiles'>,
          bookId,
        }
      : 'skip',
  )
  const [pendingAction, setPendingAction] = useState<'like' | 'read' | null>(null)

  if (!isAuthenticated || isProfileLoading || !activeProfile || !activeProfileId) {
    return null
  }

  const isLiked = profileBookState?.likedAt !== undefined
  const isRead = profileBookState?.readAt !== undefined
  const isDisabled = pendingAction !== null || profileBookState === undefined

  if (layout === 'card-overlay') {
    return (
      <div className='pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between'>
        <ProfileActionIconButton
          isActive={isRead}
          disabled={isDisabled}
          label={isRead ? `Remove read status for ${activeProfile.name}` : `Mark as read for ${activeProfile.name}`}
          onClick={() => void handleToggleRead()}
        >
          <BookCheck />
        </ProfileActionIconButton>

        <ProfileActionIconButton
          isActive={isLiked}
          disabled={isDisabled}
          label={isLiked ? `Remove like for ${activeProfile.name}` : `Like this book for ${activeProfile.name}`}
          onClick={() => void handleToggleLike()}
        >
          <Heart className={cn(isLiked ? 'fill-current' : undefined)} />
        </ProfileActionIconButton>
      </div>
    )
  }

  return (
    <div className='rounded-lg border bg-muted/30 p-3'>
      <p className='text-sm font-medium'>For {activeProfile.name}</p>
      <div className='mt-3 flex flex-wrap gap-2'>
        <Button
          variant={isLiked ? 'default' : 'outline'}
          size='sm'
          disabled={isDisabled}
          onClick={() => void handleToggleLike()}
        >
          <Heart className={isLiked ? 'fill-current' : undefined} />
          {pendingAction === 'like' ? 'Saving...' : isLiked ? 'Liked' : 'Like'}
        </Button>

        <Button
          variant={isRead ? 'default' : 'outline'}
          size='sm'
          disabled={isDisabled}
          onClick={() => void handleToggleRead()}
        >
          <BookCheck />
          {pendingAction === 'read' ? 'Saving...' : isRead ? 'Read' : 'Mark as read'}
        </Button>
      </div>
    </div>
  )

  async function handleToggleLike() {
    setPendingAction('like')

    try {
      await toggleLike({
        profileId: activeProfileId as Id<'profiles'>,
        bookId,
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleToggleRead() {
    setPendingAction('read')

    try {
      await toggleRead({
        profileId: activeProfileId as Id<'profiles'>,
        bookId,
      })
    } finally {
      setPendingAction(null)
    }
  }
}

type ProfileActionIconButtonProps = {
  children: ReactNode
  isActive: boolean
  disabled: boolean
  label: string
  onClick: () => void
}

function ProfileActionIconButton(props: ProfileActionIconButtonProps) {
  const { children, isActive, disabled, label, onClick } = props

  return (
    <Button
      type='button'
      variant='outline'
      size='icon-sm'
      className={cn(
        'pointer-events-auto rounded-full shadow-sm backdrop-blur-sm transition-opacity',
        isActive
          ? 'border-brand bg-brand text-brand-foreground hover:bg-brand/90'
          : 'border-border/60 bg-background/90 opacity-0 hover:bg-background group-hover:opacity-100 group-focus-within:opacity-100',
      )}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}
