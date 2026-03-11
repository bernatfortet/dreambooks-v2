'use client'

import { useState } from 'react'
import { BookCheck, Heart } from 'lucide-react'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { ProfileActionControls, type ProfileActionLayout } from '@/components/profiles/ProfileActionControls'
import { useProfileActionContext } from '@/components/profiles/useProfileActionContext'
import { cn } from '@/lib/utils'

type SeriesProfileActionsProps = {
  layout?: ProfileActionLayout
  seriesId: Id<'series'>
}

export function SeriesProfileActions(props: SeriesProfileActionsProps) {
  const { layout = 'panel', seriesId } = props
  const { activeProfile, activeProfileId, canRenderActions } = useProfileActionContext()
  const toggleLike = useMutation(api.profileSeriesStates.mutations.toggleLike)
  const toggleRead = useMutation(api.profileSeriesStates.mutations.toggleRead)
  const profileSeriesState = useQuery(
    api.profileSeriesStates.queries.getForSeries,
    activeProfileId
      ? {
          profileId: activeProfileId,
          seriesId,
        }
      : 'skip',
  )
  const [pendingAction, setPendingAction] = useState<'like' | 'read' | null>(null)

  if (!canRenderActions || !activeProfile || !activeProfileId) {
    return null
  }

  const isLiked = profileSeriesState?.likedAt !== null
  const isRead = profileSeriesState?.isRead ?? false
  const isReadDerivedOnly = profileSeriesState?.readSource === 'derived' && profileSeriesState.explicitReadAt === null
  const isDisabled = pendingAction !== null || profileSeriesState === undefined

  return (
    <ProfileActionControls
      layout={layout}
      profileName={activeProfile.name}
      footer={
        layout === 'panel' && isReadDerivedOnly ? (
          <p className='text-sm text-muted-foreground'>
            This series counts as read because every visible book in it is marked read for {activeProfile.name}.
          </p>
        ) : null
      }
      actions={[
        {
          key: 'read',
          icon: <BookCheck />,
          isActive: isRead,
          disabled: isDisabled,
          label: getReadLabel({
            isRead,
            isReadDerivedOnly,
            profileName: activeProfile.name,
          }),
          buttonLabel: pendingAction === 'read' ? 'Saving...' : isRead ? 'Read' : 'Mark as read',
          onClick: () => void handleToggleRead(),
        },
        {
          key: 'like',
          icon: <Heart className={cn(isLiked ? 'fill-current' : undefined)} />,
          isActive: isLiked,
          disabled: isDisabled,
          label: isLiked ? `Remove like for ${activeProfile.name}` : `Like this series for ${activeProfile.name}`,
          buttonLabel: pendingAction === 'like' ? 'Saving...' : isLiked ? 'Liked' : 'Like',
          onClick: () => void handleToggleLike(),
        },
      ]}
    />
  )

  async function handleToggleLike() {
    setPendingAction('like')

    try {
      await toggleLike({
        profileId: activeProfileId,
        seriesId,
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleToggleRead() {
    setPendingAction('read')

    try {
      await toggleRead({
        profileId: activeProfileId,
        seriesId,
      })
    } finally {
      setPendingAction(null)
    }
  }
}

function getReadLabel(args: {
  isRead: boolean
  isReadDerivedOnly: boolean
  profileName: string
}) {
  if (args.isReadDerivedOnly) {
    return `This series counts as read for ${args.profileName} because every visible book is marked read.`
  }

  if (args.isRead) {
    return `Remove read status for ${args.profileName}`
  }

  return `Mark as read for ${args.profileName}`
}
