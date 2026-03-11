import { getAuthUserId } from '@convex-dev/auth/server'
import { internalQuery, query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { v } from 'convex/values'
import { getAuthTokenProfile } from '../lib/authTokenProfile'
import { isSuperadminEmail } from '../lib/superadmin'

export const viewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      isSuperadmin: v.boolean(),
    }),
  ),
  handler: async (context) => {
    return await getViewerProfile(context)
  },
})

export const currentIsSuperadmin = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (context) => {
    const viewer = await getViewerProfile(context)
    return viewer?.isSuperadmin === true
  },
})

async function getViewerProfile(context: QueryCtx) {
  const userId = await getAuthUserId(context)
  if (!userId) return null

  const user = await context.db.get(userId)
  if (!user) return null

  const tokenProfile = await getAuthTokenProfile(context, userId)
  const email = user.email ?? tokenProfile?.email ?? undefined

  return {
    name: user.name ?? tokenProfile?.name ?? tokenProfile?.given_name ?? undefined,
    email,
    imageUrl: user.image ?? tokenProfile?.picture ?? undefined,
    isSuperadmin: isSuperadminEmail(email),
  }
}
