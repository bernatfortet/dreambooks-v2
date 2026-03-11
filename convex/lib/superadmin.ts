import { getAuthUserId } from '@convex-dev/auth/server'
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import { getAuthTokenProfile } from './authTokenProfile'

const SUPERADMIN_EMAILS = new Set(['bernatfortet@gmail.com'])

type AuthContext = MutationCtx | QueryCtx | ActionCtx
type DatabaseAuthContext = MutationCtx | QueryCtx

export function isSuperadminEmail(email: string | null | undefined) {
  if (!email) return false

  return SUPERADMIN_EMAILS.has(email.toLowerCase())
}

export async function requireSuperadmin(context: AuthContext) {
  if (await isSuperadmin(context)) return

  throw new Error('Unauthorized')
}

export async function isSuperadmin(context: AuthContext) {
  if (!('db' in context)) {
    return await context.runQuery(internal.users.queries.currentIsSuperadmin, {})
  }

  const email = await getAuthenticatedUserEmail(context)
  return isSuperadminEmail(email)
}

async function getAuthenticatedUserEmail(context: DatabaseAuthContext) {
  const userId = await getAuthUserId(context)
  if (!userId) return null

  const user = await context.db.get(userId)
  if (user?.email) {
    return user.email.toLowerCase()
  }

  const tokenProfile = await getAuthTokenProfile(context, userId)
  return tokenProfile?.email?.toLowerCase() ?? null
}
