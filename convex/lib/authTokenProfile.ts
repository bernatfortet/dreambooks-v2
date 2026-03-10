import type { MutationCtx, QueryCtx } from '../_generated/server'

type AuthContext = MutationCtx | QueryCtx

export type AuthTokenProfile = {
  email?: string
  given_name?: string
  name?: string
  picture?: string
}

export async function getAuthTokenProfile(context: AuthContext, userId: string) {
  const googleAccount = (
    await context.db
      .query('authAccounts')
      .filter((query) => query.eq(query.field('userId'), userId))
      .take(1)
  )[0] as { id_token?: string } | undefined

  return decodeJwtPayload(googleAccount?.id_token)
}

function decodeJwtPayload(token: string | undefined): AuthTokenProfile | null {
  if (!token) return null

  const [, payload] = token.split('.')
  if (!payload) return null

  const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
  const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')

  try {
    return JSON.parse(atob(paddedPayload)) as AuthTokenProfile
  } catch {
    return null
  }
}
