import { internalQuery, query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { v } from 'convex/values'
import { isSuperadminEmail } from '../lib/superadmin'
import { getViewerIdentity } from '../lib/viewerProfile'

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
  const viewerIdentity = await getViewerIdentity(context)
  if (!viewerIdentity) return null

  const email = viewerIdentity.email

  return {
    name: viewerIdentity.name,
    email,
    imageUrl: viewerIdentity.imageUrl,
    isSuperadmin: isSuperadminEmail(email),
  }
}
