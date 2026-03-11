'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { ProfileActionControls, type ProfileActionLayout } from '@/components/profiles/ProfileActionControls'
import { useProfileActionContext } from '@/components/profiles/useProfileActionContext'
import { cn } from '@/lib/utils'

type AuthorProfileActionsProps = {
  authorId: Id<'authors'>
  layout?: Exclude<ProfileActionLayout, 'card-overlay'>
}

export function AuthorProfileActions(props: AuthorProfileActionsProps) {
  const { authorId, layout = 'panel' } = props
  const { activeProfile, activeProfileId, canRenderActions } = useProfileActionContext()
  const toggleLike = useMutation(api.profileAuthorStates.mutations.toggleLike)
  const profileAuthorState = useQuery(
    api.profileAuthorStates.queries.getForAuthor,
    activeProfileId
      ? {
          profileId: activeProfileId,
          authorId,
        }
      : 'skip',
  )
  const [isPending, setIsPending] = useState(false)

  if (!canRenderActions || !activeProfile || !activeProfileId) {
    return null
  }

  const isLiked = profileAuthorState?.likedAt !== null
  const isDisabled = isPending || profileAuthorState === undefined

  return (
    <ProfileActionControls
      layout={layout}
      profileName={activeProfile.name}
      actions={[
        {
          key: 'like',
          icon: <Heart className={cn(isLiked ? 'fill-current' : undefined)} />,
          isActive: isLiked,
          disabled: isDisabled,
          label: isLiked ? `Remove like for ${activeProfile.name}` : `Like this author for ${activeProfile.name}`,
          buttonLabel: isPending ? 'Saving...' : isLiked ? 'Liked' : 'Like',
          onClick: () => void handleToggleLike(),
        },
      ]}
    />
  )

  async function handleToggleLike() {
    setIsPending(true)

    try {
      await toggleLike({
        profileId: activeProfileId,
        authorId,
      })
    } finally {
      setIsPending(false)
    }
  }
}
