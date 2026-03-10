import { getAuthUserId } from '@convex-dev/auth/server'
import type { MutationCtx } from '../_generated/server'
import { getAuthTokenProfile } from './authTokenProfile'

const SUPERADMIN_EMAILS = new Set(['bernatfortet@gmail.com'])

export function isSuperadminEmail(email: string | null | undefined) {
  if (!email) return false

  return SUPERADMIN_EMAILS.has(email.toLowerCase())
}

export async function requireSuperadmin(context: MutationCtx) {
  const email = await getAuthenticatedUserEmail(context)
  if (isSuperadminEmail(email)) return

  throw new Error('Unauthorized')
}

async function getAuthenticatedUserEmail(context: MutationCtx) {
  const userId = await getAuthUserId(context)
  if (!userId) return null

  const user = await context.db.get(userId)
  if (user?.email) {
    return user.email.toLowerCase()
  }

  const tokenProfile = await getAuthTokenProfile(context, userId)
  return tokenProfile?.email?.toLowerCase() ?? null
}
