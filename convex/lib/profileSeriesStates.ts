import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { isBookVisibleForDiscovery } from './bookVisibility'

export type ProfileSeriesReadSource = 'explicit' | 'derived' | null

export type ResolvedProfileSeriesState = {
  likedAt: number | null
  explicitReadAt: number | null
  derivedReadAt: number | null
  readAt: number | null
  isRead: boolean
  readSource: ProfileSeriesReadSource
  updatedAt: number | null
}

type ProfileSeriesStateDoc = Pick<Doc<'profileSeriesStates'>, 'likedAt' | 'readAt' | 'updatedAt'>

export function resolveSeriesReadState(args: {
  explicitReadAt?: number
  visibleBookCount: number
  readBookTimestamps: number[]
}) {
  const derivedReadAt =
    args.visibleBookCount > 0 && args.readBookTimestamps.length === args.visibleBookCount
      ? Math.max(...args.readBookTimestamps)
      : null

  const explicitReadAt = args.explicitReadAt ?? null
  const readAt = explicitReadAt ?? derivedReadAt
  const readSource: ProfileSeriesReadSource = explicitReadAt !== null ? 'explicit' : derivedReadAt !== null ? 'derived' : null

  return {
    derivedReadAt,
    readAt,
    isRead: readAt !== null,
    readSource,
  }
}

export async function getProfileReadBookTimestampMap(context: QueryCtx, profileId: Id<'profiles'>) {
  const profileBookStates = await context.db
    .query('profileBookStates')
    .withIndex('by_profileId', (query) => query.eq('profileId', profileId))
    .collect()

  const readBookTimestampById = new Map<Id<'books'>, number>()

  for (const profileBookState of profileBookStates) {
    if (profileBookState.readAt !== undefined) {
      readBookTimestampById.set(profileBookState.bookId, profileBookState.readAt)
    }
  }

  return readBookTimestampById
}

export async function getResolvedProfileSeriesState(
  context: QueryCtx,
  args: {
    profileId: Id<'profiles'>
    seriesId: Id<'series'>
  },
) {
  const explicitState = await context.db
    .query('profileSeriesStates')
    .withIndex('by_profileId_seriesId', (query) => query.eq('profileId', args.profileId).eq('seriesId', args.seriesId))
    .unique()

  const readBookTimestampById = await getProfileReadBookTimestampMap(context, args.profileId)

  return await resolveProfileSeriesStateFromData(context, {
    seriesId: args.seriesId,
    explicitState,
    readBookTimestampById,
  })
}

export async function listResolvedReadSeriesForProfile(context: QueryCtx, profileId: Id<'profiles'>) {
  const explicitSeriesStates = await context.db
    .query('profileSeriesStates')
    .withIndex('by_profileId', (query) => query.eq('profileId', profileId))
    .collect()

  const explicitStateBySeriesId = new Map<Id<'series'>, Doc<'profileSeriesStates'>>(
    explicitSeriesStates.map((profileSeriesState) => [profileSeriesState.seriesId, profileSeriesState]),
  )
  const readBookTimestampById = await getProfileReadBookTimestampMap(context, profileId)
  const candidateSeriesIds = new Set<Id<'series'>>()

  for (const explicitSeriesState of explicitSeriesStates) {
    if (explicitSeriesState.readAt !== undefined) {
      candidateSeriesIds.add(explicitSeriesState.seriesId)
    }
  }

  for (const bookId of readBookTimestampById.keys()) {
    const book = await context.db.get(bookId)
    if (!book || !isBookVisibleForDiscovery(book) || !book.seriesId) {
      continue
    }

    candidateSeriesIds.add(book.seriesId)
  }

  const resolvedSeriesEntries = await Promise.all(
    Array.from(candidateSeriesIds).map(async (seriesId) => {
      const series = await context.db.get(seriesId)
      if (!series) {
        return null
      }

      const resolvedState = await resolveProfileSeriesStateFromData(context, {
        seriesId,
        explicitState: explicitStateBySeriesId.get(seriesId) ?? null,
        readBookTimestampById,
      })

      if (!resolvedState.isRead || resolvedState.readAt === null) {
        return null
      }

      return {
        series,
        shelfTimestamp: resolvedState.readAt,
        state: resolvedState,
      }
    }),
  )

  return resolvedSeriesEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

async function resolveProfileSeriesStateFromData(
  context: QueryCtx,
  args: {
    seriesId: Id<'series'>
    explicitState: ProfileSeriesStateDoc | null | undefined
    readBookTimestampById: Map<Id<'books'>, number>
  },
): Promise<ResolvedProfileSeriesState> {
  const visibleBooks = await getVisibleSeriesBooks(context, args.seriesId)
  const readBookTimestamps = visibleBooks.flatMap((book) => {
    const readAt = args.readBookTimestampById.get(book._id)
    return readAt === undefined ? [] : [readAt]
  })
  const resolvedReadState = resolveSeriesReadState({
    explicitReadAt: args.explicitState?.readAt,
    visibleBookCount: visibleBooks.length,
    readBookTimestamps,
  })

  return {
    likedAt: args.explicitState?.likedAt ?? null,
    explicitReadAt: args.explicitState?.readAt ?? null,
    derivedReadAt: resolvedReadState.derivedReadAt,
    readAt: resolvedReadState.readAt,
    isRead: resolvedReadState.isRead,
    readSource: resolvedReadState.readSource,
    updatedAt: args.explicitState?.updatedAt ?? null,
  }
}

async function getVisibleSeriesBooks(context: QueryCtx, seriesId: Id<'series'>) {
  const books = await context.db
    .query('books')
    .withIndex('by_seriesId', (query) => query.eq('seriesId', seriesId))
    .collect()

  return books.filter((book) => isBookVisibleForDiscovery(book))
}
