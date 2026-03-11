import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { isBookVisibleForDiscovery } from '../lib/bookVisibility'
import { listResolvedReadSeriesForProfile } from '../lib/profileSeriesStates'
import { getViewerIdentity } from '../lib/viewerProfile'
import {
  getDefaultProfileId,
  isProfilePublic,
  listProfilesForOwner,
  profileValidator,
} from '../lib/profiles'

const publicProfileCountsValidator = v.object({
  books: v.object({
    liked: v.number(),
    read: v.number(),
  }),
  series: v.object({
    liked: v.number(),
    read: v.number(),
  }),
  authors: v.object({
    liked: v.number(),
  }),
})

const publicProfileValidator = v.object({
  _id: v.id('profiles'),
  name: v.string(),
  slug: v.string(),
  type: v.union(v.literal('self'), v.literal('child')),
  imageUrl: v.optional(v.string()),
  counts: publicProfileCountsValidator,
})

const publicBookShelfItemValidator = v.object({
  _id: v.id('books'),
  title: v.string(),
  slug: v.union(v.string(), v.null()),
  authors: v.array(v.string()),
  shelfTimestamp: v.number(),
  cover: v.object({
    url: v.union(v.string(), v.null()),
    urlThumb: v.union(v.string(), v.null()),
    width: v.number(),
    height: v.number(),
    dominantColor: v.union(v.string(), v.null()),
  }),
})

const publicSeriesShelfItemValidator = v.object({
  _id: v.id('series'),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  coverUrl: v.union(v.string(), v.null()),
  shelfTimestamp: v.number(),
})

const publicAuthorShelfItemValidator = v.object({
  _id: v.id('authors'),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  shelfTimestamp: v.number(),
})

export const bootstrap = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      profiles: v.array(profileValidator),
      defaultProfileId: v.optional(v.id('profiles')),
    }),
  ),
  handler: async (context) => {
    const viewerIdentity = await getViewerIdentity(context)
    if (!viewerIdentity) return null

    const profiles = await listProfilesForOwner(context, viewerIdentity.userId)
    const defaultProfileId = getDefaultProfileId(profiles) ?? undefined

    return {
      profiles: profiles.map((profile) => ({
        _id: profile._id,
        name: profile.name,
        type: profile.type,
        imageUrl: profile.imageUrl,
        slug: profile.slug,
        publicVisibility: profile.publicVisibility,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })),
      defaultProfileId,
    }
  },
})

export const getPublicBySlug = query({
  args: {
    slug: v.string(),
  },
  returns: v.union(v.null(), publicProfileValidator),
  handler: async (context, args) => {
    const profile = await getPublicProfileBySlug(context, args.slug)
    if (!profile) {
      return null
    }

    const counts = await getPublicProfileCounts(context, profile._id)

    return {
      _id: profile._id,
      name: profile.name,
      slug: profile.slug ?? '',
      type: profile.type,
      imageUrl: profile.imageUrl,
      counts,
    }
  },
})

