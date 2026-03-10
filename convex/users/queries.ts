import { getAuthUserId } from '@convex-dev/auth/server'
import { query } from '../_generated/server'
import { v } from 'convex/values'

export const viewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
    }),
  ),
  handler: async (context) => {
    const userId = await getAuthUserId(context)
    if (!userId) return null

    const user = await context.db.get(userId)
    if (!user) return null

    const googleAccount = (
      await context.db
        .query('authAccounts')
        .filter((q) => q.eq(q.field('userId'), userId))
        .take(1)
    )[0] as { id_token?: string } | undefined

    const tokenProfile = decodeJwtPayload(googleAccount?.id_token)

    return {
      name: user.name ?? tokenProfile?.name ?? tokenProfile?.given_name ?? undefined,
      email: user.email ?? tokenProfile?.email ?? undefined,
      imageUrl: user.image ?? tokenProfile?.picture ?? undefined,
    }
  },
})

type JwtProfile = {
  email?: string
  given_name?: string
  name?: string
  picture?: string
}

function decodeJwtPayload(token: string | undefined): JwtProfile | null {
  if (!token) return null

  const [, payload] = token.split('.')
  if (!payload) return null

  const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
  const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')

  try {
    return JSON.parse(atob(paddedPayload)) as JwtProfile
  } catch {
    return null
  }
}
