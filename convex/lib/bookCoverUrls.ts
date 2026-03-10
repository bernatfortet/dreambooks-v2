import type { Doc, Id } from '../_generated/dataModel'

type StorageReader = {
  getUrl: (id: Id<'_storage'>) => Promise<string | null>
}

type LegacyBookCoverFields = {
  url?: string | null
  urlThumb?: string | null
  urlFull?: string | null
}

export async function resolveBookCoverUrls(
  storage: StorageReader,
  book: Doc<'books'>,
): Promise<{ coverUrl: string | null; coverUrlThumb: string | null; coverUrlFull: string | null }> {
  const cover = book.cover as (NonNullable<Doc<'books'>['cover']> & LegacyBookCoverFields) | undefined

  const coverUrl = await resolveStoredCoverUrl(storage, cover?.storageIdMedium, cover?.url)
  const coverUrlThumb = await resolveStoredCoverUrl(storage, cover?.storageIdThumb, cover?.urlThumb ?? coverUrl)
  const coverUrlFull = await resolveStoredCoverUrl(storage, cover?.storageIdFull, cover?.urlFull ?? coverUrl)

  return { coverUrl, coverUrlThumb, coverUrlFull }
}

async function resolveStoredCoverUrl(
  storage: StorageReader,
  storageId: Id<'_storage'> | undefined,
  fallbackUrl: string | null | undefined,
): Promise<string | null> {
  if (!storageId) return fallbackUrl ?? null

  const storageUrl = await storage.getUrl(storageId)
  if (storageUrl) return storageUrl

  return fallbackUrl ?? null
}