export const listPublicShelf = query({
  args: {
    profileId: v.id('profiles'),
    shelfType: v.union(v.literal('liked'), v.literal('read')),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(publicBookShelfItemValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (context, args) => {
    const profile = await context.db.get(args.profileId)
    if (!profile || !isProfilePublic(profile)) {
      return getEmptyPublicShelfResult<PublicBookShelfItem>()
    }

    const shelfField = getShelfField(args.shelfType)
    const shelfIndex = args.shelfType === 'liked' ? 'by_profileId_likedAt' : 'by_profileId_readAt'
    const shelfResult = await context.db
      .query('profileBookStates')
      .withIndex(shelfIndex, (query) => query.eq('profileId', args.profileId))
      .order('desc')
      .filter((query) => query.neq(query.field(shelfField), undefined))
      .paginate(args.paginationOpts)

    const page = await buildPublicShelfPage({
      shelfField,
      profileBookStates: shelfResult.page,
      db: context.db,
      storage: context.storage,
    })

    return {
      page,
      isDone: shelfResult.isDone,
      continueCursor: shelfResult.continueCursor ?? '',
    }
  },
})

export const listPublicSeriesShelf = query({
  args: {
    profileId: v.id('profiles'),
    shelfType: v.union(v.literal('liked'), v.literal('read')),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(publicSeriesShelfItemValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (context, args) => {
    const profile = await context.db.get(args.profileId)
    if (!profile || !isProfilePublic(profile)) {
      return getEmptyPublicShelfResult<PublicSeriesShelfItem>()
    }

    if (args.shelfType === 'liked') {
      const shelfResult = await context.db
        .query('profileSeriesStates')
        .withIndex('by_profileId_likedAt', (query) => query.eq('profileId', args.profileId))
        .order('desc')
        .filter((query) => query.neq(query.field('likedAt'), undefined))
        .paginate(args.paginationOpts)

      const page = await buildPublicSeriesLikedShelfPage({
        db: context.db,
        profileSeriesStates: shelfResult.page,
        storage: context.storage,
      })

      return {
        page,
        isDone: shelfResult.isDone,
        continueCursor: shelfResult.continueCursor ?? '',
      }
    }

    const resolvedReadSeries = await listResolvedReadSeriesForProfile(context, args.profileId)
    const sortedReadSeries = [...resolvedReadSeries].sort((leftEntry, rightEntry) => {
      if (leftEntry.shelfTimestamp !== rightEntry.shelfTimestamp) {
        return rightEntry.shelfTimestamp - leftEntry.shelfTimestamp
      }

      return leftEntry.series.name.localeCompare(rightEntry.series.name)
    })

    const readSeriesItems = await Promise.all(
      sortedReadSeries.map((entry) => buildPublicSeriesShelfItem(context.storage, entry.series, entry.shelfTimestamp)),
    )

    return paginatePublicShelfItems(readSeriesItems, args.paginationOpts)
  },
})

export const listPublicAuthorShelf = query({
  args: {
    profileId: v.id('profiles'),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(publicAuthorShelfItemValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (context, args) => {
    const profile = await context.db.get(args.profileId)
    if (!profile || !isProfilePublic(profile)) {
      return getEmptyPublicShelfResult<PublicAuthorShelfItem>()
    }

    const shelfResult = await context.db
      .query('profileAuthorStates')
      .withIndex('by_profileId_likedAt', (query) => query.eq('profileId', args.profileId))
      .order('desc')
      .filter((query) => query.neq(query.field('likedAt'), undefined))
      .paginate(args.paginationOpts)

    const page = await buildPublicAuthorShelfPage({
      db: context.db,
      profileAuthorStates: shelfResult.page,
      storage: context.storage,
    })

    return {
      page,
      isDone: shelfResult.isDone,
      continueCursor: shelfResult.continueCursor ?? '',
    }
  },
})

function getShelfField(shelfType: 'liked' | 'read') {
  return shelfType === 'liked' ? 'likedAt' : 'readAt'
}

type PublicBookShelfItem = {
  _id: Id<'books'>
  title: string
  slug: string | null
  authors: string[]
  shelfTimestamp: number
  cover: {
    url: string | null
    urlThumb: string | null
    width: number
    height: number
    dominantColor: string | null
  }
}
type PublicSeriesShelfItem = {
  _id: Id<'series'>
  name: string
  slug: string | null
  coverUrl: string | null
  shelfTimestamp: number
}
type PublicAuthorShelfItem = {
  _id: Id<'authors'>
  name: string
  slug: string | null
  imageUrl: string | null
  shelfTimestamp: number
}

function getEmptyPublicShelfResult<TItem>() {
  return {
    page: [] as TItem[],
    isDone: true,
    continueCursor: '',
  }
}

async function getPublicProfileBySlug(
  context: QueryCtx,
  slug: string,
) {
  const profile = await context.db
    .query('profiles')
    .withIndex('by_slug', (query) => query.eq('slug', slug))
    .unique()

  if (!profile || profile.slug === undefined || !isProfilePublic(profile)) {
    return null
  }

  return profile
}

async function getPublicProfileCounts(
  context: QueryCtx,
  profileId: Id<'profiles'>,
) {
  const [profileBookStates, profileSeriesStates, profileAuthorStates, resolvedReadSeries] = await Promise.all([
    context.db
      .query('profileBookStates')
      .withIndex('by_profileId', (query) => query.eq('profileId', profileId))
      .collect(),
    context.db
      .query('profileSeriesStates')
      .withIndex('by_profileId', (query) => query.eq('profileId', profileId))
      .collect(),
    context.db
      .query('profileAuthorStates')
      .withIndex('by_profileId', (query) => query.eq('profileId', profileId))
      .collect(),
    listResolvedReadSeriesForProfile(context, profileId),
  ])

  const likedBookCount = countDefinedTimestamps(profileBookStates, 'likedAt')
  const readBookCount = countDefinedTimestamps(profileBookStates, 'readAt')
  const likedSeriesCount = countDefinedTimestamps(profileSeriesStates, 'likedAt')
  const likedAuthorCount = countDefinedTimestamps(profileAuthorStates, 'likedAt')

  return {
    books: {
      liked: likedBookCount,
      read: readBookCount,
    },
    series: {
      liked: likedSeriesCount,
      read: resolvedReadSeries.length,
    },
    authors: {
      liked: likedAuthorCount,
    },
  }
}

async function buildPublicShelfPage(args: {
  db: {
    get: (id: Id<'books'>) => Promise<Doc<'books'> | null>
  }
  storage: {
    getUrl: (id: Id<'_storage'>) => Promise<string | null>
  }
  profileBookStates: Doc<'profileBookStates'>[]
  shelfField: 'likedAt' | 'readAt'
}) {
  const page = await Promise.all(
    args.profileBookStates.map(async (profileBookState) => {
      const book = await args.db.get(profileBookState.bookId)
      if (!book || !isBookVisibleForDiscovery(book)) return null

      const cover = await resolveShelfCover(args.storage, book)
      const shelfTimestamp = profileBookState[args.shelfField]
      if (shelfTimestamp === undefined) return null

      return {
        _id: book._id,
        title: book.title,
        slug: book.slug ?? null,
        authors: book.authors,
        shelfTimestamp,
        cover,
      }
    }),
  )

  return page.filter((book): book is NonNullable<typeof book> => book !== null)
}

async function buildPublicSeriesLikedShelfPage(args: {
  db: {
    get: (id: Id<'series'>) => Promise<Doc<'series'> | null>
  }
  profileSeriesStates: Doc<'profileSeriesStates'>[]
  storage: {
    getUrl: (id: Id<'_storage'>) => Promise<string | null>
  }
}) {
  const page = await Promise.all(
    args.profileSeriesStates.map(async (profileSeriesState) => {
      if (profileSeriesState.likedAt === undefined) {
        return null
      }

      const series = await args.db.get(profileSeriesState.seriesId)
      if (!series) {
        return null
      }

      return await buildPublicSeriesShelfItem(args.storage, series, profileSeriesState.likedAt)
    }),
  )

  return page.filter((series): series is NonNullable<typeof series> => series !== null)
}

async function buildPublicAuthorShelfPage(args: {
  db: {
    get: (id: Id<'authors'>) => Promise<Doc<'authors'> | null>
  }
  profileAuthorStates: Doc<'profileAuthorStates'>[]
  storage: {
    getUrl: (id: Id<'_storage'>) => Promise<string | null>
  }
}) {
  const page = await Promise.all(
    args.profileAuthorStates.map(async (profileAuthorState) => {
      if (profileAuthorState.likedAt === undefined) {
        return null
      }

      const author = await args.db.get(profileAuthorState.authorId)
      if (!author) {
        return null
      }

      return await buildPublicAuthorShelfItem(args.storage, author, profileAuthorState.likedAt)
    }),
  )

  return page.filter((author): author is NonNullable<typeof author> => author !== null)
}

async function buildPublicSeriesShelfItem(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  series: Doc<'series'>,
  shelfTimestamp: number,
): Promise<PublicSeriesShelfItem> {
  const coverUrl = series.coverStorageId ? await storage.getUrl(series.coverStorageId) : null

  return {
    _id: series._id,
    name: series.name,
    slug: series.slug ?? null,
    coverUrl,
    shelfTimestamp,
  }
}

async function buildPublicAuthorShelfItem(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  author: Doc<'authors'>,
  shelfTimestamp: number,
): Promise<PublicAuthorShelfItem> {
  const imageUrl = author.image?.storageIdMedium
    ? await storage.getUrl(author.image.storageIdMedium)
    : author.imageStorageId
      ? await storage.getUrl(author.imageStorageId)
      : null

  return {
    _id: author._id,
    name: author.name,
    slug: author.slug ?? null,
    imageUrl,
    shelfTimestamp,
  }
}

async function resolveShelfCover(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  book: Doc<'books'>,
) {
  const mediumId = book.cover?.storageIdMedium
  const thumbId = book.cover?.storageIdThumb
  const url = mediumId ? await storage.getUrl(mediumId) : null
  const urlThumb = thumbId ? await storage.getUrl(thumbId) : url

  return {
    url,
    urlThumb,
    width: book.cover?.width && book.cover.width > 0 ? book.cover.width : 200,
    height: book.cover?.height && book.cover.height > 0 ? book.cover.height : 300,
    dominantColor: book.cover?.dominantColor ?? null,
  }
}

function paginatePublicShelfItems<TItem extends { _id: string }>(
  items: TItem[],
  paginationOpts: {
    cursor: string | null
    numItems: number
  },
): {
  page: TItem[]
  isDone: boolean
  continueCursor: string
} {
  let startIndex = 0

  if (paginationOpts.cursor) {
    const cursorIndex = items.findIndex((item) => item._id === paginationOpts.cursor)
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1
    }
  }

  const endIndex = startIndex + paginationOpts.numItems
  const page = items.slice(startIndex, endIndex)
  const isDone = endIndex >= items.length
  const lastItem = page[page.length - 1]

  return {
    page,
    isDone,
    continueCursor: !isDone && lastItem ? lastItem._id : '',
  }
}

function countDefinedTimestamps<TEntry extends Record<string, number | undefined>, TKey extends keyof TEntry>(
  entries: TEntry[],
  key: TKey,
) {
  return entries.reduce((count, entry) => count + (entry[key] !== undefined ? 1 : 0), 0)
}
