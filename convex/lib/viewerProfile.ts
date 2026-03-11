import { getAuthUserId } from '@convex-dev/auth/server'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { getAuthTokenProfile } from './authTokenProfile'

type ViewerContext = MutationCtx | QueryCtx

export type ViewerIdentity = {
  userId: Id<'users'>
  name?: string
  email?: string
  imageUrl?: string
}

export async function getViewerIdentity(context: ViewerContext): Promise<ViewerIdentity | null> {
  const userId = await getAuthUserId(context)
  if (!userId) return null

  const user = await context.db.get(userId)
  if (!user) return null

  const tokenProfile = await getAuthTokenProfile(context, userId)
  const email = user.email ?? tokenProfile?.email ?? undefined

  return {
    userId,
    name: user.name ?? tokenProfile?.name ?? tokenProfile?.given_name ?? undefined,
    email,
    imageUrl: user.image ?? tokenProfile?.picture ?? undefined,
  }
}
